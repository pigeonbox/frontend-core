// 双语言包 key 集合一致性守卫：zh-CN 与 en-US 任一侧新增/删除 key 而另一侧未同步
// 时即刻红——防止两语言包再次漂移（文案缺失会以裸 key 兜底渲染给用户）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

type Messages = Record<string, unknown>

// 递归展开为「点分 key → 叶子值」的扁平映射
const flatten = (obj: Messages, prefix = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Messages, key))
    } else {
      out[key] = v
    }
  }
  return out
}

const zh = flatten(zhCN as Messages)
const en = flatten(enUS as Messages)

describe('locale parity', () => {
  it('zh-CN 与 en-US 顶层命名空间一致', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort())
  })

  it('zh-CN 独有 key 为空（en-US 缺失的 key）', () => {
    const missingInEn = Object.keys(zh).filter((k) => !(k in en))
    expect(missingInEn).toEqual([])
  })

  it('en-US 独有 key 为空（zh-CN 缺失的 key）', () => {
    const missingInZh = Object.keys(en).filter((k) => !(k in zh))
    expect(missingInZh).toEqual([])
  })

  it('叶子值类型一致（对象/标量不串型）', () => {
    for (const k of Object.keys(zh)) {
      expect(typeof zh[k], `key ${k}`).toBe(typeof en[k])
    }
  })
})
