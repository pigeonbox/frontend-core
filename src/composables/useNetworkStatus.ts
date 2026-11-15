import { ref, onScopeDispose, getCurrentScope, type Ref } from 'vue'

/**
 * 断网状态机（frontend-core#94 · 上传/下载弱网可见性）。
 *
 * 语义：
 * - online：当前是否在线（浏览器 online/offline 事件驱动）；
 * - restored：**曾断过线后又恢复**的瞬时态——开页就在线不算恢复，不打扰用户；
 * - 同态事件幂等（重复 online 不会把 restored 再翻一次）。
 *
 * 测试经 isOnline/subscribe 注入驱动（node 无 window 事件流）；
 * 真实现挂 window 的 online/offline 监听，随组件作用域自动退订。
 */
export interface NetworkStatusOptions {
  /** 初始在线状态（缺省读 navigator.onLine；无 navigator 时按在线处理） */
  isOnline?: () => boolean
  /** 订阅在线变化，返回退订函数（缺省挂 window online/offline 事件） */
  subscribe?: (onChange: (online: boolean) => void) => () => void
}

function defaultSubscribe(onChange: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const on = () => onChange(true)
  const off = () => onChange(false)
  window.addEventListener('online', on)
  window.addEventListener('offline', off)
  return () => {
    window.removeEventListener('online', on)
    window.removeEventListener('offline', off)
  }
}

export function useNetworkStatus(opts: NetworkStatusOptions = {}) {
  const readInitial = (): boolean => {
    if (opts.isOnline) return opts.isOnline()
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine
    }
    return true
  }

  const online = ref(readInitial())
  /** 断过线才叫「恢复」（开页在线不算） */
  const wasOffline = ref(false)
  /** 恢复瞬时态：UI 弹「网络已恢复」，dismissRestored 或再次断线时清 */
  const restored = ref(false)

  const apply = (next: boolean) => {
    if (next === online.value) return
    online.value = next
    if (!next) {
      wasOffline.value = true
      restored.value = false
    } else if (wasOffline.value) {
      restored.value = true
      wasOffline.value = false
    }
  }

  const unsubscribe = (opts.subscribe ?? defaultSubscribe)(apply)
  if (getCurrentScope()) onScopeDispose(() => unsubscribe())

  const dismissRestored = () => {
    restored.value = false
  }

  return {
    online: online as Ref<boolean>,
    restored: restored as Ref<boolean>,
    dismissRestored,
  }
}
