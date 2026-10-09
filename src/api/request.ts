/**
 * 寄件码/反向收件 API（P2）
 */
import { request } from '@/utils/request'
import { xhrSend } from '@/api/_xhr'
import type { ApiResponse } from '@/types/common'

/** 字段与 core model.FileRequest 的 json tag（snake_case）对齐；gorm.Model 内嵌字段前端未用 */
export interface FileRequestItem {
  token: string
  title: string
  max_files: number
  max_bytes: number
  expired_at: string | null
  used_count: number
  recv_bytes: number
}

export interface RequestPublicView {
  token: string
  title: string
  max_files: number
  max_bytes: number
  expired_at: string | null
}

export const requestApi = {
  create: (data: { title: string; max_files: number; max_bytes: number; expire_value: number; expire_style: string }) =>
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
