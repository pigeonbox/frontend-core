import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { notify as notifyContract } from '@pigeonbox/contracts'

// 契约镜像退休(P1):admin 直出 model 的通知字段与契约 NotifyItem 一致
// (start_at/end_at 为 optional 非 null;ListData 为超集含 total/page)。
export type NotifyItem = notifyContract.NotifyItem

export type NotifyListData = notifyContract.ListData

export const notifyApi = {
  // 获取当前活跃通知（匿名公开端点；2026-10-07 前指向不存在的 /notifies/active，
  // 公告横幅从未在访客侧亮过）
  active: (type?: string) => {
    return request<ApiResponse<NotifyListData>>({
      url: '/api/v1/notifies/public',
      method: 'GET',
      params: type ? { type } : undefined,
    })
  },

  // 列表（管理）
  list: (params: { page?: number; page_size?: number; type?: string; level?: string; status?: number }) => {
    return request<ApiResponse<{
      items: NotifyItem[]
      total: number
      page: number
      page_size: number
    }>>({
      url: '/admin/notifies',
      method: 'GET',
      params,
    })
  },

  get: (id: number) => {
    return request<ApiResponse<NotifyItem>>({
      url: `/admin/notifies/${id}`,
      method: 'GET',
    })
  },

  create: (data: Omit<NotifyItem, 'id' | 'created_at' | 'updated_at' | 'status'> & { status?: number }) => {
    return request<ApiResponse<NotifyItem>>({
      url: '/admin/notifies',
      method: 'POST',
      data,
    })
  },

  update: (id: number, data: Partial<NotifyItem>) => {
    return request<ApiResponse<unknown>>({
      url: `/admin/notifies/${id}`,
      method: 'PUT',
      data,
    })
  },

  delete: (id: number) => {
    return request<ApiResponse<unknown>>({
      url: `/admin/notifies/${id}`,
      method: 'DELETE',
    })
  },
}
