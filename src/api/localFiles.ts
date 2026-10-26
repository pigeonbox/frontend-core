import { request } from '@/utils/request'
import type { ApiResponse } from '@/types/common'
import type { admin as adminContract } from '@pigeonbox/contracts'

// 契约切换挂起(P1/B2 波):contracts main 已含 admin.LocalFileEntry/
// AdminListLocalFilesData/AdminImportLocalFileReq|Data(local-files 三端点
// 已 IDL 化),待 contracts v0.10.0 tag+列车钉版后切 import 并退休手抄。
// ⇒ 2026-10-26 局部兑现（contracts v0.20.0 钉版）：**import 一端**已切契约
// （AdminImportLocalFileReq/Data）；**list/delete 两端**仍用手抄（不在本轮
// 10 条路由范围内，字段与契约逐字同形，后续可一并收）。
//
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

/**
 * 本地文件导入为分享的请求体（契约 AdminImportLocalFileReq）。
 *
 * 契约里 expire_value/expire_style 是 optional（服务端有缺省兜底），前端表单
 * 恒有值 ⇒ 这里收紧为 required，保持既有调用契约不变。
 */
export type ImportLocalShareReq = adminContract.AdminImportLocalFileReq & {
  expire_value: number
  expire_style: string
}

/** 导入结果（契约 AdminImportLocalFileData：分享码 + 分享链接） */
export type ImportLocalShareData = adminContract.AdminImportLocalFileData

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
  importShare: (data: ImportLocalShareReq) => {
    return request<ApiResponse<ImportLocalShareData>>({
      url: '/admin/local-files/import',
      method: 'POST',
      data,
    })
  },
}
