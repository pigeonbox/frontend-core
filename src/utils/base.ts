// 应用部署前缀工具:统一网关(fnOS)下页面挂在 /app/pigeonbox/ 前缀,
// hash 路由不受影响,但根绝对路径的 API 请求与静态资源会丢前缀。
// 由 location.pathname 运行时推导,根路径部署(端口直连/反代)推导为空串,零影响。

let cachedBase: string | null = null

/**
 * appBase 返回当前页面的部署前缀(无尾斜杠;根路径部署返回 '')。
 * 例:/app/pigeonbox/ → '/app/pigeonbox';/ → '';/index.html → ''
 */
export function appBase(): string {
  if (cachedBase !== null) return cachedBase
  // SSR/测试环境(node)无 window:退化为根路径部署语义。
  if (typeof window === 'undefined') {
    cachedBase = ''
    return cachedBase
  }
  let path = window.location.pathname
  // index.html 直开(file:// 或某些宿主)剥掉文件名
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'/index.html'.length)
  }
  if (path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  cachedBase = path
  return cachedBase
}

/**
 * withBase 给根绝对路径补部署前缀。传入非根绝对路径原样返回。
 * 例:withBase('/api/v1/user/info') → '/app/pigeonbox/api/v1/user/info'
 */
export function withBase(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  const base = appBase()
  if (!base) return path
  return base + path
}

/** 仅供单测重置缓存 */
export function resetBaseCache(): void {
  cachedBase = null
}
