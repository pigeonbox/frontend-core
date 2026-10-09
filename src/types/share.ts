/** 分享详情（/share/select 响应载荷） */
export interface ShareInfo {
  code: string
  filename: string
  file_size: number
  content_type: 'text' | 'file'
  content?: string
  has_password: boolean
  created_at: string
  expire_time?: string
  download_count: number
  max_downloads?: number
  username?: string
}

/** 分享成功结果载荷——FileUpload/TextShare 的 success emit 与 ShareResultDialog.open 的共同契约。
 *  share_url/full_share_url 为展示链接(多端点归一化产物:部分端点下发 full_share_url,
 *  文本/文件分享仅 code/url,由队列层归一);二维码由 Dialog 以 full_share_url 现场渲染,
 *  qr_code_data 字段已删除(后端任何端点均不下发,v0.13.6 清理)。
 *  file_name/has_password 供成功弹窗命令行下载 Tab 决策(wget 是否可用),旧发射方可不传。 */
export interface ShareResult {
  code: string
  share_url: string
  full_share_url: string
  e2e_key?: string
  file_name?: string
  has_password?: boolean
  /** 6 位取件码（文件分享铸造；前端成功弹窗据此展示快捷取件卡） */
  pickup_code?: string
}

