// 运营解读聚合口径单测（frontend-core#91）。
//
// 视图层的「窗口聚合」最容易在分母上出错：失败分布拿全量当分母（占比压扁）、
// 取件率拿 total_files 当分母（过期越多越虚低）、时段桶把解析失败的行算进 0 点。
// 这些口径全在 utils/opsInsights.ts，本文件逐条钉住——负对照已实跑：
// 改分母 / 改归组字段 / 改缺省 success 判据，对应用例即红。
import { describe, expect, it } from 'vitest'
import {
  failureBreakdown,
  failureCount,
  hourHistogram,
  hourOf,
  pickupRatePercent,
  ratePercent,
  topShares,
} from '@/utils/opsInsights'

describe('hourOf：服务端本地时间字符串取小时（不做 Date 解析）', () => {
  it('标准 "YYYY-MM-DD HH:mm:ss" 取到小时', () => {
    expect(hourOf('2026-11-16 08:30:00')).toBe(8)
    expect(hourOf('2026-11-16 23:59:59')).toBe(23)
    expect(hourOf('2026-11-16 00:00:00')).toBe(0)
  })

  it('非法/缺失返回 null（不落进 0 点桶）', () => {
    expect(hourOf(undefined)).toBeNull()
    expect(hourOf('')).toBeNull()
    expect(hourOf('2026-11-16')).toBeNull() // 长度不足，没有时间段
    expect(hourOf('not-a-date-time')).toBeNull()
  })

  it('小时越界返回 null（防御脏数据）', () => {
    expect(hourOf('2026-11-16 25:00:00')).toBeNull()
  })
})

describe('hourHistogram：download 操作按小时归桶', () => {
  const rows = [
    { operation: 'download', created_at: '2026-11-16 09:00:00' },
    { operation: 'download', created_at: '2026-11-16 09:30:00' },
    { operation: 'upload', created_at: '2026-11-16 09:45:00' }, // 非 download 不计
    { operation: 'download', created_at: '2026-11-16 21:10:00' },
    { operation: 'download', created_at: 'bad-time' }, // 解析失败不计
  ]

  it('只统计指定 operation，解析失败的行不进任何桶', () => {
    const buckets = hourHistogram(rows, 'download')
    expect(buckets).toHaveLength(24)
    expect(buckets[9]).toBe(2)
    expect(buckets[21]).toBe(1)
    expect(buckets[0]).toBe(0)
    const total = buckets.reduce((a, b) => a + b, 0)
    expect(total).toBe(3) // 4 条 download − 1 条坏时间
  })

  it('不传 operation 统计全部操作', () => {
    const buckets = hourHistogram(rows)
    expect(buckets[9]).toBe(3) // 2 download + 1 upload
  })
})

describe('topShares：窗口内被取最多的分享', () => {
  const rows = [
    { operation: 'download', file_code: 'AAA111', file_name: 'a.zip' },
    { operation: 'download', file_code: 'AAA111', file_name: 'a.zip' },
    { operation: 'download', file_code: 'BBB222', file_name: 'b.mp4' },
    { operation: 'upload', file_code: 'CCC333', file_name: 'c.txt' }, // upload 不计
    { operation: 'download', file_code: '', file_name: 'no-code' }, // 无 code 跳过
  ]

  it('按 download 计数降序，percent 分母是窗口内 download 总数', () => {
    const top = topShares(rows, 5)
    expect(top).toHaveLength(2)
    expect(top[0]).toMatchObject({ code: 'AAA111', count: 2 })
    expect(top[1]).toMatchObject({ code: 'BBB222', count: 1 })
    // 分母=3（有效 download 行），不是 5（全部行）
    expect(top[0]!.percent).toBeCloseTo((2 / 3) * 100, 5)
  })

  it('limit 生效；空窗口返回空数组（不抛）', () => {
    expect(topShares(rows, 1)).toHaveLength(1)
    expect(topShares([], 5)).toEqual([])
  })

  it('并列时按 code 字典序（渲染顺序稳定）', () => {
    const tie = [
      { operation: 'download', file_code: 'ZZZ', file_name: 'z' },
      { operation: 'download', file_code: 'AAA', file_name: 'a' },
    ]
    expect(topShares(tie, 5).map((x) => x.code)).toEqual(['AAA', 'ZZZ'])
  })
})

describe('failureBreakdown：审计失败按 action 归组', () => {
  const items = [
    { action: 'file.purge', success: false },
    { action: 'file.purge', success: false },
    { action: 'user.delete', success: false },
    { action: 'file.status', success: true }, // 成功不计
    { action: 'config.update' }, // success 缺省当成功，不计
    { success: false }, // action 缺省归 unknown 桶
  ]

  it('只收 success===false，percent 分母=失败样本数（不是全量）', () => {
    const list = failureBreakdown(items, 6)
    expect(list[0]).toMatchObject({ action: 'file.purge', count: 2 })
    // 并列项按 action 字典序（unknown < user.delete），故只钉「有这几桶」不钉并列次序
    expect(list).toHaveLength(3)
    const byAction = Object.fromEntries(list.map((x) => [x.action, x.count]))
    expect(byAction).toEqual({ 'file.purge': 2, 'user.delete': 1, unknown: 1 })
    // 分母=4 条失败，不是 6 条全量
    expect(list[0]!.percent).toBeCloseTo((2 / 4) * 100, 5)
  })

  it('failureCount 与分布分母一致', () => {
    expect(failureCount(items)).toBe(4)
    expect(failureBreakdown([], 6)).toEqual([])
    expect(failureCount([])).toBe(0)
  })

  it('limit 生效', () => {
    expect(failureBreakdown(items, 1)).toHaveLength(1)
  })
})

describe('ratePercent：0 样本返回 null 而不是 0%', () => {
  it('正常比例', () => {
    expect(ratePercent(3, 4)).toBe(75)
  })

  it('whole≤0 / 非有限 → null（「没样本」≠「0%」）', () => {
    expect(ratePercent(0, 0)).toBeNull()
    expect(ratePercent(1, -1)).toBeNull()
    expect(ratePercent(Number.NaN, 10)).toBeNull()
  })
})

describe('pickupRatePercent：未过期口径的取件率', () => {
  it('(active − never_picked) / active', () => {
    // 10 个未过期分享，其中 3 个从未被取 ⇒ 7/10 = 70%
    expect(pickupRatePercent(10, 3)).toBe(70)
  })

  it('never_picked ⊆ active：never_picked 超过 active 时钳到 0（不出现负数）', () => {
    expect(pickupRatePercent(5, 99)).toBe(0)
  })

  it('active=0 → null（无样本，展示空态而不是 0%）', () => {
    expect(pickupRatePercent(0, 0)).toBeNull()
    expect(pickupRatePercent(-1, 0)).toBeNull()
  })
})
