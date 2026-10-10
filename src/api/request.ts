/**
 * 寄件码/反向收件 API（P2）
 */
import { request } from '@/utils/request'
import { xhrSend } from '@/api/_xhr'
import type { ApiResponse } from '@/types/common'
import type { request as requestContract } from '@pigeonbox/contracts'

// 契约镜像退休(P1):IDL 化列车后服务层直返契约模型 FileRequestData/PublicViewData
// (含 id/created_at/updated_at,较旧手抄子集更全;expired_at 为 optional 而非 null——
// 消费侧如有 `=== null` 比较需一并调整)。
export type FileRequestItem = requestContract.FileRequestData

export type RequestPublicView = requestContract.PublicViewData

export const requestApi = {
  create: (data: requestContract.CreateReq) =>
    request<ApiResponse<FileRequestItem>>({ url: '/api/v1/user/requests', method: 'POST', data }),

  listMine: () => request<ApiResponse<FileRequestItem[]>>({ url: '/api/v1/user/requests', method: 'GET' }),

  remove: (token: string) =>
    request<ApiResponse<unknown>>({ url: `/api/v1/user/requests/${token}`, method: 'DELETE' }),

  getPublic: (token: string) =>
    request<ApiResponse<RequestPublicView>>({ url: `/request/${token}`, method: 'GET' }),
}

/** 访客投递（multipart，XHR 通道以支持进度） */
export async function guestSubmit(
  token: string,
  files: File[],
  onProgress?: (percent: number) => void
): Promise<void> {
  const formData = new FormData()
  for (const f of files) formData.append('files', f)
  // 原内联 XHR 无超时（timeout=0=不限），钉现状
  await xhrSend({
    url: `/api/v1/request/${encodeURIComponent(token)}/upload`,
    form: formData,
    onProgress: (loaded, total) => onProgress?.(Math.round((loaded / Math.max(total, 1)) * 100)),
    timeout: 0,
  })
}
