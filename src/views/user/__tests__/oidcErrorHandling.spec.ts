// OIDC 回调失败的**可区分**提示守卫（2026-10-26，core 侧审计 P2 的后半段）。
//
// 事故形态：core 此前把失败原因整段丢弃（`redirectOIDCError(c, msg)` 的 msg 是
// **死参数**）⇒ 前端只能拿到裸的 `oidc_error=1` ⇒ 用户与运维无法区分
// 「IdP 挂了」「state 过期」「账号被禁用」。core 现改为按 `oidc_code` 回跳。
//
// ⇒ 前端**必须消费 oidc_code**（按码选自己的 i18n 文案），且：
//   · 必须读 `route.query.oidc_code`（应用是 **hash 路由** ⇒ query 在 '#' 之后
//     ⇒ `location.search` 恒为空）；
//   · **不得**展示 core 下发的 `msg`（那是 core 的措辞、只有中文、可能变更）。
//
// 负对照 = 把消费代码删掉 ⇒ 本守卫变红。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import {
  OIDC_ERROR_CODES,
  OIDC_ERROR_I18N_KEYS,
  resolveOidcErrorCode,
  oidcErrorI18nKey,
  isOidcErrorRedirect,
} from '@/utils/oidcError'
import { readSrc, srcRoot, stripComments } from '@/utils/__tests__/sourceScan'

const LANDING_PAGES = ['views/user/Login.vue', 'views/user/OidcCallback.vue']

describe('OIDC 失败回跳：必须消费 oidc_code', () => {
  it('落地页必须读 route.query.oidc_code（不是 location.search）', () => {
    for (const page of LANDING_PAGES) {
      const src = stripComments(readSrc(page))
      expect(src, `${page} 未消费 oidc_code`).toContain('route.query.oidc_code')
      expect(src, `${page} 应用是 hash 路由 ⇒ 不得用 location.search 取 oidc 参数`).not.toMatch(
        /location\.search[^\n]*oidc/,
      )
    }
  })

  it('落地页必须按码映射出提示（isOidcErrorRedirect + oidcErrorI18nKey）', () => {
    for (const page of LANDING_PAGES) {
      const src = readSrc(page)
      expect(src, `${page} 应接入 isOidcErrorRedirect`).toContain('isOidcErrorRedirect')
      expect(src, `${page} 应接入 oidcErrorI18nKey`).toContain('oidcErrorI18nKey')
    }
  })

  it('不得展示 core 下发的 msg（跨仓措辞 + 只有中文 + 可能变更）', () => {
    for (const page of LANDING_PAGES) {
      const src = stripComments(readSrc(page))
      expect(src, `${page} 不得把 core 的 msg 当权威文案展示`).not.toContain('route.query.msg')
    }
  })

  it('短码集合与 core 侧契约一致（core 仓在场时自动核对）', () => {
    // 真相源 = core transport/http/handler/oidc.go（oidcPublicError + missing_code）
    const coreFile = resolve(srcRoot, '..', '..', 'core', 'transport', 'http', 'handler', 'oidc.go')
    if (!existsSync(coreFile)) {
      // frontend-core 独立仓（CI 只克隆本仓）⇒ 跳过跨仓核对
      expect(OIDC_ERROR_CODES.length, '前端应登记 core 的全部短码').toBeGreaterThanOrEqual(3)
      return
    }
    const core = readFileSync(coreFile, 'utf8')
    const fnStart = core.indexOf('func oidcPublicError(')
    expect(fnStart, 'core 应仍有 oidcPublicError').toBeGreaterThan(-1)
    const fnEnd = core.indexOf('\n}', fnStart)
    const body = core.slice(fnStart, fnEnd)
    const coreCodes = new Set<string>()
    for (const m of body.matchAll(/return\s+"([a-z_]+)"/g)) coreCodes.add(m[1]!)
    for (const m of core.matchAll(/redirectOIDCError\(c,\s*"([a-z_]+)"/g)) coreCodes.add(m[1]!)
    expect(
      [...coreCodes].sort(),
      'core 的短码集合变了 ⇒ 前端要补映射（跨仓契约，前端不得自造新码）',
    ).toEqual([...OIDC_ERROR_CODES].sort())
  })

  it('每个短码都要有 i18n 文案（zh/en 两侧）', () => {
    const zh = zhCN.login as { oidcError: Record<string, string> }
    const en = enUS.login as { oidcError: Record<string, string> }
    for (const code of OIDC_ERROR_CODES) {
      const key = OIDC_ERROR_I18N_KEYS[code]
      const leaf = key.split('.').pop() as string
      expect(zh.oidcError?.[leaf], `zh-CN 缺 ${key}`).toBeTruthy()
      expect(en.oidcError?.[leaf], `en-US 缺 ${key}`).toBeTruthy()
    }
  })

  it('短码解析：已知码原样、未知码回落通用（不裸奔标识）', () => {
    for (const code of OIDC_ERROR_CODES) {
      expect(resolveOidcErrorCode(code)).toBe(code)
    }
    expect(resolveOidcErrorCode('nope')).toBeNull()
    expect(resolveOidcErrorCode(undefined)).toBeNull()
    expect(oidcErrorI18nKey('nope')).toBe('login.oidcError.loginFailed')
    expect(oidcErrorI18nKey('account_disabled')).toBe('login.oidcError.accountDisabled')
  })

  it('失败回跳判定：oidc_error 存在即为失败', () => {
    expect(isOidcErrorRedirect({ oidc_error: '1' })).toBe(true)
    expect(isOidcErrorRedirect({})).toBe(false)
    expect(isOidcErrorRedirect({ oidc_error: '' })).toBe(false)
  })
})
