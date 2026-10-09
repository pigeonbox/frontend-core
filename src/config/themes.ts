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

export const THEMES: ThemePreset[] = [
  { key: 'indigo', labelKey: 'admin.configPage.themes.indigo', accent: '#5e6ad2', swatch: '#5e6ad2' },
  { key: 'fresh', labelKey: 'admin.configPage.themes.fresh', accent: '#409eff', swatch: '#409eff' },
  { key: 'emerald', labelKey: 'admin.configPage.themes.emerald', accent: '#0e9f6e', swatch: '#0e9f6e' },
  { key: 'amber', labelKey: 'admin.configPage.themes.amber', accent: '#d97706', swatch: '#d97706' },
  { key: 'rose', labelKey: 'admin.configPage.themes.rose', accent: '#e11d48', swatch: '#e11d48' },
  { key: 'ink', labelKey: 'admin.configPage.themes.ink', accent: '#18181b', swatch: '#18181b' },
]

/** 根据 accent 反查预设名（无命中=自定义） */
export const matchThemePreset = (accent?: string): string => {
  if (!accent) return ''
  return THEMES.find((t) => t.accent.toLowerCase() === accent.toLowerCase())?.key ?? 'custom'
}
