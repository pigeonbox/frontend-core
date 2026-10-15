// api/p2p.ts — 设备直传管理端 API（P2a；与 contracts idl/p2p.thrift 对齐）。
// 复用 request 封装（自动带 CSRF 头/401 重放/错误信封）。
import { request } from '@/utils/request'
import { xhrSend } from '@/api/_xhr'

export interface P2pTask {
  id: string
  kind: 'send' | 'recv'
  state: 'waiting' | 'running' | 'retrying' | 'done' | 'failed' | 'canceled' | 'expired'
  code: string
  paths: string[]
  bytes_done: number
  /** 传输总字节（0=未知；p2pc 进度行回填，前端画进度条） */
  bytes_total: number
  error: string
  attempts: number
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

// 在线名录对端（2026-10-14 邀请信箱配套；p2pd 名录透传，零敏感）
export interface P2pDirectoryPeer {
  node_id: string
  name: string
  url: string
  box_pub: string
  online_since: number
}

export interface PublishOpts {
  expire_value?: number
  expire_style?: string
  require_auth?: boolean
  password?: string
  custom_code?: string
}

export interface UploadSendOpts {
  inviteTo?: string
  inviteNote?: string
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export const p2pApi = {
  status: () => request<ApiResponse<P2pStatus>>({ url: '/admin/p2p/status', method: 'GET' }),
  tasks: () => request<ApiResponse<{ tasks: P2pTask[] }>>({ url: '/admin/p2p/tasks', method: 'GET' }),
  // taskLog 任务日志（p2pc 行级环,时间正序;详情抽屉诊断用——失败免登服务器）
  taskLog: (taskId: string) =>
    request<ApiResponse<{ lines: string[] }>>({ url: `/admin/p2p/tasks/${encodeURIComponent(taskId)}/log`, method: 'GET' }),
  send: (paths: string[], inviteTo?: string, inviteNote?: string) =>
    request<ApiResponse<{ task: P2pTask }>>({
      url: '/admin/p2p/send',
      method: 'POST',
      data: { paths, invite_to: inviteTo || undefined, invite_note: inviteNote || undefined },
    }),
  // uploadSend 浏览器文件直发（2026-10-15:p2pcweb 体验融入管理台）。
  // multipart files[] → 服务器上传临时区 → p2pc send；invite 元数据走 query。
  // 走 xhrSend 才有上传进度；timeout=0（大文件上传不限时，与访客投递同规）。
  uploadSend: (files: File[], opts: UploadSendOpts = {}) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    const qs = new URLSearchParams()
    if (opts.inviteTo) qs.set('invite_to', opts.inviteTo)
    if (opts.inviteNote) qs.set('invite_note', opts.inviteNote)
    const q = qs.toString()
    return xhrSend<{ task: P2pTask }>({
      url: '/admin/p2p/send/upload' + (q ? `?${q}` : ''),
      form: fd,
      timeout: 0,
      signal: opts.signal,
      onProgress: opts.onProgress,
    })
  },
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
  // 在线名录（发送卡对端选择器）
  directory: () => request<ApiResponse<{ peers: P2pDirectoryPeer[] }>>({ url: '/admin/p2p/directory', method: 'GET' }),
}
