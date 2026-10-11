/**
 * 取件码/分享码统一输入的分派与分格纯逻辑（2026-10-08 双模式合并；
 * 2026-10-12 输入收敛 6 格固定——「只保留 6 位码」决策收口输入面）。
 *
 * 码型（与后端约束对齐）：
 *   - 6 位取件码：匿名取件（字符表全大写无混淆字符；输入大小写不敏感），
 *     后端映射未命中自动回源 DB，兼容 6 位自定义口令；
 *   - 8 位分享码 / 3-64 位自定义口令：分享详情页（/share/select 查库）——
 *     仅作旧数据/自定义口令/联邦码的静默兜底通道（粘贴/深链），输入框不再扩格。
 */

export const PICKUP_LEN = 6
/** 填满后防抖自动提交的等待（续输即取消） */
export const AUTO_SUBMIT_MS = 700

export type DispatchKind = 'retrieve' | 'share'

export interface DispatchTarget {
  kind: DispatchKind
  /** retrieve 时 true = 取件页做密码预检（无密码直接取，有密码聚焦密码框） */
  auto: boolean
  /** 实际用于分派的整串（>8 位口令时与分格显示不同） */
  code: string
}

const ALNUM = /^[A-Za-z0-9]+$/

export function isPickupCode(s: string): boolean {
  return s.length === PICKUP_LEN && ALNUM.test(s)
}

/**
 * 按码长分派：恰 6 位字母数字 → 匿名取件（auto 预检）；其余非空 → 分享详情。
 * 空串返回 null（调用方提示）。超长口令按整串分派。
 */
export function resolveDispatch(raw: string): DispatchTarget | null {
  const code = raw.trim()
  if (!code) return null
  if (isPickupCode(code)) return { kind: 'retrieve', auto: true, code }
  return { kind: 'share', auto: false, code }
}

/**
 * 分格输入的单次按键落格：从 start 格起顺延写入 typed（已 sanitize），
 * 超出 length 的溢出整段返回（调用方据此 emit expand 扩格）。
 * value 始终裁剪到 length。
 */
export function splitTyping(
  existing: string,
  start: number,
  typed: string,
  length: number,
): { value: string; overflow: string } {
  const chars = existing.split('')
  let idx = start
  let consumed = 0
  for (const ch of typed) {
    if (idx >= length) break
    chars[idx] = ch
    idx++
    consumed++
  }
  const value = chars.slice(0, length).join('')
  const overflow = typed.slice(consumed)
  return { value, overflow }
}

export interface PastePlan {
  /** 分格内回显的串（≤PICKUP_LEN；超长码回显前 6 位） */
  display: string
  /** 非空 = 立即分派；null = 留在格子等按钮/续输 */
  target: DispatchTarget | null
}

/**
 * 粘贴整段码的分派计划：恰 6 位 → 立即匿名取件；≤6 位散串 → 回显等按钮；
 * >6 位（旧 8 位码/自定义口令/联邦码）→ 回显前 6 位、按整串立即走分享详情兜底。
 */
export function planPaste(text: string): PastePlan {
  const code = text.trim()
  if (!code) return { display: '', target: null }
  if (isPickupCode(code)) {
    return { display: code, target: { kind: 'retrieve', auto: true, code } }
  }
  if (code.length <= PICKUP_LEN) return { display: code, target: null }
  return { display: code.slice(0, PICKUP_LEN), target: { kind: 'share', auto: false, code } }
}
