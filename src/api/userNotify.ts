import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { notify as notifyContract } from '@pigeonbox/contracts'

// 契约镜像退休(P1):IDL 化列车后 notify mine 直返契约模型
// (read_at 为 optional 非 null——消费侧如有 `=== null` 比较需一并调整)。
export type UserNotifyItem = notifyContract.UserNotifyItemData

export type UserNotifyListData = notifyContract.MineData

export const userNotifyApi = {
  // 我的通知列表
  list: (params: { page?: number; page_size?: number } = {}) => {
    return request<ApiResponse<UserNotifyListData>>({
      url: '/api/v1/notifies/mine',
      method: 'GET',
      params,
    })
  },

  // 未读数
  unreadCount: () => {
    return request<ApiResponse<{ unread: number }>>({
      url: '/api/v1/notifies/unread-count',
      method: 'GET',
    })
  },

  // 标记已读
  markAllRead: () => {
    return request<ApiResponse<{ marked: number }>>({
      url: '/api/v1/notifies/mark-read',
      method: 'POST',
      data: { all: true },
    })
  },
}
