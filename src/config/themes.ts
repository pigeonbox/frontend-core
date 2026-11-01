/**
 * 主题预设注册表（2026-10-07 对标上游主题包机制的轻量实现）。
 *
 * 上游主题包=整套独立前端 SPA 注入 themes/ 目录切换；我们的等价物=命名预设
 * 驱动既有运行时主题管线（utils/accent.ts 的 accent → CSS 变量），选择预设
 * 即写入对应的 ui.accent_color 持久化键，零后端契约改动。
 *
 * 扩展方式：向 THEMES 数组追加一项即可（管理台外观页自动出现新选项）——
 * 这就是本仓的"主题包"接入点。
 */
export interface ThemePreset {
  key: string
  /** i18n key（admin.configPage.themes.<key>） */
  labelKey: string
  /** 主色（写入 ui.accent_color） */
  accent: string
  /** 选择器色板预览 */
  swatch: string
}

/**
 * 默认主题（产品出厂主色）= 青竹。
 * 与三处保持一致：main.scss 的 --primary-* 预填值、静态图标底色
 * （scripts/gen-brand-icons.py 生成）、以及本注册表首项。
 * 后端 ui.accent_color 缺省为空 ⇒ 前端回落到 main.scss 默认值；
 * 管理台用 matchThemePreset 反查高亮，故空值也返回默认项。
 */
export const DEFAULT_THEME_KEY = 'emerald'

export const THEMES: ThemePreset[] = [
  { key: 'emerald', labelKey: 'admin.configPage.themes.emerald', accent: '#0e9f6e', swatch: '#0e9f6e' },
  { key: 'indigo', labelKey: 'admin.configPage.themes.indigo', accent: '#5e6ad2', swatch: '#5e6ad2' },
  { key: 'fresh', labelKey: 'admin.configPage.themes.fresh', accent: '#409eff', swatch: '#409eff' },
  { key: 'ink', labelKey: 'admin.configPage.themes.ink', accent: '#18181b', swatch: '#18181b' },
  { key: 'amber', labelKey: 'admin.configPage.themes.amber', accent: '#d97706', swatch: '#d97706' },
  { key: 'rose', labelKey: 'admin.configPage.themes.rose', accent: '#e11d48', swatch: '#e11d48' },
]

/** 默认主色（缺省 accent 时的实际生效值，与 main.scss 一致） */
export const DEFAULT_ACCENT = THEMES.find((t) => t.key === DEFAULT_THEME_KEY)?.accent ?? '#0e9f6e'

/** 根据 accent 反查预设名（未配置=默认项；无命中=自定义） */
export const matchThemePreset = (accent?: string): string => {
  if (!accent) return DEFAULT_THEME_KEY
  return THEMES.find((t) => t.accent.toLowerCase() === accent.toLowerCase())?.key ?? 'custom'
}
