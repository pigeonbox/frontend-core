import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'

export interface PublicConfig {
  name: string
  description: string
  uploadSize: number
  enableChunk: number
  openUpload: boolean
  /** 匿名上传需登录（upload.require_login）；缺省=false */
  requireLogin?: boolean
  /** 注册开关（与 /user/register 判定同源）；缺省视为未拿到，不据此隐藏入口 */
  registerEnabled?: boolean
  /** OIDC 单点登录开关（P2 SSO；security.oidc.enabled） */
  oidcEnabled?: boolean
  /** 管理后台入口可见性（ui.show_admin_addr，缺省=展示；/admin 路由始终可达，仅控制页脚入口展示） */
  showAdminAddr?: boolean
  /** API 文档开关（ui.expose_openapi）：false 时后端 /openapi.json 404，前端隐藏入口并降级 /api-docs 页 */
  apiDocsEnabled?: boolean
  /** 背景图 URL（后端已白名单校验 http(s)） */
  background?: string
  /** 直传策略：everyone=所有人可直传 / authenticated=仅登录用户 / disabled=关闭直传 */
  presignPolicy?: 'everyone' | 'authenticated' | 'disabled'
  /** 派生匿名开关（presignPolicy !== 'disabled'）；兼容旧语义判断 */
  presignEnabled?: boolean
  /** 直传阈值 MB（超过走 presign 直传；缺省=100） */
  presignThresholdMb?: number
  /** 主题色（#hex，后端已校验） */
  accentColor?: string
  /** 分享码/口令查询是否不区分大小写（download.code_case_insensitive，缺省=开；旧后端无此键） */
  codeCaseInsensitive?: boolean
  expireStyle: string[]
  textMaxBytes: number
  initialized?: boolean
}

// 系统初始化请求（字段名与后端 thrift 模型 snake_case 对齐）
export interface InitializeSystemReq {
  admin_username: string
  admin_password: string
  admin_email: string
  // 站点预配置（2026-10-07 首启向导；可选，缺省走 yaml 默认）
  base_config?: { name: string; description: string; port?: number; host?: string }
  site_config?: { upload_size_mb: number; open_upload: boolean }
}

export const publicApi = {
  // 获取公开配置（站点名/上传限制/初始化状态等，前端启动时拉取）
  getConfig: () => {
    return request<ApiResponse<PublicConfig>>({
      url: '/api/config',
      method: 'GET',
    })
  },

  // 检查系统初始化状态
  checkInitialization: () => {
    return request<{
      initialized: boolean
      message: string
    }>({
      url: '/setup/check',
      method: 'GET',
    })
  },

  // 初始化系统（创建首个管理员；仅未初始化时可用，重复调用返回 403）
  // 成功：HTTP 200 + {message, username}；失败：HTTP 400/403/500 + {code, message}
  initializeSystem: (data: InitializeSystemReq) => {
    return request<{ message: string; username: string }>({
      url: '/setup',
      method: 'POST',
      data,
    })
  },
}
