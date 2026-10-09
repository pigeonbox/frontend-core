import { describe, it, expect } from 'vitest'
import { formatFileSize, formatDateTime, toLocaleDateTime } from '../format'

describe('formatFileSize', () => {
  it('零/负/NaN/字符串零 → 0 B', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(-5)).toBe('0 B')
    expect(formatFileSize(NaN)).toBe('0 B')
    expect(formatFileSize('0')).toBe('0 B')
    expect(formatFileSize('abc')).toBe('0 B')
  })
  it('各档位换算（parseFloat 去尾零）', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatFileSize(1.5 * 1024 ** 3)).toBe('1.5 GB')
    expect(formatFileSize(2 * 1024 ** 4)).toBe('2 TB')
  })
  it('≥1PB 钳制到 TB 档', () => {
    expect(formatFileSize(1024 ** 5)).toBe('1024 TB')
  })
  it('字符串数字与数字等价', () => {
    expect(formatFileSize('2048')).toBe(formatFileSize(2048))
  })
})

describe('formatDateTime（族 A·字符串归一）', () => {
  it('T 分隔归一为空格并截到秒', () => {
    expect(formatDateTime('2026-07-28T12:34:56.789Z')).toBe('2026-07-28 12:34:56')
  })
  it('已是空格分隔则原样返回', () => {
    expect(formatDateTime('2026-07-28 12:34:56')).toBe('2026-07-28 12:34:56')
  })
  it('空值回退 fallback（默认 —）', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined, '-')).toBe('-')
  })
})

describe('toLocaleDateTime（族 B·本地解析）', () => {
  it('空格分隔日期可解析（Safari T 归一）', () => {
    const out = toLocaleDateTime('2026-07-28 12:34:56')
    expect(out).not.toContain('Invalid')
    expect(out).toMatch(/2026/)
  })
  it('空值回退 fallback（默认 -）', () => {
    expect(toLocaleDateTime('')).toBe('-')
    expect(toLocaleDateTime(null, { fallback: 'never' })).toBe('never')
  })
  it('非法日期串回退 fallback 而非 Invalid Date', () => {
    expect(toLocaleDateTime('not-a-date')).toBe('-')
    expect(toLocaleDateTime('not-a-date', { fallback: 'x' })).toBe('x')
  })
})
