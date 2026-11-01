/**
 * 主题色（accent）统一应用。
 *
 * accent 来自 /api/config（ui.accent_color，管理后台可配，后端已做 #hex 白名单校验）。
 * 必须同时覆盖 Element Plus 变量与 main.scss 的 --primary-* 家族：只改前者会出现
 * EP 组件（按钮/菜单/分页）与自定义元素（链接/聚焦环/hover 浅底）两种主色并存。
 * 色阶按当前深浅模式分别向黑/白混合；深色下主色整体提亮以满足 #0a0a0a 底的
 * 对比度（≥4.5:1）。accent 为空时清除全部内联变量，回归 main.scss 设计色。
 *
 * 纯计算在 resolveAccent（node 可测，main.scss 的预填色阶与 index.html 首帧
 * 引导都必须与本文件公式保持一致）。
 */

interface Rgb {
  r: number
  g: number
  b: number
}

export const ACCENT_CACHE_KEY = 'app_accent'

const ACCENT_PROPS = [
  '--el-color-primary',
  '--el-color-primary-light-3',
  '--el-color-primary-light-5',
  '--el-color-primary-light-7',
  '--el-color-primary-light-8',
  '--el-color-primary-light-9',
  '--el-color-primary-dark-2',
  '--primary-color',
  '--primary-hover',
  '--primary-active',
  '--primary-bg',
  '--primary-color-rgb',
  '--primary-gradient',
  // 仪表盘统计卡图标色调 2-4（Dashboard.vue tone-violet/teal/amber 消费）
  '--stat-tone-2-color',
  '--stat-tone-2-bg',
  '--stat-tone-3-color',
  '--stat-tone-3-bg',
  '--stat-tone-4-color',
  '--stat-tone-4-bg',
]

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }
// 深色混合目标贴近 --color-bg(#0a0a0a) 而非纯黑，色阶过渡更顺
const DARK_BASE: Rgb = { r: 10, g: 10, b: 10 }

/** 暗色主色在深色底上的最低对比度（正文级可读性下限） */
const DARK_MIN_CONTRAST = 4.5

/** WCAG 相对亮度 */
function relativeLuminance(c: Rgb): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** WCAG 对比度 */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function parseHex(raw: string): Rgb | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw.trim())
  if (!m || !m[1]) return null
  let h = m[1]
  if (h.length === 3) h = h
    .split('')
    .map((c) => c + c)
    .join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const mix = (c: Rgb, t: Rgb, ratio: number): Rgb => ({
  r: Math.round(c.r + (t.r - c.r) * ratio),
  g: Math.round(c.g + (t.g - c.g) * ratio),
  b: Math.round(c.b + (t.b - c.b) * ratio),
})

const lighten = (c: Rgb, ratio: number): Rgb => mix(c, WHITE, ratio)

/**
 * 暗色主色：先按 30% 提亮；若仍不足与深色底(#0a0a0a)的 4.5:1 对比度，继续提亮到达标。
 *
 * 为什么需要地板：主色在暗色模式下会被当**文字色**用（链接、强调文本），
 * 固定 30% 提亮对彩色 accent 够用，但灰阶 accent（墨黑 #18181b → #5a5a5c）
 * 只有 2.2:1 ⇒ 暗色下链接几乎看不见。提亮到 42%（#79797b ≈4.6:1）才达标。
 * 彩色 accent 原就达标 ⇒ 取值不变，既有主题不受影响。
 */
function darkBase(accent: Rgb): Rgb {
  let ratio = 0.3
  let c = lighten(accent, ratio)
  while (ratio < 1 && contrastRatio(c, DARK_BASE) < DARK_MIN_CONTRAST) {
    ratio = Math.min(1, Math.round((ratio + 0.01) * 100) / 100)
    c = lighten(accent, ratio)
  }
  return c
}

const rgb = (c: Rgb): string => `rgb(${c.r}, ${c.g}, ${c.b})`

// 统计卡图标色调 2-4 = **固定语义色板**（紫 / 青绿 / 琥珀），不随主色派生。
// 2026-10-26 实录：原实现是「主色色相偏移(+30/-60/+160)」派生，只有靛蓝这类
// 彩色主色才恰好落在紫/青绿/琥珀上；主色换成墨黑（灰阶）或青竹后分别退化成
// 「3 个几乎一样的灰」和「3 个绿」，语义四色构图直接崩掉（界面看着发闷）。
// ⇒ 改为固定色板：4 张卡的图标（主色 + 紫 + 青绿 + 琥珀）恒定可辨，
//    换任何主题色都不影响这组语义配色的识别度。
const TONE_PALETTE: { light: Rgb; dark: Rgb }[] = [
  { light: { r: 124, g: 58, b: 237 }, dark: { r: 167, g: 139, b: 250 } }, // 2 紫
  { light: { r: 13, g: 148, b: 136 }, dark: { r: 45, g: 212, b: 191 } },  // 3 青绿
  { light: { r: 217, g: 119, b: 6 }, dark: { r: 245, g: 158, b: 11 } },  // 4 琥珀
]

function toneVars(dark: boolean): Record<string, string> {
  const out: Record<string, string> = {}
  TONE_PALETTE.forEach((p, i) => {
    const tone = dark ? p.dark : p.light
    const alpha = dark ? 0.16 : 0.1
    out[`--stat-tone-${i + 2}-color`] = rgb(tone)
    out[`--stat-tone-${i + 2}-bg`] = `rgba(${tone.r}, ${tone.g}, ${tone.b}, ${alpha})`
  })
  return out
}

export interface ResolvedAccent {
  /** CSS 变量 → 值（含 --el-color-primary 系、--primary-* 家族与 --stat-tone-* 语义色调） */
  vars: Record<string, string>
  /** 规范化为 6 位 hex 的 accent（供首帧引导缓存） */
  hex: string
}

/**
 * 图标底座渐变端点：与静态图标底色（hub scripts/gen-brand-icons.py）和
 * main.scss 的 `.logo-icon/.logo` 底座同公式 —— mix(主色,白 6%) → mix(主色,黑 30%)。
 * 运行时动态图标（浏览器标签 / iOS 主屏）用同一套端点，
 * 保证「静态图标 / 界面 logo / 浏览器标签图标」三者永远同色。
 */
export function accentGradient(accent: string | null | undefined): { top: string; bottom: string } | null {
  const c = parseHex(accent || '')
  if (!c) return null
  return { top: rgb(mix(c, WHITE, 0.06)), bottom: rgb(mix(c, BLACK, 0.30)) }
}

/**
 * 纯计算：给定 accent 原始值与深浅模式，产出应设置的全部 CSS 变量。
 * 无效输入返回 null（调用方应清除内联变量、回归 main.scss 默认）。
 */
export function resolveAccent(raw: string | null | undefined, dark: boolean): ResolvedAccent | null {
  const accent = parseHex(raw || '')
  if (!accent) return null

  // 深色下主色提亮（与 main.scss html.dark 同公式），保证 #0a0a0a 底对比度
  const base = dark ? darkBase(accent) : accent
  const toward = dark ? DARK_BASE : WHITE
  const darkenTarget = dark ? WHITE : BLACK

  const vars: Record<string, string> = {
    // Element Plus：light-N 用于浅底/边框/hover，dark-2 用于 active
    '--el-color-primary': rgb(base),
    '--el-color-primary-light-3': rgb(mix(base, toward, 0.3)),
    '--el-color-primary-light-5': rgb(mix(base, toward, 0.5)),
    '--el-color-primary-light-7': rgb(mix(base, toward, 0.7)),
    '--el-color-primary-light-8': rgb(mix(base, toward, 0.8)),
    '--el-color-primary-light-9': rgb(mix(base, toward, 0.88)),
    '--el-color-primary-dark-2': rgb(mix(base, darkenTarget, 0.2)),
    // main.scss 的 --primary-* 家族（链接/聚焦环/hover 浅底/tag 底色）
    '--primary-color': rgb(base),
    '--primary-hover': rgb(mix(base, toward, 0.18)),
    '--primary-active': rgb(mix(base, darkenTarget, 0.3)),
    '--primary-bg': dark ? `rgba(${base.r}, ${base.g}, ${base.b}, 0.14)` : rgb(mix(base, WHITE, 0.9)),
    '--primary-color-rgb': `${base.r}, ${base.g}, ${base.b}`,
    '--primary-gradient': `linear-gradient(135deg, ${rgb(base)} 0%, ${rgb(base)} 100%)`,
    // 仪表盘统计卡图标色调 2-4（固定语义色板 紫/青绿/琥珀；深浅模式各自的
    // 底色透明度与 main.scss 预填值同款）
    ...toneVars(dark),
  }
  const hex = '#' + [accent.r, accent.g, accent.b]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
  return { vars, hex }
}

/** 把计算结果应用到 <html> 内联样式；raw 无效时清除并回退 main.scss 默认 */
export function applyAccent(raw?: string | null): void {
  const root = document.documentElement
  const resolved = resolveAccent(raw, root.classList.contains('dark'))
  if (!resolved) {
    for (const p of ACCENT_PROPS) root.style.removeProperty(p)
    try { localStorage.removeItem(ACCENT_CACHE_KEY) } catch { /* noop */ }
    return
  }
  for (const [p, v] of Object.entries(resolved.vars)) root.style.setProperty(p, v)
  try { localStorage.setItem(ACCENT_CACHE_KEY, resolved.hex) } catch { /* noop */ }
}
