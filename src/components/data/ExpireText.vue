<template>
  <span v-if="!value" class="expire-text muted">{{ foreverText }}</span>
  <span v-else class="expire-text" :class="{ 'is-expired': expired }">{{ formatted }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '@/utils/format'

/**
 * 过期时间展示（2026-10-06 W3 收敛自 user/Shares 与 admin/Files）：
 * 空值显示"永久"，已过期红色着色，其余归一化显示。
 */
const props = withDefaults(defineProps<{
  /** ISO/"YYYY-MM-DD HH:mm:ss" 时间串；空=永久 */
  value?: string | null
  /** 是否已过期（着色判定；调用方已有字段则直传） */
  expired?: boolean
  /** 时区解析歧义保护：以调用方判断为准时传 raw 显示 */
  foreverKey?: string
}>(), {
  value: '',
  expired: false,
  foreverKey: 'user.shares.forever',
})

const { t } = useI18n()

const formatted = computed(() => formatDateTime(props.value ?? '', '—'))
const foreverText = computed(() => t(props.foreverKey))
</script>

<style scoped>
.expire-text.muted {
  color: var(--color-text-tertiary);
}

.expire-text.is-expired {
  color: var(--color-danger);
}
</style>
