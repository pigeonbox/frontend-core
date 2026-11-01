// 用户端「API 密钥」页撤销失败文案守卫（2026-10-26 审计 P2 · 缺陷 9）。
//
// 事故形态：单条撤销与「全部撤销」的 catch 都用 `t('user.tokens.loadFailed')`
// ⇒ 用户点「撤销」失败时弹出「加载 API Key 列表失败」⇒ 与用户刚做的操作完全
// 无关，看不出是哪一步失败。⇒ 撤销路径改用 `user.tokens.revokeFailed`，
// 而 loadList() 仍用 loadFailed。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import { readSrc } from '@/utils/__tests__/sourceScan'

const SRC = readSrc('views/user/Tokens.vue')

/** 取 `const <name> = ` 起到下一个顶层 `const ` 之间的源码 */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} =`)
  expect(start, `应能定位 ${name}`).toBeGreaterThan(-1)
  const next = src.indexOf('\nconst ', start + 1)
  return next < 0 ? src.slice(start) : src.slice(start, next)
}

describe('API 密钥页：撤销失败文案', () => {
  it('单条撤销失败必须用 revokeFailed（不得复用 loadFailed）', () => {
    const body = fnBody(SRC, 'revoke')
    expect(body, '撤销路径应使用 user.tokens.revokeFailed').toContain("t('user.tokens.revokeFailed')")
    expect(body, '撤销路径不得再使用 user.tokens.loadFailed').not.toContain(
      "t('user.tokens.loadFailed')"
    )
  })

  it('批量撤销失败同样必须用 revokeFailed', () => {
    const body = fnBody(SRC, 'revokeAll')
    expect(body, '批量撤销路径应使用 user.tokens.revokeFailed').toContain(
      "t('user.tokens.revokeFailed')"
    )
    expect(body, '批量撤销路径不得再使用 user.tokens.loadFailed').not.toContain(
      "t('user.tokens.loadFailed')"
    )
  })

  it('列表加载失败仍用 loadFailed（两类失败要分得开）', () => {
    const body = fnBody(SRC, 'loadList')
    expect(body, 'loadList 应继续使用 user.tokens.loadFailed').toContain(
      "t('user.tokens.loadFailed')"
    )
  })

  it('revokeFailed 键在两侧语言包里都要存在', () => {
    const zh = zhCN.user as { tokens: Record<string, unknown> }
    const en = enUS.user as { tokens: Record<string, unknown> }
    expect(zh.tokens.revokeFailed, 'zh-CN 缺 user.tokens.revokeFailed').toBeTruthy()
    expect(en.tokens.revokeFailed, 'en-US 缺 user.tokens.revokeFailed').toBeTruthy()
    expect(zh.tokens.revokeFailed, 'revokeFailed 与 loadFailed 不得同文案').not.toBe(
      zh.tokens.loadFailed,
    )
  })
})
