// OIDC 管理员 MFA 前端闭环的纯函数判据（frontend-core#108 / core#180）。
//
// 事故形态（修前）：后端对「OIDC + 管理员已开 TOTP」只签发半会话，回跳带
// mfa_pending=1；前端不认识该参数 ⇒ 当成登录成功 ⇒ 每个业务接口 401
// ⇒ OIDC + 管理员 MFA 组合实际不可用（白屏/反复弹回登录）。
import { describe, it, expect } from 'vitest'
import { isMfaPending, stripQueryParams } from '../oidcMfa'

describe('isMfaPending（半会话判据）', () => {
  it('mfa_pending=1 ⇒ 进二验（hash 路由的 route.query）', () => {
    expect(isMfaPending({ mfa_pending: '1', token: '' })).toBe(true)
  })

  it('容忍重复 query 的数组形态与布尔字面量', () => {
    expect(isMfaPending({ mfa_pending: ['1'] })).toBe(true)
    expect(isMfaPending({ mfa_pending: 'true' })).toBe(true)
  })

  it('缺省/其它值 ⇒ 官方回调（不得把普通登录拦进二验死循环）', () => {
    expect(isMfaPending({})).toBe(false)
    expect(isMfaPending(undefined)).toBe(false)
    expect(isMfaPending(null)).toBe(false)
    expect(isMfaPending({ mfa_pending: '0' })).toBe(false)
    expect(isMfaPending({ token: 'abc' })).toBe(false)
  })
})

describe('stripQueryParams（地址栏清理）', () => {
  it('摘掉单个参数并保留其余 query 与路由段', () => {
    expect(stripQueryParams('#/oidc/callback?token=&mfa_pending=1', ['token'])).toBe(
      '#/oidc/callback?mfa_pending=1'
    )
  })

  it('摘掉多个参数后折叠多余分隔符', () => {
    expect(
      stripQueryParams('#/oidc/callback?token=&mfa_pending=1&x=2', ['token', 'mfa_pending'])
    ).toBe('#/oidc/callback?x=2')
  })

  it('参数是最后一个时不留尾随 ?', () => {
    expect(stripQueryParams('#/oidc/callback?mfa_pending=1', ['mfa_pending'])).toBe(
      '#/oidc/callback'
    )
  })

  it('无参数时原样返回；非法参数名直接报错（防外部输入进 RegExp）', () => {
    expect(stripQueryParams('#/oidc/callback', ['mfa_pending'])).toBe('#/oidc/callback')
    expect(() => stripQueryParams('#/a?b=1', ['a.*'])).toThrow()
  })
})
