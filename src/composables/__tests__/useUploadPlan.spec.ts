import { describe, it, expect } from 'vitest'
import { pickUploadPlan } from '../useUploadPlan'

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
