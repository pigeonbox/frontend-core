import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { pickUploadPlan, isPresignFallbackEligible } from '@/composables/useUploadPlan'
import { uploadFile } from '@/api/share'
import { multiDirect, chunkUploadFile, multiBind, buildFingerprint, getChunkStatus, chunkQuickProbe, chunkCancelSession, type MultiShareOptions, type MultiShareResult } from '@/api/multifile'
import { hashFileSha256 } from '@/utils/fileHash'
import type { UploadTaskRecord, NewUploadTaskRecord } from '@/stores/uploadTasks'
import type { PresignCompleteData } from '@/api/presign'
import { generateKeyB64, encryptFile, wrapKey } from '@/utils/e2e'
import { translateError } from '@/utils/api-interceptor'
import { formatUploadDiagnostics, isSwitchChannelRequested } from '@/utils/uploadFailure'
import { createSpeedMeter, formatSpeed, formatEtaHms } from '@/utils/transferSpeed'
import { formatFileSize } from '@/utils/format'
import { blockedExtensionOf } from '@/utils/uploadPreflight'
import type { ShareSettings } from '@/composables/useShareSettings'
import type { ShareResult } from '@/types/share'

/**
 * 上传队列状态机（2026-10-06 W2 自 FileUpload.vue 抽出的编排层）。
 * E2E 预加密 → pickUploadPlan 通道决策 → 执行 → 任务行进度/状态。
 * UI 提示直接用 ElMessage（现状即如此）；i18n 文案经 opts.t 注入（composable 可脱离组件单测）。
 */

/**
 * blocked = 因**单文件上限**或**禁传扩展名**被本地拦下（2026-10-23 / 2026-11-03）。
 *
 * 与 error 语义分离：error 是「上传失败，可重试」；blocked 是「压根不该发」。
 * 混在一起有两个实测可见的问题：①`canStart` 统计 error ⇒ 全部文件超限时
 * 「安全寄送」仍可点，用户点了才被告知；②行内「重试」把超限文件重置成
 * pending，用户以为能重试、实际每次都被同一道闸拦回。
 *
 * blocked 不计入 canStart、不参与整批发送；但**上限被调大后可以恢复**
 * （start()/retry() 时按当前上限重新判定），管理员调整上限后用户不必移除重加。
 */
export type UploadTaskStatus = 'pending' | 'encrypting' | 'uploading' | 'binding' | 'success' | 'error' | 'blocked' | 'paused'

export interface UploadTask {
  id: string
  /** 原始文件（列表展示名/大小） */
  file: File
  /** 实际上传内容（E2E 密文；未加密 === file） */
  payload: File
  status: UploadTaskStatus
  /** 执行通道（plan 定案时写入；pause 仅 multi-chunk 可用——其余是单请求体，暂停=中止） */
  channel?: 'direct' | 'presign' | 'multi-direct' | 'multi-chunk'
  progress: number
  statusText: string
  error: string
  /** 失败诊断（可复制给管理员：code/message/trace_id；成功/拦截时为空） */
  diag?: string
}

/**
 * 任务持久化出口（2026-11-03 Phase 2）：结构化最小面——真实现是 pinia 的
 * useUploadTasksStore（写穿 localStorage），单测传内存假实现即可，无需挂 pinia。
 */
export interface UploadTasksSink {
  create: (record: NewUploadTaskRecord) => { id: string }
  update: (id: string, patch: Partial<Omit<UploadTaskRecord, 'id' | 'createdAt'>>) => void
  findByFingerprint: (fingerprint: string) => UploadTaskRecord | undefined
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
  presign?: (file: File, settings: ShareSettings) => Promise<PresignCompleteData>
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
  /**
   * 站点禁传扩展名黑名单（/api/config blockedExtensions，与服务端校验同源）。
   * 命中文件在**任何通道发出前**本地拦截（blocked 终态）——服务端 30011 才是权威，
   * 本地拦只是省一次「传完才被拒」的往返与流量（2026-11-03 1.35GB 实录）。
   */
  blockedExts?: () => string[]
  /**
   * 任务持久化（断点续传坐标）：缺省不持久化（既有单测零改动）。
   * 只有 multi-chunk 通道可续传（分片会话可位图续传）⇒ 只有它写任务记录；
   * direct/presign 一次性请求体不可断点，不写记录（不给不可续传的假希望）。
   */
  uploadTasks?: UploadTasksSink
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

  /**
   * 失败收敛：状态/用户文案/诊断三件套一起落（行内「复制诊断」按钮的数据源）。
   * 诊断含 code + trace_id，用户贴给管理员即可对服务端日志检索定位。
   */
  const failTask = (task: UploadTask, msg: string, code?: number, traceId?: string) => {
    task.status = 'error'
    task.error = msg
    task.diag = formatUploadDiagnostics({
      file: task.file.name, code, message: msg, traceId,
    })
  }

  const addFiles = (files: File[] | FileList) => {
    const limit = maxFileSizeLimit()
    for (const f of Array.from(files)) {
      // 超限/禁传扩展名直接落 blocked 终态：选完文件即刻可见，且不计入 canStart
      const over = limit > 0 && f.size > limit
      const bext = blockedExtensionOf(f.name, opts.blockedExts?.())
      tasks.value.push({
        id: newId(),
        file: f,
        payload: f,
        status: over || bext ? 'blocked' : 'pending',
        progress: 0,
        statusText: '',
        error: over
          ? overLimitMsg(f.size, limit)
          : bext
            ? t('upload.blockedExt', { ext: bext })
            : '',
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
      // 禁传扩展名复检：管理员可能刚改过黑名单，按**当前**名单重新判定
      const bext = blockedExtensionOf(task.file.name, opts.blockedExts?.())
      if (bext) {
        task.error = t('upload.blockedExt', { ext: bext })
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

  /**
   * 行内续传（2026-11-03 Phase 2）：同页面内 File 尚在内存 ⇒ 直接复位重跑，
   * 不必重新选文件。multi-chunk 分支会按任务记录的续传坐标跳过已传分片。
   * 与 retry 的差别：仅收 error/paused（blocked 是「不该发」，重试=重新判定上限，不是续传）。
   * Phase 3：paused 与 error 同权走续传——坐标已在暂停时保留，恢复即从断点补缺片。
   */
  const resumeTask = async (id: string): Promise<ShareResult | null> => {
    const task = tasks.value.find((f) => f.id === id)
    if (!task || (task.status !== 'error' && task.status !== 'paused')) return null
    task.status = 'pending'
    task.error = ''
    task.statusText = ''
    task.progress = 0
    if (tasks.value.length > 1) return null
    return await start()
  }

  /**
   * 暂停（2026-11-03 Phase 3 · 统任务面）：仅 multi-chunk 通道可暂停——
   * direct/presign/multi-direct 是单请求体，中途"暂停"只能 abort=丢弃整个请求
   * （无法续传），给假按钮是欺骗。multi-chunk 在**片间边界**响应暂停（单片
   * 不打断），当前分片传完即停、坐标保留，恢复从缺片续。
   */
  const pause = (id: string): void => {
    const task = tasks.value.find((f) => f.id === id)
    if (!task || task.channel !== 'multi-chunk' || task.status !== 'uploading') return
    task.status = 'paused'
  }

  /**
   * 刷新后续传（2026-11-03 Phase 2）：File 对象不跨刷新存活，用户重选同指纹文件
   * （指纹命中的判定在 FileUpload 层，未命中提示 resumeMismatch）。
   * 装入队列后整批发起（既有批量语义）；multi-chunk 分支内按指纹查到未完成
   * 记录 ⇒ 沿用其续传坐标（服务端位图为准）从断点继续。
   */
  const resumeFrom = async (file: File): Promise<ShareResult | null> => {
    addFiles([file])
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
        const code = (e as { code?: number })?.code
        const traceId = (e as { traceId?: string })?.traceId ?? (e as { trace_id?: string })?.trace_id
        for (const task of pending) {
          if (task.status !== 'success') {
            failTask(task, msg, code, traceId)
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
    // presign 回调未接线 ⇒ 通道不可用（矩阵 <32MB 默认 presign，缺回调会直接抛
    // 'presign unavailable'）⇒ 视同关闭，落 direct/multi 既有分支。
    const presignAllowed = (opts.presignAllowed?.() ?? true) && !settings.e2e && typeof opts.presign === 'function'
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
        task.channel = 'direct'
        task.progress = 0
        task.error = ''
        task.statusText = t('upload.prepare')
        const ctrl = new AbortController()
        controllers.set(task.id, ctrl)
        // 速度 + ETA（设计 B3）：单文件直传的任务行状态文本随进度刷新。
        // 聚合批次（multi-direct/multi-chunk）是共享一个 HTTP 会话的聚合进度，
        // 分摊到行内的速度口径存疑 ⇒ Phase 1 不做（PR 描述已注明，Phase 2 任务化后补）。
        const meter = createSpeedMeter()
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
            meter.record(loaded)
            const bps = meter.speedBps()
            const eta = meter.etaSeconds(Math.max(total - loaded, 0))
            const { h, m, s } = formatEtaHms(eta ?? 0)
            task.statusText = eta === null
              ? t('upload.speedOnly', { speed: formatSpeed(bps) })
              : t('upload.speedEta', {
                  speed: formatSpeed(bps),
                  eta: h > 0
                    ? t('upload.etaHms', { h: String(h), m: String(m), s: String(s) })
                    : t('upload.etaMs', { m: String(m), s: String(s) }),
                })
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
        task.channel = 'presign'
        task.progress = 0
        task.error = ''
        task.statusText = t('upload.largeFileHint')
        let r: PresignCompleteData | undefined
        try {
          r = await opts.presign?.(task.file, settings)
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
          // 用户在失败块显式点「改用分片通道」（switchChannelError）**强制回退**
          // ——按钮只在非永久拒绝时展示，用户自担重传成本。
          const errCode = (e as { code?: number })?.code
            ?? (e as { response?: { data?: { code?: number } } })?.response?.data?.code
          if (isPresignFallbackEligible(errCode) || isSwitchChannelRequested(e)) {
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
          task.channel = 'multi-direct'
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

      // multi-chunk：逐文件分片上传（复用 chunk 通道任意大小能力），最后一次性绑定。
      // 断点续传（2026-11-03 Phase 2）：每文件先查任务记录拿续传坐标，服务端会话
      // 位图为准（getChunkStatus），缺片补传；坐标经任务 store 写穿 localStorage。
      multiAbort = new AbortController()
      const entries: Array<{ upload_id: string }> = []
      const store = opts.uploadTasks
      const recOf = new Map<string, string>()
      // 秒传早命中的直出结果（单文件路径；命中即免绑定）
      let quickResult: ShareResult | null = null
      for (const task of pending) {
        if (multiAbort.signal.aborted) throw new Error('Cancelled')
        task.status = 'uploading'
        task.channel = 'multi-chunk'
        task.progress = 0
        task.error = ''
        task.statusText = t('upload.uploading')

        // 指纹用**原始 file** 三元组（E2E payload 是密文，逐次加密字节不同，不能当指纹）
        const fingerprint = buildFingerprint(task.file)
        const prev = store?.findByFingerprint(fingerprint)
        const rec = prev ?? store?.create({
          fingerprint,
          fileName: task.file.name,
          fileSize: task.file.size,
          fileLastModified: task.file.lastModified,
          channel: 'multi-chunk',
          status: 'uploading',
          uploadedIndexes: [],
        })
        if (rec) recOf.set(task.id, rec.id)

        // 续传坐标只在「内容逐字节一致」时可信（payload === file ⇒ 未加密）。
        // E2E 每次 start() 都重新加密（新密钥/新 IV）⇒ 与旧会话的分片不是同一内容，
        // 续旧会话会拼出损坏密文 ⇒ 一律丢弃旧坐标、开新会话。
        const resumable = task.payload === task.file
        const chunkSize = (resumable ? prev?.chunkSize : undefined) ?? opts.chunkSize ?? DEFAULT_CHUNK_SIZE
        const prevUploadId = resumable ? prev?.uploadId : undefined
        const prevToken = resumable ? prev?.sessionToken : undefined
        if (rec) {
          store!.update(rec.id, {
            status: 'uploading',
            error: '',
            chunkSize,
            // 非可续传（E2E）⇒ 清旧坐标，避免下次误续到别的密文
            uploadId: prevUploadId,
            sessionToken: prevToken,
            uploadedIndexes: resumable ? prev?.uploadedIndexes ?? [] : [],
          })
        }

        // 服务端位图是唯一跳片判据（本地坐标可能滞后/会话已被清理）。
        // 探测失败/会话不在 ⇒ 无条件开新会话 + 全量传（绝不按本地坐标盲跳——
        // 新会话里这些分片并不存在，盲跳会拼出空洞文件）。
        const st = prevUploadId ? await getChunkStatus(prevUploadId, prevToken).catch(() => null) : null
        const uploaded = new Set<number>(st?.uploadedIndexes ?? [])
        // 已传坐标即时镜像（含首跑跳片 + 赛跑中断后的恢复输入）
        const uploadedNow = new Set<number>(uploaded)
        const totalChunks = Math.max(1, Math.ceil(task.payload.size / chunkSize))
        let writtenChunks = 0
        // 会话坐标即时落盘（init 成功即回传）——中途失败后凭它续传
        const firstSession: { uploadId?: string; sessionToken?: string } = {}
        const onSession = (s: { uploadId: string; sessionToken?: string }) => {
          firstSession.uploadId = s.uploadId
          firstSession.sessionToken = s.sessionToken
          if (rec) store!.update(rec.id, { uploadId: s.uploadId, sessionToken: s.sessionToken })
        }

        // 秒传早命中（2026-11-03 Phase 3）：单文件 + **确认登录**（D1 同用户去重，
        // 匿名探测必落空、白花两请求）+ 非 E2E（密文逐次不同，hash 恒新）时，
        // 上传与整文件 hash 赛跑：hash 先出 ⇒ 探秒传快速通道，命中即出码并
        // 中止冗余传输。多文件批次不探（multi-bind 无 share_code 合并形态）。
        const quickEligible = pending.length === 1 && opts.isLoggedIn?.() === true && task.payload === task.file
        const hashP = quickEligible
          ? hashFileSha256(task.payload, { signal: multiAbort.signal }).catch(() => null)
          : null

        try {
          const onChunkProgress = (loaded: number, total: number) => {
            task.progress = Math.round((loaded / Math.max(total, 1)) * 100)
            // 续传坐标写穿（节流：仅整片完成时写）。顺序上传 ⇒ 已完成=前缀 0..done-1
            const done = Math.min(Math.ceil(loaded / chunkSize), totalChunks)
            for (let i = writtenChunks; i < done; i++) uploadedNow.add(i)
            if (rec && done > writtenChunks) {
              store!.update(rec.id, {
                uploadedIndexes: Array.from({ length: done }, (_, i) => i),
              })
            }
            if (done > writtenChunks) writtenChunks = done
          }
          // 首跑：st 有活会话 ⇒ 跳 init 直接补缺片（Task 4 续传语义）；
          // 赛跑中断后的恢复跑：沿用首跑刚建/续的会话坐标 + 即时位图
          const startRun = (resume: boolean) => {
            const resumeId = resume ? firstSession.uploadId : st?.uploadId
            const token = resume ? firstSession.sessionToken : prevToken
            return chunkUploadFile(task.payload, newId(), chunkSize, onChunkProgress, multiAbort.signal, {
              uploaded: resume ? uploadedNow : uploaded,
              sessionToken: token,
              ...(resumeId ? { resumeSessionId: resumeId } : {}),
              onSession,
              // 暂停（Phase 3）：片间边界检查任务态，pause() 置 paused ⇒ 下一
              // 片前抛 'Paused' 停下（单片不打断）。坐标由 onChunkProgress 即时
              // 落盘，恢复走 resumeTask → startRun(true) 补缺片。
              shouldPause: () => task.status === 'paused',
            })
          }

          let run = startRun(false)
          // 被赛跑替换/中止的跑动也要有人接住拒绝（防 unhandled rejection）
          run.catch(() => {})

          if (hashP) {
            const winner = await Promise.race([run.then(() => null), hashP])
            if (winner) {
              // hash 先出：**先同步中止在途上传、再探测**——探测命中会真的建新分享，
              // 不先停传就存在「探测响应到达时上传恰好成享」的双分享竞态
              // （JS 单线程 ⇒ 检查与中止之间不可插入上传完成的处理）。
              multiAbort.abort()
              const probe = await chunkQuickProbe(task.payload, winner, chunkSize, multiOptions(wrappedKey)).catch(() => null)
              if (probe?.hit) {
                // 秒传命中：回收半途会话，直接以既有内容出码（免传分片）
                if (firstSession.uploadId) {
                  await chunkCancelSession(firstSession.uploadId, firstSession.sessionToken).catch(() => {})
                }
                task.status = 'success'
                task.progress = 100
                task.statusText = t('common.success')
                if (rec) {
                  store!.update(rec.id, {
                    status: 'success',
                    pickupCode: probe.shareCode,
                    shareUrl: probe.shareUrl || undefined,
                  })
                }
                ElMessage.success(`${task.file.name}: ${t('upload.dedupedSuccess')}`)
                quickResult = {
                  code: probe.shareCode!,
                  share_url: probe.shareUrl || '',
                  full_share_url: probe.shareUrl || '',
                  e2e_wrapped: undefined,
                  file_name: task.file.name,
                  has_password: !!settings.password,
                  pickup_code: probe.shareCode,
                  expire_style: settings.expire_style,
                  expire_value: settings.expire_value,
                }
                continue
              }
              // 落空：回收探测落空生成的空会话，按坐标恢复上传（只重传在途那一片）
              if (probe?.missSessionId) {
                await chunkCancelSession(probe.missSessionId).catch(() => {})
              }
              if (batchCancelled) throw new Error('Cancelled')
              multiAbort = new AbortController()
              run = startRun(true)
              run.catch(() => {})
            }
          }

          // 返回值=服务端会话主键（v0.11+ 以服务端返回为准，绑定按它合并）+ 会话令牌
          const { uploadId: sessionId, sessionToken } = await run
          // 绑定阶段提示（分片已传完、等待服务端合并）
          task.status = 'binding'
          task.progress = 100
          task.statusText = t('upload.prepare')
          entries.push({ upload_id: sessionId })
        } catch (e) {
          // 暂停（Phase 3）：片间边界抛 'Paused' ⇒ 保留续传坐标、任务落 paused，
          // 不走错误路径。恢复走 resumeTask → startRun(true) 补缺片。
          if (e instanceof Error && e.message === 'Paused') {
            task.status = 'paused'
            task.statusText = t('upload.paused')
            if (rec) {
              // 记录留 interrupted=可续传（坐标 uploadId/sessionToken 已写穿）
              store!.update(rec.id, { status: 'interrupted', error: '' })
            }
            return null
          }
          // 失败保留续传坐标（onSession 已写 uploadId/sessionToken）：
          // 记录留 error/interrupted，用户重试/重选同指纹文件即从断点继续
          if (rec) {
            const cancelled = e instanceof Error && (e.message === 'Cancelled' || e.message === 'Aborted')
            store!.update(rec.id, {
              status: cancelled ? 'interrupted' : 'error',
              error: e instanceof Error ? e.message : String(e),
            })
          }
          throw e
        }
      }
      // 秒传早命中已出码（单文件）：免绑定直接返回
      if (quickResult) return quickResult
      const result = await multiBind(entries, multiOptions(wrappedKey))
      for (const task of pending) {
        task.status = 'success'
        task.progress = 100
        task.statusText = t('common.success')
        // 成功收尾：记录留取件码/链接（clearFinished 可清；unfinished 不再含它）
        const rid = recOf.get(task.id)
        if (store && rid) {
          store.update(rid, {
            status: 'success',
            pickupCode: result.pickup_code || undefined,
            shareUrl: result.share_url || result.url,
          })
        }
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
        failTask(task, msg, tr.code ?? undefined,
          tr.traceId || (e as { traceId?: string })?.traceId || undefined)
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
    resumeTask,
    resumeFrom,
    pause,
    start,
    dispose,
  }
}

// MultiShareResult 仅作类型留存（multi 分支返回值映射用）
export type { MultiShareResult }
