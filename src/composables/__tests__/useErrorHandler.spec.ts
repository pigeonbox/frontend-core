import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 的 te() 只认识这些键（模拟真实语言包）——必须用 vi.hoisted，否则
// mock 工厂（随 import 提升执行）会撞上 const 的暂时性死区。
const { KNOWN } = vi.hoisted(() => ({
  KNOWN: new Set([
    'common.errorTitle',
    'common.failed',
    'error.forbidden',
    'error.unauthorized',
    'errcode.20005',
  ]),
}))

// useErrorHandler 依赖 useI18n（组件 setup 内使用），单测中 mock。
// ⚠️ te() 必须 mock：缺键时 vue-i18n **返回键名本身**（非空串）⇒ `t(k) || fallback`
// 是死代码 ⇒ 真实实现用 te() 判存在性（2026-10-26 审计 P2）。
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, te: (k: string) => KNOWN.has(k) }),
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

  // ───────────────────────────────────────────────────────────────────────────
  // 错误 toast **标题**分支（2026-10-26 审计 P2 · 缺陷 8）
  //
  // 此前标题按 `e instanceof BizError` 分支，而 BizError **从未被抛出**
  // （request.ts 真正 reject 的是普通对象 {code, message, trace_id}）⇒ 该分支
  // 恒为假 ⇒ 标题恒为 common.failed，注释里声称的 common.errorTitle 从未生效。
  // ⇒ 删掉不可达分支后，标题统一为 common.errorTitle（**真的可达**）。
  // ───────────────────────────────────────────────────────────────────────────
  it('后端业务错误形态 {code,message,trace_id} 的 toast 标题必须是 common.errorTitle', async () => {
    const { handleError } = useErrorHandler()
    const seen = fireToast()
    handleError({ code: 403, message: 'x', trace_id: '' })
    const event = await seen
    expect(event.detail.title, '业务错误标题应为 common.errorTitle').toBe('common.errorTitle')
    expect(event.detail.message, '403 应映射到 error.forbidden').toBe('error.forbidden')
  })

  it('普通 Error 的 toast 标题同样走 common.errorTitle（不再是恒定 common.failed）', async () => {
    const { handleError } = useErrorHandler()
    const seen = fireToast()
    handleError(new Error('boom'))
    const event = await seen
    expect(event.detail.title).toBe('common.errorTitle')
  })

  it('显式传入的 title 优先（不得被统一标题覆盖）', async () => {
    const { handleError } = useErrorHandler()
    const seen = fireToast()
    handleError(new Error('boom'), { title: '我的标题' })
    const event = await seen
    expect(event.detail.title).toBe('我的标题')
  })

  it('缺键时用 fallback 而不是裸键名（te() 判存在性）', () => {
    const { translateOnly } = useErrorHandler()
    // 20005 在 mock 的 KNOWN 集合里 ⇒ 走 i18n 键
    expect(translateOnly({ code: 20005, message: 'raw', trace_id: '' })).toBe('errcode.20005')
    // 99999 不在集合里 ⇒ 没有 i18n 键 ⇒ 走后端原文
    expect(translateOnly({ code: 99999, message: 'raw', trace_id: '' })).toBe('raw')
  })
})
