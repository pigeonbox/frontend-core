/**
 * 首启向导（/setup）的令牌取值。
 *
 * ⚠️ 2026-10-26 审计：应用是 **hash 路由**（createWebHashHistory）⇒ 站内链接的
 * query 都在 `#` 之后（`#/setup?token=xxx`）⇒ `window.location.search` **恒为空**
 * ⇒ 此前只读 location.search 的实现拿不到令牌：令牌输入框不出现、
 * `tokenRequired` 不置位。而后端 401 文案承诺「用带 ?token= 的链接打开本页」，
 * 且门禁把**缺失令牌**计入按 IP 的失败锁定 ⇒ 管理员只能走完向导点「初始化」
 * 才吃 401，令牌框这才出现（这次失败已计入失败锁定预算）。
 *
 * ⇒ 同时读 `route.query.token`（vue-router 的 hash 模式会把 `#/setup?token=x`
 *   解析进 route.query，与 views/share/View.vue 读 `route.query.key` 同款）；
 *   `location.search` 保留作兼容分支（非 hash 部署 / 直开带 query 的链接）。
 *
 * 抽成纯函数是为了**能单测**（本仓无组件测试基建）。
 */
export function resolveSetupToken(routeToken: unknown, locationSearch: string): string {
  if (typeof routeToken === 'string' && routeToken.trim()) return routeToken.trim()
  try {
    const v = new URLSearchParams(locationSearch || '').get('token')
    return v && v.trim() ? v.trim() : ''
  } catch {
    return ''
  }
}
