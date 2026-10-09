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

export interface MultiShareOptions {
  expire_value: number
  expire_style: string
  require_auth?: boolean
  password?: string
  encrypted?: boolean
  custom_code?: string
}

export interface MultiShareResult {
  code: string
  url: string
  share_url: string
  file_count: number
  /** 6 位取件码（文件分享铸造；永久/文本分享为空） */
  pickup_code?: string
}

export const isOkCode = (code?: number) => code === 0 || code === 200

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
  if (opts.custom_code) formData.append('custom_code', opts.custom_code)

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
  signal?: AbortSignal
): Promise<string> {
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))

  // 整文件哈希（2026-10-06 W2 补）：core v0.11+ 加固将 file_hash 置 required（此前不发送必 400），
  // 且服务端以 file_hash 作为分片会话主键、据此做跨会话秒传检索。multi-chunk 批量场景下秒传命中
  // （is_quick_upload）无法经 multi-bind 合并（entry 无 share_code 形态），故发送空串→服务端
  // 生成 UUID 会话，保持“批量始终真实上传”的既有行为；单文件大文件的秒传由 presign 通道负责。
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
    signal,
  })

  // 会话主键以服务端返回为准（file_hash 为空时服务端自生成 UUID，与客户端自报值不同）
  const sessionId = initRes.data?.upload_id || uploadId

  for (let index = 0; index < totalChunks; index++) {
    if (signal?.aborted) throw new Error('Cancelled')
    const start = index * chunkSize
    const blob = file.slice(start, Math.min(start + chunkSize, file.size))
    const form = new FormData()
    form.append('chunk', blob, `${file.name}.part${index}`)
    // 分片期望哈希（SHA-256，服务端恒时比对，不符返回 422）：传输损坏限定在单片内，
    // 客户端重传该分片即可；非安全上下文(无 crypto.subtle)自动降级为不携带。
    const hash = await sha256Hex(blob)
    if (hash) form.append('hash', hash)
    await uploadChunkWithRetry(sessionId, index, form, signal)
    onProgress?.(Math.min(start + blob.size, file.size), file.size)
  }
  return sessionId
}

/** 逐片 SHA-256；非安全上下文(subtle 不可用)返回 null */
async function sha256Hex(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 上传单片；422（服务端哈希校验失败）时重传，最多 2 次 */
async function uploadChunkWithRetry(
  uploadId: string,
  index: number,
  form: FormData,
  signal?: AbortSignal,
  maxRetries = 2
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await request<ApiResponse<unknown>>({
        url: `/chunk/upload/chunk/${uploadId}/${index}`,
        method: 'POST',
        data: form,
        timeout: 300000,
        signal,
      })
      return
    } catch (e) {
      const code = (e as { code?: number })?.code
      if (code === 422 && attempt < maxRetries) continue
      throw e
    }
  }
}

/** 把若干 chunk 会话/对象 key 绑定为一个多文件分享 */
export async function multiBind(
  entries: Array<{ upload_id?: string; object_key?: string; file_name?: string }>,
  opts: MultiShareOptions
): Promise<MultiShareResult> {
  const res = await request<ApiResponse<MultiShareResult>>({
    url: '/api/v1/share/multi-bind',
    method: 'POST',
    data: {
      entries,
      expire_value: opts.expire_value,
      expire_style: opts.expire_style,
      require_auth: opts.require_auth || false,
      password: opts.password || '',
      encrypted: opts.encrypted || false,
      custom_code: opts.custom_code || '',
    },
    timeout: 600000,
  })
  if (isOkCode(res.code) && res.data) return res.data
  throw new Error(res.message || 'multi-bind failed')
}
