// 首启向导令牌取值守卫（2026-10-26 审计 P2）。
//
// 事故形态：/setup 此前只从 `window.location.search` 取令牌 ⇒ 应用是 **hash
// 路由**（createWebHashHistory）⇒ 站内链接的 query 都在 `#` 之后
// （`#/setup?token=xxx`）⇒ location.search 恒空 ⇒ 令牌不自动填、
// tokenRequired 不置位 ⇒ 管理员走完向导点「初始化」才吃 401，令牌框这才出现
// （而这次失败已计入按 IP 的失败锁定预算）。
//
// 修法：同时读 route.query.token（vue-router hash 模式已解析进 route.query），
// location.search 保留作兼容分支。取值逻辑抽成纯函数以便单测。
import { describe, it, expect } from 'vitest'
import { resolveSetupToken } from '@/utils/setupToken'
import { readSrc } from '@/utils/__tests__/sourceScan'

describe('首启向导令牌取值', () => {
  it('hash 形态的 ?token=（route.query）必须被识别', () => {
    expect(resolveSetupToken('T', '')).toBe('T')
  })

  it('非 hash 形态的 ?token=（location.search）仍兼容', () => {
    expect(resolveSetupToken(undefined, '?token=X')).toBe('X')
    expect(resolveSetupToken('', '?token=X')).toBe('X')
  })

  it('两边都没有 ⇒ 空串（令牌框不出现，保持既有语义）', () => {
    expect(resolveSetupToken(undefined, '')).toBe('')
    expect(resolveSetupToken(undefined, '?other=1')).toBe('')
    expect(resolveSetupToken('   ', '?token=X')).toBe('X')
  })

  it('向导页必须真的用上 route.query.token（否则改了纯函数也白改）', () => {
    const src = readSrc('views/setup/Index.vue')
    expect(src, '向导页应读 route.query.token').toContain('route.query.token')
    expect(src, '向导页应通过 resolveSetupToken 取值').toContain(
      'resolveSetupToken(route.query.token, window.location.search)'
    )
    expect(src, '不应再直接读 location.search 取 token').not.toMatch(
      /new URLSearchParams\(window\.location\.search\)\.get\('token'\)/
    )
  })
})
