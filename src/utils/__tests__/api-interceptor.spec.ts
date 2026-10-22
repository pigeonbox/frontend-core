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

  it('后端全部 63 个错误码都已登记（防止新增码又漏登 → 裸露英文原文）', () => {
    // 真相源 = contracts/errcode/errcode.go 的码表（2026-10-22 实测 63 个非 0 码）
    const ALL_CODES = [
      10000, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010, 10011,
      10012, 10013, 10014, 10015, 10016,
      20001, 20002, 20003, 20004, 20005, 20006, 20007, 20008, 20009, 20010, 20011, 20012, 20013,
      30001, 30002, 30003, 30004, 30005, 30006, 30007, 30008, 30009, 30010, 30011, 30012, 30013,
      40001, 40002, 40003, 40004, 40005, 40006, 40007, 40008, 40009, 40010, 40011,
      50001, 50002, 50003, 50004, 50005, 50006,
      90001, 90002, 90003,
    ]
    const missing = ALL_CODES.filter((c) => !ERRCODE_KEY_MAP[c])
    expect(missing, `未登记的错误码: ${missing.join(', ')}`).toEqual([])
  })
})

describe('translateError', () => {
  it('BizError 返回 i18n key 与 fallback', () => {
    const err = new BizError({ code: 10002, message: 'unauthorized', traceId: 't' })
    const r = translateError(err)
    expect(r.i18nKey).toBe('errcode.10002')
    expect(r.fallback).toBe('unauthorized')
    expect(r.code).toBe(10002)
  })

  it('带动态信息的后端文案不被 i18n 覆盖（保留超限数字/秒数等关键信息）', () => {
    // 10011 的后端文案带「等 N 秒」，i18n 通用文案只有「已临时锁定」——
    // 覆盖会抹掉用户最需要的「还要等多久」（2026-10-22 审计）。
    const err = new BizError({
      code: 10011,
      message: '尝试过于频繁，已临时锁定，请 42 秒后重试',
      traceId: 't',
    })
    const r = translateError(err)
    expect(r.i18nKey).toBeNull()
    expect(r.fallback).toContain('42 秒')
  })

  it('未逐码登记的错误码按段位兜底到本地化文案（不裸露英文原文）', () => {
    // 2xxxx = 分享/取件段。哪怕该码没登记进 ERRCODE_KEY_MAP，
    // 也要落到本地化的段位通用文案，而不是后端英文原文。
    const r = translateError(new BizError({ code: 29999, message: 'something went sideways', traceId: 't' }))
    expect(r.i18nKey).toBe('errcode.20001')
  })

  it('普通错误返回 fallback，无 i18n key', () => {
    const r = translateError(new Error('boom'))
    expect(r.i18nKey).toBeNull()
    expect(r.fallback).toBe('boom')
  })

  it('request.ts 包装的普通对象 {code,message,trace_id} 同样吃错误码映射（英文 toast 回归钉）', () => {
    const r = translateError({
      code: 20005,
      message: 'pickup code not found',
      trace_id: 't-9',
    })
    expect(r.i18nKey).toBe('errcode.20005')
    expect(r.fallback).toBe('pickup code not found')
    expect(r.code).toBe(20005)
    expect(r.traceId).toBe('t-9')
  })

  it('普通对象无 code 时保持无映射', () => {
    const r = translateError({ message: 'plain' })
    expect(r.i18nKey).toBeNull()
    expect(r.code).toBeNull()
  })
})
