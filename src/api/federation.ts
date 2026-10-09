import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'

// P2P 联邦（M2）：口令跨站解析代理。本站未命中时后端转查联邦注册中心，
// 命中返回源节点信息（取件方直连源节点下载，流量不经过本站/注册中心）。
export interface FederationResolveData {
  available: boolean
  url?: string
  node_id?: string
  name?: string
  expires_at?: number
}

export const federationApi = {
  resolve: (code: string) =>
    request<ApiResponse<FederationResolveData>>({
      url: '/api/v1/federation/resolve',
      method: 'GET',
      params: { code },
    }),
}
