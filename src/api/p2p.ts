// api/p2p.ts — 跨站联邦管理端 API（Wave B'：设备直传面整体退役，只剩联邦面）。
//
// 2026-10-22 两应用分拆：设备直传（p2pc / p2pcweb）拆为独立应用 PigeonBeam，
// Box 侧不再编排直传，直传的 9 个管理端点与任务模型已从 contracts idl/p2p.thrift
// 删除（contracts 4c3d188）。本文件因此**只保留联邦四端点**：
// invites / invites-accept / invite-push / directory。
//
// 类型依赖纪律（关键）：前端消费的是**已发布**的 contracts tgz（package.json 钉
// v0.20.7）。该发布包的 p2p 域**只剩联邦一族类型**（直传时代的状态/任务/发送/
// 接收/取消/发布/日志/上传/配对那一族已随直传面退役从 IDL 删除），所以本文件
// 的每个类型都直接取自契约生成物，不留手写副本。
import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { p2p as p2pContract } from '@pigeonbox/contracts'

// 邀请信封（跨站推送的凭证与状态机）——与契约同形
export type P2pInvite = p2pContract.InviteInfo
// 在线名录对端（p2pd 名录透传，零敏感）——与契约同形
export type P2pDirectoryPeer = p2pContract.P2pDirectoryPeer

/**
 * accept 的响应类型：**引用 contracts 生成类型**（v0.20.7 起可用）。
 *
 * 沿革：v0.17.0 发布包里 accept 的 data 还是直传任务信封（随直传面一并从 IDL
 * 删除），新契约（contracts 4c3d188）改为 { invite: InviteInfo }——接受邀请退化为
 * 纯信封动作。引旧类型会绑死已删的任务模型。当时 contracts 尚未把该类型随 IDL
 * 发布，只能就地手写一份；**v0.20.7 已发布** `AdminP2pInviteAcceptResp` /
 * `AdminP2pInviteAcceptData` ⇒ 改为引用契约类型，删掉手写副本（手写副本与契约
 * 漂移的风险由 src/api/__tests__/contractTypeDrift.spec.ts 守卫）。
 *
 * ⚠️ contracts 的 index 只导出**域命名空间**（`export type * as p2p from './p2p'`），
 * 没有顶层类型导出 ⇒ 只能按 `p2pContract.X` 取用；写成
 * `import type { AdminP2pInviteAcceptResp } from '@pigeonbox/contracts'` 编译不过。
 */
export type P2pInviteAcceptResp = p2pContract.AdminP2pInviteAcceptResp

export const p2pApi = {
  // 待收邀请箱（跨站推送进来的口令信封）
  invites: () =>
    request<ApiResponse<p2pContract.AdminP2pInvitesData>>({ url: '/admin/p2p/invites', method: 'GET' }),

  // 认领邀请：出箱 + 留痕 + 返回信封（不再 spawn 直传运行时）
  acceptInvite: (inviteId: string) =>
    request<ApiResponse<p2pContract.AdminP2pInviteAcceptData>>({
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
