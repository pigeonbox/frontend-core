/**
 * 取件码/分享码统一输入的分派与分格纯逻辑（2026-10-08 双模式合并；
 * 2026-10-12 输入收敛 6 格固定——「只保留 6 位码」决策收口输入面；
 * 2026-10-22 归一化：取件码字符表全大写 → 输入大小写不敏感；
 * 去空格/横杠；整段粘贴只认 6 位（取件）与 8 位（分享详情），其余长度明确报错）。
 *
 * 码型（与后端约束对齐）：
 *   - 6 位取件码：匿名取件（字符表 ABCDEFGHJKMNPQRSTUVWXYZ23456789，全大写、
 *     无混淆字符；输入大小写不敏感），后端映射未命中自动回源 DB，兼容 6 位自定义口令；
 *   - 8 位分享码 / 3-64 位自定义口令：分享详情页（/share/select 查库）——
 *     仅作旧数据/自定义口令/联邦码的静默兜底通道（粘贴/深链），输入框不再扩格。
 *
 * 输入面事实（文案自陈勿与之脱节）：
 *   - 分格输入框恒为 6 格（= 取件码长度）：逐格键入只能填 6 位，填满即取件；
 *     8 位分享码**不能**逐格键入，只能整段粘贴或走深链（?code=）——
 *     「8 位分享码可整段粘贴」仅指粘贴通道，不代表输入框有 8 格；
 *   - 整段粘贴：归一化后 6 位 → 匿名取件；8 位 → 分享详情；
 *     其余长度 → 明确报错（不再静默截前 6 位当取件码用）。
 */

export const PICKUP_LEN = 6
/** 分享码长度（后端 file_codes.code 恒 8 位） */
export const SHARE_CODE_LEN = 8
/**
 * 合法口令的最大长度（2026-10-22）：分享码 8 位；自定义口令 3-32 位；
 * 深链 /?code= 允许 3-64 位。取 64 作上限——超长不是合法口令形态，
 * 拿它去查库只会打一次注定失败的请求。
 */
export const MAX_CODE_LEN = 64
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

/**
 * 去分隔符（空格/横杠）但保留大小写——分享码区分大小写、自定义口令可含 -/_，
 * 只有取件码路径才做大小写归一。
 */
export function stripSeparators(raw: string): string {
  return raw.replace(/[\s-]+/g, '')
}

/**
 * 取件码归一化：去空格/横杠 + 转大写。
 * 取件码字符表全大写（core/app/anonymous/anonymous.go:38），故输入大小写不敏感：
 * 「vnxt 8s」/「VNXT-8S」都应命中「VNXT8S」。
 */
export function normalizePickup(raw: string): string {
  return stripSeparators(raw).toUpperCase()
}

export function isPickupCode(s: string): boolean {
  return s.length === PICKUP_LEN && ALNUM.test(s)
}

/**
 * 按码长分派：归一化后恰 6 位字母数字 → 匿名取件（auto 预检）；
 * 其余非空 → 分享详情。空串返回 null（调用方提示）。超长口令按整串分派。
 */
export function resolveDispatch(raw: string): DispatchTarget | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const stripped = stripSeparators(trimmed)
  if (stripped.length === PICKUP_LEN && isPickupCode(stripped)) {
    return { kind: 'retrieve', auto: true, code: stripped.toUpperCase() }
  }
  return { kind: 'share', auto: false, code: trimmed }
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
  /** 分格内回显的串（≤PICKUP_LEN；超长码回显前 6 位仅作视觉过渡，随即跳走） */
  display: string
  /** 非空 = 立即分派；null = 留在格子等按钮/续输 */
  target: DispatchTarget | null
  /**
   * 长度超出合法口令上限（>MAX_CODE_LEN）= 明确报错（2026-10-22）。
   * 注意：**不再**用于「非 6 位/非 8 位」——自定义口令 3-64 位都是合法的，
   * 按长度白名单过滤会判死合法口令（旧行为是静默截前 6 位当取件码用）。
   */
  invalid?: boolean
}

/**
 * 粘贴整段码的分派计划：归一化后恰 6 位且字符合法 → 立即匿名取件；
 * **其余长度一律按整串走分享详情**（区分大小写，原样透传）。
 *
 * 为什么不是「只认 6/8 位、其余报错」：分享码 8 位，而**自定义口令 3-64 位**
 * （`upload.customCodePlaceholder` 允许 3-32 位，深链 `/?code=` 允许 3-64 位）
 * 同样走 /share/select 查库 —— 按长度白名单过滤会把合法的自定义口令判死。
 * 与 `resolveDispatch`（键入/点击路径）**保持同一口径**，只是粘贴多一步归一化。
 *
 * 真正的旧缺陷不是「按长度分派」，而是**静默截前 6 位**：用户粘了一段长码，
 * 界面只回显前 6 位，用户会以为拿到的是取件码。现在长码整串走分享详情，
 * 回显的前 6 位仅作视觉过渡（随即跳走），不再冒充取件码。
 */
export function planPaste(text: string): PastePlan {
  const trimmed = text.trim()
  if (!trimmed) return { display: '', target: null }
  const stripped = stripSeparators(trimmed)
  if (!stripped) return { display: '', target: null }
  if (stripped.length === PICKUP_LEN && isPickupCode(stripped)) {
    const code = stripped.toUpperCase()
    return { display: code, target: { kind: 'retrieve', auto: true, code } }
  }
  if (stripped.length < PICKUP_LEN) {
    return { display: stripped, target: null }
  }
  // 超长（>64 位）不是合法口令形态：明确报错，不拿它去查库
  if (stripped.length > MAX_CODE_LEN) {
    return { display: '', target: null, invalid: true }
  }
  // 7 位 / 8 位 / 9+ 位（含自定义口令）：整串走分享详情
  return { display: stripped.slice(0, PICKUP_LEN), target: { kind: 'share', auto: false, code: trimmed } }
}
