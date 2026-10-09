import { onMounted, onBeforeUnmount } from 'vue'

/**
 * 定时轮询（2026-10-06 W3 收敛 NotifyBell/通知未读数/admin Dashboard 三处手写 setInterval）：
 * 挂载启动、卸载清理、页面隐藏时暂停（回到前台立即补一次），避免后台标签页空转。
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number) {
  let timer: number | undefined
  let stopped = true

  const tick = () => {
    void Promise.resolve(fn()).catch(() => { /* 轮询错误由调用方自理 */ })
  }

  const start = () => {
    if (!stopped) return
    stopped = false
    timer = window.setInterval(tick, intervalMs)
  }

  const stop = () => {
    stopped = true
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  const onVisibility = () => {
    if (document.hidden) {
      stop()
    } else {
      tick() // 回前台立即补一次
      start()
    }
  }

  onMounted(() => {
    start()
    document.addEventListener('visibilitychange', onVisibility)
  })

  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { start, stop }
}
