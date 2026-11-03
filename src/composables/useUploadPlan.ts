/**
 * 上传通道决策（2026-10-06 W2 自 FileUpload.vue 抽出的纯函数，决策树与原实现一致）。
 * 单测 useUploadPlan.spec.ts 钉死边界——改判定必须先改测试。
 */

export type UploadChannel = 'direct' | 'presign' | 'multi-direct' | 'multi-chunk'

export interface UploadPlanInput {
  count: number
  /** 待传文件总体积（原始文件；密文略大不参与判定——钉现状） */
  totalBytes: number
  maxFileBytes: number
  /** 单请求体上限（uploadSize−1MB 余量，或 8MB 兜底） */
  bodyCap: number
  /** 预签名直传阈值（默认 100MB） */
  presignThreshold: number
  /** 匿名直传是否开放（由调用方从后端下发的 presignPolicy 推导；false 时 presign
   * 通道不参与决策）。缺省视为 true —— **本地调用方未提供该能力**时的默认，
   * 与「旧后端」无关（旧后端兼容已删，见 api/public.ts 已无 presignEnabled）。 */
  presignAllowed?: boolean
}

export function pickUploadPlan(input: UploadPlanInput): UploadChannel {
  const { count, totalBytes, maxFileBytes, bodyCap, presignThreshold, presignAllowed } = input
  if (count <= 0) throw new Error('no files to upload')
  if (count === 1) {
    if (presignAllowed === false) {
      // 匿名直传被管理开关关闭：≤bodyCap 直接单发，>bodyCap 分片中转
      return maxFileBytes > bodyCap ? 'multi-chunk' : 'direct'
    }
    return maxFileBytes > presignThreshold ? 'presign' : 'direct'
  }
  if (totalBytes <= bodyCap && maxFileBytes <= bodyCap) return 'multi-direct'
  return 'multi-chunk'
}

/**
 * presign 直传失败后**能否回退分片中转**（2026-11-03）。
 *
 * 背景：原实现只在错误码 10015（匿名直传被管理开关关闭）时回退，
 * **任何传输层失败（超时 / 连接被拒 / 5xx）都直接抛错** ⇒ 大文件一旦
 * presign PUT 失败就零退路（实测家宽上行 ~0.86MB/s，1.35GB 必撞 300s 超时）。
 * 而分片通道（5MB/片 POST multipart）对任意体积都可用 ⇒ 传输层失败应回退。
 *
 * 判定口径：**只对传输层失败回退**，业务失败不回退（回退必然同样失败，
 * 白白重传一遍大文件）：
 *  - 回退（可换通道重试）：
 *    · code 10015 —— 匿名直传被管理开关关闭（**原行为，保留**）
 *    · code 0 —— 网络层错误（连接被拒/DNS/CORS 拦截，request.ts 归一为 0）
 *    · code -1 —— 取消（用户主动取消，**不回退**：那是用户意图）
 *    · HTTP 5xx —— 服务端临时故障，换通道可能成功
 *    · 超时 —— xhrRaw 的 'Timeout'（request.ts 归一为 code 0，已被上条覆盖）
 *  - 不回退（业务判定，重试无意义）：
 *    · 4xx 业务码（配额超限 10004/文件过大 30008/类型禁止/权限不足 等）
 *    · 10003 用户注册已关闭、10015 以外的 1xxxx 业务码
 *
 * @param code 归一化后的错误码（0=网络错误；-1=取消；HTTP 状态；业务码）
 */
export function isPresignFallbackEligible(code: number | undefined): boolean {
  if (code === undefined) return false
  // 取消是用户意图，不静默换通道重传
  if (code === -1) return false
  // 网络层错误（request.ts 把无响应归一为 0；xhrRaw 的 onerror/onTimeout 亦为 0）
  if (code === 0) return true
  // 匿名直传被管理开关关闭（原回退条件）
  if (code === 10015) return true
  // 服务端临时故障（5xx）：换通道可能成功
  if (code >= 500 && code < 600) return true
  // 其余（4xx 业务码、1xxxx 业务码）一律不回退
  return false
}
