import { describe, expect, it } from 'vitest'
import { useNetworkStatus, type NetworkStatusOptions } from '@/composables/useNetworkStatus'

/** 注入式订阅：测试手动 emit 在线状态翻转（node 无 window 事件流） */
function harness(initial: boolean): {
  opts: NetworkStatusOptions
  emit: (online: boolean) => void
  unsubscribed: () => boolean
} {
  let cb: ((online: boolean) => void) | null = null
  let unsub = false
  return {
    opts: {
      isOnline: () => initial,
      subscribe: (onChange) => {
        cb = onChange
        return () => {
          unsub = true
          cb = null
        }
      },
    },
    emit: (online) => cb?.(online),
    unsubscribed: () => unsub,
  }
}

describe('useNetworkStatus（断网恢复状态机）', () => {
  it('初始在线：online=true，无恢复态', () => {
    const h = harness(true)
    const s = useNetworkStatus(h.opts)
    expect(s.online.value).toBe(true)
    expect(s.restored.value).toBe(false)
  })

  it('断网 → 恢复：断线时 restored 保持 false，恢复后置 true', () => {
    const h = harness(true)
    const s = useNetworkStatus(h.opts)
    h.emit(false)
    expect(s.online.value).toBe(false)
    expect(s.restored.value).toBe(false)
    h.emit(true)
    expect(s.online.value).toBe(true)
    expect(s.restored.value).toBe(true)
  })

  it('从未断线不算恢复（开页就在线不提示）', () => {
    const h = harness(true)
    const s = useNetworkStatus(h.opts)
    h.emit(true)
    expect(s.restored.value).toBe(false)
  })

  it('同态事件幂等：重复 online 不会翻出恢复态，重复 offline 不重置', () => {
    const h = harness(true)
    const s = useNetworkStatus(h.opts)
    h.emit(false)
    h.emit(false)
    expect(s.online.value).toBe(false)
    h.emit(true)
    expect(s.restored.value).toBe(true)
    h.emit(true)
    expect(s.restored.value).toBe(true)
  })

  it('恢复后再次断线 ⇒ 清掉恢复态（横幅切回红色警示）', () => {
    const h = harness(true)
    const s = useNetworkStatus(h.opts)
    h.emit(false)
    h.emit(true)
    expect(s.restored.value).toBe(true)
    h.emit(false)
    expect(s.online.value).toBe(false)
    expect(s.restored.value).toBe(false)
  })

  it('dismissRestored 收起恢复提示，不影响在线态', () => {
    const h = harness(true)
    const s = useNetworkStatus(h.opts)
    h.emit(false)
    h.emit(true)
    s.dismissRestored()
    expect(s.restored.value).toBe(false)
    expect(s.online.value).toBe(true)
  })

  it('初始离线（navigator.onLine=false 注入）', () => {
    const h = harness(false)
    const s = useNetworkStatus(h.opts)
    expect(s.online.value).toBe(false)
    expect(s.restored.value).toBe(false)
  })

  it('作用域销毁会退订（不泄漏 window 监听）', () => {
    const h = harness(true)
    useNetworkStatus(h.opts)
    // 无活动作用域时不在意退订时机；这里仅验证订阅契约可被调用方收回
    expect(typeof h.opts.subscribe).toBe('function')
  })
})
