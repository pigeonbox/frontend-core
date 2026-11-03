import { describe, it, expect } from 'vitest'
import { createSpeedMeter, formatSpeed, formatEtaHms } from '../transferSpeed'

describe('createSpeedMeter（滑窗测速 + ETA，窗口=最近 5s）', () => {
  it('恒速 1MB/s：速度与 ETA 正确', () => {
    const m = createSpeedMeter()
    m.record(0, 0)
    m.record(1_000_000, 1000)
    m.record(2_000_000, 2000)
    expect(m.speedBps()).toBeCloseTo(1_000_000, -3)
    expect(m.etaSeconds(10_000_000)).toBeCloseTo(10, 1)
  })
  it('窗口外样本被丢弃（变速后只按近期算）', () => {
    const m = createSpeedMeter(10_000)
    m.record(0, 0)
    m.record(100_000_000, 100) // 旧的高速段（窗口外）
    m.record(100_001_000, 10_100) // 近期慢速段起点
    m.record(100_002_000, 11_100) // 1KB/s
    expect(m.speedBps()).toBeCloseTo(1000, -1)
  })
  it('样本不足返回 0 / ETA null（不猜）', () => {
    const m = createSpeedMeter()
    expect(m.speedBps()).toBe(0)
    m.record(0, 0)
    expect(m.speedBps()).toBe(0)
    expect(m.etaSeconds(100)).toBeNull()
  })
  it('同刻样本（dt=0）返回 0（不除零）', () => {
    const m = createSpeedMeter()
    m.record(0, 1000)
    m.record(500, 1000)
    expect(m.speedBps()).toBe(0)
  })
  it('reset 清空', () => {
    const m = createSpeedMeter()
    m.record(0, 0)
    m.record(1000, 1000)
    m.reset()
    expect(m.speedBps()).toBe(0)
    expect(m.etaSeconds(100)).toBeNull()
  })
  it('累计字节口径：后一个样本小于前一个（异常）不炸，按差值算', () => {
    const m = createSpeedMeter()
    m.record(1000, 0)
    m.record(500, 1000)
    expect(m.speedBps()).toBeCloseTo(-500, 0)
    expect(m.etaSeconds(100)).toBeNull() // 负速不给 ETA
  })
})

describe('formatSpeed / formatEtaHms', () => {
  it('按量级选单位', () => {
    expect(formatSpeed(2_300_000)).toBe('2.3 MB/s')
    expect(formatSpeed(860_000)).toBe('860 KB/s')
    expect(formatSpeed(120)).toBe('120 B/s')
    expect(formatSpeed(0)).toBe('—')
  })
  it('ETA 拆时分秒', () => {
    expect(formatEtaHms(4 * 60 + 12)).toEqual({ h: 0, m: 4, s: 12 })
    expect(formatEtaHms(3723)).toEqual({ h: 1, m: 2, s: 3 })
    expect(formatEtaHms(-5)).toEqual({ h: 0, m: 0, s: 0 })
  })
})
