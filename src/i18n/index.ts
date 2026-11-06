// i18n 入口（不在模块顶层访问 pinia store，避免与 pinia install 顺序冲突）
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import jaJP from './locales/ja-JP'
import deDE from './locales/de-DE'
import ruRU from './locales/ru-RU'

export type AppLocale = 'zh-CN' | 'en-US' | 'ja-JP' | 'de-DE' | 'ru-RU'

export const supportedLocales: AppLocale[] = ['zh-CN', 'en-US', 'ja-JP', 'de-DE', 'ru-RU']
export const defaultLocale: AppLocale = 'zh-CN'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'de-DE': deDE,
  'ru-RU': ruRU,
} as const

function detectInitialLocale(): AppLocale {
  try {
    const stored = localStorage.getItem('app-locale') as AppLocale | null
    if (stored && (supportedLocales as string[]).includes(stored)) return stored
  } catch {
    /* noop */
  }
  return detectBrowserLocale()
}

// detectBrowserLocale 无显式偏好时的浏览器语言跟随。
//
// **只认 5.3.0 新增的三门语言**（ja / de / ru），中文与英文浏览器仍落到默认的
// zh-CN：那两条路径在 5.3.0 之前就是 zh-CN，改动它们等于替存量用户换界面语言
// （把英文浏览器的中文用户突然切成 en-US 是一次没人要求的迁移）。新语种则相反
// ——日语用户第一次进来看到中文界面，几乎不可能自己找到右上角那个切换按钮，
// 「新增语言」就等于没加。
const NEW_LOCALE_PREFIX: Record<string, AppLocale> = {
  ja: 'ja-JP',
  de: 'de-DE',
  ru: 'ru-RU',
}

function detectBrowserLocale(): AppLocale {
  try {
    const nav = typeof navigator === 'undefined' ? undefined : navigator
    const tags = [nav?.language, ...(nav?.languages ?? [])].filter(Boolean) as string[]
    for (const tag of tags) {
      const prefix = tag.toLowerCase().split('-')[0]
      const hit = NEW_LOCALE_PREFIX[prefix]
      if (hit) return hit
    }
  } catch {
    /* noop */
  }
  return defaultLocale
}

// localeMessages 语言包注册表（供守卫对账：注册表与 supportedLocales 必须同步，
// 少登记一个 ⇒ 该语种用户在切换器里选了却渲染出裸 key）
export const localeMessages: Record<AppLocale, unknown> = messages

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: defaultLocale,
  messages,
})

export default i18n
