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
]

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }
// 深色混合目标贴近 --color-bg(#0a0a0a) 而非纯黑，色阶过渡更顺
const DARK_BASE: Rgb = { r: 10, g: 10, b: 10 }

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

const rgb = (c: Rgb): string => `rgb(${c.r}, ${c.g}, ${c.b})`

export interface ResolvedAccent {
  /** CSS 变量 → 值（含 --el-color-primary 系与 --primary-* 家族） */
  vars: Record<string, string>
  /** 规范化为 6 位 hex 的 accent（供首帧引导缓存） */
  hex: string
}

/**
 * 纯计算：给定 accent 原始值与深浅模式，产出应设置的全部 CSS 变量。
 * 无效输入返回 null（调用方应清除内联变量、回归 main.scss 默认）。
 */
export function resolveAccent(raw: string | null | undefined, dark: boolean): ResolvedAccent | null {
  const accent = parseHex(raw || '')
  if (!accent) return null

  // 深色下主色提亮（与 main.scss html.dark 同公式），保证 #0a0a0a 底对比度
  const base = dark ? lighten(accent, 0.3) : accent
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
