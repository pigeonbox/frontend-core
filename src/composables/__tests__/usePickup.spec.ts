import { beforeEach, describe, expect, it, vi } from 'vitest'

// 被测模块依赖 element-plus（ElMessage/ElMessageBox 默认实现）——node 环境
// 全部以 deps 注入桩替代，这里 mock 掉模块避免真实加载
vi.mock('element-plus', () => ({
  ElMessage: { info: vi.fn() },
  ElMessageBox: { alert: vi.fn(), confirm: vi.fn() },
}))
vi.mock('vue-router', () => ({ useRouter: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/composables/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}))

vi.mock('@/api/anonymous', () => ({
  anonymousApi: { search: vi.fn(), retrieve: vi.fn() },
}))
vi.mock('@/api/federation', () => ({
  federationApi: { resolve: vi.fn() },
}))

import { anonymousApi } from '@/api/anonymous'
import { federationApi } from '@/api/federation'
import { usePickup } from '../usePickup'

const mockedSearch = vi.mocked(anonymousApi.search)
const mockedRetrieve = vi.mocked(anonymousApi.retrieve)
const mockedResolve = vi.mocked(federationApi.resolve)

// node 测试环境桩浏览器 location（联邦同源判断用）
const SELF_ORIGIN = 'https://self.example.com'
;(globalThis as { location?: unknown }).location = new URL(SELF_ORIGIN)

/** 组装全桩 deps：返回常用桩引用便于断言 */
function makeDeps() {
  const deps = {
    router: { push: vi.fn() },
    handleError: vi.fn(),
    recordPickup: vi.fn(),
    info: vi.fn(),
    alert: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(undefined),
    t: (k: string) => k,
    jumpExternal: vi.fn(),
  }
  return deps
}

const ok = <T>(data: T) => Promise.resolve({ code: 0, message: 'success', data, trace_id: '' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePickup（匿名取件状态机）', () => {
  it('Peek 无密码 → 直接取件，成功后记本机记录并跳结果页', async () => {
    mockedSearch.mockReturnValue(ok({ require_password: false }) as never)
    mockedRetrieve.mockReturnValue(
      ok({ file_name: 'a.txt', file_size: 3, content_type: 'text/plain', download_url: '/x', remaining_count: 1, expire_at: 0, require_password: false }) as never,
    )
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('ABC123')

    expect(mockedSearch).toHaveBeenCalledWith('ABC123')
    expect(mockedRetrieve).toHaveBeenCalledWith({ code: 'ABC123', password: undefined })
    expect(deps.recordPickup).toHaveBeenCalledWith({ code: 'ABC123', name: 'a.txt', size: 3 })
    expect(deps.router.push).toHaveBeenCalledTimes(1)
    expect(deps.router.push.mock.calls[0]?.[0]?.path).toBe('/retrieve/result')
    expect(ctl.phase.value).toBe('input')
  })

  it('Peek 要密码 → 进 needPassword 相位（不自动尝试密码），提交密码后取件', async () => {
    mockedSearch.mockReturnValue(ok({ require_password: true }) as never)
    mockedRetrieve.mockReturnValue(ok({ file_name: 'b.txt', file_size: 1, download_url: '/y' }) as never)
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('ABC123')
    expect(ctl.phase.value).toBe('needPassword')
    expect(deps.info).toHaveBeenCalled()
    expect(mockedRetrieve).not.toHaveBeenCalled()

    ctl.password.value = 'pw1'
    await ctl.confirmPassword()
    expect(mockedRetrieve).toHaveBeenCalledWith({ code: 'ABC123', password: 'pw1' })
    expect(deps.router.push).toHaveBeenCalledTimes(1)
    expect(ctl.phase.value).toBe('input')
  })

  it('Peek 失败（限流/网络）→ 静默降级直取件', async () => {
    mockedSearch.mockRejectedValue(new Error('network'))
    mockedRetrieve.mockReturnValue(ok({ file_name: 'c.txt' }) as never)
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('ABC123')
    expect(mockedRetrieve).toHaveBeenCalledTimes(1)
    expect(deps.handleError).not.toHaveBeenCalled()
  })

  it('取件未命中 + 联邦未接管 → 全局错误 toast，密码相位保留可重试', async () => {
    mockedSearch.mockReturnValue(ok({ require_password: true }) as never)
    mockedRetrieve.mockReturnValue({ code: 20003, message: '密码错误', data: null, trace_id: '' } as never)
    mockedResolve.mockReturnValue(ok({ available: false }) as never)
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('ABC123')
    expect(ctl.phase.value).toBe('needPassword')
    ctl.password.value = 'bad'
    await ctl.confirmPassword()
    expect(deps.handleError).toHaveBeenCalledTimes(1)
    // 密码错误留在 needPassword 相位，密码保留可重试
    expect(ctl.phase.value).toBe('needPassword')
    expect(ctl.password.value).toBe('bad')
  })

  it('404 形态未命中（reject）→ 联邦接管跳源节点，不再弹本地错误', async () => {
    mockedSearch.mockRejectedValue({ code: 404, message: 'not found' })
    mockedResolve.mockReturnValue(
      ok({ available: true, url: 'https://node-b.example.com', name: '节点B' }) as never,
    )
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('abc123')
    expect(deps.confirm).toHaveBeenCalledTimes(1)
    expect(deps.jumpExternal).toHaveBeenCalledWith('https://node-b.example.com/#/retrieve?code=abc123')
    expect(deps.handleError).not.toHaveBeenCalled()
  })

  it('设备直传占位 url（direct.invalid）→ 弹 alert 引导设备端接收', async () => {
    mockedRetrieve.mockReturnValue({ code: 404, message: 'not found', data: null, trace_id: '' } as never)
    mockedResolve.mockReturnValue(ok({ available: true, url: 'peer://device', name: '设备' }) as never)
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('XYZ789')
    expect(deps.alert).toHaveBeenCalledTimes(1)
    expect(deps.jumpExternal).not.toHaveBeenCalled()
    expect(deps.handleError).not.toHaveBeenCalled()
  })

  it('联邦 url 指向本站 → 视为公告残留，回落本地错误', async () => {
    mockedRetrieve.mockReturnValue({ code: 404, message: 'not found', data: null, trace_id: '' } as never)
    mockedResolve.mockReturnValue(ok({ available: true, url: SELF_ORIGIN, name: 'self' }) as never)
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('ABC123')
    expect(deps.jumpExternal).not.toHaveBeenCalled()
    expect(deps.handleError).toHaveBeenCalledTimes(1)
  })

  it('cancelPassword 回输入态并清密码', async () => {
    mockedSearch.mockReturnValue(ok({ require_password: true }) as never)
    const deps = makeDeps()
    const ctl = usePickup(deps)

    await ctl.submit('ABC123')
    expect(ctl.phase.value).toBe('needPassword')
    ctl.password.value = 'x'
    ctl.cancelPassword()
    expect(ctl.phase.value).toBe('input')
    expect(ctl.password.value).toBe('')
  })

  it('submitting 相位期间重复 submit 被忽略', async () => {
    mockedSearch.mockReturnValue(ok({ require_password: false }) as never)
    let resolveRetrieve!: (v: unknown) => void
    mockedRetrieve.mockImplementation(
      () => new Promise((resolve) => { resolveRetrieve = resolve }) as never,
    )
    const deps = makeDeps()
    const ctl = usePickup(deps)

    const first = ctl.submit('ABC123')
    const second = ctl.submit('ABC123')
    // 等 #1 推进到 retrieve 挂起，再断言 #2 被 inFlight 闸掉
    await vi.waitFor(() => expect(mockedRetrieve).toHaveBeenCalledTimes(1))
    expect(mockedRetrieve).toHaveBeenCalledTimes(1)
    resolveRetrieve({ code: 0, message: 'ok', data: { file_name: 'x' } })
    await Promise.all([first, second])
  })
})
