// 分享页「码的身份」判定（2026-10-23）。
//
// 背景：分享域的按码解析（后端 pkg/codex）认两种码——
//   - 分享码：8 位随机或 3-32 位自定义，存在 code 列；
//   - 取件码：6 位数字，存在 pickup_code 列，是**别名**（凭码即可取件，口令语义）。
//  ⇒ 同一个页面链接既可能用分享码打开，也可能用取件码打开（取件码当链接用）。
// 页面若一律标「分享码」，就是把取件码错标成分享码：用户会照着界面抄走一个
// 自己以为是分享码、实际是取件口令的码（强度语义不同，见产品双码收敛拍板）。
//
// 判定**不靠长度**：自定义码允许 3-32 位（可能就是 6 位），按长度猜会错标。
// 靠「与后端下发的**规范分享码**是否相同」：相同 = 分享码；不同 = 只有取件码
// 这一个别名 ⇒ 取件码。大小写不敏感：core 可开启大小写折叠，折叠命中时后端
// 返回的是库里的原样大小写，与用户输入可能仅大小写不同（那种情况仍是分享码）。

export interface CodeIdentity {
  /** 展示值：用户进来的那个码（手里握着的凭据本身） */
  display: string
  /** 是否取件码（别名） */
  isPickup: boolean
  /** i18n key：标签（分享码 / 取件码） */
  labelKey: 'share.codeLabel' | 'share.pickupCodeLabel'
  /** i18n key：带值的标签（'分享码: {code}'） */
  labelWithCodeKey: 'share.codeWithLabel' | 'share.pickupCodeWithLabel'
}

/**
 * 判定分享页上这个「码」是什么身份。
 *
 * @param urlCode      用户进来的码（路由参数）
 * @param canonicalCode 后端下发的规范分享码（ShareDetail.code）；缺失（旧后端）时
 *                      按分享码处理
 */
export function identifyShareCode(
  urlCode: string,
  canonicalCode?: string | null
): CodeIdentity {
  const display = (urlCode || '').trim()
  const canonical = (canonicalCode || '').trim()
  const isPickup = canonical.length > 0 && display.toUpperCase() !== canonical.toUpperCase()
  return {
    display,
    isPickup,
    labelKey: isPickup ? 'share.pickupCodeLabel' : 'share.codeLabel',
    labelWithCodeKey: isPickup ? 'share.pickupCodeWithLabel' : 'share.codeWithLabel',
  }
}
