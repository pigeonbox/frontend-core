import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { resolveAccent } from '../../utils/accent'
import { DEFAULT_ACCENT, DEFAULT_THEME_KEY, THEMES } from '../../config/themes'

const here = dirname(fileURLToPath(import.meta.url))
const SCSS = resolve(here, '../main.scss')
const THEME_INIT = resolve(here, '../../../public/theme-init.js')

/** 取 SCSS 中某个选择器块的原文（括号配平） */
function blockOf(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`main.scss 里找不到 ${selector} 块`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  throw new Error(`${selector} 块括号不配平`)
}

/** 取块内某个 CSS 变量值（`--name:` 精确匹配，不会误吃 `--name-rgb:`） */
function varOf(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!m || !m[1]) throw new Error(`块内找不到 --${name}`)
  return m[1].trim()
}

/** 归一化：hex → rgb()，压缩空白（scss 写 hex、accent.ts 写 rgb()、theme-init.js 无空格，三者语义等价） */
const norm = (s: string) =>
  s
    .replace(/#([0-9a-f]{6})/gi, (_, h: string) => {
      const n = parseInt(h, 16)
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
    })
    .replace(/,\s+/g, ',')
    .replace(/\s+/g, ' ')
    .trim()

const css = readFileSync(SCSS, 'utf8')
const lightBlock = blockOf(css, ':root')
const darkBlock = blockOf(css, 'html.dark')

// main.scss 预填的变量清单（不含 --primary-color-rgb / --primary-gradient，
// 这两个形态特殊，单独断言）
const COLOR_VARS = [
  '--primary-color',
  '--primary-hover',
  '--primary-active',
  '--primary-bg',
  '--el-color-primary',
  '--el-color-primary-light-3',
  '--el-color-primary-light-5',
  '--el-color-primary-light-7',
  '--el-color-primary-light-8',
  '--el-color-primary-light-9',
  '--el-color-primary-dark-2',
] as const

const TONE_VARS = [
  '--stat-tone-2-color',
  '--stat-tone-2-bg',
  '--stat-tone-3-color',
  '--stat-tone-3-bg',
  '--stat-tone-4-color',
  '--stat-tone-4-bg',
] as const

describe('主题色三处一致（main.scss 预填 = accent.ts 公式 = theme-init.js 首帧）', () => {
  it('默认主题是青竹，且注册表首项/缺省反查一致', () => {
    expect(DEFAULT_THEME_KEY).toBe('emerald')
    expect(DEFAULT_ACCENT).toBe('#0e9f6e')
    expect(THEMES[0]?.key).toBe('emerald')
    // 缺省（后端未配置 accent）时管理台高亮默认项
    expect(THEMES.map((t) => t.accent)).toContain(DEFAULT_ACCENT)
  })

  it('浅色：main.scss 预填值 == resolveAccent(默认主色)', () => {
    const v = resolveAccent(DEFAULT_ACCENT, false)!.vars
    for (const name of COLOR_VARS) {
      expect(norm(varOf(lightBlock, name.replace(/^--/, '')))).toBe(norm(v[name]!))
    }
    for (const name of TONE_VARS) {
      expect(norm(varOf(lightBlock, name.replace(/^--/, '')))).toBe(norm(v[name]!))
    }
    expect(varOf(lightBlock, 'primary-color-rgb')).toBe(v['--primary-color-rgb'])
    expect(norm(varOf(lightBlock, 'primary-gradient'))).toBe(norm(v['--primary-gradient']!))
  })

  it('暗色：main.scss 预填值 == resolveAccent(默认主色)', () => {
    const v = resolveAccent(DEFAULT_ACCENT, true)!.vars
    for (const name of COLOR_VARS) {
      expect(norm(varOf(darkBlock, name.replace(/^--/, '')))).toBe(norm(v[name]!))
    }
    for (const name of TONE_VARS) {
      expect(norm(varOf(darkBlock, name.replace(/^--/, '')))).toBe(norm(v[name]!))
    }
    expect(varOf(darkBlock, 'primary-color-rgb')).toBe(v['--primary-color-rgb'])
  })

  it('暗色主色对 #0a0a0a 底 ≥ 4.5:1（灰阶主色可当文字色用）', () => {
    const v = resolveAccent(DEFAULT_ACCENT, true)!.vars
    const rgb = (v['--primary-color'] as string).match(/\d+/g)!.map(Number)
    const lin = (x: number) => {
      const s = x / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const lum = 0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!)
    const bgLum = lin(10)
    const ratio = (Math.max(lum, bgLum) + 0.05) / (Math.min(lum, bgLum) + 0.05)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  describe('theme-init.js 首帧引导（无 jsdom，桩全局后执行）', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const runInit = (accent: string, theme: 'light' | 'dark') => {
      const store: Record<string, string> = { app_accent: accent, app_theme: theme }
      const vars: Record<string, string> = {}
      const classes = new Set<string>()
      const style = {
        colorScheme: '',
        setProperty: (k: string, v: string) => {
          vars[k] = v
        },
        removeProperty: (k: string) => {
          delete vars[k]
        },
      }
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
      })
      vi.stubGlobal('window', { matchMedia: () => ({ matches: theme === 'dark' }) })
      vi.stubGlobal('document', {
        documentElement: {
          classList: {
            add: (c: string) => classes.add(c),
            contains: (c: string) => classes.has(c),
          },
          style,
        },
      })
      // eslint-disable-next-line no-new-func
      new Function(readFileSync(THEME_INIT, 'utf8'))()
      return vars
    }

    it('浅色首帧变量 == resolveAccent', () => {
      const vars = runInit(DEFAULT_ACCENT, 'light')
      const v = resolveAccent(DEFAULT_ACCENT, false)!.vars
      for (const name of COLOR_VARS) {
        expect(norm(vars[name]!)).toBe(norm(v[name]!))
      }
    })

    it('暗色首帧变量 == resolveAccent（含灰阶主色的对比度地板）', () => {
      const vars = runInit(DEFAULT_ACCENT, 'dark')
      const v = resolveAccent(DEFAULT_ACCENT, true)!.vars
      for (const name of COLOR_VARS) {
        expect(norm(vars[name]!)).toBe(norm(v[name]!))
      }
    })

    it('彩色主色取值不受地板影响（回归：靛蓝暗色仍是 #8e97e0）', () => {
      const vars = runInit('#5e6ad2', 'dark')
      expect(norm(vars['--primary-color']!)).toBe('rgb(142,151,224)')
    })
  })
})
