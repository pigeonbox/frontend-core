import { describe, it, expect } from 'vitest'
import { uploadCapMismatch, alignedUploadCap } from '../uploadCap'

// 两个上传闸口的矛盾判据（2026-10-30）。
//
// 事故形态：管理台把「单文件上限」配成 4GB、「单次发送总量上限」留着旧默认 50MB
// ⇒ 超过 50MB 的文件**永远发不出去**（先被总量闸拒，报「上传总大小超过限制」），
// 而界面仍在宣称「单文件最大 4GB」⇒ 两个旋钮从来没对齐过。

const MB = 1024 * 1024
const GB = 1024 * MB

describe('uploadCapMismatch', () => {
  it('总量低于单文件 ⇒ 矛盾（大文件永远发不出去）', () => {
    expect(uploadCapMismatch(50 * MB, 4 * GB)).toBe(true)
  })

  it('总量等于单文件 ⇒ 不矛盾（刚好允许发一个最大文件）', () => {
    expect(uploadCapMismatch(4 * GB, 4 * GB)).toBe(false)
  })

  it('总量高于单文件 ⇒ 不矛盾', () => {
    expect(uploadCapMismatch(8 * GB, 4 * GB)).toBe(false)
  })

  it('总量 0（不限）⇒ 不矛盾（总量闸没开，单文件闸说了算）', () => {
    expect(uploadCapMismatch(0, 4 * GB)).toBe(false)
  })

  it('单文件 0（不限）⇒ 不矛盾（没有「超过单文件上限」的文件）', () => {
    expect(uploadCapMismatch(50 * MB, 0)).toBe(false)
  })
})

describe('alignedUploadCap', () => {
  it('对齐到单文件上限', () => {
    expect(alignedUploadCap(4 * GB)).toBe(4 * GB)
  })

  it('单文件不限 ⇒ 总量不限（0），与之相容', () => {
    expect(alignedUploadCap(0)).toBe(0)
  })
})
