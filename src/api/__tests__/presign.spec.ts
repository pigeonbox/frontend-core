import { describe, expect, it } from 'vitest'
import { presignApi } from '../presign'

describe('presignApi.isOk', () => {
  it('接受 0（resp.Success）与 200（旧式 handler），拒绝其他', () => {
    expect(presignApi.isOk(0)).toBe(true)
    expect(presignApi.isOk(200)).toBe(true)
    expect(presignApi.isOk(20003)).toBe(false)
    expect(presignApi.isOk(undefined)).toBe(false)
  })
})

describe('presignApi.computeFileHash', () => {
  it('对小文件返回正确的 SHA-256 十六进制串', async () => {
    const content = 'hello'
    const file = new File([content], 'a.txt')
    const hash = await presignApi.computeFileHash(file)
    // sha256("hello")
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('超过上限的文件返回空串（跳过秒传检测）', async () => {
    const file = new File(['x'], 'big.bin')
    const hash = await presignApi.computeFileHash(file, 0)
    expect(hash).toBe('')
  })
})
