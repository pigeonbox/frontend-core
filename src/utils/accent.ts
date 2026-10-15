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

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let t: [number, number, number]
  if (h < 60) t = [c, x, 0]
  else if (h < 120) t = [x, c, 0]
  else if (h < 180) t = [0, c, x]
  else if (h < 240) t = [0, x, c]
  else if (h < 300) t = [x, 0, c]
  else t = [c, 0, x]
  return {
    r: Math.round((t[0] + m) * 255),
    g: Math.round((t[1] + m) * 255),
    b: Math.round((t[2] + m) * 255),
  }
}

/** 色相旋转 deg 度（饱和度/亮度不变）；灰阶（d≈0）原样返回 */
function rotateHue(c: Rgb, deg: number): Rgb {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  if (d < 1e-6) return c
  const l = (max + min) / 2
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = ((h * 60 + deg) % 360 + 360) % 360
  return hslToRgb(h, s, l)
}

// 统计卡图标色调 2-4 = 主色色相偏移派生（+30/-60/+160）：默认靛蓝(#5e6ad2)
// 下恰好落在 main.scss 预填的紫/青绿/琥珀色相上，语义四色构图不变；
// 灰阶主题（ink）旋转后仍近灰阶，图标随之去彩色。
const TONE_HUE_OFFSETS = [30, -60, 160] as const

function toneVars(base: Rgb, dark: boolean): Record<string, string> {
  const out: Record<string, string> = {}
  TONE_HUE_OFFSETS.forEach((off, i) => {
    const tone = dark ? lighten(rotateHue(base, off), 0.3) : rotateHue(base, off)
    const alpha = dark ? 0.16 : 0.1
    out[`--stat-tone-${i + 2}-color`] = rgb(tone)
    out[`--stat-tone-${i + 2}-bg`] = `rgba(${tone.r}, ${tone.g}, ${tone.b}, ${alpha})`
  })
  return out
}

export interface ResolvedAccent {
  /** CSS 变量 → 值（含 --el-color-primary 系、--primary-* 家族与 --stat-tone-* 派生色调） */
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
    // 仪表盘统计卡图标色调 2-4（随主色派生；深浅模式各自的底色透明度与
    // main.scss 预填值同款）
    ...toneVars(accent, dark),
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
