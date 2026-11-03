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
 *  - server      ：服务端故障（5xx）→ 提示稍后重试
 *  - unknown     ：兜底
 */

export type UploadFailureKind =
  | 'timeout'
  | 'blocked'
  | 'quota'
  | 'size'
  | 'server'
  | 'unknown'

/** 业务码：存储配额超限 */
const QUOTA_CODES = new Set([30002])
/** 业务码：上传大小超过限制（两种口径都算体积被拒） */
const SIZE_CODES = new Set([10010, 30008])

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
    if (code >= 500 && code < 600) return 'server'
  }

  return 'unknown'
}
