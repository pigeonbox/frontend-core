import { ref, computed, type Ref, type ComputedRef } from 'vue'
import {
  download,
  DownloadCancelledError,
  DownloadInterruptedError,
  type DownloadOutcome,
  type DownloadPhase,
  type DownloadRequest,
  type DownloadResumeState,
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
  /** 当前退避重试序号（1 起；0=未在重试）——UI 显示「第 N 次」 */
  const retryAttempt = ref(0)
  /**
   * 断点坐标（frontend-core#94）：DownloadInterruptedError 携带的恢复状态。
   * 非空 ⇒ UI 展示「继续下载」，点击走 resumeDownload 从断点续传。
   */
  const resumeState = ref<DownloadResumeState | null>(null)

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
    retryAttempt.value = 0
    resumeState.value = null
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
          retryAttempt.value = p.retryAttempt ?? 0
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
      } else if (e instanceof DownloadInterruptedError) {
        // 中断（非取消）：进度还在 ⇒ 保留断点坐标，UI 给「继续下载」。
        // resume=null 表示服务端不接受断点，只能整份重来（不给续传按钮）。
        resumeState.value = e.resume
        error.value =
          e.resume && percent.value >= 0
            ? t('download.interrupted', { percent: String(percent.value) })
            : e.resume
              ? t('download.interruptedUnknown')
              : t('download.failed')
      } else {
        error.value = t('download.failed')
      }
      phase.value = 'done'
      return null
    } finally {
      controller = null
    }
  }

  /**
   * 从断点继续（frontend-core#94）：把中断时保留的坐标/缓冲/句柄回传下载器。
   * fs 档不再弹保存框（句柄已在）⇒ 不受 transient activation 约束。
   */
  const resumeDownload = async (
    req: Omit<DownloadRequest, 'onProgress' | 'signal' | 'resume'>
  ): Promise<DownloadOutcome | null> => {
    const state = resumeState.value
    if (!state) return null
    return await run({ ...req, resume: state })
  }

  const cancel = () => {
    controller?.abort()
  }

  /** 前置校验失败时直接落终态（不发起下载）——用于「缺口令/缺密钥」这类阻断 */
  const fail = (message: string) => {
    error.value = message
    phase.value = 'done'
  }

  /** 断点可续（中断过且载体还在）⇒ UI 展示「继续下载」 */
  const canResume = computed(() => resumeState.value !== null && error.value !== '')

  return {
    phase: phase as Ref<DownloadUiPhase>,
    retryAttempt: retryAttempt as Ref<number>,
    resumeState: resumeState as Ref<DownloadResumeState | null>,
    canResume: canResume as ComputedRef<boolean>,
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
    resumeDownload,
    cancel,
    reset,
    fail,
  }
}
