import { request } from '@/utils/request'
import type { ApiResponse, PaginatedResponse } from '@/types/common'
import type { admin as adminContract } from '@pigeonbox/contracts'

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

// notify 段（通用 GET/PUT /admin/config 透传，语义见 contracts idl/admin.thrift 注释）。
// telegram/bark 为外部推送渠道（2026-11-01 core#31）：缺省空 = 禁用该渠道。
export interface TelegramNotifyUpdate {
  bot_token?: string
  chat_id?: string
  [key: string]: unknown
}

export interface BarkNotifyUpdate {
  server_url?: string
  device_key?: string
  [key: string]: unknown
}

// 分享到期提醒（5.5.0 core）：注意它**不是渠道**，而是「什么时候产生消息」。
// 所以是 notify 段的平级子段，关掉它不影响各渠道自己的配置。
export interface ExpiryReminderNotifyUpdate {
  enabled?: boolean
  advance_hours?: number
  interval_minutes?: number
  [key: string]: unknown
}

// 推送渠道测试发送（core#122）wire 类型——**手写副本**。
// core#122 待 IDL 化后替换为 contracts 生成类型：该路由（POST /admin/notify/channels/test）
// 暂以手写注册进 core 的 routes_custom.go，未进 contracts IDL ⇒ 无生成类型可用；
// 待下趟库线列车收敛进 admin.thrift 并发 contracts tag 后，本段整体换成
// adminContract 生成类型（同 contractTypeDrift.spec 已登记路由的口径）。
export type NotifyTestChannel = 'webhook' | 'telegram' | 'bark'

// 测试结论（HTTP 200 + 全站信封的 data）：ok=false 表示**发送失败但 API 正常**
// （error_summary 为脱敏摘要，不含 token/key/目标 URL 凭据片段）；
// 仅请求非法（缺 channel / 未知 channel）才是 400 + 10001。
export interface NotifyChannelTestResult {
  ok: boolean
  latency_ms: number
  error_summary: string
}

export interface NotifyConfigUpdate {
  webhook_url?: string
  smtp?: Record<string, unknown>
  telegram?: TelegramNotifyUpdate
  bark?: BarkNotifyUpdate
  expiry_reminder?: ExpiryReminderNotifyUpdate
  [key: string]: unknown
}

export type AdminConfigUpdate = Partial<BasicConfigUpdate & SecurityConfigUpdate & EmailConfigUpdate> & {
  notify?: NotifyConfigUpdate
  [key: string]: unknown
}

// 备份包条目（/admin/backups 的 items）。
export interface BackupItem {
  name: string
  size: number
  // 生成时间取自**文件名**（不是 mtime），RFC3339；空串表示解析不出（不该发生）
  created_at: string
  download_url: string
}

// 备份状态 + 列表（一次请求取齐）。
//
// 为什么合成一个响应而不是两次请求：分两次会让卡片短暂出现「有 3 份包但显示
// 从未备份」这种自相矛盾的中间态——运维看到这种图只会怀疑功能坏了。
export interface BackupOverview {
  enabled: boolean
  dir: string
  keep: number
  at: string
  count: number
  total_bytes: number
  last_file: string
  last_size: number
  // 最新一份包的生成时间（RFC3339；空串 = 从未备份）
  last_backup_at: string
  running: boolean
  last_error: string
  items: BackupItem[]
}

export const adminApi = {
  // 管理员登录(契约镜像 P1:core 返回 AdminLoginData{token,token_type,expires_in}——
  // 旧手抄内联 {token,user{...}} 是照抄 /user/login 形态的幻影字段,wire 从不下发
  // user;消费面(Login.vue)只判 code+另拉 fetchUserInfo,幻影零影响已核实)
  login: (data: adminContract.AdminLoginReq) => {
    return request<ApiResponse<adminContract.AdminLoginData>>({
      url: '/admin/login',
      method: 'POST',
      data,
    })
  },

  // 获取系统统计(契约镜像 P1:AdminStatsData 为超集,较旧内联 9 字段多
  // latest_upload 等健康维度,消费面读子集无碍)
  getStats: () => {
    return request<ApiResponse<adminContract.AdminStatsData>>({
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

  // 部署自检快照（含更新状态）。
  //
  // 只取「更新」这一段：其余检查项（DB / 存储 / Redis / 首启）由 pb doctor 消费，
  // 前端维护页不重复呈现——同一事实两个界面 = 两份要维护的文案。
  getDiagnostics: () => {
    return request<ApiResponse<{
      version: string
      update?: {
        current: string
        latest?: string
        available: boolean
        source: 'github' | 'disabled' | 'unknown'
        checked_at?: string
        stale?: boolean
        url?: string
        error?: string
      }
    }>>({
      url: '/admin/diagnostics',
      method: 'GET'
    })
  },

  // ===== 备份（5.1.0 定时自动备份）=====
  getBackups: () => {
    return request<ApiResponse<BackupOverview>>({
      url: '/admin/backups',
      method: 'GET'
    })
  },

  // 立即备份：服务端**立刻返回**（真正的导出在后台跑，几十 GB 不能挂在 HTTP
  // 请求上）⇒ 返回的是「有没有开始」，进度看 getBackups().running。
  runBackup: () => {
    return request<ApiResponse<{ started: boolean; running: boolean }>>({
      url: '/admin/backups/run',
      method: 'POST'
    })
  },

  // 下载备份包。必须走 blob 而不是 <a href>：该端点要鉴权头，浏览器直连会
  // 401；且拦截器对二进制载荷不做信封归一化（见 utils/request.ts）。
  downloadBackup: (name: string) => {
    return request<Blob>({
      url: `/admin/backups/${encodeURIComponent(name)}`,
      method: 'GET',
      responseType: 'blob'
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
        // username 上传者用户名（2026-10-29 新增）：账号已删/匿名时为空，
        // 前端据此回退显示 user_id 或「匿名」。
        username?: string
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

  // 推送渠道测试发送（core#122）：真实发一条固定文案测试消息到所选渠道。
  // 渠道发送失败是**测试的结论**（200 + data.ok=false），不是 API 错误。
  testNotifyChannel: (channel: NotifyTestChannel) => {
    return request<ApiResponse<NotifyChannelTestResult>>({
      url: '/admin/notify/channels/test',
      method: 'POST',
      data: { channel },
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
