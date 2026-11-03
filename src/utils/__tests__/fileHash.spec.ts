// fileHash：增量 SHA-256（2026-11-03 Phase 3 秒传强化）。
// vitest node 无 Worker ⇒ 恒走主线程降级路径（与 worker 路径同一套分片增量算法）。
import { describe, it, expect } from 'vitest'
import { hashFileSha256, workerHashAvailable, HASH_SLICE_SIZE } from '@/utils/fileHash'

// NIST 已知向量
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('hashFileSha256（增量哈希，主线程降级路径）', () => {
  it('空文件 ⇒ 空串向量 e3b0c4…', async () => {
    expect(await hashFileSha256(new Blob([]))).toBe(SHA256_EMPTY)
  })
  it('abc ⇒ ba7816…（与 crypto.subtle 逐字一致的 NIST 向量）', async () => {
    expect(await hashFileSha256(new Blob(['abc']))).toBe(SHA256_ABC)
  })
  it('跨分片内容 ⇒ 与整串哈希一致（增量 update 拼接正确）', async () => {
    // 构造超过一个 HASH_SLICE_SIZE 的内容（两片）
    const part = new Uint8Array(HASH_SLICE_SIZE).fill(65) // 'A' × 8MB
    const tail = new Uint8Array(100).fill(66) // 'B' × 100
    const blob = new Blob([part, tail])
    const got = await hashFileSha256(blob)
    // 对照：主线程一次性整串（node 的 subtle.digest）
    const whole = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    const want = Array.from(new Uint8Array(whole)).map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(got).toBe(want)
  })
  it('onProgress 单调推进到 total（含跨片）', async () => {
    const part = new Uint8Array(HASH_SLICE_SIZE + 5).fill(65)
    const seen: Array<[number, number]> = []
    await hashFileSha256(new Blob([part]), { onProgress: (h, t) => seen.push([h, t]) })
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[seen.length - 1]).toEqual([part.byteLength, part.byteLength])
    for (let i = 1; i < seen.length; i++) expect(seen[i]![0]).toBeGreaterThan(seen[i - 1]![0])
  })
  it('signal 中断 ⇒ 抛 Cancelled', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(hashFileSha256(new Blob(['abc']), { signal: ctrl.signal })).rejects.toThrow('Cancelled')
  })
  it('node 环境 workerHashAvailable=false（降级路径覆盖说明）', () => {
    expect(workerHashAvailable()).toBe(false)
  })
})
