import { afterEach, describe, expect, it, vi } from 'vitest'
import instance, { request, shouldNetRetry, MAX_NET_RETRIES } from '@/utils/request'

/** axios 网络层失败：有 config + request、无 response（shouldNetRetry 的判据形态） */
const netError = (config: unknown) =>
  Object.assign(new Error('Network Error'), { config, request: {}, code: 'ERR_NETWORK' })

/** HTTP 错误：有 config + request + response */
const httpError = (config: unknown, status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    config,
    request: {},
    response: { status, data: {}, headers: {} },
  })

type Adapter = (config: Record<string, unknown>) => Promise<unknown>
const setAdapter = (fn: Adapter) => {
  instance.defaults.adapter = fn as never
}
const realAdapter = instance.defaults.adapter

afterEach(() => {
  instance.defaults.adapter = realAdapter
  vi.useRealTimers()
})

/** 与下载器同款的假时钟跑法：推进全部退避 setTimeout，微任务同步排空 */
async function run(p: () => Promise<unknown>) {
  vi.useFakeTimers()
  const settled = p().then(
    (v) => ({ ok: true as const, v }),
    (e) => ({ ok: false as const, e }),
  )
  await vi.advanceTimersByTimeAsync(0)
  await vi.runAllTimersAsync()
  return await settled
}

const okAdapter = (config: Record<string, unknown>) =>
  Promise.resolve({ data: { code: 200, ok: 1 }, status: 200, statusText: 'OK', headers: {}, config })

describe('请求层弱网退避重试（幂等才自动重试）', () => {
  it('GET 网络失败两次后成功：共 3 次请求，结果正常返回', async () => {
    let calls = 0
    setAdapter((config) => {
      calls++
      return calls <= 2 ? Promise.reject(netError(config)) : okAdapter(config)
    })
    const r = await run(() => request({ url: '/api/config', method: 'GET' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.v as { code: number }).code).toBe(200)
    expect(calls).toBe(3)
  })

  it('POST 网络失败不重试（非幂等）：只 1 次请求', async () => {
    let calls = 0
    setAdapter((config) => {
      calls++
      return Promise.reject(netError(config))
    })
    const r = await run(() => request({ url: '/api/v1/user/shares', method: 'POST', data: {} }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect((r.e as { code: number }).code).toBe(0)
    expect(calls).toBe(1)
  })

  it('PUT（幂等）撞 503 后成功：重试 1 次', async () => {
    let calls = 0
    setAdapter((config) => {
      calls++
      return calls === 1 ? Promise.reject(httpError(config, 503)) : okAdapter(config)
    })
    const r = await run(() => request({ url: '/file', method: 'PUT', data: 'x' }))
    expect(r.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('GET 撞 404 不重试（业务 4xx 是明确裁决）：只 1 次请求', async () => {
    let calls = 0
    setAdapter((config) => {
      calls++
      return Promise.reject(httpError(config, 404))
    })
    const r = await run(() => request({ url: '/missing', method: 'GET' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect((r.e as { code: number }).code).toBe(404)
    expect(calls).toBe(1)
  })

  it(`预算耗尽：1 次首发 + ${MAX_NET_RETRIES} 次重试后按网络错误归一化 reject`, async () => {
    let calls = 0
    setAdapter((config) => {
      calls++
      return Promise.reject(netError(config))
    })
    const r = await run(() => request({ url: '/api/config', method: 'GET' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const e = r.e as { code: number; message: string }
      expect(e.code).toBe(0)
      expect(e.message).toBe('Network error')
    }
    expect(calls).toBe(1 + MAX_NET_RETRIES)
  })

  it('请求已被用户中止（signal.aborted）⇒ 适配器前取消、零请求零重试', async () => {
    let calls = 0
    setAdapter((config) => {
      calls++
      return Promise.reject(netError(config))
    })
    const controller = new AbortController()
    controller.abort()
    const r = await run(() =>
      request({ url: '/api/config', method: 'GET', signal: controller.signal }),
    )
    // axios 在 dispatchRequest 阶段就拦截已中止的 signal，压根走不到适配器/重试
    expect(r.ok).toBe(false)
    expect(calls).toBe(0)
  })
})

describe('shouldNetRetry 判据', () => {
  const base = { method: 'get' }

  it('GET/HEAD/PUT 网络失败（无 response、有 request）⇒ 可重试', () => {
    expect(shouldNetRetry(netError({}), base)).toBe(true)
    expect(shouldNetRetry(netError({}), { method: 'head' })).toBe(true)
    expect(shouldNetRetry(netError({}), { method: 'PUT' })).toBe(true)
  })

  it('POST/DELETE/PATCH 不重试', () => {
    expect(shouldNetRetry(netError({}), { method: 'post' })).toBe(false)
    expect(shouldNetRetry(netError({}), { method: 'delete' })).toBe(false)
    expect(shouldNetRetry(netError({}), { method: 'patch' })).toBe(false)
  })

  it('method 缺省按 GET 处理（axios 默认方法）', () => {
    expect(shouldNetRetry(netError({}), {})).toBe(true)
  })

  it('502/503/504 可重试，其余状态码（含 4xx/500/401）不重试', () => {
    for (const s of [502, 503, 504]) {
      expect(shouldNetRetry(httpError({}, s), base)).toBe(true)
    }
    for (const s of [400, 401, 404, 429, 500, 505]) {
      expect(shouldNetRetry(httpError({}, s), base)).toBe(false)
    }
  })

  it('重试预算用尽 ⇒ 不再重试', () => {
    expect(shouldNetRetry(netError({}), { ...base, _netRetry: MAX_NET_RETRIES })).toBe(false)
    expect(shouldNetRetry(netError({}), { ...base, _netRetry: MAX_NET_RETRIES - 1 })).toBe(true)
  })

  it('signal 已中止 / config 缺失 ⇒ 不重试', () => {
    expect(shouldNetRetry(netError({}), { ...base, signal: AbortSignal.abort() })).toBe(false)
    expect(shouldNetRetry(netError({}), undefined)).toBe(false)
  })

  it('既无 request 也无 response（拦截器/配置错误）⇒ 不是网络问题', () => {
    expect(shouldNetRetry(Object.assign(new Error('bad config'), { config: {} }), base)).toBe(false)
  })
})
