/**
 * 契约 v0.20.10 口令型 E2E 字段垫片（contracts 钉版抬升后移除，改用 share.ShareDetail 原生字段）。
 *
 * 2026-11-01 core#30 / frontend-core#38：内容密钥不再进分享链接，改由口令包装成
 * wrapped_key（base64 信封，见 utils/e2e.ts）随分享创建提交、落服务端。contracts
 * 钉版（v0.20.9 的 tgz）还没有这两个字段 ⇒ 先在此垫片，组合类型接住：
 *   - wrapped_key：取件侧解包用（ShareDetail 下发）；
 *   - has_wrapped_key：metadata 端点的提前渲染标志——**缺字段 ≠ false**，
 *     老后端不下发时不得据此隐藏口令输入（以 detail.wrapped_key 为准）。
 */
export interface WrappedKeyFields {
  wrapped_key?: string
  has_wrapped_key?: boolean
}

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
  /**
   * 口令型 E2E（2026-11-01 core#30）：本次分享的密钥已用口令包装成 wrapped_key
   * 落服务端 ⇒ **链接不再拼 ?key=**（旧 e2e_key 字段已随 URL-hash 密钥形态退役），
   * 弹窗据此提示「取件需要口令，请通过另一渠道告知取件人」。
   */
  e2e_wrapped?: boolean
  file_name?: string
  has_password?: boolean
  /** 6 位取件码（文件分享铸造；前端成功弹窗据此展示快捷取件卡） */
  pickup_code?: string
  /**
   * 本次选择的过期样式与数值（2026-10-22）。
   * 弹窗的过期回显真相源仍是服务端 metadata 的 expired_at；但「按取件次数」
   * (count) 的语义是"对方最多取 N 次"，服务端只给时间 ⇒ 需要本地值才能说清。
   */
  expire_style?: string
  expire_value?: number
}

