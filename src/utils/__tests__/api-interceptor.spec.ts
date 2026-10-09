import { describe, expect, it } from 'vitest'
import { BizError, ERRCODE_KEY_MAP, onFulfilled, translateError } from '../api-interceptor'
import type { AxiosResponse } from 'axios'

function makeResponse(code: number, traceId?: string): AxiosResponse {
  return {
    data: { code, message: 'msg', data: { ok: true }, trace_id: traceId },
    headers: {},
    status: 200,
    statusText: 'OK',
    config: { headers: {} as never },
  } as unknown as AxiosResponse
}

describe('onFulfilled（统一响应拦截）', () => {
  it('code=200（旧式 handler）放行原始 response', () => {
    const res = makeResponse(200)
    expect(onFulfilled(res)).toBe(res)
  })

  it('code=0（新版 resp.Success / contracts errcode）同样放行', () => {
    const res = makeResponse(0)
    expect(onFulfilled(res)).toBe(res)
  })

  it('其他业务码抛 BizError 且带 code/traceId', () => {
    const res = makeResponse(20003, 'tid-1')
    try {
      onFulfilled(res)
      expect.unreachable('应当抛出 BizError')
    } catch (e) {
      expect(e).toBeInstanceOf(BizError)
      expect((e as BizError).code).toBe(20003)
      expect((e as BizError).traceId).toBe('tid-1')
    }
  })
})

describe('ERRCODE_KEY_MAP 覆盖新增安全错误码', () => {
  it('锁定/会话/令牌/类型/端点错误码均有映射', () => {
    for (const code of [10011, 20010, 20011, 30011, 30012]) {
      expect(ERRCODE_KEY_MAP[code], `缺少错误码 ${code} 的映射`).toBe(`errcode.${code}`)
    }
  })
})

describe('translateError', () => {
  it('BizError 返回 i18n key 与 fallback', () => {
    const err = new BizError({ code: 10011, message: 'locked', traceId: 't' })
    const r = translateError(err)
    expect(r.i18nKey).toBe('errcode.10011')
    expect(r.fallback).toBe('locked')
    expect(r.code).toBe(10011)
  })

  it('普通错误返回 fallback，无 i18n key', () => {
    const r = translateError(new Error('boom'))
    expect(r.i18nKey).toBeNull()
    expect(r.fallback).toBe('boom')
  })
})
