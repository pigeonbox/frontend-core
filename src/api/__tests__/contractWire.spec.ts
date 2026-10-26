// 契约化后的**行为等价**回归（2026-10-26 contracts v0.20.0 钉版列车）。
//
// 这批用例锁的是「换类型来源**不改运行时行为**」：
//   · api 层只做**透传**——不重命名字段、不补默认、不裁剪载荷；
//   · 请求路径/参数/请求体形状不变；
//   · 错误分支照旧抛（错误码与文案不被吞）。
//
// mock 打在**传输边界**（@/utils/request 的 request / @/api/_xhr 的 xhrSend），
// ⇒ 被测的 api 函数是**真跑**的，只有传输被替身。
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/request', () => ({ request: vi.fn(), default: { interceptors: {} } }))
vi.mock('@/api/_xhr', () => ({ xhrSend: vi.fn(), xhrRaw: vi.fn() }))
vi.mock('axios', () => ({ default: { post: vi.fn() } }))

import axios from 'axios'
import { request } from '@/utils/request'
import { xhrSend } from '@/api/_xhr'
import { publicApi } from '@/api/public'
import { multiBind, multiDirect } from '@/api/multifile'
import { notifyApi } from '@/api/notify'
import { federationApi } from '@/api/federation'
import { userApi } from '@/api/user'
import { localFilesApi } from '@/api/localFiles'

const mockedRequest = vi.mocked(request)
const mockedXhrSend = vi.mocked(xhrSend)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /share/metadata/:code（契约 ShareMetadataData）', () => {
  it('请求路径带 encodeURIComponent，响应字段原样透传', async () => {
    mockedRequest.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: {
        code: 'ABC123',
        type: 'file',
        name: 'a.txt',
        size: 12,
        has_password: false,
        expired_at: '2026-11-01T00:00:00Z',
        expired_count: -1,
        used_count: 0,
        encrypted: false,
        file_count: 1,
        created_at: '2026-10-26T00:00:00Z',
      },
    } as never)

    const res = await publicApi.getShareMetadata('ABC123')
    expect(mockedRequest.mock.calls[0]![0]).toMatchObject({
      url: '/share/metadata/ABC123',
      method: 'GET',
    })
    expect(res.data.code).toBe('ABC123')
    expect(res.data.type).toBe('file')
    expect(res.data.name).toBe('a.txt')
    expect(res.data.expired_count).toBe(-1)
    expect(res.data.file_count).toBe(1)
  })

  it('码做 URL 编码（防止路径穿越）', async () => {
    mockedRequest.mockResolvedValue({ code: 200, message: 'ok', data: {} } as never)
    await publicApi.getShareMetadata('a/b c')
    expect(mockedRequest.mock.calls[0]![0]).toMatchObject({ url: '/share/metadata/a%2Fb%20c' })
  })

  it('expired_at 缺省（服务端不下发）⇒ undefined，消费面 ?? null 得 null', async () => {
    // 契约里 expired_at 是 optional（缺省不输出）；手抄版是 string | null。
    // ⇒ 消费面必须显式兜底，不许让 undefined 直接进 DOM/比较。
    mockedRequest.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: { code: 'ABC123', type: 'text', size: 0, has_password: false, expired_count: -1, used_count: 0, encrypted: false, file_count: 0, created_at: '2026-10-26T00:00:00Z' },
    } as never)

    const res = await publicApi.getShareMetadata('ABC123')
    expect(res.data.expired_at).toBeUndefined()
    expect(res.data.expired_at ?? null).toBeNull()
  })

  it('错误分支：api 层不吞错（原样 reject 给调用方）', async () => {
    mockedRequest.mockRejectedValue({ code: 20004, message: 'reach limit' })
    await expect(publicApi.getShareMetadata('ABC123')).rejects.toMatchObject({ code: 20004 })
  })
})

describe('POST /api/v1/share/multi-bind（契约 MultiShareBindReq/MultiShareData）', () => {
  const opts = { expire_value: 7, expire_style: 'day', require_auth: false }

  it('成功：返回契约字段名的载荷，code 0 与 200 都算成功', async () => {
    mockedRequest.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: { code: 'C1', url: 'http://x/#/share/C1', share_url: 'http://x/s/C1', file_count: 2, pickup_code: '654321' },
    } as never)
    const res = await multiBind([{ upload_id: 'u1' }], opts)
    expect(res.code).toBe('C1')
    expect(res.share_url).toBe('http://x/s/C1')
    expect(res.file_count).toBe(2)
    expect(res.pickup_code).toBe('654321')

    mockedRequest.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { code: 'C2', url: 'u', share_url: 's', file_count: 1 },
    } as never)
    const res0 = await multiBind([{ upload_id: 'u1' }], opts)
    expect(res0.code).toBe('C2')
  })

  it('请求体形状不变：entries + 公共参数（缺省补空串/false）', async () => {
    mockedRequest.mockResolvedValue({ code: 200, message: 'ok', data: { code: 'C', url: 'u', share_url: 's', file_count: 1 } } as never)
    await multiBind([{ upload_id: 'u1' }, { object_key: 'k1', file_name: 'b.txt' }], opts)
    expect(mockedRequest.mock.calls[0]![0]).toMatchObject({
      url: '/api/v1/share/multi-bind',
      method: 'POST',
      data: {
        entries: [{ upload_id: 'u1' }, { object_key: 'k1', file_name: 'b.txt' }],
        expire_value: 7,
        expire_style: 'day',
        require_auth: false,
        password: '',
        encrypted: false,
        custom_code: '',
        note: '',
      },
    })
  })

  it('错误分支：非成功码抛 Error（带服务端文案）', async () => {
    mockedRequest.mockResolvedValue({ code: 400, message: '配额超限', data: undefined } as never)
    await expect(multiBind([{ upload_id: 'u1' }], opts)).rejects.toThrow('配额超限')
  })
})

describe('POST /api/v1/share/multi-direct（契约 MultiShareDirectReq/MultiShareData）', () => {
  it('multipart 字段名与发送顺序不变，响应透传', async () => {
    mockedXhrSend.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: { code: 'M1', url: 'http://x/#/share/M1', share_url: 'http://x/s/M1', file_count: 2 },
    } as never)

    const file = new File(['x'], 'a.txt')
    const res = await multiDirect([file], { expire_value: 7, expire_style: 'day', require_auth: false })

    const opts = mockedXhrSend.mock.calls[0]![0]
    expect(opts.url).toBe('/api/v1/share/multi-direct')
    const form = opts.form as FormData
    expect(form.get('expire_value')).toBe('7')
    expect(form.get('expire_style')).toBe('day')
    expect(form.get('require_auth')).toBe('false')
    expect(form.get('password')).toBeNull()
    expect(res.code).toBe('M1')
    expect(res.file_count).toBe(2)
  })

  it('错误分支：服务端无 data 时抛 Error', async () => {
    mockedXhrSend.mockResolvedValue({ code: 200, message: '', data: undefined } as never)
    await expect(
      multiDirect([new File(['x'], 'a.txt')], { expire_value: 7, expire_style: 'day', require_auth: false }),
    ).rejects.toThrow('multi-direct failed')
  })
})

describe('GET /api/v1/notifies/public（契约 NotifyPublicListData/NotifyPublicItem）', () => {
  it('只回 {items}：api 层不补 total/page/page_size（那三个是管理端 ListData 的幻影）', async () => {
    mockedRequest.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: {
        items: [
          { id: 1, title: '公告', content: '正文', type: 'system', level: 'info', start_at: '2026-10-01T00:00:00Z', end_at: '2026-11-01T00:00:00Z' },
        ],
      },
    } as never)

    const res = await notifyApi.active()
    expect(mockedRequest.mock.calls[0]![0]).toMatchObject({ url: '/api/v1/notifies/public', method: 'GET' })
    expect(Object.keys(res.data)).toEqual(['items'])
    expect(res.data.items[0]!.title).toBe('公告')
    expect(res.data.items[0]!.level).toBe('info')
  })
})

describe('GET /api/v1/federation/resolve（契约 FederationResolveData）', () => {
  it('未命中：只有 available（其余 optional 不输出）', async () => {
    mockedRequest.mockResolvedValue({ code: 200, message: 'ok', data: { available: false } } as never)
    const res = await federationApi.resolve('NOPE')
    expect(mockedRequest.mock.calls[0]![0]).toMatchObject({
      url: '/api/v1/federation/resolve',
      method: 'GET',
      params: { code: 'NOPE' },
    })
    expect(res.data.available).toBe(false)
    expect(res.data.url).toBeUndefined()
  })

  it('命中：透传源节点信息', async () => {
    mockedRequest.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: { available: true, url: 'http://peer/s/ABC', node_id: 'n1', name: 'peer' },
    } as never)
    const res = await federationApi.resolve('ABC')
    expect(res.data.available).toBe(true)
    expect(res.data.url).toBe('http://peer/s/ABC')
    expect(res.data.node_id).toBe('n1')
  })
})

describe('POST /user/api-keys/revoke-all（契约 UserAPIKeysRevokeAllData）', () => {
  it('返回吊销数量', async () => {
    mockedRequest.mockResolvedValue({ code: 200, message: 'ok', data: { revoked: 3 } } as never)
    const res = await userApi.revokeAllApiKeys()
    expect(mockedRequest.mock.calls[0]![0]).toMatchObject({
      url: '/user/api-keys/revoke-all',
      method: 'POST',
    })
    expect(res.data.revoked).toBe(3)
  })
})

describe('POST /admin/local-files/import（契约 AdminImportLocalFileData）', () => {
  it('返回分享码与分享链接', async () => {
    mockedRequest.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: { code: 'L1', share_url: 'http://x/s/L1' },
    } as never)
    const res = await localFilesApi.importShare({
      root: 0,
      path: 'a.txt',
      expire_value: 7,
      expire_style: 'day',
    })
    expect(mockedRequest.mock.calls[0]![0]).toMatchObject({
      url: '/admin/local-files/import',
      method: 'POST',
    })
    expect(res.data.code).toBe('L1')
    expect(res.data.share_url).toBe('http://x/s/L1')
  })
})

describe('会话端点（契约 UserRefreshResp / UserLogoutResp）', () => {
  // node 环境无 localStorage ⇒ 桩一个（stores/user.ts 在 setup 里就读它）
  const mem = new Map<string, string>()
  beforeEach(() => {
    mem.clear()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    }
  })

  it('refresh：code 0 与 200 都算续期成功；其它码/网络异常算失败', async () => {
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useUserStore } = await import('@/stores/user')
    const store = useUserStore()
    store.markSessionActive()

    const post = vi.mocked(axios.post)
    post.mockResolvedValueOnce({ data: { code: 0, message: 'ok', data: { token: 't' } } } as never)
    expect(await store.refreshToken()).toBe(true)

    post.mockResolvedValueOnce({ data: { code: 200, message: 'ok', data: { token: 't' } } } as never)
    expect(await store.refreshToken()).toBe(true)

    post.mockResolvedValueOnce({ data: { code: 10002, message: 'unauthorized' } } as never)
    expect(await store.refreshToken()).toBe(false)

    post.mockRejectedValueOnce(new Error('network'))
    expect(await store.refreshToken()).toBe(false)

    expect(post.mock.calls[0]![0]).toBe('/api/v1/user/refresh')
  })

  it('refresh：无会话标记时直接失败（不发请求）', async () => {
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useUserStore } = await import('@/stores/user')
    const store = useUserStore()
    const post = vi.mocked(axios.post)
    expect(await store.refreshToken()).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('logout：fire-and-forget——服务端失败不阻断本地登出', async () => {
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useUserStore } = await import('@/stores/user')
    const store = useUserStore()
    store.markSessionActive()

    const post = vi.mocked(axios.post)
    post.mockRejectedValueOnce(new Error('backend down'))
    expect(() => store.logout()).not.toThrow()
    expect(post.mock.calls[0]![0]).toBe('/api/v1/user/logout')
    expect(store.isLoggedIn).toBe(false)
  })
})
