import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { notify as notifyContract } from '@pigeonbox/contracts'

// 契约镜像退休(P1):admin 直出 model 的通知字段与契约 NotifyItem 一致
// (start_at/end_at 为 optional 非 null;ListData 为超集含 total/page)。
export type NotifyItem = notifyContract.NotifyItem

export type NotifyListData = notifyContract.ListData

/**
 * 公开公告条目（契约 NotifyPublicItem）。
 *
 * ⚠️ 与管理端 NotifyItem 的差异：公开端点（/api/v1/notifies/public）只下发
 * 展示用的 7 个字段（core 的 ListPublicNotifies 手工 map），**没有**
 * status/created_at/updated_at ⇒ 公开面用独立类型，不复用 NotifyItem。
 */
export type NotifyPublicItem = notifyContract.NotifyPublicItem

export const notifyApi = {
  // 获取当前活跃通知（匿名公开端点；2026-10-07 前指向不存在的 /notifies/active，
  // 公告横幅从未在访客侧亮过）
  //
  // 契约派生（contracts v0.20.0：NotifyPublicListData）——此前挂的是管理端
  // ListData（含 total/page/page_size），而公开端点**只回 {items}** ⇒ 那三个
  // 字段是幻影。消费面（NotifyBanner）只读 items，行为不变。
  active: (type?: string) => {
    return request<ApiResponse<notifyContract.NotifyPublicListData>>({
      url: '/api/v1/notifies/public',
      method: 'GET',
      params: type ? { type } : undefined,
    })
  },

  // 列表（管理）——契约 ListData（items/total/page/page_size，与此前的内联
  // 字面量逐字段同形）；公开面改用 NotifyPublicListData 后，这里让
  // NotifyListData 回到「唯一在用」的出口，不留孤儿导出。
  list: (params: { page?: number; page_size?: number; type?: string; level?: string; status?: number }) => {
    return request<ApiResponse<NotifyListData>>({
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
