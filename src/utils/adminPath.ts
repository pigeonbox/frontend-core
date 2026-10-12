/**
 * 管理入口路径段（#502 admin 路径混淆）。
 * 与后端 conf.AdminPathOrDefault 同规则：仅字母/数字/-/_，长度 2~32，其余回退 admin。
 * 注意这只是入口混淆（路径随公开配置下发），不构成安全边界——安全靠登录鉴权。
 */
export function normalizeAdminPath(p?: string): string {
  const s = (p || '').trim().replace(/^\/+|\/+$/g, '')
  if (s.length >= 2 && s.length <= 32 && /^[A-Za-z0-9_-]+$/.test(s)) return s
  return 'admin'
}

/** 管理后台 hash 路由基址，如 `/admin` 或 `/xk3-ops` */
export function adminBasePath(p?: string): string {
  return `/${normalizeAdminPath(p)}`
}
