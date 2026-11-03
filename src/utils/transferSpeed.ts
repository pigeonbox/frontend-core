/**
 * 传输速度/ETA（2026-11-03 设计 B3）：滑动窗口测速纯函数。
 *
 * 取「窗口内首尾样本差分」而非瞬时值：xhr progress 回调粒度抖动大，
 * 瞬时值会疯狂跳动；窗口默认 5s（设计稿口径），兼顾响应速度与稳定。
 * loadedBytes 是**累计**字节（与 xhr progress 的 loaded 同口径）。
 */
export interface SpeedMeter {
  /** 记录一个累计字节样本（at 缺省 Date.now()，可注入假时钟便于单测） */
  record(loadedBytes: number, at?: number): void
  /** 窗口内平均字节/秒；样本不足或 dt=0 返回 0 */
  speedBps(): number
  /** 剩余秒数；速度未知或非正（含倒退异常）返回 null——不猜 */
  etaSeconds(remainingBytes: number): number | null
  reset(): void
}

export function createSpeedMeter(windowMs = 5_000, minSamples = 2): SpeedMeter {
  let samples: { at: number; bytes: number }[] = []
  const speedBps = (): number => {
    if (samples.length < minSamples) return 0
    const first = samples[0]!
    const last = samples[samples.length - 1]!
    const dtMs = last.at - first.at
    if (dtMs <= 0) return 0
    return ((last.bytes - first.bytes) * 1000) / dtMs
  }
  return {
    record(loadedBytes: number, at: number = Date.now()) {
      samples.push({ at, bytes: loadedBytes })
      // 只保留窗口内的样本（差分起点必须在窗口内——窗口前的旧字节基线会
      // 污染速度：变速后按「旧段字节+新段字节」差分得不出近期速度）
      const cutoff = at - windowMs
      let i = 0
      while (i < samples.length - 1 && samples[i]!.at < cutoff) i++
      samples = samples.slice(i)
    },
    speedBps,
    etaSeconds(remainingBytes: number): number | null {
      const bps = speedBps()
      return bps > 0 ? remainingBytes / bps : null
    },
    reset() {
      samples = []
    },
  }
}

/** 人读速度（B/s、KB/s、MB/s 三档；非正值返回占位 —） */
export function formatSpeed(bps: number): string {
  if (!(bps > 0)) return '—'
  if (bps < 1000) return `${Math.round(bps)} B/s`
  if (bps < 1_000_000) return `${Math.round(bps / 1000)} KB/s`
  return `${(bps / 1_000_000).toFixed(1)} MB/s`
}

/** ETA 秒数拆 h/m/s（文案拼装走 i18n，这里只拆数；负值归零） */
export function formatEtaHms(seconds: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.round(seconds))
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  }
}
