// 分享页「取数触发键」守卫（2026-10-24 真机实测出的明文滞留缺陷）。
//
// 实测事故：端到端加密分享的解密密钥在 URL 查询参数里（#/share/CODE?key=xxx）。
// 分享页原先只 watch 路径参数 `:code` ⇒ 「只改 key」不重新取数 ⇒
//   - 页面保留上一次的**明文**（旧解密结果没清）；
//   - 同时又弹出「此分享已端到端加密，但当前链接缺少解密密钥」的警告
// ⇒ 自相矛盾，且旧明文滞留（同一页面会话内）。
//
// 修法：触发键 = 分享码 + key ⇒ 任一变化都重新取数；取数时清掉旧解密结果。
import { describe, it, expect } from 'vitest'
import { shareRouteKey } from '../shareRouteKey'

describe('shareRouteKey（分享页取数触发键）', () => {
  it('同一分享码 + 同一 key ⇒ 触发键不变（不重复取数）', () => {
    expect(shareRouteKey('AbCd1234', 'k1')).toBe(shareRouteKey('AbCd1234', 'k1'))
  })

  it('key 变化 ⇒ 触发键变化（必须重新取数，否则旧明文滞留）', () => {
    expect(shareRouteKey('AbCd1234', 'k1')).not.toBe(shareRouteKey('AbCd1234', 'k2'))
    expect(shareRouteKey('AbCd1234', 'k1')).not.toBe(shareRouteKey('AbCd1234', undefined))
  })

  it('分享码变化 ⇒ 触发键变化', () => {
    expect(shareRouteKey('AbCd1234', 'k1')).not.toBe(shareRouteKey('Other5678', 'k1'))
  })

  it('空值归一（缺 code / 缺 key 都不抛异常）', () => {
    expect(shareRouteKey(undefined, undefined)).toBe('|')
    expect(shareRouteKey(null, null)).toBe('|')
    expect(shareRouteKey('AbCd1234', null)).toBe('AbCd1234|')
  })
})
