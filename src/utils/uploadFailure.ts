/**
 * 上传失败分类（2026-11-03）——把「上传失败」细分成**用户能据此行动**的几类。
 *
 * 背景：大文件上传失败时，旧实现只显示一句「上传失败 / Upload failed」，
 * 用户无从判断是「网慢超时」「浏览器/代理拦截」还是「配额/体积被拒」，
 * 只能反复重试（而传输层失败重试同一条通道大概率同样失败）。
 *
 * 分类口径（按错误码 + 错误消息双重判定）：
 *  - timeout     ：上传超时（网络慢/带宽不足）→ 提示换通道/稍后再试
 *  - blocked     ：连接被拒（浏览器安全策略、公司代理拦截）→ 提示换浏览器/网络
 *  - quota/size  ：配额或体积被拒（业务判定）→ 提示改配置/换小文件
 *  - type        ：文件类型/内容被拒（30011，后端带具体原因）→ 提示换文件
 *  - server      ：服务端故障（5xx）→ 提示稍后重试
 *  - unknown     ：兜底
 */

export type UploadFailureKind =
  | 'timeout'
  | 'blocked'
  | 'quota'
  | 'size'
  | 'type'
  | 'server'
  | 'unknown'

/** 业务码：存储配额超限 */
const QUOTA_CODES = new Set([30002])
/** 业务码：上传大小超过限制（两种口径都算体积被拒；含归一化的 HTTP 413） */
const SIZE_CODES = new Set([10010, 30008, 413])
/** 业务码：文件类型/内容被拒（黑名单/白名单/魔数/审核；含归一化的 HTTP 415） */
const TYPE_CODES = new Set([30011, 415])

/**
 * 永久性业务拒绝：重试**同一份文件、同一条通道**必然同样失败。
 * 这类失败必须立刻把后端原因告诉用户，而不是「Retrying (1/3)...」把
 * 大文件再整份传两遍（2026-11-03 真机实录：1.35GB 的 .AppImage 被 30011
 * 误杀后又被整份重传了 2 次才报错）。
 */
const PERMANENT_CODES = new Set([
  10012, // 上传已关闭
  10014, // 匿名日配额用尽
  30002, // 存储配额超限
  30008, // 体积/预签名口径拒绝
  30011, // 文件类型/内容被拒
  30013, // 内容未通过审核
  30014, // 上传会话已完成
])

/**
 * 判定上传失败类别。
 *
 * @param code   归一化错误码（0=网络错误；-1=取消；HTTP 状态；业务码）
 * @param message 错误消息原文（用于识别 Timeout / Network error 等传输层语义）
 */
export function classifyUploadFailure(
  code: number | undefined,
  message?: string
): UploadFailureKind {
  const msg = (message || '').toLowerCase()

  // 传输层：超时（xhrRaw 的 ontimeout 抛 'Timeout'，code=0）
  if (msg.includes('timeout') || msg.includes('超时')) return 'timeout'

  // 传输层：连接被拒 / 网络错误（浏览器安全策略、公司代理、跨域拦截的典型表现）
  if (
    msg.includes('network error')
    || msg.includes('failed to fetch')
    || msg.includes('connection')
    || msg.includes('refused')
    || msg.includes('网络')
  ) {
    return 'blocked'
  }

  if (code !== undefined) {
    if (QUOTA_CODES.has(code)) return 'quota'
    if (SIZE_CODES.has(code)) return 'size'
    if (TYPE_CODES.has(code)) return 'type'
    if (code >= 500 && code < 600) return 'server'
  }

  return 'unknown'
}

/**
 * 永久性业务拒绝判定（重试无意义）：分类口径 + 永久业务码清单任一命中即真。
 * 只有传输层可重试失败（timeout/blocked/server/未知网络抖动）才值得自动重试。
 */
export function isPermanentUploadFailure(
  code: number | undefined,
  message?: string
): boolean {
  const kind = classifyUploadFailure(code, message)
  if (kind === 'quota' || kind === 'size' || kind === 'type') return true
  return code !== undefined && PERMANENT_CODES.has(code)
}

/**
 * 上传错误构造：把**业务码**附在 Error 上，失败分类（classifyUploadFailure）
 * 才看得见它。此前 `throw new Error(completeRes.message)` 把 code 丢在门外，
 * 分类只能拿消息猜（2026-11-03 实录：30011 被分成 unknown）。
 */
export function uploadError(code: number | undefined, message: string): Error {
  return Object.assign(new Error(message), { code })
}

/** 这些分类的后端消息带**具体原因**（文件名/检测到的格式/上限数值），
 *  上屏时附服务端原文，用户才知道到底为什么被拒。 */
export const SERVER_DETAIL_KINDS = new Set<UploadFailureKind>(['type', 'quota', 'size'])
