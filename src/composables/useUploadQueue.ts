import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { pickUploadPlan, isPresignFallbackEligible } from '@/composables/useUploadPlan'
import { uploadFile } from '@/api/share'
import { multiDirect, chunkUploadFile, multiBind, type MultiShareOptions, type MultiShareResult } from '@/api/multifile'
import type { PresignCompleteData, PresignUploadProgress } from '@/api/presign'
import { generateKeyB64, encryptFile, wrapKey } from '@/utils/e2e'
import { translateError } from '@/utils/api-interceptor'
import { formatFileSize } from '@/utils/format'
import type { ShareSettings } from '@/composables/useShareSettings'
import type { ShareResult } from '@/types/share'

/**
 * 上传队列状态机（2026-10-06 W2 自 FileUpload.vue 抽出的编排层）。
 * E2E 预加密 → pickUploadPlan 通道决策 → 执行 → 任务行进度/状态。
 * UI 提示直接用 ElMessage（现状即如此）；i18n 文案经 opts.t 注入（composable 可脱离组件单测）。
 */

/**
 * blocked = 因**单文件上限**被本地拦下（2026-10-23）。
 *
 * 与 error 语义分离：error 是「上传失败，可重试」；blocked 是「压根不该发」。
 * 混在一起有两个实测可见的问题：①`canStart` 统计 error ⇒ 全部文件超限时
 * 「安全寄送」仍可点，用户点了才被告知；②行内「重试」把超限文件重置成
 * pending，用户以为能重试、实际每次都被同一道闸拦回。
 *
 * blocked 不计入 canStart、不参与整批发送；但**上限被调大后可以恢复**
 * （start()/retry() 时按当前上限重新判定），管理员调整上限后用户不必移除重加。
 */
export type UploadTaskStatus = 'pending' | 'encrypting' | 'uploading' | 'binding' | 'success' | 'error' | 'blocked'

export interface UploadTask {
  id: string
  /** 原始文件（列表展示名/大小） */
  file: File
  /** 实际上传内容（E2E 密文；未加密 === file） */
  payload: File
  status: UploadTaskStatus
  progress: number
  statusText: string
  error: string
}

const DEFAULT_BODY_CAP = 8 * 1024 * 1024
const DEFAULT_PRESIGN_THRESHOLD = 100 * 1024 * 1024
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024
const E2E_MAX_BYTES = 100 * 1024 * 1024

export function useUploadQueue(opts: {
  settings: ShareSettings
  t: (key: string, params?: Record<string, string>) => string
  bodyCap?: () => number
  presignThreshold?: number | (() => number)
  /** 匿名直传是否开放（后端 presign.anonymous_enabled 下发；false 时 >阈值 文件回退分片中转） */
  presignAllowed?: () => boolean
  chunkSize?: number
  /**
   * presign 大文件直传（>100MB）。
   *
   * onProgress 把弹窗内部 PUT 的**原始字节数**与阶段透给队列 ⇒ 上传列表那一行
   * 也能显示百分比（此前弹窗里有进度、列表行恒 0%）。
   */
  presign?: (
    file: File,
    settings: ShareSettings,
    onProgress?: (p: PresignUploadProgress) => void
  ) => Promise<PresignCompleteData>
  /** 登录态注入（custom_code 仅登录时发送；默认视为登录） */
  isLoggedIn?: () => boolean
  /**
   * 站点级单文件上限（字节，0=不限；后端 upload.max_file_size 经 /api/config 下发）。
   * 超限文件在**任何通道发出前**本地拦截——服务端 presign init 阶段也会拒
   * （错误码 30008），但那时已经浪费了一次往返和用户等待。
   */
  maxFileSize?: () => number
  /**
   * 站点默认「单次发送**总量**上限」（字节，0=不限；user.user_upload_size 经
   * /api/config 下发）。与 maxFileSize（**单文件**上限）是两个不同的闸。
   *
   * ⚠️ **只提示、不阻断**：本值是**站点级默认**，登录用户的用户级上限可能更宽松
   * （users.max_upload_size）⇒ 硬拦会误杀合法上传。服务端 413 才是权威，
   * 本地预检的价值是「选文件时就看见」，不是替服务端做决定。
   */
  batchSizeCap?: () => number
}) {
  const { settings, t } = opts

  const tasks = ref<UploadTask[]>([])
  // 单文件直传的中断控制器（multi 用共享 controller）
  const controllers = new Map<string, AbortController>()
  let multiAbort: AbortController | null = null
  /**
   * 当前批次（start() 正在处理的任务行）+ 批次取消标记（2026-10-22）。
   * multi 取消中止整批时，批次内其余任务必须一并落到终态——只标被点的那一个
   * 会让其余停在 uploading/encrypting/binding，isUploading 恒真、按钮永久 loading。
   */
  let currentBatch: UploadTask[] = []
  let batchRunning = false
  let batchCancelled = false

  const isUploading = computed(() => tasks.value.some((f) => f.status === 'uploading' || f.status === 'encrypting' || f.status === 'binding'))
  const canStart = computed(
    () => tasks.value.length > 0 && tasks.value.some((f) => f.status === 'pending' || f.status === 'error')
  )
  /**
   * 被单文件上限拦下的任务数（blocked）。UI 用它说明「为什么按钮是灰的」——
   * 全部任务都超限时 canStart=false，按钮禁用但**没有原因**（2026-10-23 实测盲区）。
   */
  const blockedCount = computed(() => tasks.value.filter((f) => f.status === 'blocked').length)

  /** 批次内未到终态的任务统一落到终态（error）——取消/中断后必须收敛，否则按钮卡 loading */
  const settleBatch = (msg: string) => {
    for (const task of currentBatch) {
      if (task.status === 'success' || task.status === 'error' || task.status === 'blocked') continue
      task.status = 'error'
      task.error = msg
      task.statusText = ''
    }
  }

  const newId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

  /** 单文件上限（字节，0=不限）。注意命名勿与 start() 内「本批最大文件」的局部量撞名 */
  const maxFileSizeLimit = () => opts.maxFileSize?.() ?? 0

  /** 单次发送总量上限（字节，0=不限）：站点级默认，仅用于**提示**（不阻断） */
  const batchSizeCapLimit = () => opts.batchSizeCap?.() ?? 0

  /**
   * 本批合计体积（字节）：blocked 的文件不参与发送（不进合计），其余都算。
   *
   * 取 **file.size**（原始体积）而非 payload.size——服务端按**申报**体积
   * （init 的 file_size = 原始文件大小）判总量，E2E 密文略大，用 payload 会
   * 把合计算高、误报超限。
   */
  const totalSize = computed(() =>
    tasks.value
      .filter((f) => f.status !== 'blocked')
      .reduce((sum, f) => sum + (f.file?.size ?? 0), 0)
  )

  /**
   * 本批合计是否超过站点默认的总量上限（提示用，**不阻断**）。
   * 见 batchSizeCap 的说明：用户级上限可能更宽松 ⇒ 只提示，服务端 413 才是权威。
   */
  const batchOverLimit = computed(() => {
    const cap = batchSizeCapLimit()
    return cap > 0 && totalSize.value > cap
  })

  /** 超限提示文案（统一口径：实际大小 + 上限） */
  const overLimitMsg = (size: number, limit: number) =>
    t('upload.maxFileExceeded', { size: formatFileSize(size), limit: formatFileSize(limit) })

  const addFiles = (files: File[] | FileList) => {
    const limit = maxFileSizeLimit()
    for (const f of Array.from(files)) {
      // 超限文件直接落 blocked 终态：选完文件即刻可见，且不计入 canStart
      const over = limit > 0 && f.size > limit
      tasks.value.push({
        id: newId(),
        file: f,
        payload: f,
        status: over ? 'blocked' : 'pending',
        progress: 0,
        statusText: '',
        error: over ? overLimitMsg(f.size, limit) : '',
      })
    }
    if (limit > 0) {
      const over = Array.from(files).filter((f) => f.size > limit)
      if (over.length > 0) {
        ElMessage.error(overLimitMsg(over[0]!.size, limit))
      }
    }
  }

  const remove = (id: string) => {
    const ctrl = controllers.get(id)
    if (ctrl) {
      ctrl.abort()
      controllers.delete(id)
    }
    const idx = tasks.value.findIndex((f) => f.id === id)
    if (idx >= 0) tasks.value.splice(idx, 1)
  }

  const cancel = (id: string) => {
    const task = tasks.value.find((f) => f.id === id)
    if (!task) return
    const ctrl = controllers.get(id)
    if (ctrl) {
      ctrl.abort()
      controllers.delete(id)
    }
    // W3 语义改进：multi 进行中取消任一任务=中止整批（multi-bind 需全部文件，
    // 单独移除一个无法成享；原行为仅标记、最终仍被成功覆盖且文件留在分享内）
    if (multiAbort || batchRunning) {
      multiAbort?.abort()
      // 整批收敛（2026-10-22）：批次内未到终态的任务一并落到终态。
      // 只标被点的那一个 → 其余停在 uploading/encrypting/binding →
      // isUploading 恒真 → 上传按钮永久 loading。
      batchCancelled = true
      settleBatch(t('upload_view.presign.abort'))
      return
    }
    task.status = 'error'
    task.error = t('upload_view.presign.abort')
    task.statusText = ''
  }

  /**
   * 单任务重试（2026-10-22）：把失败任务复位回 pending 并重新入队。
   * 多文件批量语义下单文件重试不成立（批量分享需整批文件同时成享）：
   * 队列多于 1 个任务时只复位（由主按钮整批重跑），不自动发起。
   */
  const retry = async (id: string): Promise<ShareResult | null> => {
    const task = tasks.value.find((f) => f.id === id)
    if (!task || (task.status !== 'error' && task.status !== 'blocked')) return null
    // blocked 的重试 = 按**当前**上限重新判定（管理员可能已把上限调大）；
    // 仍超限则保持 blocked 并给出原因，不做任何请求。
    if (task.status === 'blocked') {
      const limit = maxFileSizeLimit()
      if (limit > 0 && task.file.size > limit) {
        task.error = overLimitMsg(task.file.size, limit)
        ElMessage.error(task.error)
        return null
      }
    }
    task.status = 'pending'
    task.error = ''
    task.statusText = ''
    task.progress = 0
    if (tasks.value.length > 1) return null
    return await start()
  }

  const dispose = () => {
    controllers.forEach((c) => c.abort())
    controllers.clear()
    multiAbort?.abort()
    multiAbort = null
    // 卸载即中止：批次内未到终态的任务一并收敛（避免残留 uploading 态）
    batchCancelled = true
    settleBatch(t('upload_view.presign.abort'))
  }

  const multiOptions = (wrappedKey?: string): MultiShareOptions => ({
    expire_value: settings.expire_value,
    expire_style: settings.expire_style,
    require_auth: settings.require_auth,
    password: settings.password,
    encrypted: settings.e2e,
    // 口令型 E2E（2026-11-01 core#30）：口令包装的内容密钥随创建请求落服务端
    wrapped_key: wrappedKey || undefined,
    // 统一为登录才发（原 multi 路径无条件发送，对齐 single 路径与后端 v0.11.1 语义）
    custom_code: opts.isLoggedIn?.() ?? true ? settings.custom_code || undefined : undefined,
    note: settings.note || undefined,
  })

  /** 结束批次登记（提前返回路径必须调用，否则 batchRunning 残留 true） */
  const endBatch = () => {
    multiAbort = null
    batchRunning = false
    currentBatch = []
  }

  const start = async (): Promise<ShareResult | null> => {
    // blocked 也纳入判定：上限可能已被管理员调大/调小，须按**当前**上限重新判定
    let pending = tasks.value.filter(
      (f) => f.status === 'pending' || f.status === 'error' || f.status === 'blocked'
    )
    if (pending.length === 0) return null
    // 单文件上限兜底（addFiles 已拦一道）。此处补三条漏网路径：
    // ① 上限在排队期间被管理员调低；② error 态任务被重试重置为 pending；
    // ③ 上限在排队期间被调大 ⇒ 此前 blocked 的应恢复为可发。
    // 超限任务落 blocked 终态并剔出本批——不发出任何请求。
    const limit = maxFileSizeLimit()
    if (limit > 0) {
      const over = pending.filter((f) => f.file.size > limit)
      if (over.length > 0) {
        for (const task of over) {
          task.status = 'blocked'
          task.error = overLimitMsg(task.file.size, limit)
          task.statusText = ''
        }
        pending = pending.filter((f) => f.file.size <= limit)
        ElMessage.error(overLimitMsg(over[0]!.file.size, limit))
        if (pending.length === 0) return null
      }
    }
    for (const task of pending) {
      if (task.status === 'error') {
        task.status = 'pending'
        task.error = ''
      }
    }
    // 批次登记（取消时整批收敛用）
    currentBatch = pending
    batchRunning = true
    batchCancelled = false

    // E2E（口令型，2026-11-01 core#30）：单密钥 + 逐文件预加密（密文作为实际上传
    // 内容）；密钥不进链接，用口令包装成 wrapped_key 随各通道的创建请求落服务端。
    let e2eKey = ''
    let wrappedKey = ''
    if (settings.e2e) {
      const tooBig = pending.filter((f) => f.file.size > E2E_MAX_BYTES)
      if (tooBig.length > 0) {
        ElMessage.error(t('upload.e2e.tooLarge'))
        endBatch()
        return null
      }
      try {
        e2eKey = await generateKeyB64()
        wrappedKey = wrapKey(settings.e2e_password, e2eKey)
        for (const task of pending) {
          if (batchCancelled) break
          task.status = 'encrypting'
          task.statusText = t('upload.e2e.encrypting')
          task.progress = 0
          task.payload = await encryptFile(e2eKey, task.file)
          task.status = 'pending'
          task.statusText = ''
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('upload.e2e.failed')
        for (const task of pending) {
          if (task.status !== 'success') {
            task.status = 'error'
            task.error = msg
          }
        }
        ElMessage.error(msg)
        endBatch()
        return null
      }
      // 加密阶段被取消：整批收敛，不再进入上传通道
      if (batchCancelled) {
        settleBatch(t('upload_view.presign.abort'))
        endBatch()
        return null
      }
    }

    // 通道决策（用原始文件大小——钉现状）
    const totalBytes = pending.reduce((s, f) => s + f.file.size, 0)
    const maxFileBytes = Math.max(...pending.map((f) => f.file.size))
    // 匿名直传开关：后端下发 false 时， presign 通道不参与决策（>阈值 落 multi-chunk）。
    // E2E 也强制退出 presign（2026-11-01 core#30）：presign 通道既不收 wrapped_key
    // （init 无此字段，密钥无从交付 ⇒ 取件人永远解不开），历史实现还直传 task.file
    // 原文件（明文泄漏面）⇒ E2E 一律走 direct/multi 通道（密文 + wrapped_key）。
    const presignAllowed = (opts.presignAllowed?.() ?? true) && !settings.e2e
    let plan = pickUploadPlan({
      count: pending.length,
      totalBytes,
      maxFileBytes,
      bodyCap: opts.bodyCap?.() ?? DEFAULT_BODY_CAP,
      presignThreshold: typeof opts.presignThreshold === "function" ? opts.presignThreshold() : (opts.presignThreshold ?? DEFAULT_PRESIGN_THRESHOLD),
      presignAllowed,
    })

    try {
      if (plan === 'direct') {
        const task = pending[0]!
        task.status = 'uploading'
        task.progress = 0
        task.error = ''
        task.statusText = t('upload.prepare')
        const ctrl = new AbortController()
        controllers.set(task.id, ctrl)
        // e2e 开启时 payload 必为密文（加密在上方完成），encrypted 等价于 settings.e2e
        const res = await uploadFile(
          task.payload,
          {
            expire_value: settings.expire_value,
            expire_style: settings.expire_style,
            require_auth: settings.require_auth,
            password: settings.password || undefined,
            encrypted: settings.e2e && task.payload !== task.file,
            wrapped_key: settings.e2e ? wrappedKey : undefined,
            custom_code: opts.isLoggedIn?.() ?? true ? settings.custom_code || undefined : undefined,
            note: settings.note || undefined,
          },
          (loaded, total) => {
            task.progress = Math.round((loaded / Math.max(total, 1)) * 100)
            task.statusText = t('upload.uploading')
          },
          ctrl.signal
        )
        controllers.delete(task.id)
        task.status = 'success'
        task.progress = 100
        task.statusText = t('common.success')
        // 秒传去重命中（2026-10-12）：内容已存在未重复存储，提示区别于普通上传
        ElMessage.success(
          `${task.file.name}: ${res.deduped ? t('upload.dedupedSuccess') : t('upload.success')}`
        )
        return {
          code: res.code,
          share_url: res.url,
          full_share_url: res.url,
          e2e_wrapped: settings.e2e ? true : undefined,
          file_name: task.file.name,
          has_password: !!settings.password,
          pickup_code: res.pickup_code || undefined,
          expire_style: settings.expire_style,
          expire_value: settings.expire_value,
        }
      }

      if (plan === 'presign') {
        const task = pending[0]!
        task.status = 'uploading'
        task.progress = 0
        task.error = ''
        task.statusText = t('upload.largeFileHint')
        let r: PresignCompleteData | undefined
        try {
          r = await opts.presign?.(task.file, settings, (p) => {
            if (p.phase === 'put' && p.total > 0) {
              task.progress = Math.round((p.loaded / p.total) * 100)
              task.statusText = t('upload.uploading')
            } else if (p.phase === 'complete') {
              task.progress = 100
              task.statusText = t('upload.prepare')
            }
          })
          if (!r) throw new Error('presign unavailable')
        } catch (e) {
          // presign 直传失败 ⇒ **传输层失败可回退分片中转**（2026-11-03）。
          //
          // 原实现只在 10015（匿名直传被管理开关关闭）时回退，其余一律抛错
          // ⇒ 大文件（>100MB 走 presign）一旦 PUT 超时/连接被拒就**零退路**。
          // 实测家宽上行仅 ~0.86MB/s ⇒ 1.35GB 文件必然撞 300s 超时。
          // 分片通道（5MB/片 POST multipart）对任意体积都可用 ⇒ 传输层失败应回退。
          //
          // 业务码（配额/体积/类型/权限）**不回退**：换通道同样会被拒，
          // 白白重传一遍大文件。详见 isPresignFallbackEligible。
          const errCode = (e as { code?: number })?.code
            ?? (e as { response?: { data?: { code?: number } } })?.response?.data?.code
          if (isPresignFallbackEligible(errCode)) {
            ElMessage.info(t('upload.presignFallback'))
            plan = 'multi-chunk'
          } else {
            throw e
          }
        }
        if (plan === 'presign') {
          if (!r) throw new Error('presign unavailable')
          task.status = 'success'
          task.progress = 100
          task.statusText = t('common.success')
          return {
            code: r.code || '',
            share_url: r.url || '',
            full_share_url: r.url || '',
            e2e_wrapped: settings.e2e ? true : undefined,
            file_name: task.file.name,
            has_password: !!settings.password,
            pickup_code: r.pickup_code || undefined,
            expire_style: settings.expire_style,
            expire_value: settings.expire_value,
          }
        }
        // 回退：落入下方 multi 流程（r 未定义安全——TS 收窄由 plan 判定保证）
        task.status = 'pending'
        task.statusText = t('upload.prepare')
      }

      if (plan === 'multi-direct') {
        for (const task of pending) {
          task.status = 'uploading'
          task.progress = 0
          task.error = ''
          task.statusText = t('upload.prepare')
        }
        multiAbort = new AbortController()
        // 聚合进度按字节均摊到各任务行（上传的是密文（若启用 E2E）或原文件）
        const payloads = pending.map((f) => f.payload)
        const capBytes = payloads.map((f) => f.size)
        const result = await multiDirect(
          payloads,
          multiOptions(wrappedKey),
          (loaded) => {
            let acc = 0
            for (let idx = 0; idx < pending.length; idx++) {
              const task = pending[idx]!
              const cap = Math.max(capBytes[idx] ?? task.file.size, 1)
              const done = Math.min(Math.max(loaded - acc, 0), cap)
              task.progress = Math.round((done / cap) * 100)
              task.statusText = t('upload.uploading')
              acc += cap
            }
          },
          multiAbort.signal
        )
        for (const task of pending) {
          task.status = 'success'
          task.progress = 100
          task.statusText = t('common.success')
        }
        ElMessage.success(t('upload.success'))
        return {
          code: result.code,
          share_url: result.share_url || result.url,
          full_share_url: result.url,
          e2e_wrapped: settings.e2e ? true : undefined,
          file_name: pending.length === 1 ? pending[0]!.file.name : undefined,
          has_password: !!settings.password,
          pickup_code: result.pickup_code || undefined,
          expire_style: settings.expire_style,
          expire_value: settings.expire_value,
        }
      }

      // multi-chunk：逐文件分片上传（复用 chunk 通道任意大小能力），最后一次性绑定
      multiAbort = new AbortController()
      const entries: Array<{ upload_id: string }> = []
      for (const task of pending) {
        if (multiAbort.signal.aborted) throw new Error('Cancelled')
        task.status = 'uploading'
        task.progress = 0
        task.error = ''
        task.statusText = t('upload.uploading')
        const uploadId = newId()
        // 返回值=服务端会话主键（v0.11+ 以服务端返回为准，绑定按它合并）
        const sessionId = await chunkUploadFile(
          task.payload,
          uploadId,
          opts.chunkSize ?? DEFAULT_CHUNK_SIZE,
          (loaded, total) => {
            task.progress = Math.round((loaded / Math.max(total, 1)) * 100)
          },
          multiAbort.signal
        )
        // 绑定阶段提示（分片已传完、等待服务端合并）
        task.status = 'binding'
        task.progress = 100
        task.statusText = t('upload.prepare')
        entries.push({ upload_id: sessionId })
      }
      const result = await multiBind(entries, multiOptions(wrappedKey))
      for (const task of pending) {
        task.status = 'success'
        task.progress = 100
        task.statusText = t('common.success')
      }
      ElMessage.success(t('upload.success'))
      return {
        code: result.code,
        share_url: result.share_url || result.url,
        full_share_url: result.url,
        e2e_wrapped: settings.e2e ? true : undefined,
        file_name: pending.length === 1 ? pending[0]!.file.name : undefined,
        has_password: !!settings.password,
        pickup_code: result.pickup_code || undefined,
        expire_style: settings.expire_style,
        expire_value: settings.expire_value,
      }
    } catch (e: unknown) {
      // 错误统一走错误码翻译（errcode/网络/HTTP 兜底），不再裸抛英文原文
      const tr = translateError(e)
      let msg = tr.i18nKey ? t(tr.i18nKey) : tr.fallback
      if (!tr.i18nKey && e instanceof Error && (e.message === 'Cancelled' || e.message === 'Aborted')) {
        msg = t('upload_view.presign.abort')
      }
      for (const task of pending) {
        if (task.status === 'success') continue
        // 已有终态错误（如用户取消）不覆盖——保留「已取消」与真实失败原因的区分
        if ((task.status === 'error' && task.error) || task.status === 'blocked') continue
        task.status = 'error'
        task.error = msg
      }
      // 不再弹全局 toast（2026-10-22）：行内已有逐条错误文本，重复弹窗是噪音；
      // 混合成功/失败态下全局文案也无法准确表达——行内文本才是真相。
      return null
    } finally {
      endBatch()
    }
  }

  return {
    tasks: tasks as Ref<UploadTask[]>,
    isUploading: isUploading as ComputedRef<boolean>,
    canStart: canStart as ComputedRef<boolean>,
    blockedCount: blockedCount as ComputedRef<number>,
    /** 本批合计体积（字节）——UI 用它说明「这次一共多大」 */
    totalSize: totalSize as ComputedRef<number>,
    /** 本批合计是否超过站点默认的单次发送总量上限（提示用，不阻断） */
    batchOverLimit: batchOverLimit as ComputedRef<boolean>,
    addFiles,
    remove,
    cancel,
    retry,
    start,
    dispose,
  }
}

// MultiShareResult 仅作类型留存（multi 分支返回值映射用）
export type { MultiShareResult }
