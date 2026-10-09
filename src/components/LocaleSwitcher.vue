<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button circle :title="currentLabel" class="locale-btn">
      <el-icon><Operation /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item in options"
          :key="item.value"
          :command="item.value"
          :disabled="localeStore.locale === item.value"
        >
          <el-icon v-if="localeStore.locale === item.value"><Check /></el-icon>
          <span :class="{ 'current-locale': localeStore.locale === item.value }">
            {{ item.label }}
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Operation, Check } from '@element-plus/icons-vue'
import { useLocaleStore, type AppLocale } from '@/stores/locale'
import { useI18n } from 'vue-i18n'

const localeStore = useLocaleStore()
const { locale } = useI18n()

const options: { value: AppLocale; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
]

const currentLabel = computed(
  () => options.find((o) => o.value === localeStore.locale)?.label ?? ''
)

const handleCommand = (value: AppLocale) => {
  localeStore.setLocale(value)
  locale.value = value
  // 同步 html lang
  document.documentElement.lang = value
}
</script>

<style scoped>
.locale-btn {
  /* 主题感知：此前写死白字白底（为深色顶栏设计），放进浅色侧栏即隐形 */
  background: var(--color-muted);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.locale-btn:hover {
  background: var(--primary-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
  transform: translateY(-2px);
}

.current-locale {
  margin-left: 4px;
  font-weight: 600;
  color: var(--el-color-primary);
}
</style>
