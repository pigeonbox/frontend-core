// 取件时间线（frontend-core#93）展示面守卫。
//
// 锁三件 parity/契约管不到的事：
//   ① API 走手写过渡端点且码做 URL 编码（防路径拼接注入/漏编码）；
//   ② 三态与失败原因枚举（错误码语义）都接到了 UI 文案；
//   ③ 时间线 UI **不展示明文 IP/指纹**（隐私拍板：只有来源计数与同源布尔）。
//   ④ 五语包都有 timeline 命名空间（parity 管键齐，这里钉「命名空间真的在」）。
import { describe, it, expect } from 'vitest'
import { readSrc } from '@/utils/__tests__/sourceScan'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import deDE from '@/i18n/locales/de-DE'
import ruRU from '@/i18n/locales/ru-RU'

const SHARES = readSrc('views/user/Shares.vue')
const API = readSrc('api/userShares.ts')

const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key))
    } else {
      out[key] = v
    }
  }
  return out
}

describe('取件时间线 API（手写过渡端点）', () => {
  it('走 /api/v1/user/shares/:code/timeline，且 code 做 URL 编码', () => {
    expect(API).toContain('/timeline')
    expect(API).toContain('encodeURIComponent(code)')
    expect(API).toMatch(/url: `\/api\/v1\/user\/shares\/\$\{encodeURIComponent\(code\)\}\/timeline`/)
  })

  it('wire 类型声明三态与来源聚合字段', () => {
    expect(API).toContain("state: 'never' | 'failed' | 'picked'")
    expect(API).toContain('failure_count')
    expect(API).toContain('failure_sources')
    expect(API).toContain('same_source')
  })
})

describe('取件时间线 UI（Shares.vue）', () => {
  it('三态标签齐全：从未被访问 / 被尝试但失败 / 成功取件', () => {
    for (const k of ['stateNever', 'stateFailed', 'statePicked']) {
      expect(SHARES, `缺三态文案引用 ${k}`).toContain(`user.shares.timeline.${k}`)
    }
  })

  it('失败原因按错误码语义枚举映射（20004 次数耗尽 ≠ 404 过期）', () => {
    for (const k of ['reasonPasswordWrong', 'reasonCountExhausted', 'reasonExpired']) {
      expect(SHARES, `缺原因枚举文案引用 ${k}`).toContain(`user.shares.timeline.${k}`)
    }
    expect(SHARES).toContain("'count_exhausted'")
    expect(SHARES).toContain("'expired'")
    expect(SHARES).toContain("'password_wrong'")
  })

  it('来源信息只给聚合与同源布尔（不展示明文 IP/指纹）', () => {
    expect(SHARES).toContain('failureSummary')
    expect(SHARES).toContain('same_source')
    const start = SHARES.indexOf('el-drawer v-model="showTimeline"')
    expect(start, '时间线抽屉必须存在').toBeGreaterThan(-1)
    const end = SHARES.indexOf('</el-drawer>', start)
    expect(end).toBeGreaterThan(start)
    const block = SHARES.slice(start, end)
    expect(block).not.toContain('source_hash')
    expect(block).not.toContain('viewer_ip')
    expect(block, '抽屉模板里不得出现 IP 字段').not.toMatch(/\bip\b/i)
  })

  it('操作入口在表格与窄屏卡片两处都在', () => {
    const opens = SHARES.match(/openTimeline\(/g) || []
    expect(opens.length, '表格行 + 窄屏卡片行各一个入口（调用点共 2 处）').toBe(2)
  })
})

describe('取件时间线五语包', () => {
  const LOCALES: Array<[string, Record<string, unknown>]> = [
    ['zh-CN', zhCN as Record<string, unknown>],
    ['en-US', enUS as Record<string, unknown>],
    ['ja-JP', jaJP as Record<string, unknown>],
    ['de-DE', deDE as Record<string, unknown>],
    ['ru-RU', ruRU as Record<string, unknown>],
  ]

  it('每个语种都有 user.shares.timeline 命名空间（16 个键）', () => {
    const expected = [
      'title', 'open', 'stateNever', 'stateFailed', 'statePicked',
      'resultSuccess', 'resultFailed', 'reasonPasswordWrong', 'reasonCountExhausted',
      'reasonExpired', 'sameSource', 'diffSource', 'failureSummary', 'empty',
      'channelSelect', 'channelDownload', 'channelRetrieve',
    ]
    for (const [code, msgs] of LOCALES) {
      const flat = flatten(msgs)
      for (const k of expected) {
        expect(flat[`user.shares.timeline.${k}`], `${code} 缺 user.shares.timeline.${k}`).toBeDefined()
      }
    }
  })
})
