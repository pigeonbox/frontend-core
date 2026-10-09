import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'

// 本地文件条目（Path 为相对所选根目录的路径，正斜杠）
export interface LocalFileEntry {
  name: string
  path: string
  size: number
  mod_time: string
  is_dir: boolean
}

export interface LocalFilesResp {
  roots: string[]
  entries: LocalFileEntry[]
}

// 管理端本地文件管理（对标上游 2.7.0 data/local；路径=root 索引+白名单内相对路径）
export const localFilesApi = {
  list: (root: number, dir: string) => {
    return request<ApiResponse<LocalFilesResp>>({
      url: '/admin/local-files',
      method: 'GET',
      params: { root, dir: dir || undefined },
    })
  },
  remove: (root: number, path: string) => {
    return request<ApiResponse<null>>({
      url: '/admin/local-files',
      method: 'DELETE',
      params: { root, path },
    })
  },
  importShare: (data: {
    root: number
    path: string
    expire_value: number
    expire_style: string
    require_auth?: boolean
    password?: string
    custom_code?: string
  }) => {
    return request<ApiResponse<{ code: string; share_url: string }>>({
      url: '/admin/local-files/import',
      method: 'POST',
      data,
    })
  },
}
