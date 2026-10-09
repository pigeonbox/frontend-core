import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { UserInfo, UserStats } from '@/types/user'

export const userApi = {
  // 用户注册
  register: (data: {
    username: string
    email: string
    password: string
    nickname?: string
  }) => {
    return request<ApiResponse<UserInfo>>({
      url: '/user/register',
      method: 'POST',
      data,
    })
  },

  // 用户登录
  login: (data: { username: string; password: string }) => {
    return request<ApiResponse<{ token: string; user: UserInfo }>>({
      url: '/user/login',
      method: 'POST',
      data,
    })
  },

  // 获取用户信息
  getUserInfo: () => {
    return request<ApiResponse<UserInfo>>({
      url: '/user/info',
      method: 'GET',
    })
  },

  // 更新用户资料
  updateProfile: (data: { nickname?: string; avatar?: string }) => {
    return request<ApiResponse<UserInfo>>({
      url: '/user/profile',
      method: 'PUT',
      data,
    })
  },

  // 更新用户信息（Dashboard 页面使用）
  updateUserInfo: (data: { nickname?: string; email?: string }) => {
    return request<ApiResponse<UserInfo>>({
      url: '/user/profile',
      method: 'PUT',
      data,
    })
  },

  // 修改密码
  changePassword: (data: { old_password: string; new_password: string }) => {
    return request<ApiResponse<void>>({
      url: '/user/change-password',
      method: 'POST',
      data,
    })
  },

  // 获取用户统计
  getUserStats: () => {
    return request<ApiResponse<UserStats>>({
      url: '/user/stats',
      method: 'GET',
    })
  },

  // ===== API Key（个人访问令牌）=====

  // 列出我的 API Key（含已吊销；注意后端载荷键为 keys 而非 data）
  listApiKeys: () => {
    return request<ApiResponse<never> & { keys: ApiKeyItem[] }>({
      url: '/user/api-keys',
      method: 'GET',
    })
  },

  // 创建 API Key（明文 key 仅本次响应返回一次）
  createApiKey: (data: { name?: string; expires_in_days?: number }) => {
    return request<ApiResponse<{ key: string; api_key: ApiKeyItem }>>({
      url: '/user/api-keys',
      method: 'POST',
      data,
    })
  },

  // 吊销 API Key（即时生效）
  revokeApiKey: (id: number) => {
    return request<ApiResponse<void>>({
      url: `/user/api-keys/${id}`,
      method: 'DELETE',
    })
  },

  // 一键吊销全部有效 API Key（应急止损，返回吊销数量）
  revokeAllApiKeys: () => {
    return request<ApiResponse<{ revoked: number }>>({
      url: '/user/api-keys/revoke-all',
      method: 'POST',
    })
  },
}

export interface ApiKeyItem {
  id: number
  name: string
  prefix: string
  last_used_at: string | null
  last_used_ip: string | null
  expires_at: string | null
  created_at: string | null
  revoked: boolean
}
