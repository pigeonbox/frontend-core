<template>
  <div class="beam-entry">
    <div class="beam-entry-head">
      <span class="beam-entry-icon">
        <el-icon size="20"><Connection /></el-icon>
      </span>
      <div class="beam-entry-text">
        <h3 class="beam-entry-title">{{ t('home.path.p2pTitle') }}</h3>
        <p class="beam-entry-desc">{{ t('home.path.p2pDesc') }}</p>
      </div>
    </div>

    <!-- 状态如实回显：401/503 也给入口，但必须说清「进去会怎样」，
         不能给用户一个必然失败的按钮而没有任何提示 -->
    <p class="beam-entry-status" :class="statusClass">{{ t(statusKey) }}</p>

    <el-button type="primary" size="large" class="beam-entry-btn" @click="openBeam">
      {{ t('home.path.p2pOpen') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Connection } from '@element-plus/icons-vue'
import { withBase } from '@/utils/base'
import type { BeamEntryStatus } from '@/components/share/deliveryPath'

/**
 * 直连设备入口卡（PigeonBeam 信鸽直传）。
 * 前端不做直传编排——这里只提供一个跳 /beam 的入口，实际直传由 PigeonBeam 客户端完成。
 */
const props = defineProps<{
  /** 探测结果：ready=就绪 / auth=需登录 / unready=组件未就绪 */
  status: BeamEntryStatus
}>()

const { t } = useI18n()

const statusKey = computed(() => {
  switch (props.status) {
    case 'ready':
      return 'home.path.p2pReady'
    case 'auth':
      return 'home.path.p2pNeedLogin'
    case 'unready':
      return 'home.path.p2pNotReady'
    default:
      return 'home.path.p2pNotReady'
  }
})

const statusClass = computed(() =>
  props.status === 'ready' ? 'is-ready' : 'is-warn'
)

// 新标签打开直传页；noopener 切断 window.opener（目标页拿不到本站引用）
const openBeam = () => {
  window.open(withBase('/beam'), '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
.beam-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  margin: 0 var(--spacing-xl);
  padding: var(--spacing-lg) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-muted);
  text-align: center;
}

.beam-entry-head {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  text-align: left;
}

.beam-entry-icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--primary-bg);
  color: var(--primary-color);
}

.beam-entry-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.beam-entry-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.beam-entry-desc {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.beam-entry-status {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.6;
}

.beam-entry-status.is-ready {
  color: var(--color-text-tertiary);
}

.beam-entry-status.is-warn {
  color: var(--color-warning);
}

.beam-entry-btn {
  width: 100%;
  max-width: 320px;
  height: 44px;
  font-weight: 600;
  border-radius: 999px;
  border: none;
}

@media (max-width: 768px) {
  .beam-entry {
    margin: 0 var(--spacing-sm);
  }
}
</style>
