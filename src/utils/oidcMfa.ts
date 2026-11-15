// OIDC 管理员 MFA 前端闭环的纯函数（frontend-core#108 / core#180）。
//
// 后端在 OIDC 登录时发现「管理员已开 TOTP」⇒ 只签发**半会话**，回跳
//   <frontend-callback>&mfa_pending=1
// （core app/oidc/service.go FrontendMFACallback）。半会话被所有认证中间件拒绝，
// 只放行 POST /api/v1/user/oidc/mfa ⇒ 前端必须先把用户拦在二验页再换发，
// 否则表现为「登录成功但每个接口都 401」的假登录（2026-11-15 评审 P0）。

export type RouteQueryLike = Record<string, unknown> | null | undefined

/**
 * mfa_pending 判据。
 *
 * 应用是 hash 路由 ⇒ query 在 '#' 之后，由 vue-router 解析成 route.query
 * （location.search 恒空，不能拿它判断）。同时容忍数组形态（重复 query）。
 */
export function isMfaPending(query: RouteQueryLike): boolean {
  if (!query) return false
  const raw = (query as Record<string, unknown>).mfa_pending
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === '1' || value === 1 || value === 'true'
}

/**
 * 从 hash 段里摘掉指定 query 参数（保留路由段本身）。
 *
 * 为什么只处理 hash：hash 路由下 location.pathname + location.search 会把整段
 * 路由抹掉（search 恒空）。参数摘除后重新折叠多余的 ? / &。
 *
 * 参数名由本仓代码常量给出（mfa_pending / token / oidc_*），不含正则元字符；
 * 仍显式拒绝含元字符的名字，避免调用方将来把外部输入传进来。
 */
export function stripQueryParams(hash: string, names: readonly string[]): string {
  let out = hash
  for (const name of names) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      throw new Error('stripQueryParams: invalid param name')
    }
    out = out.replace(new RegExp('([?&])' + name + '=[^&]*', 'g'), '$1')
  }
  // 连续摘除会在参数之间留下 "?&" / "&&"：反复折叠到稳定（最多参数个数轮）
  for (let i = 0; i <= names.length; i++) {
    out = out.replace(/\?&/g, '?').replace(/&&/g, '&')
  }
  return out.replace(/[?&]+$/, '')
}
