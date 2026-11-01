<template>
  <div class="delivery-path">
    <!-- 只有一条投递路径时不渲染选择器（没有选择就没有选择器） -->
    <div v-if="paths.length > 1" class="seg" role="radiogroup" :aria-label="t('home.path.label')">
      <button
        v-for="p in paths"
        :key="p.key"
        class="seg-item"
        :class="{ active: modelValue === p.key }"
        role="radio"
        :aria-checked="modelValue === p.key"
        @click="select(p.key)"
      >
        {{ t(p.labelKey) }}
      </button>
    </div>

    <!-- 直连设备：前端不做直传编排，只给入口（跳 /beam 打开 PigeonBeam 客户端） -->
    <!-- ⚠️ 显隐条件与 paths 保持同一口径：多副本拓扑下直传不可用 ⇒ 入口必须收起。
         即便 modelValue 仍是 'p2p'（父组件持有状态，回落 emit 尚未生效）也不露出卡片。 -->
    <BeamEntryCard v-if="modelValue === 'p2p' && !multiReplica" :status="status" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'
import { withBase } from '@/utils/base'
import { multiReplicaDeclared } from '@/utils/capabilities'
import {
  probeBeamEntry,
  visibleDeliveryPaths,
  type BeamEntryStatus,
  type DeliveryPath,
} from '@/components/share/deliveryPath'
import BeamEntryCard from '@/components/share/BeamEntryCard.vue'

const props = defineProps<{
  modelValue: DeliveryPath
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DeliveryPath]
}>()

const { t } = useI18n()
const userStore = useUserStore()
const configStore = useConfigStore()

// 探测结果（组件级缓存）：只在登录态变化时探一次，不随渲染重复发请求
const status = ref<BeamEntryStatus>('absent')

// 探测序号：登出/重探时丢弃在途旧结果，避免「已登出却又冒出直连路径」
let probeSeq = 0

const runProbe = async () => {
  const seq = ++probeSeq
  // 直传是站点运营者自己的能力（/beam 本身要 Box 会话）：未登录不探测、不显示
  if (!userStore.isLoggedIn) {
    status.value = 'absent'
    return
  }
  const result = await probeBeamEntry(withBase('/beam'))
  if (seq !== probeSeq) return
  status.value = result
}

watch(() => userStore.isLoggedIn, () => { void runProbe() }, { immediate: true })

// 多副本拓扑下直传在架构上不可用（core 的 deployment.go 会强制降级）⇒
// 不给入口，而不是给一个点不动的按钮。
//
// ⚠️ 只认服务端**明确**说出的多副本：老后端不下发 capabilities 段 ⇒ 属于「未知」
// ⇒ 不能据此把功能藏没（宁可多给入口，也别给坏入口）。
const multiReplica = computed(() => multiReplicaDeclared(configStore.config))

// 可选路径：直连设备仅在本机确实挂了 /beam、且不是多副本拓扑时才出现。
// 判定口径集中在 utils/deliveryPath 的 visibleDeliveryPaths（可单测）。
const paths = computed<Array<{ key: DeliveryPath; labelKey: string }>>(() => {
  const visible = visibleDeliveryPaths(status.value, multiReplica.value)
  const labels: Record<DeliveryPath, string> = {
    box: 'home.path.box',
    p2p: 'home.path.p2p',
  }
  return visible.map((key) => ({ key, labelKey: labels[key] }))
})

// 当前路径失效（如登出后直连路径消失）→ 回落「到柜」，避免面板空着
watch(paths, (list) => {
  if (!list.some((p) => p.key === props.modelValue)) {
    emit('update:modelValue', 'box')
  }
})

const select = (path: DeliveryPath) => {
  if (path !== props.modelValue) {
    emit('update:modelValue', path)
  }
}
</script>

<style scoped>
/* 分段控件（与寄件台文件/文本 tab 同构，scoped 隔离） */
.seg {
  display: flex;
  gap: 4px;
  margin: 0 var(--spacing-xl) var(--spacing-lg);
  padding: 4px;
  background: var(--color-muted);
  border-radius: var(--radius-lg);
}

.seg-item {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: calc(var(--radius-lg) - 4px);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.seg-item:hover {
  color: var(--color-text-primary);
}

.seg-item.active {
  background: var(--color-card-bg);
  color: var(--color-text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

@media (max-width: 768px) {
  .seg {
    margin: 0 var(--spacing-md) var(--spacing-md);
  }
}
</style>
