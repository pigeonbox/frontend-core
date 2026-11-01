import { describe, expect, it } from 'vitest'
import { shareQuotaDisplay, shareStatusKind } from '../pickupQuota'

// 回归（2026-10-24 审计发现的前端真缺陷）：
// 旧写法 `row.expired_count === -1 || row.expired_count === 0 && !row.require_auth`
// ⇒ 把「额度已用完」渲染成「N / 无限」——而契约语义是 **-1=无限, 0=耗尽**。
// 依据：contracts/idl/share.thrift 的 expired_count 注释 + core 的
// CalculateExpireCount（非 count 样式恒 -1）+ DecrementExpiredCount（递减到 0）。
describe('shareQuotaDisplay', () => {
  it('不限次：expired_count=-1 ⇒ 显示「N / 无限」', () => {
    const d = shareQuotaDisplay({ expired_count: -1, used_count: 7 })
    expect(d.kind).toBe('unlimited')
    expect(d.used).toBe(7)
  })

  it('额度已用完：expired_count=0 ⇒ exhausted（**不得**是 unlimited）', () => {
    const d = shareQuotaDisplay({ expired_count: 0, used_count: 3 })
    expect(d.kind).toBe('exhausted')
    expect(d.used).toBe(3)
    expect(d.total).toBe(3)
  })

  it('还有剩余：expired_count>0 ⇒ used/(used+remaining)', () => {
    const d = shareQuotaDisplay({ expired_count: 2, used_count: 1 })
    expect(d.kind).toBe('remaining')
    expect(d.used).toBe(1)
    expect(d.total).toBe(3)
  })

  it('负对照：旧判定的「0 ⇒ 无限」分支已被废除', () => {
    // 旧实现：expired_count===0 && !require_auth ⇒ unlimited
    const legacyKind =
      ({ expired_count: 0, used_count: 3 } as { expired_count: number; used_count: number; require_auth?: boolean })
        .expired_count === 0
        ? 'unlimited'
        : 'remaining'
    expect(legacyKind).toBe('unlimited') // 旧行为确实错
    expect(shareQuotaDisplay({ expired_count: 0, used_count: 3 }).kind).not.toBe('unlimited')
  })

  it('字段缺失/异常值不崩：按不限次处理', () => {
    const d = shareQuotaDisplay({ expired_count: Number.NaN, used_count: 0 })
    expect(d.kind).toBe('unlimited')
    expect(d.used).toBe(0)
  })
})

describe('shareStatusKind', () => {
  it('回收站优先', () => {
    expect(shareStatusKind({ deleted_at: '2026-10-24', expired_count: 0, is_expired: true })).toBe('deleted')
  })

  it('次数耗尽 ≠ 时间过期（两者分开呈现）', () => {
    // 后端把两者合并成 is_expired 下发，但前端有 expired_count 可区分
    expect(shareStatusKind({ is_expired: true, expired_count: 0 })).toBe('exhausted')
    expect(shareStatusKind({ is_expired: true, expired_count: -1 })).toBe('expired')
    expect(shareStatusKind({ is_expired: true, expired_count: 3 })).toBe('expired')
  })

  it('有效', () => {
    expect(shareStatusKind({ is_expired: false, expired_count: 3 })).toBe('active')
  })
})
