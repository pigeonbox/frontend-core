import { request } from '@/utils/request'
import type { ApiResponse, PaginatedResponse } from '@/types/common'

// 管理员配置更新类型（替代 any）
export interface BasicConfigUpdate {
  site_name?: string
  site_description?: string
  [key: string]: unknown
}

export interface SecurityConfigUpdate {
  allow_registration?: boolean
  [key: string]: unknown
}

export interface EmailConfigUpdate {
  smtp_host?: string
  smtp_port?: number
  [key: string]: unknown
}

export type AdminConfigUpdate = Partial<BasicConfigUpdate & SecurityConfigUpdate & EmailConfigUpdate> & {
  [key: string]: unknown
}

export const adminApi = {
  // 管理员登录
  login: (data: { username: string; password: string }) => {
    return request<ApiResponse<{
      token: string
      user: {
        id: number
        username: string
        nickname: string
        role: string
      }
    }>>({
      url: '/admin/login',
      method: 'POST',
      data,
    })
  },

  // 获取系统统计
  getStats: () => {
    return request<ApiResponse<{
      total_files: number
      total_users: number
      total_size: number
      today_uploads: number
      today_downloads: number
      // 文件健康洞察维度（2026-10-07；后端 AdminStatsData 同步暴露）
      active_files: number
      expired_files: number
      expiring_soon_files: number
      never_picked_files: number
      forever_files: number
    }>>({
      url: '/admin/stats',
      method: 'GET',
    })
  },

  // 别名：获取仪表板统计
  getDashboardStats: () => adminApi.getStats(),

  // 服务端构建版本（/version 在 v0.12.x 攻击面收缩后收归管理员门禁,仅供仪表盘版本页脚）
  getVersion: () => {
    return request<{
      code: number
      version: string
      commit: string
      build_time: string
      start_time: string
    }>({
      url: '/version',
      method: 'GET',
    })
  },

  // 健康洞察过滤取值（与后端 FileCodeQuery.Health 同口径）
  healthFilters: ['active', 'expired', 'expiring_soon', 'never_picked', 'forever'] as const,

  // 获取文件列表
  getFiles: (params: {
    page?: number
    page_size?: number
    keyword?: string
    sort_by?: string
    health?: string
  }) => {
    return request<PaginatedResponse<{
      id: number
      code: string
      file_name: string
      file_size: number
      expire_time: string
      view_count: number
      download_count: number
      created_at: string
    }>>({
      url: '/admin/files',
      method: 'GET',
      params,
    })
  },

  // 别名：获取文件列表
  getFilesList: (params: {
    page?: number
    page_size?: number
    keyword?: string
    sort_by?: string
  }) => adminApi.getFiles(params),

  // 删除文件（按Code）
  deleteFile: (code: string) => {
    return request<ApiResponse<void>>({
      url: `/admin/files/${code}`,
      method: 'DELETE',
    })
  },

  // 删除文件（按ID）
  deleteFileById: (id: number) => {
    return request<ApiResponse<void>>({
      url: `/admin/files/${id}`,
      method: 'DELETE',
    })
  },

  // 删除文件（按Code）
  deleteFileByCode: (code: string) => {
    return request<ApiResponse<void>>({
      url: `/admin/files/${code}`,
      method: 'DELETE',
    })
  },

  // 获取用户列表
  getUsers: (params: {
    // IDL 中 page/page_size 为 required i32（api.query），必须传值，否则后端返回 400
    page: number
    page_size: number
    keyword?: string
    status?: number
  }) => {
    return request<PaginatedResponse<{
      id: number
      username: string
      email: string
      nickname: string
      status: number
      quota_used: number
      quota_limit: number
      created_at: string
    }>>({
      url: '/admin/users',
      method: 'GET',
      params,
    })
  },

  // 别名：获取用户列表
  getUsersList: (params: {
    page: number
    page_size: number
    keyword?: string
    status?: number
  }) => adminApi.getUsers(params),

  // 获取最新用户（用于 Dashboard）
  getRecentUsers: () => {
    return request<ApiResponse<any[]>>({
      url: '/admin/users',
      method: 'GET',
      params: { page: 1, page_size: 5 }
    })
  },

  // 获取最新文件（用于 Dashboard）
  getRecentFiles: () => {
    return request<ApiResponse<any[]>>({
      url: '/admin/files',
      method: 'GET',
      params: { page: 1, page_size: 5 }
    })
  },

  // 更新用户状态
  updateUserStatus: (id: number, status: number) => {
    return request<ApiResponse<void>>({
      url: `/admin/users/${id}/status`,
      method: 'PUT',
      data: { status },
    })
  },

  // 创建用户（后端已实现：POST /admin/users）
  createUser: (data: {
    username: string
    email?: string
    password: string
    nickname?: string
    role?: string
    max_storage_quota?: number
  }) => {
    return request<ApiResponse<any>>({
      url: '/admin/users',
      method: 'POST',
      data,
    })
  },

  // 更新用户（昵称/角色/状态/配额；后端已实现：PUT /admin/users/:id）
  updateUser: (id: number, data: {
    nickname?: string
    role?: string
    status?: string
    max_storage_quota?: number
    max_upload_size?: number
  }) => {
    return request<ApiResponse<any>>({
      url: `/admin/users/${id}`,
      method: 'PUT',
      data,
    })
  },

  // 删除用户（后端已实现：DELETE /admin/users/:id）
  deleteUser: (id: number) => {
    return request<ApiResponse<void>>({
      url: `/admin/users/${id}`,
      method: 'DELETE',
    })
  },

  // 重置用户密码（后端已实现：POST /admin/users/:id/reset-password）
  resetUserPassword: (id: number, password: string) => {
    return request<ApiResponse<void>>({
      url: `/admin/users/${id}/reset-password`,
      method: 'POST',
      data: { password },
    })
  },

  // 带筛选的用户列表（后端已实现：GET /admin/users/filter）
  getUsersFiltered: (params: {
    page?: number
    page_size?: number
    keyword?: string
    status?: string
    role?: string
  }) => {
    return request<ApiResponse<{ list: any[]; total: number; page: number; page_size: number }>>({
      url: '/admin/users/filter',
      method: 'GET',
      params,
    })
  },

  // 文件详情（后端已实现：GET /admin/files/:id）
  getFileDetail: (id: number) => {
    return request<ApiResponse<any>>({
      url: `/admin/files/${id}`,
      method: 'GET',
    })
  },

  // 编辑文件（延期/改次数；后端已实现：PUT /admin/files/:id）
  updateFile: (id: number, data: {
    expire_value?: number
    expire_style?: string
    expired_count?: number
  }) => {
    return request<ApiResponse<void>>({
      url: `/admin/files/${id}`,
      method: 'PUT',
      data,
    })
  },

  // 批量删除文件（按文件 ID；后端已实现：POST /admin/files/batch-delete）
  batchDeleteFilesByIds: (ids: number[]) => {
    return request<ApiResponse<{ deleted: number }>>({
      url: '/admin/files/batch-delete',
      method: 'POST',
      data: { ids },
    })
  },

  // 批量延期文件（后端已实现：POST /admin/files/batch-extend）
  batchExtendFiles: (ids: number[], expireValue: number, expireStyle: string) => {
    return request<ApiResponse<{ extended: number }>>({
      url: '/admin/files/batch-extend',
      method: 'POST',
      data: { ids, expire_value: expireValue, expire_style: expireStyle },
    })
  },

  // 管理端下载（302 到带令牌的公开下载端点）
  fileDownloadUrl: (id: number) => `/admin/files/${id}/download`,

  // Dashboard 富指标（昨日对比/top 后缀/下载总量；后端已实现）
  getEnhancedStats: () => {
    return request<ApiResponse<{
      today_uploads: number
      yesterday_uploads: number
      total_downloads: number
      expired_files: number
      anonymous_files: number
      presign_files: number
      top_suffixes: { suffix: string; count: number }[]
    }>>({
      url: '/admin/stats/enhanced',
      method: 'GET',
    })
  },

  // Dashboard 趋势序列（后端已实现：GET /admin/stats/trend?days=7）
  getStatsTrend: (days = 7) => {
    return request<ApiResponse<{ days: { date: string; uploads: number; downloads: number }[] }>>({
      url: '/admin/stats/trend',
      method: 'GET',
      params: { days },
    })
  },

  // 传输日志（后端已实现：GET /admin/logs/transfer）
  getTransferLogsList: (params: {
    page?: number
    page_size?: number
    operation?: string
    keyword?: string
  }) => {
    return request<ApiResponse<{ items: any[]; total: number; page: number; page_size: number }>>({
      url: '/admin/logs/transfer',
      method: 'GET',
      params,
    })
  },

  // 回收站：恢复（软删 → 存活）
  restoreFiles: (ids: number[]) => {
    return request<ApiResponse<{ restored: number }>>({
      url: '/admin/files/restore',
      method: 'POST',
      data: { ids }
    })
  },

  // 回收站：彻底删除（DB 硬删 + 存储对象删除，不可恢复）
  purgeFiles: (ids: number[]) => {
    return request<ApiResponse<{ purged: number }>>({
      url: '/admin/files/purge',
      method: 'POST',
      data: { ids }
    })
  },

  // 管理操作审计日志（后端已实现：GET /admin/activities）
  getActivities: (params: {
    page?: number
    page_size?: number
    action?: string
    actor?: string
    success?: string
  }) => {
    return request<ApiResponse<{ list: any[]; total: number; page: number; page_size: number }>>({
      url: '/admin/activities',
      method: 'GET',
      params,
    })
  },

  // 获取系统配置(v0.13.5 起 data = SystemConfig 全量 JSON,按段读取;契约层
  // 不锁形——自由格式对象,语义见 contracts idl/admin.thrift 注释)
  getConfig: () => {
    return request<ApiResponse<Record<string, any>>>({
      url: '/admin/config',
      method: 'GET',
    })
  },

  // 别名：获取系统配置
  getSystemConfig: () => adminApi.getConfig(),

  // 更新系统配置
  updateConfig: (config: AdminConfigUpdate) => {
    return request<ApiResponse<void>>({
      url: '/admin/config',
      method: 'PUT',
      // 扁平契约(v0.13.5 起):body = SystemConfig 局部 JSON,nil 段保留。
      // 勿包 {config:...} 壳——曾因此 ex 段写入被静默丢弃(假开关)
      data: config,
    })
  },

  // 更新基础配置
  updateBasicConfig: (data: BasicConfigUpdate) => adminApi.updateConfig({ basic: data }),

  // 更新安全配置
  updateSecurityConfig: (data: SecurityConfigUpdate) => adminApi.updateConfig({ security: data }),

  // 更新邮件配置
  updateEmailConfig: (data: EmailConfigUpdate) => adminApi.updateConfig({ email: data }),

  // 获取传输日志
  getTransferLogs: (params: {
    page?: number
    page_size?: number
  }) => {
    return request<PaginatedResponse<Record<string, unknown>>>({
      url: '/admin/logs/transfer',
      method: 'GET',
      params,
    })
  },

  // 获取系统信息
  getSystemInfo: () => {
    return request<ApiResponse<{
      go_version: string
      build_time: string
      git_commit: string
      os_info: string
      cpu_cores: number
      pigeonbox_version: string
    }>>({
      url: '/admin/maintenance/system-info',
      method: 'GET'
    })
  },

  // 测试邮件（后端未实现，待后端实现后启用）
  testEmail: () => {
    return request<ApiResponse<void>>({
      url: '/admin/email/test',
      method: 'POST'
    })
  },

  // 清理过期文件
  cleanExpiredFiles: () => {
    return request<ApiResponse<{ deleted_count: number }>>({
      url: '/admin/maintenance/clean-expired',
      method: 'POST'
    })
  },

  // 清理孤立文件（后端未实现，待后端实现后启用）
  cleanOrphanFiles: () => {
    return request<ApiResponse<{ deleted_count: number }>>({
      url: '/admin/maintenance/clean-orphan',
      method: 'POST'
    })
  },

  // 优化数据库（后端未实现，待后端实现后启用）
  optimizeDatabase: () => {
    return request<ApiResponse<void>>({
      url: '/admin/maintenance/optimize',
      method: 'POST'
    })
  },

  // 导出数据（后端未实现，待后端实现后启用）
  exportData: () => {
    return request<ApiResponse<{ download_url: string }>>({
      url: '/admin/export',
      method: 'GET'
    })
  },

  // ===== 分享治理（2026-10-03）：组合过滤 + 管控状态机 =====

  // 组合过滤文件列表（后端已实现：GET /admin/files/filter）
  getFilesFiltered: (params: {
    page?: number
    page_size?: number
    keyword?: string
    user_id?: number
    upload_type?: string
    owner_ip?: string
    status?: string
    min_size?: number
    max_size?: number
    created_after?: string
    created_before?: string
    expired?: string
  }) => {
    return request<ApiResponse<{
      items: {
        id: number
        code: string
        file_name: string
        is_text: boolean
        text_preview: string
        size: number
        expired_at: string | null
        expired_count: number
        used_count: number
        viewer_count: number
        status: string
        upload_type: string
        user_id: number | null
        owner_ip: string
        require_auth: boolean
        created_at: string
      }[]
      total: number
      page: number
      page_size: number
    }>>({
      url: '/admin/files/filter',
      method: 'GET',
      params,
    })
  },

  // 设置单个分享管控状态（后端已实现：PUT /admin/files/:id/status）
  setFileStatus: (id: number, status: 'normal' | 'blocked' | 'pending_review') => {
    return request<ApiResponse<{ affected: number }>>({
      url: `/admin/files/${id}/status`,
      method: 'PUT',
      data: { status },
    })
  },

  // 批量设置分享管控状态（后端已实现：POST /admin/files/batch-status）
  batchSetFileStatus: (ids: number[], status: 'normal' | 'blocked' | 'pending_review') => {
    return request<ApiResponse<{ affected: number }>>({
      url: '/admin/files/batch-status',
      method: 'POST',
      data: { ids, status },
    })
  },

  // 用户设置（注册开关/配额默认/会话时长；读写 system_configs user 段，即时生效）
  // 2026-10-03 假开关接线：此前该表单随通用配置保存被后端 thrift 丢弃
  getUserSettings: () => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/config/user',
      method: 'GET',
    })
  },
  updateUserSettings: (data: Record<string, unknown>) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/config/user',
      method: 'PUT',
      data,
    })
  },

  // 限流配置（后端已有：GET/PUT /admin/ratelimit/config）
  getRateLimitConfig: () => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/ratelimit/config',
      method: 'GET',
    })
  },

  updateRateLimitConfig: (data: Record<string, unknown>) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/ratelimit/config',
      method: 'PUT',
      data,
    })
  },

  // 限流运行状态（活跃客户端/被封禁 IP）
  getRateLimitStatus: () => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/ratelimit/status',
      method: 'GET',
    })
  },

  // ===== 存储管理（信息/配置/切换/Probe）=====
  getStorageInfo: () => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/storage',
      method: 'GET',
    })
  },
  // 扁平形态：请求体即完整候选配置（后端整体校验→Probe→热切换→持久化）
  updateStorageConfig: (data: Record<string, unknown>) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/storage/config',
      method: 'PUT',
      data,
    })
  },
  switchStorage: (type: string) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/storage/switch',
      method: 'POST',
      data: { type },
    })
  },
  testStorage: (type: string) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: `/admin/storage/test/${type}`,
      method: 'GET',
    })
  },

  // ===== 设置测试（SMTP 发信 / OIDC discovery）=====
  testSMTP: (to: string) => {
    return request<ApiResponse<null>>({
      url: '/admin/notify/smtp/test',
      method: 'POST',
      data: { to },
    })
  },
  testOIDC: () => {
    return request<ApiResponse<null>>({
      url: '/admin/oidc/test',
      method: 'POST',
    })
  },

  // ===== 公告管理（/admin/notifies CRUD）=====
  listNotifies: (params?: { page?: number; page_size?: number; type?: string }) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/notifies',
      method: 'GET',
      params,
    })
  },
  createNotify: (data: Record<string, unknown>) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: '/admin/notifies',
      method: 'POST',
      data,
    })
  },
  updateNotify: (id: number, data: Record<string, unknown>) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: `/admin/notifies/${id}`,
      method: 'PUT',
      data,
    })
  },
  deleteNotify: (id: number) => {
    return request<ApiResponse<Record<string, unknown>>>({
      url: `/admin/notifies/${id}`,
      method: 'DELETE',
    })
  },
}
