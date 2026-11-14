// user store 会话/角色状态机的三条覆盖缺口（2026-11-14 前端审计 → frontend-core#95/#97/#98）。
//
//   #95 applyExternalSession 必须把登录态灌进 store（OIDC 回调成功后 isLoggedIn
//       为真——否则 Dashboard onMounted 判未登录，把刚登录的用户弹回登录页）；
//   #97 fetchUserInfo 失败 → logout 的清理路径此前零覆盖（登出是最敏感的分支：
//       把业务 401 误入 catch 清会话 ⇒ 用户被莫名登出，CI 无感知）；
//   #98 login() 成功必须与 applyExternalSession 同口径写 userRole（写点收口：
//       普通登录不写 / 换号残留 admin 标记两条触发路径）。
//
// node 环境无 localStorage ⇒ 按 contractWire.spec.ts 同款桩一个。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/request', () => ({ request: vi.fn(), default: { interceptors: {} } }))
vi.mock('@/api/_xhr', () => ({ xhrSend: vi.fn(), xhrRaw: vi.fn() }))
// post 必须返回 Promise：logout() 是 axios.post(...).catch(...) 链式调用，
// 裸 vi.fn() 返回 undefined ⇒ TypeError('reading catch')（frontend-core#97 复现）
vi.mock('axios', () => ({ default: { post: vi.fn(() => Promise.resolve({ data: {} })) } }))
vi.mock('@/api/user', () => ({ userApi: { login: vi.fn(), getUserInfo: vi.fn() } }))

import axios from 'axios'
import { userApi } from '@/api/user'
import { useUserStore } from '@/stores/user'
import type { UserInfo } from '@/types/user'

const mem = new Map<string, string>()

const stubUser = (role?: string): UserInfo => ({
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  nickname: 'Alice',
  avatar: '',
  status: 1,
  created_at: '2026-11-14T00:00:00Z',
  ...(role ? { role } : {}),
})

beforeEach(() => {
  vi.clearAllMocks()
  mem.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  }
  setActivePinia(createPinia())
})

describe('#95 applyExternalSession：登录态进 store（OIDC 回调后不被弹回）', () => {
  it('灌入 userInfo 后 isLoggedIn 为真 + 会话标记双写', () => {
    const store = useUserStore()
    expect(store.isLoggedIn).toBe(false)
    store.applyExternalSession(stubUser('user'))
    expect(store.isLoggedIn).toBe(true)
    expect(localStorage.getItem('fcb_session')).toBe('1')
    expect(store.userInfo?.username).toBe('alice')
  })

  it('applyExternalSession 写 userRole（OIDC/admin 登录与 login() 同一口径）', () => {
    const store = useUserStore()
    store.applyExternalSession(stubUser('admin'))
    expect(localStorage.getItem('userRole')).toBe('admin')
  })
})

describe('#97 fetchUserInfo 失败 → logout（此前零覆盖）', () => {
  it('getUserInfo 抛错：userInfo/sessionActive/userRole 清空 + 注销请求发出', async () => {
    const store = useUserStore()
    store.applyExternalSession(stubUser('admin'))
    vi.mocked(userApi.getUserInfo).mockRejectedValueOnce(new Error('boom'))

    await store.fetchUserInfo()

    expect(store.userInfo).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(localStorage.getItem('fcb_session')).toBeNull()
    expect(localStorage.getItem('userRole')).toBeNull()
    const post = vi.mocked(axios.post)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe('/api/v1/user/logout')
  })

  it('正向：getUserInfo 成功填充 userInfo', async () => {
    const store = useUserStore()
    store.markSessionActive()
    vi.mocked(userApi.getUserInfo).mockResolvedValueOnce({
      code: 200,
      message: 'ok',
      data: stubUser('user'),
    } as never)

    await store.fetchUserInfo()

    expect(store.userInfo?.username).toBe('alice')
    expect(store.isLoggedIn).toBe(true)
  })

  it('无会话时不发请求（早退路径）', async () => {
    const store = useUserStore()
    await store.fetchUserInfo()
    expect(userApi.getUserInfo).not.toHaveBeenCalled()
  })
})

describe('#98 login 成功统一写 userRole（写点收口到 applyExternalSession）', () => {
  it('登录载荷带 role ⇒ userRole 写入（普通账号覆盖残留 admin 标记）', async () => {
    localStorage.setItem('userRole', 'admin') // 换号残留
    const store = useUserStore()
    vi.mocked(userApi.login).mockResolvedValueOnce({
      code: 200,
      message: 'ok',
      data: { token: 't', user: stubUser('user') },
    } as never)

    await expect(store.login('alice', 'pw')).resolves.toBe(true)

    expect(localStorage.getItem('userRole')).toBe('user')
    expect(store.isLoggedIn).toBe(true)
    expect(store.userInfo?.username).toBe('alice')
  })

  it('登录载荷 role=admin ⇒ userRole=admin（user 登录页登录的 admin 不被 requiresAdmin 守卫弹回）', async () => {
    const store = useUserStore()
    vi.mocked(userApi.login).mockResolvedValueOnce({
      code: 200,
      message: 'ok',
      data: { token: 't', user: stubUser('admin') },
    } as never)

    await store.login('boss', 'pw')

    expect(localStorage.getItem('userRole')).toBe('admin')
  })

  it('载荷无 role ⇒ 清掉残留 userRole（换号不给陈旧 admin 标记留门）', async () => {
    localStorage.setItem('userRole', 'admin')
    const store = useUserStore()
    vi.mocked(userApi.login).mockResolvedValueOnce({
      code: 200,
      message: 'ok',
      data: { token: 't', user: stubUser() },
    } as never)

    await store.login('alice', 'pw')

    expect(localStorage.getItem('userRole')).toBeNull()
  })

  it('登录失败抛错且不写 userRole', async () => {
    const store = useUserStore()
    vi.mocked(userApi.login).mockResolvedValueOnce({ code: 40013, message: 'bad' } as never)

    await expect(store.login('alice', 'x')).rejects.toMatchObject({ code: 40013 })

    expect(localStorage.getItem('userRole')).toBeNull()
    expect(store.isLoggedIn).toBe(false)
  })
})
