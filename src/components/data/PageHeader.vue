<template>
  <div class="page-header">
    <h2>{{ title }}</h2>
    <p v-if="desc" class="page-desc">{{ desc }}</p>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 页头（2026-10-06 W3 收敛自 5 个用户页的同款 h2+desc 结构）。
 * actions slot 承载页头右侧按钮（如有）。
 */
defineProps<{ title: string; desc?: string }>()
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-xl);
}

.page-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.page-desc {
  margin: 4px 0 0;
  width: 100%;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.page-actions {
  margin-left: auto;
  display: flex;
  gap: var(--spacing-sm);
}
</style>
