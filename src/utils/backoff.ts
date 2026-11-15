/**
 * 弱网退避（2026-11-16 · frontend-core#94）。
 *
 * 下载断点续传（utils/downloader.ts）与请求层幂等重试（utils/request.ts）
 * 共用同一口径：指数增长 + 半区间抖动（half-jitter）——
 *   delay = exp/2 + rng() * exp/2，其中 exp = min(BASE * 2^(attempt-1), CAP)
 * 抖动用半区间而非 full-jitter：下限仍有退避意义（不至于 0ms 连打），
 * 上限被 CAP 钳住（断网 30s 恢复场景必须能覆盖到）。
 *
 * rng 可注入 ⇒ 单测用确定性函数断言边界，不碰 Math.random。
 */

/** 首次重试前的基础退避（毫秒） */
export const RETRY_BASE_MS = 1000
/** 单次退避上限（毫秒） */
export const RETRY_CAP_MS = 15000

/**
 * 第 attempt 次重试（attempt 从 1 起）的等待毫秒数。
 * rng() ∈ [0,1]，缺省 Math.random；测试注入 () => 0 / () => 1 取上下界。
 */
export function retryDelayMs(attempt: number, rng: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt))
  const exp = Math.min(RETRY_BASE_MS * 2 ** (n - 1), RETRY_CAP_MS)
  return Math.round(exp / 2 + rng() * (exp / 2))
}

/** 等待 ms 毫秒；signal 中止则立即抛 AbortError（不拖着重试尾巴） */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
