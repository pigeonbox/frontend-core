import { request } from '@/utils/request'
import { xhrSend } from '@/api/_xhr'
import type { ApiResponse } from '@/types/common'
import type { share as shareContract } from '@pigeonbox/contracts'

export const shareApi = {
  // 分享文本(请求契约 = contracts IDL 生成;此前手写类型漏 custom_code/encrypted)
  shareText: (data: shareContract.ShareTextReq) => {
    const formData = new FormData()
    formData.append('text', data.text)
    formData.append('expire_value', String(data.expire_value))
    if (data.require_auth && data.password) formData.append('password', data.password)
    formData.append('expire_style', data.expire_style)
    formData.append('require_auth', String(data.require_auth || false))
    if (data.encrypted) formData.append('encrypted', 'true')
    if (data.custom_code) formData.append('custom_code', data.custom_code)

    // 响应契约 = ShareData{code,url}(share_url/full_share_url/qr_code_data 为
    // 幻影字段,后端不下发,v0.13.6 清理)
    return request<ApiResponse<shareContract.ShareData>>({
      url: '/share/text/',
      method: 'POST',
      data: formData,
    })
  },

  // 分享文件(请求契约同上;password v0.6.1 起入契约)
  shareFile: (data: shareContract.ShareFileReq & { file: File }) => {
    const formData = new FormData()
    formData.append('file', data.file)
    formData.append('expire_value', String(data.expire_value))
    formData.append('expire_style', data.expire_style)
    // require_auth 为契约必填: false 也必须显式发送(条件 append 曾致公开分享 400)
    formData.append('require_auth', String(data.require_auth))
    if (data.require_auth && data.password) formData.append('password', data.password)

    // 响应契约 = ShareData{code,url}(幻影字段清理同上)
    return request<ApiResponse<shareContract.ShareData>>({
      url: '/share/file/',
      method: 'POST',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // 获取分享内容(响应契约 v0.6.0 起 = ShareDetail 全字段,含 download_url/token/files)
  getShare: (code: string, password?: string) => {
    return request<ApiResponse<shareContract.ShareDetail>>({
      url: '/share/select/',
      method: 'GET',
      params: { code, password },
    })
  },

}

/**
 * 分享文件（multipart，XHR 通道支持进度与中断）。
 * 2026-10-06 W2 收编自 FileUpload 内联 XHR；encrypted/custom_code 由调用方按
 * 原语义传入（e2e 且密文已生成才传 encrypted；登录且非空才传 custom_code）。
 */
export interface UploadFileResult {
  code: string
  url: string
  pickup_code?: string
}

export async function uploadFile(
  file: File,
  opts: {
    expire_value: number
    expire_style: string
    require_auth: boolean
    password?: string
    encrypted: boolean
    custom_code?: string
  },
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<UploadFileResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('expire_value', String(opts.expire_value))
  formData.append('expire_style', opts.expire_style)
  // require_auth 为契约必填: false 也必须显式发送
  formData.append('require_auth', String(opts.require_auth))
  if (opts.require_auth && opts.password) formData.append('password', opts.password)
  if (opts.encrypted) formData.append('encrypted', 'true')
  if (opts.custom_code) formData.append('custom_code', opts.custom_code)

  // 原内联 XHR 无超时（timeout=0=不限），钉现状
  const res = await xhrSend<UploadFileResult>({
    url: '/share/file/',
    form: formData,
    onProgress,
    signal,
    timeout: 0,
  })
  if (!res.data) throw new Error(res.message || 'Upload failed')
  return res.data
}
