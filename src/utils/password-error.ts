/**
 * 取件页密码族错误的语义判据（2026-10-22）。
 *
 * 后端对「需要密码」与「密码填错了」用**同一个错误码 20003**，靠响应体的
 * `data.has_password` 区分：
 *
 *   - 20003 + `{data:{has_password:true}}` = 只是缺密码 → 静默展开密码输入框，
 *     **不弹错误提示**（用户还没输密码，弹"密码错误"是误导）
 *   - 20003（无 data）                    = 密码填错了 → 弹错误提示
 *
 * 三个"需要密码"响应面（`/share/select`、`/preview`、`/anonymous/retrieve`）
 * 在 core 侧都带 `has_password` 标志，判据可靠。
 *
 * 此前前端靠**硬编码中文串**比较 `message === '需要密码'`——后端措辞一改，
 * "只缺密码"时就会误弹一个错误提示（2026-10-22 改为结构化判据）。
 */

export interface PasswordErrorLike {
  code?: number | string
  message?: string
  /** 后端响应体的业务载荷（request.ts 的错误包装会保留它） */
  data?: { has_password?: boolean } | null
  response?: { status?: number } | null
}

/**
 * 是否是「取件页密码族」错误（需要密码 / 密码错误 / 缺下载令牌）。
 *
 * 后端对这些情况一律回 HTTP 401。
 *
 * ⚠️ 旧实现还把 `code === 403` 算作密码族（历史兼容）——后端**从不**产生业务码
 * 403（密码错=20003→401；次数耗尽=20004→403 但**不是**密码问题），而 request.ts
 * 的包装 `code: data.code ?? error.response.status ?? 0` 会在**反向代理返回裸 403**
 * （无 JSON body）时回退成 HTTP 状态码 ⇒ 把「代理拒绝」显示成「需要密码」= 误判。
 * ⇒ 2026-10-25 删除该旧兼容。
 */
export function isPasswordFamilyError(err: unknown): boolean {
  const e = (err ?? {}) as PasswordErrorLike
  return e.response?.status === 401
}

/**
 * 该错误是否**只是缺密码**（后端带 `data.has_password`）——此时只展开密码框，
 * 不弹错误提示。
 */
export function isPasswordMissingOnly(err: unknown): boolean {
  const e = (err ?? {}) as PasswordErrorLike
  return e.data?.has_password === true
}
