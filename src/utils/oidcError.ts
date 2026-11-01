/**
 * OIDC 回调失败的**可区分**错误码（2026-10-26，core 侧审计 P2 的后半段）。
 *
 * core 的 `transport/http/handler/oidc.go` 此前把失败原因**整段丢弃**
 * （`redirectOIDCError(c, msg)` 的 msg 是**死参数**，函数注释却写着「携带错误
 * 信息」）⇒ 前端只能拿到裸的 `oidc_error=1` ⇒ 用户与运维无法区分
 * 「IdP 挂了」「state 过期」「账号被禁用」。
 *
 * core 现改为**受限文案映射**（**绝不透传 err.Error()**，避免泄露 IdP 内部
 * 细节：issuer / 端点 URL / token 响应片段 / 账号标识），失败时 302 回
 * `/#/user/login?oidc_error=1&oidc_code=<短码>&msg=<urlencode 后的可公开文案>`。
 *
 * ⚠️ **码集合是跨仓契约**（core 侧 `oidcPublicError` 的三个返回分支 +
 *   `missing_code` 分支）⇒ 前端**不得自造新码**；core 增码时前端补一条映射
 *   即可（守卫 `src/views/user/__tests__/oidcErrorHandling.spec.ts` 会核对两侧
 *   的集合一致——core 仓在场时自动核对）。
 *
 * ⚠️ `msg` **不作为权威文案展示**：它是 core 的措辞（且只有中文）⇒ 英文界面
 *   会夹中文，且措辞可能随 core 变更 ⇒ 前端**只按 oidc_code 映射**自己的文案。
 */

/** core 下发的短码集合（真相源 = core transport/http/handler/oidc.go） */
export const OIDC_ERROR_CODES = [
  'state_invalid',
  'account_disabled',
  'login_failed',
  'missing_code',
] as const

export type OidcErrorCode = (typeof OIDC_ERROR_CODES)[number]

/** 短码 → 前端 i18n key（前端自有文案，不展示 core 的 msg） */
export const OIDC_ERROR_I18N_KEYS: Record<OidcErrorCode, string> = {
  state_invalid: 'login.oidcError.stateInvalid',
  account_disabled: 'login.oidcError.accountDisabled',
  login_failed: 'login.oidcError.loginFailed',
  missing_code: 'login.oidcError.missingCode',
}

/** 规范化 core 下发的短码；未知/缺失 ⇒ null（不裸奔标识） */
export function resolveOidcErrorCode(raw: unknown): OidcErrorCode | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  return (OIDC_ERROR_CODES as readonly string[]).includes(v) ? (v as OidcErrorCode) : null
}

/** 短码 → i18n key；未知码 ⇒ 通用失败键（不把裸标识显示给用户） */
export function oidcErrorI18nKey(raw: unknown): string {
  const code = resolveOidcErrorCode(raw)
  return code ? OIDC_ERROR_I18N_KEYS[code] : OIDC_ERROR_I18N_KEYS.login_failed
}

/**
 * 是否是「OIDC 失败回跳」。
 *
 * ⚠️ 应用是 **hash 路由** ⇒ core 的 query 都在 `#` 之后 ⇒ 必须读
 * `route.query`（**不能**用 `location.search`，那是空的）。
 */
export function isOidcErrorRedirect(query: Record<string, unknown>): boolean {
  const v = query?.oidc_error
  return v !== undefined && v !== null && v !== ''
}
