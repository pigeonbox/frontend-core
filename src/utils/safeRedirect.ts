/**
 * 登录后跳转目标（`?redirect=`）的运行时校验（frontend-core#120）。
 *
 * 背景：登录成功后 `router.push(query.redirect as string)` —— query 是外部
 * 输入，`as string` 只是类型断言，数组形态（`?redirect=a&redirect=b`）、
 * `//x`、`#/admin`、超长串都会原样交给 vue-router。应用是 **hash 路由**
 * ⇒ 不会构成外站 open redirect（`https://evil.com` 也只会变成
 * `#/https://evil.com` 这类站内路径），但可构造出各种站内异常路径：落到
 * 404 兜底、管理入口，或隐式依赖 vue-router 对非字符串的处理，体验上像
 * 「登录后乱跳」。
 *
 * 只接受站内路径：
 * - 非数组、非空且非超长的 `string`（query 的正常形态只有 string / string[]）；
 * - 以单个 `/` 开头（拒绝 `//host` 与 `/\host` —— 浏览器按 URL 规范把反斜杠
 *   归一化为斜杠，后者等价于协议相对 URL）；
 * - 不含控制字符/空白（`\s` + C0/C1 控制区）、反斜杠、`#`（hash 路由的
 *   分隔符，redirect 里再出现 `#` 不是站内 path）；
 * - 解码 `%XX` 后仍满足以上全部条件（防 `/%2F%2Fevil.com`、`/%5Cevil`、
 *   `/%23` 这类编码绕过；非法百分号转义同样拒绝）。
 *
 * 不匹配 ⇒ 回落 `'/'`。返回原串（不做归一化），调用方直接交给 `router.push`。
 *
 * 附加项（#120 可选加分）：拒绝登录页自身（`/user/login`），登录成功后跳回
 * 登录页没有意义；大小写不敏感（vue-router 默认按大小写不敏感匹配路由）。
 */

/**
 * 跳转目标长度上限。issue#120 的建议值是 512；这里取 URL 的常规上限 2048
 * —— 仍然有界，同时容得下带较长 query 的站内深链。
 */
export const MAX_REDIRECT_LENGTH = 2048

/** 空白（含 Unicode 空白）与 C0/C1 控制字符 */
const CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f-\u009f]/
/** 反斜杠：浏览器在 URL 解析时归一化为 `/`，`/\evil.com` ≡ `//evil.com` */
const BACKSLASH = /\\/
/** hash 路由分隔符：站内 path 不应出现 `#` */
const HASH = /#/

/** 站内路径的静态约束（原串与解码后的串都要过这一关） */
function isSafePath(s: string): boolean {
  if (s.length === 0 || s.length > MAX_REDIRECT_LENGTH) return false
  if (!s.startsWith('/') || s.startsWith('//')) return false
  if (CONTROL_OR_SPACE.test(s)) return false
  if (BACKSLASH.test(s)) return false
  if (HASH.test(s)) return false
  return true
}

/**
 * 校验登录后的 redirect 查询参数；非法输入一律返回首页 `'/'`。
 *
 * 纯函数（不碰 window / router），便于单测。
 */
export function safeRedirect(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  if (!isSafePath(raw)) return '/'

  // 解码后再校验：`/%2F%2Fevil.com`、`/%5Cevil.com`、`/%23/admin` 解码后
  // 就是协议相对 / 反斜杠 / hash 形态。非法 `%` 转义直接拒绝。
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return '/'
  }
  if (!isSafePath(decoded)) return '/'

  // 登录页自身（可带 query）⇒ 回落首页，避免「登录成功后仍停在登录页」
  const pathOnly = (decoded.split('?')[0] ?? '').toLowerCase()
  if (pathOnly === '/user/login' || pathOnly === '/user/login/') return '/'

  return raw
}