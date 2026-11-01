/**
 * 多文件通道的 `wrapped_key` 局部扩展（core#30 / frontend-core#38）。
 *
 * 2026-11-01 core#30：内容密钥不再进分享链接，改由口令包装成 wrapped_key
 * （base64 信封，见 utils/e2e.ts）随分享创建提交、落服务端。
 *
 * ⚠️ **只有 multi 通道需要这个扩展**：contracts v0.20.10 已原生覆盖
 * `ShareTextReq.wrapped_key` / `ShareFileReq.wrapped_key` /
 * `ShareDetail.wrapped_key` / `RetrieveData.wrapped_key` / `has_wrapped_key`
 * ⇒ 那几处直接用契约类型即可，**不得再叠加垫片**（叠加会出现同名可选字段
 * 与契约字段语义打架，且让「契约已原生覆盖」这件事被掩盖）。
 *
 * ⚠️ 但 `MultiShareDirectReq` / `MultiShareBindReq`（contracts v0.20.10）
 * **确实还没有** `wrapped_key` ⇒ multi 通道用本地扩展补上，待 contracts
 * 下一版增量入契约后移除。
 */
export interface MultiWrappedKeyField {
  wrapped_key?: string
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

