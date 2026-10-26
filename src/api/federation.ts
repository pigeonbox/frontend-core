import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { p2p as p2pContract } from '@pigeonbox/contracts'

// P2P 联邦（M2）：口令跨站解析代理。本站未命中时后端转查联邦注册中心，
// 命中返回源节点信息（取件方直连源节点下载，流量不经过本站/注册中心）。
//
// 契约派生（contracts v0.20.0：FederationResolveData）——未命中时**只有**
// available 一个字段（其余 optional 不输出），与收敛前的 JSON 完全一致。
export type FederationResolveData = p2pContract.FederationResolveData

export const federationApi = {
  resolve: (code: string) =>
    request<ApiResponse<FederationResolveData>>({
      url: '/api/v1/federation/resolve',
      method: 'GET',
      params: { code },
    }),
}
