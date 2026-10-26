import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { share as shareContract } from '@pigeonbox/contracts'

export interface PublicConfig {
  name: string
  description: string
  uploadSize: number
  /** 站点级单文件上限（upload.max_file_size，字节，0=不限）；上传提示动态化数据源 */
  maxFileSize?: number
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
  /** 管理入口路径段（ui.admin_path/PB_UI_ADMIN_PATH，缺省 admin）：前端按此注册 hash 路由 */
  adminPath?: string
  /** API 文档开关（ui.expose_openapi）：false 时后端 /openapi.json 404，前端隐藏入口并降级 /api-docs 页 */
  apiDocsEnabled?: boolean
  /** 背景图 URL（后端已白名单校验 http(s)） */
  background?: string
  /** 直传策略：everyone=所有人可直传 / authenticated=仅登录用户 / disabled=关闭直传 */
  presignPolicy?: 'everyone' | 'authenticated' | 'disabled'
  /** 直传阈值 MB（超过走 presign 直传；缺省=100） */
  presignThresholdMb?: number
  /** 主题色（#hex，后端已校验） */
  accentColor?: string
  /** 分享码/口令查询是否不区分大小写（download.code_case_insensitive，缺省=开；旧后端无此键） */
  codeCaseInsensitive?: boolean
  /** 站点公网地址（base.public_url，空串=未配置）；分享链接/交付文本按它拼，缺省回退 location.origin */
  publicUrl?: string
  /** 联邦是否启用（多副本模式下后端强制降级为 false）；取件台据此显式给出「跨站取件」提示 */
  federationEnabled?: boolean
  expireStyle: string[]
  textMaxBytes: number
  initialized?: boolean
}

/**
 * 取件元数据（GET /share/metadata/:code，免密码、不扣次数；仅用于回显有效期）
 *
 * 契约派生（contracts v0.20.0：ShareMetadataData，2026-10-26 自 core 的
 * customHandler 收敛进 IDL）——此前是前端手抄的副本，后端改字段名不会编译报错。
 *
 * ⚠️ 可空性差异：契约里 expired_at 是 **optional**（缺省不输出；后端原为
 * *time.Time → null），手抄版是 `string | null` ⇒ 消费面必须 `?? null` 兜底
 * （见 components/share/ShareResultDialog.vue 的 loadExpire）。
 */
export type ShareMetadata = shareContract.ShareMetadataData

// 系统初始化请求（字段名与后端 thrift 模型 snake_case 对齐）
export interface InitializeSystemReq {
  admin_username: string
  admin_password: string
  admin_email: string
  // 站点预配置（2026-10-07 首启向导；可选，缺省走 yaml 默认）
  base_config?: { name: string; description: string; port?: number; host?: string }
  site_config?: {
    /** 单次请求体上限（MB）——对应 upload.upload_size，仅普通直传通道 */
    upload_size_mb: number
    /** 单文件上限（MB，0=不限）——对应 upload.max_file_size（直传/分片等整文件通道） */
    max_file_size_mb?: number
    open_upload: boolean
    // 政策段（2026-10-12 扩容；全部可选，缺省保持默认）
    allowed_expire_styles?: string[]
    max_save_days?: number
    allowed_extensions?: string[]
    allow_registration?: boolean
  }
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

  // 取件元数据（分享成功态回显有效期用）：免密码、不扣取件次数、不外泄内容
  getShareMetadata: (code: string) => {
    return request<ApiResponse<ShareMetadata>>({
      url: `/share/metadata/${encodeURIComponent(code)}`,
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
