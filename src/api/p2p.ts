// api/p2p.ts — 设备直传管理端 API（P2a；与 contracts idl/p2p.thrift 对齐）。
// 复用 request 封装（自动带 CSRF 头/401 重放/错误信封）。
import { request } from '@/utils/request'

export interface P2pTask {
  id: string
  kind: 'send' | 'recv'
  state: 'waiting' | 'running' | 'done' | 'failed' | 'canceled' | 'expired'
  code: string
  paths: string[]
  bytes_done: number
  error: string
  created_at: string
  finished_at: string
}

export interface P2pStatus {
  available: boolean
  binary_path: string
  enabled: boolean
  registry_url: string
  recv_dir: string
  inbox_used: number
  inbox_quota: number
  deploy_allowed: boolean
}

export interface P2pInvite {
  id: string
  code: string
  from_name: string
  note: string
  received_at: string
  expires_in: number
}

export interface PublishOpts {
  expire_value?: number
  expire_style?: string
  require_auth?: boolean
  password?: string
  custom_code?: string
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export const p2pApi = {
  status: () => request<ApiResponse<P2pStatus>>({ url: '/admin/p2p/status', method: 'GET' }),
  tasks: () => request<ApiResponse<{ tasks: P2pTask[] }>>({ url: '/admin/p2p/tasks', method: 'GET' }),
  send: (paths: string[]) => request<ApiResponse<{ task: P2pTask }>>({ url: '/admin/p2p/send', method: 'POST', data: { paths } }),
  recv: (code: string) => request<ApiResponse<{ task: P2pTask }>>({ url: '/admin/p2p/recv', method: 'POST', data: { code } }),
  cancel: (taskId: string) =>
    request<ApiResponse<{ task_id: string }>>({ url: '/admin/p2p/cancel', method: 'POST', data: { task_id: taskId } }),
  publish: (taskId: string, opts: PublishOpts) =>
    request<ApiResponse<{ share_codes: string[] }>>({ url: '/admin/p2p/publish', method: 'POST', data: { task_id: taskId, ...opts } }),
  // P3 推送邀请
  invites: () => request<ApiResponse<{ invites: P2pInvite[] }>>({ url: '/admin/p2p/invites', method: 'GET' }),
  acceptInvite: (inviteId: string) =>
    request<ApiResponse<{ task: P2pTask }>>({ url: '/admin/p2p/invites/accept', method: 'POST', data: { invite_id: inviteId } }),
  invitePush: (code: string, targetUrl: string, fromName: string, note: string) =>
    request<ApiResponse<{ target_url: string }>>({ url: '/admin/p2p/invite-push', method: 'POST', data: { code, target_url: targetUrl, from_name: fromName, note } }),
}
