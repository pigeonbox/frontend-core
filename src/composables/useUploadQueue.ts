import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { pickUploadPlan } from '@/composables/useUploadPlan'
import { uploadFile } from '@/api/share'
import { multiDirect, chunkUploadFile, multiBind, type MultiShareOptions, type MultiShareResult } from '@/api/multifile'
import type { PresignCompleteData } from '@/api/presign'
import { generateKeyB64, encryptFile } from '@/utils/e2e'
import type { ShareSettings } from '@/composables/useShareSettings'
import type { ShareResult } from '@/types/share'

/**
 * 上传队列状态机（2026-10-06 W2 自 FileUpload.vue 抽出的编排层）。
 * E2E 预加密 → pickUploadPlan 通道决策 → 执行 → 任务行进度/状态。
 * UI 提示直接用 ElMessage（现状即如此）；i18n 文案经 opts.t 注入（composable 可脱离组件单测）。
 */

export type UploadTaskStatus = 'pending' | 'encrypting' | 'uploading' | 'binding' | 'success' | 'error'

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
  t: (key: string) => string
  bodyCap?: () => number
  presignThreshold?: number | (() => number)
  /** 匿名直传是否开放（后端 presign.anonymous_enabled 下发；false 时 >阈值 文件回退分片中转） */
  presignAllowed?: () => boolean
  chunkSize?: number
  presign?: (file: File, settings: ShareSettings) => Promise<PresignCompleteData>
  /** 登录态注入（custom_code 仅登录时发送；默认视为登录） */
  isLoggedIn?: () => boolean
}) {
  const { settings, t } = opts

  const tasks = ref<UploadTask[]>([])
  // 单文件直传的中断控制器（multi 用共享 controller）
  const controllers = new Map<string, AbortController>()
  let multiAbort: AbortController | null = null

  const isUploading = computed(() => tasks.value.some((f) => f.status === 'uploading' || f.status === 'encrypting' || f.status === 'binding'))
  const canStart = computed(
    () => tasks.value.length > 0 && tasks.value.some((f) => f.status === 'pending' || f.status === 'error')
  )

  const newId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const addFiles = (files: File[] | FileList) => {
    for (const f of Array.from(files)) {
      tasks.value.push({
        id: newId(),
        file: f,
        payload: f,
        status: 'pending',
        progress: 0,
        statusText: '',
        error: '',
      })
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
    if (multiAbort) {
      multiAbort.abort()
    }
    task.status = 'error'
    task.error = t('upload.presign.abort')
    task.statusText = ''
  }

  const dispose = () => {
    controllers.forEach((c) => c.abort())
    controllers.clear()
    multiAbort?.abort()
    multiAbort = null
  }

  const multiOptions = (): MultiShareOptions => ({
    expire_value: settings.expire_value,
    expire_style: settings.expire_style,
    require_auth: settings.require_auth,
    password: settings.password,
    encrypted: settings.e2e,
    // 统一为登录才发（原 multi 路径无条件发送，对齐 single 路径与后端 v0.11.1 语义）
    custom_code: opts.isLoggedIn?.() ?? true ? settings.custom_code || undefined : undefined,
  })

  const start = async (): Promise<ShareResult | null> => {
    const pending = tasks.value.filter((f) => f.status === 'pending' || f.status === 'error')
    if (pending.length === 0) return null
    for (const task of pending) {
      if (task.status === 'error') {
        task.status = 'pending'
        task.error = ''
      }
    }

    // E2E：单密钥 + 逐文件预加密（密文作为实际上传内容）
    let e2eKey = ''
    if (settings.e2e) {
      const tooBig = pending.filter((f) => f.file.size > E2E_MAX_BYTES)
      if (tooBig.length > 0) {
        ElMessage.error(t('upload.e2e.tooLarge'))
        return null
      }
      try {
        e2eKey = await generateKeyB64()
        for (const task of pending) {
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
        return null
      }
    }

    // 通道决策（用原始文件大小——钉现状）
    const totalBytes = pending.reduce((s, f) => s + f.file.size, 0)
    const maxFileBytes = Math.max(...pending.map((f) => f.file.size))
    // 匿名直传开关：后端下发 false 时， presign 通道不参与决策（>阈值 落 multi-chunk）
    const presignAllowed = opts.presignAllowed?.() ?? true
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
            custom_code: opts.isLoggedIn?.() ?? true ? settings.custom_code || undefined : undefined,
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
        ElMessage.success(`${task.file.name}: ${t('upload.success')}`)
        return {
          code: res.code,
          share_url: res.url,
          full_share_url: res.url,
          e2e_key: settings.e2e ? e2eKey : undefined,
          file_name: task.file.name,
          has_password: !!settings.password,
          pickup_code: res.pickup_code || undefined,
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
          r = await opts.presign?.(task.file, settings)
          if (!r) throw new Error('presign unavailable')
        } catch (e) {
          // 匿名直传被管理开关关闭(10015)：静默回退分片中转（大文件仍可传）
          if ((e as { code?: number }).code === 10015
            || (e as { response?: { data?: { code?: number } } })?.response?.data?.code === 10015) {
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
            e2e_key: settings.e2e ? e2eKey : undefined,
            file_name: task.file.name,
            has_password: !!settings.password,
            pickup_code: r.pickup_code || undefined,
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
          multiOptions(),
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
          e2e_key: settings.e2e ? e2eKey : undefined,
          file_name: pending.length === 1 ? pending[0]!.file.name : undefined,
          has_password: !!settings.password,
          pickup_code: result.pickup_code || undefined,
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
      const result = await multiBind(entries, multiOptions())
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
        e2e_key: settings.e2e ? e2eKey : undefined,
        file_name: pending.length === 1 ? pending[0]!.file.name : undefined,
        has_password: !!settings.password,
        pickup_code: result.pickup_code || undefined,
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed'
      for (const task of pending) {
        if (task.status !== 'success') {
          task.status = 'error'
          task.error = msg
        }
      }
      ElMessage.error(msg)
      return null
    } finally {
      multiAbort = null
    }
  }

  return {
    tasks: tasks as Ref<UploadTask[]>,
    isUploading: isUploading as ComputedRef<boolean>,
    canStart: canStart as ComputedRef<boolean>,
    addFiles,
    remove,
    cancel,
    start,
    dispose,
  }
}

// MultiShareResult 仅作类型留存（multi 分支返回值映射用）
export type { MultiShareResult }
