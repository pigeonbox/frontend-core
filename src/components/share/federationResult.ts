// 跨站投递结果的**取用口径**（纯函数 ⇒ 可单测）。
//
// ⚠️ 对方柜**可能不回码**（core 的 ShareResult.PickupCode：「未铸造为空」）⇒
// 前端必须把两种「没有码」分开看，但**对访客是同一件事**：
//
//	· 字段**缺省**（undefined）⇒ 服务端没回这个字段；
//	· 字段**空串**（''）⇒ 服务端明确说「没铸出码」。
//
// ⇒ 两者都**不显示空码框**（那会让访客以为界面坏了），而是给一句明确说明：
// 「对方柜未回传取件码，请到对方柜查看」。

/** 对方柜回传的投递结果（只取本模块需要的字段） */
export interface FederationDeliveryResultLike {
  /** 对方柜铸的 6 位取件码（optional：缺省或空串都表示「没有码」） */
  pickup_code?: string
}

/**
 * 取对方柜铸的取件码；**没有码**时返回空串。
 *
 * ⚠️ 归一（trim）在这里做：服务端回 ` 123456 ` 也不该在 UI 上带空格。
 */
export function pickupCodeOf(result: FederationDeliveryResultLike | null | undefined): string {
  const code = result?.pickup_code
  if (typeof code !== 'string') return '' // 缺字段 ⇒ 没有码
  return code.trim() // 空串 ⇒ 同样是没有码
}
