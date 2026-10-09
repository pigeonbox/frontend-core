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
  /** 匿名直传是否开放（后端下发；false 时 presign 通道不参与决策）。
   * 缺省视为 true——兼容未下发该字段的旧后端 */
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
