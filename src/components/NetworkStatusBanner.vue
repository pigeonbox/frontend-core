<template>
  <div v-if="visible" class="network-banner-container">
    <el-alert
      :type="online ? 'success' : 'error'"
      :title="online ? t('network.restored') : t('network.offline')"
      :closable="true"
      :show-icon="true"
      class="network-banner"
      @close="onClose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

/**
 * 断网横幅（frontend-core#94）：断线期间常驻红色警示（传输会失败、恢复后可续），
 * 恢复后转绿色成功提示并 5s 自动收起（恢复是瞬时事件，不该常驻）。
 * 用户手动关闭只影响当前这一条，状态翻转（断↔恢）后重新展示。
 */
const { t } = useI18n()
const { online, restored, dismissRestored } = useNetworkStatus()
const dismissed = ref(false)

// 状态一变（断网↔恢复）即重新展示：用户关掉的只是上一条
watch(online, () => {
  dismissed.value = false
})

let hideTimer: ReturnType<typeof setTimeout> | null = null
watch(restored, (v) => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (v) {
    hideTimer = setTimeout(() => {
      dismissRestored()
      hideTimer = null
    }, 5000)
  }
})
onBeforeUnmount(() => {
  if (hideTimer) clearTimeout(hideTimer)
})

const visible = computed(() => !dismissed.value && (!online.value || restored.value))

const onClose = () => {
  dismissed.value = true
  // 断线横幅被关：不再打扰；恢复时由 restored 重新展示成功条
  if (online.value) dismissRestored()
}
</script>

<style scoped>
.network-banner-container {
  position: sticky;
  top: 0;
  z-index: 1001;
  padding: 8px 16px 0;
  background: transparent;
  pointer-events: none;
}

.network-banner {
  pointer-events: auto;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
</style>
