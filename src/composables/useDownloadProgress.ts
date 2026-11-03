import { ref, computed, type Ref, type ComputedRef } from 'vue'
import {
  download,
  DownloadCancelledError,
  type DownloadOutcome,
  type DownloadPhase,
  type DownloadRequest,
} from '@/utils/downloader'

/**
 * UI 侧的阶段：**'idle' = 还没开始**（下载器自身的 'preparing' 是「已开始、在准备」）。
 * 两者混用一个值会让按钮在空闲时也显示成 loading ⇒ 这里单独拆一层。
 */
export type DownloadUiPhase = DownloadPhase | 'idle'

/**
 * 单个下载任务的进度状态（2026-11-03）。
 *
 * 每个下载按钮各持一份 ⇒ 多文件分享时各行进度互不干扰。
 * 错误文案走 i18n（t 由调用方注入，composable 可脱离组件单测）。
 */
export function useDownloadProgress(t: (key: string, params?: Record<string, string>) => string) {
  const phase = ref<DownloadUiPhase>('idle')
  const percent = ref(-1)
  const loaded = ref(0)
  const total = ref(0)
  const bytesPerSecond = ref(0)
  const etaSeconds = ref<number | null>(null)
  const error = ref('')
  const handedOff = ref(false)
  /** 原始错误对象（供调用方按错误码细分文案，如管理台的 401 ⇒ 会话已过期） */
  const lastError = ref<unknown>(null)

  let controller: AbortController | null = null

  /** 进行中（preparing~saving 区间都算忙；idle 不算） */
  const busy = computed(
    () => phase.value !== 'idle' && phase.value !== 'done' && phase.value !== 'handed-off' && error.value === ''
  )

  const reset = () => {
    phase.value = 'idle'
    percent.value = -1
    loaded.value = 0
    total.value = 0
    bytesPerSecond.value = 0
    etaSeconds.value = null
    error.value = ''
    handedOff.value = false
    lastError.value = null
    controller = null
  }

  const run = async (
    req: Omit<DownloadRequest, 'onProgress' | 'signal'>
  ): Promise<DownloadOutcome | null> => {
    reset()
    controller = new AbortController()
    try {
      const out = await download({
        ...req,
        signal: controller.signal,
        onProgress: (p) => {
          phase.value = p.phase
          percent.value = p.percent
          loaded.value = p.loaded
          total.value = p.total
          bytesPerSecond.value = p.bytesPerSecond
          etaSeconds.value = p.etaSeconds
        },
      })
      handedOff.value = out.handedOff
      // 终态由 composable 自己定（不依赖下载器的最后一次 onProgress 上报）：
      // 成功 ⇒ done / handed-off。降级到浏览器原生下载时页面内没有 %。
      phase.value = out.handedOff ? 'handed-off' : 'done'
      return out
    } catch (e: unknown) {
      lastError.value = e
      if (e instanceof DownloadCancelledError || (e as { code?: number })?.code === -1) {
        error.value = t('download.cancelled')
      } else {
        error.value = t('download.failed')
      }
      phase.value = 'done'
      return null
    } finally {
      controller = null
    }
  }

  const cancel = () => {
    controller?.abort()
  }

  /** 前置校验失败时直接落终态（不发起下载）——用于「缺口令/缺密钥」这类阻断 */
  const fail = (message: string) => {
    error.value = message
    phase.value = 'done'
  }

  return {
    phase: phase as Ref<DownloadUiPhase>,
    percent: percent as Ref<number>,
    loaded: loaded as Ref<number>,
    total: total as Ref<number>,
    bytesPerSecond: bytesPerSecond as Ref<number>,
    etaSeconds: etaSeconds as Ref<number | null>,
    error: error as Ref<string>,
    lastError: lastError as Ref<unknown>,
    handedOff: handedOff as Ref<boolean>,
    busy: busy as ComputedRef<boolean>,
    run,
    cancel,
    reset,
    fail,
  }
}
