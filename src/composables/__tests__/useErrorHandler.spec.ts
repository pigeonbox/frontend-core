import { describe, it, expect, vi, beforeEach } from 'vitest'

// useErrorHandler 依赖 useI18n（组件 setup 内使用），单测中 mock
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))
// ElMessage 仅允许成功类提示使用；错误通道断言其不被调用（防双 toast 回归）
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

import { ElMessage } from 'element-plus'
import { useErrorHandler } from '../useErrorHandler'

// node 测试环境装最小 window 桩（composable 用 window.dispatchEvent 派发 toast）
beforeEach(() => {
  if (!(globalThis as { window?: unknown }).window) {
    ;(globalThis as { window: unknown }).window = new EventTarget()
  }
})

const fireToast = (): Promise<CustomEvent> =>
  new Promise((resolve) => {
    const handler = (e: Event) => {
      window.removeEventListener('app:error-toast', handler)
      resolve(e as CustomEvent)
    }
    window.addEventListener('app:error-toast', handler)
  })

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handleError：恰好派发一次 app:error-toast（单发，无 ElMessage 双弹）', async () => {
    const { handleError } = useErrorHandler()
    const seen = fireToast()
    handleError(new Error('boom'))
    const event = await seen
    expect(event.detail.level).toBe('error')
    expect(event.detail.message).toBe('boom')
    expect(event.detail.traceId).toBe('')
    expect(ElMessage.error).not.toHaveBeenCalled()
    // 给潜在的双发留观察窗口
    await new Promise((r) => setTimeout(r, 20))
    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledTimes(0)
  })

  it('translateOnly：仅取文案不弹 toast', () => {
    const { translateOnly } = useErrorHandler()
    expect(translateOnly(new Error('x'))).toBe('x')
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('silent 模式：不派发 toast，仅 console 记录', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handleError } = useErrorHandler()
    let dispatched = 0
    const handler = () => dispatched++
    window.addEventListener('app:error-toast', handler)
    handleError(new Error('quiet'), { silent: true })
    window.removeEventListener('app:error-toast', handler)
    expect(dispatched).toBe(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
