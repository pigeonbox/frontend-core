/**
 * 多文件分享 API（P0 多文件）。
 *
 * 两条通道：
 *  - multiDirect：小批量（总体积 ≤ 单请求体上限）一次 multipart 建分享
 *  - chunkUploadFile + multiBind：大文件走分片通道，全部传完后一次性绑定为一个分享
 */
import { request } from '@/utils/request'
import { xhrSend } from '@/api/_xhr'
import type { ApiResponse } from '@/types/common'
import type { publicapi as publicapiContract } from '@pigeonbox/contracts'

/**
 * 多文件分享公共参数（契约派生，contracts v0.20.0）。
 *
 * 契约侧 MultiShareDirectReq / MultiShareBindReq 的公共字段一律 **optional**
 * （收敛前 core 用 DefaultPostForm 读 ⇒ 缺字段时 handler 显式兜底），但前端
 * 这两项是**表单必填**且直接进 FormData（`String(undefined)` 会发出字面量
 * "undefined"）⇒ 这里收紧为 required，其余字段跟契约走。
 *
 * ⚠️ `wrapped_key` 是**本地扩展**：contracts v0.20.10 的 `MultiShare*Req`
 * **尚未**声明该字段（core 的 multi handler 已按 `wrapped_key` 读表单/JSON，
 * 见 transport/http/handler/share_multi.go）⇒ 本地补上，待 contracts 下一版
 * 增量入契约后移除。
 * （对照：`ShareTextReq` / `ShareFileReq` / `ShareDetail` / `RetrieveData`
 *  在 v0.20.10 已原生含 `wrapped_key` ⇒ 那几处直接用契约类型，不叠加垫片。）
 */
export type MultiShareOptions = publicapiContract.MultiShareDirectReq & {
  expire_value: number
  expire_style: string
}

/** 多文件分享结果（契约 MultiShareData：code/url/share_url/file_count/pickup_code?） */
export type MultiShareResult = publicapiContract.MultiShareData

/**
 * multi-bind 的一个条目（**前端视图**：契约 MultiShareBindEntry 的 file_name
 * 放宽为可选）。
 *
 * ⚠️ 契约里 file_name 是 required，但前端实际**只发** upload_id/object_key
 * （file_name 由服务端从 chunk 会话/对象键推导，core 的 multiBindEntry.FileName
 * 允许空）⇒ 这里放宽为 optional，其余字段跟契约走。
 *
 * 刻意**不叫** MultiShareBindEntry：那是契约结构体的名字，本地再叫一遍就是
 * 遮蔽契约类型（形状还不一样）⇒ 用 Input 后缀区分。
 */
export type MultiShareBindEntryInput = Omit<publicapiContract.MultiShareBindEntry, 'file_name'> & {
  file_name?: string
}

/** multi-bind 请求体（契约 MultiShareBindReq 的 entries 用上面的放宽版） */
export type MultiShareBindBody = Omit<publicapiContract.MultiShareBindReq, 'entries'> & {
  entries: MultiShareBindEntryInput[]
}

export const isOkCode = (code?: number) => code === 0 || code === 200

/** 续传匹配指纹（name|size|lastModified）。浏览器 File 不持久化，刷新后靠
 *  用户重新选文件 + 指纹匹配接管会话；三元组全同才认，防错续到别的文件。 */
export function buildFingerprint(f: { name: string; size: number; lastModified: number }): string {
  return `${f.name}|${f.size}|${f.lastModified}`
}

/** 分片级指数退避 1s/2s/4s/8s（设计稿 Phase 2 口径，重试预算 4 次）；
 *  超限抛错由上层报错/降级，不无限退避。 */
export function chunkBackoffMs(attempt: number): number {
  if (attempt < 0 || attempt > 3) throw new Error(`chunk retry budget exceeded: attempt ${attempt}`)
  return 1000 * 2 ** attempt
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 该分片是否可跳过（断点续传判据：服务端位图含该 index 即已传）。
 * 纯函数封装供单测/负对照锚定——判据反写必须在测试下转红。
 */
export function shouldSkipChunk(index: number, uploaded: ReadonlySet<number>): boolean {
  return uploaded.has(index)
}

/** 查分片会话进度（已传分片位图）。归属：IP / 登录用户 / X-Upload-Token
 *  三选一（core 端 ownedByCaller 校验）；会话不存在/无权抛错由调用方兜底重传。 */
export async function getChunkStatus(
  uploadId: string,
  sessionToken?: string
): Promise<{ uploadId: string; totalChunks: number; uploadedIndexes: number[]; status: string }> {
  const res = await request<ApiResponse<{
    upload_id: string
    total_chunks: number
    uploaded_indexes: number[]
    status: string
  }>>({
    url: `/chunk/upload/status/${uploadId}`,
    method: 'GET',
    headers: sessionToken ? { 'X-Upload-Token': sessionToken } : undefined,
  })
  const d = res.data
  if (!d) throw new Error(res.message || 'chunk status failed')
  return {
    uploadId: d.upload_id,
    totalChunks: d.total_chunks,
    uploadedIndexes: d.uploaded_indexes ?? [],
    status: d.status,
  }
}

/** 多文件直传（multipart，字段名 files；总体积需 ≤ 后端单请求体上限） */
export async function multiDirect(
  files: File[],
  opts: MultiShareOptions,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<MultiShareResult> {
  const formData = new FormData()
  for (const f of files) formData.append('files', f)
  formData.append('expire_value', String(opts.expire_value))
  formData.append('expire_style', opts.expire_style)
  // require_auth 为契约必填: false 也必须显式发送
  formData.append('require_auth', String(opts.require_auth))
  if (opts.require_auth && opts.password) formData.append('password', opts.password)
  if (opts.encrypted) formData.append('encrypted', 'true')
  // 口令型 E2E（2026-11-01 core#30）：口令包装的内容密钥随创建请求落服务端
  if (opts.wrapped_key) formData.append('wrapped_key', opts.wrapped_key)
  if (opts.custom_code) formData.append('custom_code', opts.custom_code)
  if (opts.note) formData.append('note', opts.note)

  // 原内联 XHR 无超时（timeout=0=不限），钉现状
  const res = await xhrSend<MultiShareResult>({
    url: '/api/v1/share/multi-direct',
    form: formData,
    onProgress,
    signal,
    timeout: 0,
  })
  if (!res.data) throw new Error(res.message || 'multi-direct failed')
  return res.data
}

/** 分片上传单个文件，返回服务端会话 upload_id（绑定用；不调 complete——multi-bind 服务端负责合并+标记） */
export async function chunkUploadFile(
  file: File,
  uploadId: string,
  chunkSize: number,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
  opts?: {
    /** 已传分片（断点续传跳片；缺省=全传） */
    uploaded?: Set<number>
    /** 会话令牌（init 响应头 X-Upload-Token；逐请求回传，IP 漂移后仍过归属） */
    sessionToken?: string
    /**
     * 续传既有会话：跳过 init 直接补缺片（2026-11-03 Phase 2，wire 实测修正）。
     * 分片会话主键＝服务端按 file_hash 派生（空则服务端 UUID）；init 请求体里的
     * `upload_id` 不在契约 IDL（ChunkUploadInitReq 1-11 无此字段）⇒ 会被忽略，
     * 重 init 得到的是**另一个**新会话、旧位图作废。故续传不重 init，直接对
     * 既有会话补缺片；会话已不存在时由上层（getChunkStatus 探测失败）改走新会话。
     */
    resumeSessionId?: string
    /** 会话坐标即时回调（init 成功即回传）——中途失败后凭 uploadId/sessionToken 续传 */
    onSession?: (s: { uploadId: string; sessionToken?: string }) => void
  }
): Promise<{ uploadId: string; sessionToken?: string }> {
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
  const headers: Record<string, string> = opts?.sessionToken ? { 'X-Upload-Token': opts.sessionToken } : {}

  let sessionId: string
  let sessionToken = opts?.sessionToken
  if (opts?.resumeSessionId) {
    // 断点续传：既有会话直接补缺片（见 opts.resumeSessionId 注释——重 init 另起新会话）
    sessionId = opts.resumeSessionId
    opts.onSession?.({ uploadId: sessionId, sessionToken })
  } else {
    // 整文件哈希（2026-10-06 W2 补）：core v0.11+ 加固将 file_hash 置 required（此前不发送必 400），
    // 且服务端以 file_hash 作为分片会话主键、据此做跨会话秒传检索。multi-chunk 批量场景下秒传命中
    // （is_quick_upload）无法经 multi-bind 合并（entry 无 share_code 形态），故发送空串→服务端
    // 生成 UUID 会话，保持"批量始终真实上传"的既有行为；单文件大文件的秒传由 presign 通道负责。
    const initRes = await request<ApiResponse<{ upload_id?: string }>>({
      url: '/chunk/upload/init/',
      method: 'POST',
      data: {
        file_name: file.name,
        file_size: file.size,
        chunk_size: chunkSize,
        total_chunks: totalChunks,
        upload_id: uploadId,
        file_hash: '',
      },
      headers,
      signal,
    })

    // 会话主键以服务端返回为准（file_hash 为空时服务端自生成 UUID，与客户端自报值不同）
    sessionId = initRes.data?.upload_id || uploadId
    // 会话令牌：init 响应头 X-Upload-Token（由 request.ts 拦截器透传进 payload.upload_token）
    sessionToken = (initRes as { upload_token?: string }).upload_token || opts?.sessionToken
    // 后续分片请求统一带会话令牌（IP 漂移后仍过归属校验）
    if (sessionToken) headers['X-Upload-Token'] = sessionToken
    opts?.onSession?.({ uploadId: sessionId, sessionToken })
  }

  const uploaded = opts?.uploaded ?? new Set<number>()
  for (let index = 0; index < totalChunks; index++) {
    if (signal?.aborted) throw new Error('Cancelled')
    if (shouldSkipChunk(index, uploaded)) {
      // 断点续传：已传分片跳过（服务端位图为准），进度按已传量起算
      onProgress?.(Math.min((index + 1) * chunkSize, file.size), file.size)
      continue
    }
    const start = index * chunkSize
    const blob = file.slice(start, Math.min(start + chunkSize, file.size))
    const form = new FormData()
    form.append('chunk', blob, `${file.name}.part${index}`)
    // 分片期望哈希（SHA-256，服务端恒时比对，不符返回 422）：传输损坏限定在单片内，
    // 客户端重传该分片即可；非安全上下文(无 crypto.subtle)自动降级为不携带。
    const hash = await sha256Hex(blob)
    if (hash) form.append('hash', hash)
    await uploadChunkWithRetry(sessionId, index, form, signal, headers)
    onProgress?.(Math.min(start + blob.size, file.size), file.size)
  }
  return { uploadId: sessionId, sessionToken }
}

/** 逐片 SHA-256；非安全上下文(subtle 不可用)返回 null */
async function sha256Hex(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 上传单片；可重试类失败（422/20009 哈希校验、code=0 网络类、5xx 服务端）走指数退避
 * 1/2/4/8s 重传（chunkBackoffMs，上限 4 次退避=共 5 次尝试），超限抛错由上层报错。
 */
async function uploadChunkWithRetry(
  uploadId: string,
  index: number,
  form: FormData,
  signal?: AbortSignal,
  headers?: Record<string, string>,
  maxRetries = 4
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await request<ApiResponse<unknown>>({
        url: `/chunk/upload/chunk/${uploadId}/${index}`,
        method: 'POST',
        data: form,
        timeout: 300000,
        signal,
        headers,
      })
      return
    } catch (e) {
      const code = (e as { code?: number })?.code
      const retriable =
        code === 422 || code === 20009 || code === 0 || (code !== undefined && code >= 500 && code < 600)
      if (!retriable || attempt >= maxRetries) throw e
      await sleep(chunkBackoffMs(attempt))
    }
  }
}

/** 把若干 chunk 会话/对象 key 绑定为一个多文件分享 */
export async function multiBind(
  entries: MultiShareBindEntryInput[],
  opts: MultiShareOptions
): Promise<MultiShareResult> {
  const body: MultiShareBindBody = {
    entries,
    expire_value: opts.expire_value,
    expire_style: opts.expire_style,
    require_auth: opts.require_auth || false,
    password: opts.password || '',
    encrypted: opts.encrypted || false,
    wrapped_key: opts.wrapped_key || '',
    custom_code: opts.custom_code || '',
    note: opts.note || '',
  }
  const res = await request<ApiResponse<MultiShareResult>>({
    url: '/api/v1/share/multi-bind',
    method: 'POST',
    data: body,
    timeout: 600000,
  })
  if (isOkCode(res.code) && res.data) return res.data
  throw new Error(res.message || 'multi-bind failed')
}
