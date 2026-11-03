import { describe, it, expect } from 'vitest'
import { pickUploadPlan, isPresignFallbackEligible, DEFAULT_CHUNK_RESUME_THRESHOLD } from '../useUploadPlan'

const MB = 1024 * 1024
const base = { bodyCap: 8 * MB, presignThreshold: 100 * MB }

describe('pickUploadPlan（2026-11-03 Phase 2 矩阵：≥32MB 可续传优先）', () => {
  it('单文件 <32MB 且 ≤ presign 上限 → presign（快通道+秒传检索）', () => {
    expect(pickUploadPlan({ ...base, count: 1, totalBytes: 5 * MB, maxFileBytes: 5 * MB })).toBe('presign')
  })
  it('单文件 ≥32MB → multi-chunk（默认分片，可续传）', () => {
    expect(pickUploadPlan({ ...base, count: 1, totalBytes: 32 * MB, maxFileBytes: 32 * MB })).toBe('multi-chunk')
    expect(pickUploadPlan({ ...base, count: 1, totalBytes: 1350 * MB, maxFileBytes: 1350 * MB })).toBe('multi-chunk')
  })
  it('阈值常量=32MB（设计稿口径）', () => {
    expect(DEFAULT_CHUNK_RESUME_THRESHOLD).toBe(32 * MB)
  })
  it('管理员把 presign 上限调到 32MB 以下：小文件超上限兜底 direct 单发', () => {
    expect(
      pickUploadPlan({ count: 1, totalBytes: 20 * MB, maxFileBytes: 20 * MB, bodyCap: 49 * MB, presignThreshold: 10 * MB, presignAllowed: true })
    ).toBe('direct')
    expect(
      pickUploadPlan({ count: 1, totalBytes: 5 * MB, maxFileBytes: 5 * MB, bodyCap: 49 * MB, presignThreshold: 10 * MB, presignAllowed: true })
    ).toBe('presign')
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
  it('缺省 presignAllowed（undefined）→ ≥32MB 仍 multi-chunk（可续传优先同规）', () => {
    expect(
      pickUploadPlan({ count: 1, totalBytes: 200 * MB, maxFileBytes: 200 * MB, bodyCap: 49 * MB, presignThreshold: 100 * MB })
    ).toBe('multi-chunk')
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
