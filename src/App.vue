<template>
  <el-config-provider :locale="epLocale">
    <div class="app-root">
      <NotifyBanner />
      <router-view />
      <ErrorToast />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'
import { useConfigStore } from '@/stores/config'
import { useLocaleStore, type AppLocale } from '@/stores/locale'
import { applyAccent } from '@/utils/accent'
import { host } from '@/host'
import NotifyBanner from '@/components/NotifyBanner.vue'
import ErrorToast from '@/components/ErrorToast.vue'

const { locale } = useI18n()
const userStore = useUserStore()
const themeStore = useThemeStore()
const configStore = useConfigStore()
const localeStore = useLocaleStore()

// Element Plus 内置文案（No Data / 分页 / 日期选择器等）跟随当前语言
// 类型断言：EP locale 模块的类型声明与 ConfigProvider 期望的 Language 类型存在版本差异
const epLocale = computed(() => (locale.value === 'zh-CN' ? zhCn as any : en as any))

// 主题色统一入口：accent 来自 /api/config（管理后台可配）。
// 全局应用（此前只有首页设置且从不清理，导致用户中心两套主色并存）；
// 深浅切换 / 配置刷新（管理员改色）时按新模式重算色阶。
const syncAccent = () => applyAccent(configStore.config?.accentColor)

// 宿主跟随(主题贴合宿主/语言尊重显式偏好)+打开即免登录:全部经宿主适配器
// SPI,default 实现能力全关——非宿主部署下以下调用均为 no-op。
const initHostIntegration = async () => {
  host.initFollow({
    onTheme: (dark) => themeStore.setHostTheme(dark),
    onLanguage: (language) => localeStore.setHostLocale(language as AppLocale),
  }).catch(() => {})
  if (userStore.isLoggedIn) return
  try {
    const sso = await host.ssoLogin()
    if (sso) {
      userStore.applyExternalSession(sso)
      userStore.fetchUserInfo()
    }
  } catch {
    /* SSO 失败静默:留在匿名/登录态 */
  }
}

onMounted(async () => {
  // 有会话标记则拉取用户信息（令牌在 HttpOnly Cookie，真实校验在服务端）
  if (userStore.isLoggedIn) {
    userStore.fetchUserInfo()
  }
  await configStore.fetchConfig()
  syncAccent()
  initHostIntegration()
})

watch([() => themeStore.isDark, () => configStore.config], syncAccent)
</script>

<style>
#app {
  width: 100%;
  height: 100%;
}

.app-root {
  width: 100%;
  min-height: 100vh;
}
</style>
