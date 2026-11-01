// api/p2p.ts — 跨站联邦管理端 API（Wave B'：设备直传面整体退役，只剩联邦面）。
//
// 2026-10-22 两应用分拆：设备直传（p2pc / p2pcweb）拆为独立应用 PigeonBeam，
// Box 侧不再编排直传，直传的 9 个管理端点与任务模型已从 contracts idl/p2p.thrift
// 删除（contracts 4c3d188）。本文件因此**只保留联邦四端点**：
// invites / invites-accept / invite-push / directory。
//
// 类型依赖纪律（关键）：前端消费的是**已发布**的 contracts tgz（package.json 钉
// v0.17.0，发布包里直传类型还在）。所以这里只 import 新契约仍在的联邦类型；
// 直传时代的状态/任务/发送/接收/取消/发布/日志/上传/配对那一族类型与任务模型
// 一律不引用——等 contracts 发新版删掉旧 tgz 里的同名类型时，前端不会当场编译失败。
import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { p2p as p2pContract } from '@pigeonbox/contracts'

// 邀请信封（跨站推送的凭证与状态机）——v0.17.0 与新契约同形
export type P2pInvite = p2pContract.InviteInfo
// 在线名录对端（p2pd 名录透传，零敏感）——v0.17.0 与新契约同形
export type P2pDirectoryPeer = p2pContract.P2pDirectoryPeer

/**
 * accept 的响应类型：**就地手写**，不 import contracts 的 accept 响应类型。
 *
 * 原因：v0.17.0 发布包里 accept 的 data 仍是直传任务信封（随直传面一并从 IDL
 * 删除），新契约（contracts 4c3d188）改为 { invite: InviteInfo }——接受邀请退化为
 * 纯信封动作。引旧类型会绑死已删的任务模型，故按新契约就地声明。
 * TODO(待 contracts 新版发布): 改成 import type { AdminP2pInviteAcceptResp } from '@pigeonbox/contracts'
 */
export interface P2pInviteAcceptResp {
  code: number
  message: string
  data: { invite: p2pContract.InviteInfo }
}

export const p2pApi = {
  // 待收邀请箱（跨站推送进来的口令信封）
  invites: () =>
    request<ApiResponse<p2pContract.AdminP2pInvitesData>>({ url: '/admin/p2p/invites', method: 'GET' }),

  // 认领邀请：出箱 + 留痕 + 返回信封（不再 spawn 直传运行时）
  acceptInvite: (inviteId: string) =>
    request<ApiResponse<{ invite: p2pContract.InviteInfo }>>({
      url: '/admin/p2p/invites/accept',
      method: 'POST',
      data: { invite_id: inviteId },
    }),

  // 向对端实例投递邀请（免口令交接）
  invitePush: (code: string, targetUrl: string, fromName: string, note: string) =>
    request<ApiResponse<unknown>>({
      url: '/admin/p2p/invite-push',
      method: 'POST',
      data: { code, target_url: targetUrl, from_name: fromName, note },
    }),

  // 在线名录（对端选择器数据源）
  directory: () =>
    request<ApiResponse<p2pContract.AdminP2pDirectoryData>>({ url: '/admin/p2p/directory', method: 'GET' }),
}
