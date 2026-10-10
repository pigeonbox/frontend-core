import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { share as shareContract } from '@pigeonbox/contracts'

// 契约镜像退休(P1):wire 类型直取 @pigeonbox/contracts——P2 IDL 化列车后服务层
// 直返契约模型 UserShareItemData,字段与 wire 1:1(含 pickup_code/status/file_count,
// 比旧手抄副本更全)。批次操作结果信封保持手抄:UserShareOpResp.data 为可选,
// 与消费侧非空假设不合,随 P3 一并处理。
export type UserShareItem = shareContract.UserShareItemData

export type UserShareListData = shareContract.UserSharesListData

export type UserShareListResp = ApiResponse<UserShareListData>

export interface BatchResultResp {
  code: number
  message: string
  data: { [k: string]: number }
}

export const userSharesApi = {
  // 我的分享列表（带筛选）
  list: (params: {
    status?: string
    search?: string
    page?: number
    page_size?: number
  } = {}) => {
    return request<UserShareListResp>({
      url: '/api/v1/user/shares',
      method: 'GET',
      params,
    })
  },

  // 批量软删除
  batchDelete: (codes: string[]) => {
    return request<BatchResultResp>({
      url: '/api/v1/user/shares/batch-delete',
      method: 'POST',
      data: { codes },
    })
  },

  // 批量延期
  batchExtend: (codes: string[], opts: { hours?: number; forever?: boolean }) => {
    return request<BatchResultResp>({
      url: '/api/v1/user/shares/batch-extend',
      method: 'POST',
      data: { codes, ...opts },
    })
  },

  // 恢复软删除
  restore: (code: string) => {
    return request<ApiResponse<unknown>>({
      url: `/api/v1/user/shares/${encodeURIComponent(code)}/restore`,
      method: 'POST',
    })
  },

  // 永久删除
  hardDelete: (code: string) => {
    return request<ApiResponse<unknown>>({
      url: `/api/v1/user/shares/${encodeURIComponent(code)}/hard`,
      method: 'DELETE',
    })
  },
}
