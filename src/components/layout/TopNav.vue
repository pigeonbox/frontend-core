<template>
  <header class="top-nav" :class="`top-nav--${variant}`">
    <div class="nav-left">
      <slot name="leading" />
      <div class="logo-section" @click="goHome">
        <div class="logo-icon">
          <img src="/favicon.svg" alt="PigeonBox" class="logo-img" />
        </div>
        <component :is="variant === 'home' ? 'h1' : 'span'" class="logo-text">
          {{ configStore.siteName() }}
        </component>
      </div>
    </div>

    <div class="nav-right">
      <LocaleSwitcher />
      <ThemeSwitcher />
      <NotifyBell v-if="userStore.isLoggedIn" />
      <slot name="nav-extra" />
      <UserMenu v-if="userStore.isLoggedIn" @command="(key: string) => emit('command', key)" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useUserStore } from '@/stores/user'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import NotifyBell from '@/components/NotifyBell.vue'
import UserMenu from '@/components/layout/UserMenu.vue'

/**
 * 顶部导航壳（2026-10-06 收敛自 home/index.vue 与 layouts/AppLayout.vue 两套实现）。
 * variant 保留两处原视觉差异（背景/字号/间距）；页面专属按钮走 nav-extra slot，
 * 移动端汉堡等前导元素走 leading slot（其样式随父级 scoped 作用域）。
 * 用户菜单 command 原样上抛，由页面各自路由处理。
 */
withDefaults(defineProps<{ variant?: 'home' | 'app' }>(), { variant: 'app' })
const emit = defineEmits<{ command: [key: string] }>()

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const userStore = useUserStore()

const goHome = () => {
  if (route.path !== '/') router.push('/')
}
</script>

<style scoped>
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  padding: 0 var(--spacing-xl);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

/* home 变体:无分隔线融入背景(首页只有一张卡片,少一条通栏横线更清爽) */
.top-nav--home {
  background: var(--color-bg);
  border-bottom: none;
  padding: 0 var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
}

.logo-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.top-nav--home .logo-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
}

.logo-img {
  width: 100%;
  height: 100%;
  display: block;
}

.logo-text {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
  margin: 0;
}

.top-nav--home .logo-text {
  font-size: var(--text-lg);
}

.nav-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

/* home 变体手机端保持单行:logo 左、控件右,与 PC 同构
   (旧版纵向堆叠两行——logo 独占一行、控件挤第二行,高度翻倍且参差) */
@media (max-width: 768px) {
  .top-nav--home {
    padding: 0 var(--spacing-md);
  }

  .top-nav--home .nav-right {
    flex-wrap: nowrap;
    gap: var(--spacing-xs);
  }

  .top-nav--home .logo-text {
    font-size: var(--text-base);
  }
}
</style>
