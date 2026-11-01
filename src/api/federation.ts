import { request } from '@/utils/request'
import { xhrSend } from '@/api/_xhr'
import type { ApiResponse } from '@/types/common'
import type { publicapi as publicapiContract } from '@pigeonbox/contracts'

// P2P 联邦（M2）：口令跨站解析代理。本站未命中时后端转查联邦注册中心，
// 命中返回源节点信息（取件方直连源节点下载，流量不经过本站/注册中心）。
//
// 契约派生（contracts v0.20.0：FederationResolveData）——未命中时**只有**
// available 一个字段（其余 optional 不输出），与收敛前的 JSON 完全一致。
export type FederationResolveData = publicapiContract.FederationResolveData

// ─────────────────────────────────────────────────────────────────────────────
// 跨站投递（联邦前台化，2026-11-01）
//
// 形态（设计稿：hub docs/specs/2026-11-01-federation-frontend-delivery-design.md）：
// 访客在本站（A 柜）填**对方柜基址 URL** + 选文件 ⇒ A 柜校验对端 ∈ 管理员登记的
// 「可投递对端」⇒ A 柜带共享口令向对方柜（B 柜）铸投递槽位 ⇒ A 柜把文件转发到 B 柜
// ⇒ **B 柜铸 6 位取件码** ⇒ A 柜只把该码透传给访客。
//
// ⚠️ 取件码的归属是**对方柜**（取件人站在对方柜取件）⇒ 展示时必须说清
// 「此码在对方柜使用」——否则访客会回本站试 ⇒ 以为坏了（见 FederationDeliveryForm）。
//
// ⚠️ 铸槽位端点（/api/v1/federation/delivery-slot）是 **A 柜服务端调 B 柜**的，
// 属服务端之间的通道，**前端不暴露**（访客面上没有它的位置）。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 跨站投递请求体（契约 FederationDeliverReq）。
 *
 * `target_url` 必填（对方柜基址，URL 口径）；`title`/`note` 可选。
 * 文件本体走 multipart（字段名 `files`），不入契约（同 MultiShareDirect 形态）。
 */
export type FederationDeliverReq = publicapiContract.FederationDeliverReq

/**
 * 跨站投递响应数据（契约 FederationDeliverData）。
 *
 * `file_count` = 已投到对方柜的文件数；`pickup_code` = **对方柜铸的** 6 位取件码；
 * `target_url` = 服务端回显的对方柜基址（前端用来给「去对方柜取件」链接）。
 */
export type FederationDeliverData = publicapiContract.FederationDeliverData

/**
 * 跨站投递：把文件投到**对方柜**（multipart）。
 *
 * - 表单字段：`target_url`（必填）+ 可选 `title`/`note` + 文件本体（字段名 `files`，
 *   服务端兼容 `file`）。
 * - 返回：**对方柜铸的**取件码与文件数。
 *
 * ⚠️ 错误**不吞**：服务端回了什么就抛什么（"对方柜不在可投递名单" 等）⇒
 * 调用方据此展示。前端**不做**「像不像本站」的地址判断——真正的闸在服务端
 * （未登记的对端一律拒绝，且不发任何出站请求）。
 */
export async function federationDeliver(
  files: File[],
  req: FederationDeliverReq,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<FederationDeliverData> {
  const formData = new FormData()
  formData.append('target_url', req.target_url)
  if (req.title) formData.append('title', req.title)
  if (req.note) formData.append('note', req.note)
  for (const f of files) formData.append('files', f)

  const res = await xhrSend<FederationDeliverData>({
    url: '/api/v1/federation/deliver',
    form: formData,
    onProgress,
    signal,
    // 与 multiDirect 同款：不限超时（跨站中转 + 大文件耗时不可预估，由服务端兜底）
    timeout: 0,
  })
  if (!res.data) throw new Error(res.message || 'federation deliver failed')
  return res.data
}

export const federationApi = {
  resolve: (code: string) =>
    request<ApiResponse<FederationResolveData>>({
      url: '/api/v1/federation/resolve',
      method: 'GET',
      params: { code },
    }),
}
