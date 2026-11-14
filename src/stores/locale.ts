// 语言切换 store
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { i18n, supportedLocales, type AppLocale } from '@/i18n'
import { refreshDocumentTitle } from '@/utils/documentTitle'

export type { AppLocale }

const STORAGE_KEY = 'app-locale'

// explicitPreference 仅读用户显式偏好(不回退 i18n 实例)——宿主语言跟随的判据
function explicitPreference(): AppLocale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as AppLocale | null
    if (v && (supportedLocales as string[]).includes(v)) return v
  } catch {
    /* noop */
  }
  return null
}

function readPersisted(): AppLocale {
  return explicitPreference() ?? (i18n.global.locale.value as AppLocale)
}

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<AppLocale>(readPersisted())

  // 确保 i18n 与 store 同步
  i18n.global.locale.value = locale.value
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale.value
  }

  const isZhCN = computed(() => locale.value === 'zh-CN')
  const isEnUS = computed(() => locale.value === 'en-US')

  function setLocale(next: AppLocale) {
    if (!(supportedLocales as string[]).includes(next)) return
    locale.value = next
    i18n.global.locale.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* noop */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next
    }
    // frontend-core#99：标签标题随语言重算（不导航也刷新；与守卫共用同一入口）
    refreshDocumentTitle()
  }

  function toggle() {
    setLocale(isZhCN.value ? 'en-US' : 'zh-CN')
  }

  // setHostLocale 宿主语言跟随:同步 i18n 与 store 但不落盘——宿主语言不固化
  // 为用户偏好;用户显式选过语言时尊重偏好不跟随
  function setHostLocale(next: AppLocale) {
    if (!(supportedLocales as string[]).includes(next)) return
    if (explicitPreference() !== null) return
    locale.value = next
    i18n.global.locale.value = next
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next
    }
    // 宿主语言切换同样改了界面语言 ⇒ 标题同口径重算（frontend-core#99）
    refreshDocumentTitle()
  }

  return {
    locale,
    isZhCN,
    isEnUS,
    setLocale,
    setHostLocale,
    toggle,
  }
})
