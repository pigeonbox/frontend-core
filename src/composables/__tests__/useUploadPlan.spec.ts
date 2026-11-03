import { describe, it, expect } from 'vitest'
import { pickUploadPlan, isPresignFallbackEligible } from '../useUploadPlan'

const MB = 1024 * 1024
const base = { bodyCap: 8 * MB, presignThreshold: 100 * MB }

describe('pickUploadPlan', () => {
  it('单文件 ≤ 阈值 → direct', () => {
    expect(pickUploadPlan({ ...base, count: 1, totalBytes: 5 * MB, maxFileBytes: 5 * MB })).toBe('direct')
  })
  it('单文件 > 阈值 → presign', () => {
    expect(pickUploadPlan({ ...base, count: 1, totalBytes: 101 * MB, maxFileBytes: 101 * MB })).toBe('presign')
  })
  it('单文件恰好等于阈值 → direct（> 才走 presign，钉现状）', () => {
    expect(pickUploadPlan({ ...base, count: 1, totalBytes: 100 * MB, maxFileBytes: 100 * MB })).toBe('direct')
  })
  it('多文件总体积与单文件均 ≤ bodyCap → multi-direct', () => {
    expect(pickUploadPlan({ ...base, count: 3, totalBytes: 6 * MB, maxFileBytes: 3 * MB })).toBe('multi-direct')
  })
  it('多文件总体积超 bodyCap → multi-chunk', () => {
    expect(pickUploadPlan({ ...base, count: 2, totalBytes: 20 * MB, maxFileBytes: 10 * MB })).toBe('multi-chunk')
  })
  it('多文件单文件超 bodyCap（总体积未超）→ multi-chunk', () => {
    expect(pickUploadPlan({ ...base, count: 2, totalBytes: 9 * MB, maxFileBytes: 9 * MB })).toBe('multi-chunk')
  })
  it('恰好等于 bodyCap → multi-direct（<= 判定，钉现状）', () => {
    expect(pickUploadPlan({ ...base, count: 2, totalBytes: 8 * MB, maxFileBytes: 4 * MB })).toBe('multi-direct')
  })
  it('count=0 → throw（防御）', () => {
    expect(() => pickUploadPlan({ ...base, count: 0, totalBytes: 0, maxFileBytes: 0 })).toThrow('no files')
  })
})

describe('presignAllowed=false（匿名直传被管理开关关闭）', () => {
  const MB = 1024 * 1024
  it('单文件 > 阈值 → multi-chunk（回退中转，不走 presign）', () => {
    expect(
      pickUploadPlan({ count: 1, totalBytes: 200 * MB, maxFileBytes: 200 * MB, bodyCap: 49 * MB, presignThreshold: 100 * MB, presignAllowed: false })
    ).toBe('multi-chunk')
  })
  it('单文件 ≤ bodyCap → direct（不受开关影响）', () => {
    expect(
      pickUploadPlan({ count: 1, totalBytes: 10 * MB, maxFileBytes: 10 * MB, bodyCap: 49 * MB, presignThreshold: 100 * MB, presignAllowed: false })
    ).toBe('direct')
  })
  it('单文件 bodyCap<大小≤阈值 → multi-chunk', () => {
    expect(
      pickUploadPlan({ count: 1, totalBytes: 60 * MB, maxFileBytes: 60 * MB, bodyCap: 49 * MB, presignThreshold: 100 * MB, presignAllowed: false })
    ).toBe('multi-chunk')
  })
  it('多文件 → 与开关无关（本就不走 presign）', () => {
    expect(
      pickUploadPlan({ count: 3, totalBytes: 300 * MB, maxFileBytes: 120 * MB, bodyCap: 49 * MB, presignThreshold: 100 * MB, presignAllowed: false })
    ).toBe('multi-chunk')
  })
  it('缺省 presignAllowed（undefined）→ 保持旧行为（>阈值 presign）', () => {
    expect(
      pickUploadPlan({ count: 1, totalBytes: 200 * MB, maxFileBytes: 200 * MB, bodyCap: 49 * MB, presignThreshold: 100 * MB })
    ).toBe('presign')
  })
})

describe('isPresignFallbackEligible（presign 失败可否回退分片中转）', () => {
  // ── 回退（传输层失败：换通道可能成功）──
  it('code 10015（匿名直传被管理开关关闭）→ true（原行为保留，负对照：删它必红）', () => {
    expect(isPresignFallbackEligible(10015)).toBe(true)
  })
  it('code 0（网络层错误：超时/连接被拒/CORS）→ true', () => {
    expect(isPresignFallbackEligible(0)).toBe(true)
  })
  it.each([500, 502, 503, 599])('HTTP %i（5xx 服务端临时故障）→ true', (code) => {
    expect(isPresignFallbackEligible(code)).toBe(true)
  })

  // ── 不回退（业务失败：重传必然同样失败）──
  it('code -1（用户取消）→ false（用户意图，不静默换通道重传）', () => {
    expect(isPresignFallbackEligible(-1)).toBe(false)
  })
  it('code undefined（无 code 的裸 Error）→ false', () => {
    expect(isPresignFallbackEligible(undefined)).toBe(false)
  })
  it.each([400, 401, 403, 404, 409, 413, 429, 499])('HTTP %i（4xx）→ false', (code) => {
    expect(isPresignFallbackEligible(code)).toBe(false)
  })
  it.each([10003, 10004, 10010, 10012, 30002, 30008])('业务码 %i（注册关闭/配额/体积/类型）→ false', (code) => {
    expect(isPresignFallbackEligible(code)).toBe(false)
  })
  it('code 200（非失败码走到这里）→ false（不误触发回退）', () => {
    expect(isPresignFallbackEligible(200)).toBe(false)
  })
})
