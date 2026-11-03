import { describe, it, expect } from 'vitest'
import { buildFingerprint, chunkBackoffMs } from '@/api/multifile'

describe('buildFingerprint（续传匹配指纹）', () => {
  it('name|size|lastModified 三元组', () => {
    expect(buildFingerprint({ name: 'a.img', size: 10, lastModified: 1 })).toBe('a.img|10|1')
  })
  it('任一维度不同 ⇒ 指纹不同（防错续到别的文件）', () => {
    const base = { name: 'a.img', size: 10, lastModified: 1 }
    expect(buildFingerprint({ ...base, size: 11 })).not.toBe(buildFingerprint(base))
    expect(buildFingerprint({ ...base, lastModified: 2 })).not.toBe(buildFingerprint(base))
    expect(buildFingerprint({ ...base, name: 'b.img' })).not.toBe(buildFingerprint(base))
  })
})

describe('chunkBackoffMs（分片级指数退避 1/2/4/8s）', () => {
  it.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [3, 8000],
  ])('attempt %d → %dms', (a, want) => {
    expect(chunkBackoffMs(a as number)).toBe(want)
  })
  it('attempt ≥4 超限（调用方报错，不无限退避）', () => {
    expect(() => chunkBackoffMs(4)).toThrow()
    expect(() => chunkBackoffMs(-1)).toThrow()
  })
})
