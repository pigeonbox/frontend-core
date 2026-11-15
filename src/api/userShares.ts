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

// ===== 取件时间线（frontend-core#93）=====
// contracts 无此模型（contracts 本 PR 冻结 ⇒ core 走手写过渡端点，
// 已在 core routes_classification 登记 Pending 收敛债）⇒ 本地类型手抄 wire：
// GET /api/v1/user/shares/:code/timeline → {code,message,data:{state,events,...}}（非分页）。

/** 时间线单条事件（成功/失败按时间倒序）。 */
export interface PickupTimelineEvent {
  at: string
  result: 'success' | 'failed'
  /** 失败原因枚举（错误码语义：password_wrong / count_exhausted / expired） */
  reason?: string
  /** 交付面（select / select-text / download / download-text / retrieve） */
  channel?: string
  /** 与上一条已知来源的失败是否同一来源（隐私拍板：只给布尔，不给 IP） */
  same_source?: boolean
}

/** 取件时间线数据（三态 + 事件 + 来源聚合）。 */
export interface PickupTimelineData {
  /** never 从未被访问 / failed 被尝试但失败 / picked 成功取件 */
  state: 'never' | 'failed' | 'picked'
  events: PickupTimelineEvent[]
  failure_count: number
  /** 失败来源数（指纹去重，不下发指纹本身） */
  failure_sources: number
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

  // 取件时间线（frontend-core#93：三态 + 成功/失败事件按时间序）
  timeline: (code: string) => {
    return request<ApiResponse<PickupTimelineData>>({
      url: `/api/v1/user/shares/${encodeURIComponent(code)}/timeline`,
      method: 'GET',
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
