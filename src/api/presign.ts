import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { presign as presignContract } from '@pigeonbox/contracts'

/** wire 契约类型(contracts IDL 生成,勿手写):秒传命中时 data 仅秒传字段有效 */
export type PresignInitData = presignContract.InitData

export type PresignCompleteData = presignContract.CompleteData

export const presignApi = {
  // 业务成功码：新版 resp.Success 返回 0，旧式 handler 返回 200
  isOk: (code?: number) => code === 0 || code === 200,

  // 计算 SHA-256（秒传指纹）。crypto.subtle 不支持流式，
  // 超过 limitBytes 时返回空串（调用方跳过秒传检测）。
  computeFileHash: async (file: File, limitBytes = 256 * 1024 * 1024): Promise<string> => {
    if (file.size > limitBytes) return ''
    if (!crypto?.subtle) return ''
    const buf = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  },

  // 申请预签名上传 URL
  init: (data: presignContract.InitReq) => {
    return request<ApiResponse<PresignInitData>>({
      url: '/api/v1/presign/upload',
      method: 'POST',
      data,
    })
  },

  // 上传完成后通知后端写 share 表
  complete: (data: presignContract.CompleteReq) => {
    return request<ApiResponse<PresignCompleteData>>({
      url: '/api/v1/presign/complete',
      method: 'POST',
      data,
    })
  },

  // 取消
  abort: (data: presignContract.AbortReq) => {
    return request<ApiResponse<unknown>>({
      url: '/api/v1/presign/abort',
      method: 'POST',
      data,
    })
  },
}
