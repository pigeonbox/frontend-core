import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { UserInfo, UserStats } from '@/types/user'
import type { common as commonContract, user as userContract } from '@pigeonbox/contracts'

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
  // totp_code：账号开启二验后**必填**。未带时服务端回 40012（「需要验证码」，
  // 此时口令已正确、**不计入失败锁定**）⇒ 前端据此弹第二个输入框再提交一次。
  login: (data: { username: string; password: string; totp_code?: string }) => {
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
  createApiKey: (data: { name?: string; expires_in_days?: number; scopes?: string[] }) => {
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
  // 契约派生（contracts v0.20.0：UserAPIKeysRevokeAllData）
  revokeAllApiKeys: () => {
    return request<ApiResponse<commonContract.UserAPIKeysRevokeAllData>>({
      url: '/user/api-keys/revoke-all',
      method: 'POST',
    })
  },

  // ===== 账号与信任（5.2.0）=====

  // ---- 二次验证（TOTP）----
  // setup 只是**生成**密钥（totp_enabled 仍为 false）：必须再调 totpEnable
  // 送一次有效码才算绑定成功——否则「扫了码但没验过」会把自己锁在门外。
  totpSetup: () => {
    return request<ApiResponse<userContract.TotpSetupData>>({
      url: '/user/totp/setup',
      method: 'POST',
    })
  },

  // 启用并**一次性**返回恢复码（库内只存 bcrypt 哈希，页面关掉就再也拿不到）
  totpEnable: (code: string) => {
    return request<ApiResponse<userContract.TotpEnableData>>({
      url: '/user/totp/enable',
      method: 'POST',
      data: { code },
    })
  },

  // 关闭二验必须双因子（口令 + 当前码）：防「令牌被盗后顺手把二验关掉」
  totpDisable: (data: { password: string; code: string }) => {
    return request<ApiResponse<void>>({
      url: '/user/totp/disable',
      method: 'POST',
      data,
    })
  },

  // ---- 邮箱自助找回密码 ----
  // ⚠️ forgot **恒返回成功**（防账号枚举）：不要按响应判断邮箱是否存在。
  forgotPassword: (email: string) => {
    return request<ApiResponse<void>>({
      url: '/user/password/forgot',
      method: 'POST',
      data: { email },
    })
  },

  // 重置链接里的 token 由服务端签发的邮件带入（前端只透传）
  resetPassword: (data: { token: string; new_password: string }) => {
    return request<ApiResponse<void>>({
      url: '/user/password/reset',
      method: 'POST',
      data,
    })
  },

  // ---- 登录设备管理 ----
  listSessions: () => {
    return request<ApiResponse<userContract.UserSessionsData>>({
      url: '/user/sessions',
      method: 'GET',
    })
  },

  // 踢掉指定会话（current: true 的那条由界面禁掉，避免踢掉自己）
  revokeSession: (id: number) => {
    return request<ApiResponse<void>>({
      url: `/user/sessions/${id}`,
      method: 'DELETE',
    })
  },

  // 退出所有设备：撤全部会话 + 会话纪元 +1（API Key 不受影响）
  revokeAllSessions: () => {
    return request<ApiResponse<void>>({
      url: '/user/sessions/revoke-all',
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
  /**
   * 撤销时间（contracts v0.20.7 补齐）。
   * 撤销是**软撤销 + 审计留痕**（列表**含**已撤销项）；此前服务端只落库不回传
   * ⇒ 前端拿不到「这把 Key 是什么时候被撤销的」⇒ 审计信息断在回传面。
   * 空/缺省 = 未撤销（服务端在未撤销时不回该字段）。
   */
  revoked_at?: string | null
  /**
   * 权限范围（contracts v0.20.5）：该 Key 被允许的能力面。
   * **空/缺省 = 全量**（与 scopes 机制引入前一致 ⇒ 老 Key 零影响）。
   */
  scopes?: string[]
}
