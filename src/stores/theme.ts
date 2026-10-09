// 主题模式：light / dark / auto
import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'app_theme'
const DEFAULT: ThemeMode = 'auto'
const DARK_CLASS = 'dark'

function readPersisted(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
  } catch {
    /* noop */
  }
  return DEFAULT
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyToDocumentClass(effective: EffectiveTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (effective === 'dark') {
    root.classList.add(DARK_CLASS)
  } else {
    root.classList.remove(DARK_CLASS)
  }
  // 给屏幕阅读器/颜色模式感知
  root.style.colorScheme = effective
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readPersisted())
  const systemDark = ref<boolean>(systemPrefersDark())
  // 宿主主题:经宿主适配器读取/监听(2026-10-09)。auto 模式下宿主主题优先于
  // 浏览器 prefers-color-scheme——应用视觉贴合宿主系统。
  const hostDark = ref<boolean | null>(null)

  const effective = computed<EffectiveTheme>(() => {
    if (mode.value !== 'auto') return mode.value
    if (hostDark.value !== null) return hostDark.value ? 'dark' : 'light'
    return systemDark.value ? 'dark' : 'light'
  })

  const isDark = computed(() => effective.value === 'dark')

  /** 宿主主题回调(host adapter 注入);null=无宿主,回退系统偏好 */
  function setHostTheme(dark: boolean | null) {
    hostDark.value = dark
    if (mode.value === 'auto') applyToDocumentClass(effective.value)
  }

  function setMode(next: ThemeMode) {
    mode.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* noop */
    }
    applyToDocumentClass(effective.value)
  }

  /** 在 light / dark / auto 三态间循环切换（顶栏快速切换按钮用） */
  function cycle() {
    const order: ThemeMode[] = ['light', 'dark', 'auto']
    const idx = order.indexOf(mode.value)
    const next = order[(idx + 1) % order.length] ?? 'auto'
    setMode(next)
  }

  function applyToDocument() {
    applyToDocumentClass(effective.value)
    // 监听系统主题变化（仅 auto 模式需要）
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      systemDark.value = e.matches
      if (mode.value === 'auto') {
        applyToDocumentClass(effective.value)
      }
    }
    mql.addEventListener('change', handler)
    onScopeDispose(() => mql.removeEventListener('change', handler))
  }

  return { mode, effective, isDark, setMode, cycle, setHostTheme, applyToDocument }
})
