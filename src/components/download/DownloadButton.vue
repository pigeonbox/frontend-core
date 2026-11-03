<template>
  <div class="download-btn-wrap">
    <el-button
      :disabled="disabled || busy"
      :loading="busy"
      :size="size || 'default'"
      class="dl-btn"
      @click="onClick"
    >
      <el-icon><Download /></el-icon>
      {{ label || t('common.download') }}
    </el-button>

    <!-- 进度条：就地挂在按钮下方（不弹窗、不打断当前页面） -->
    <div v-if="visible" class="dl-progress">
      <el-progress
        :percentage="percent >= 0 ? percent : 0"
        :indeterminate="percent < 0"
        :stroke-width="4"
        :show-text="false"
        :status="error ? 'exception' : ''"
      />
      <div class="dl-meta">
        <span v-if="error" class="dl-error">{{ error }}</span>
        <span v-else-if="handedOff" class="dl-handoff">{{ t('download.handedOff') }}</span>
        <span v-else class="dl-status">{{ statusText }}</span>
        <span v-if="!error && !handedOff && bytesPerSecond > 0" class="dl-speed">
          {{ t('download.speed', { speed: formatSpeed(bytesPerSecond) }) }}
        </span>
        <span v-if="!error && !handedOff && etaSeconds !== null" class="dl-eta">
          {{ t('download.eta', { time: formatDuration(etaSeconds) }) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download } from '@element-plus/icons-vue'
import { useDownloadProgress } from '@/composables/useDownloadProgress'
import type { DownloadOutcome } from '@/utils/downloader'

/**
 * 就地进度条下载按钮（2026-11-03）。
 *
 * ⚠️ **onClick 里第一句就调 download()**：文件系统 API 的 showSaveFilePicker 受
 * transient activation 约束 ⇒ 必须在用户手势的同步链内发起 ⇒ 中间任何 await
 * 都可能让 activation 失效（保存对话框弹不出来）。
 */
const props = defineProps<{
  url: string
  filename: string
  label?: string
  disabled?: boolean
  /** 按钮尺寸（对齐 Element Plus） */
  size?: 'small' | 'default' | 'large'
  headers?: Record<string, string>
  transform?: (bytes: ArrayBuffer) => Promise<ArrayBuffer>
}>()

const emit = defineEmits<{ done: [DownloadOutcome]; error: [string] }>()

const { t } = useI18n()
const dl = useDownloadProgress(t)

const busy = dl.busy
const percent = dl.percent
const error = dl.error
const handedOff = dl.handedOff
const bytesPerSecond = dl.bytesPerSecond
const etaSeconds = dl.etaSeconds

/** 进度条只在「进行中 / 出错 / 已移交」时出现——空闲时不占版面 */
const visible = computed(() => dl.phase.value !== 'idle' || !!dl.error.value)

const statusText = computed(() => {
  switch (dl.phase.value) {
    case 'preparing':
      return t('download.preparing')
    case 'transforming':
      return t('download.decrypting')
    case 'saving':
      return t('download.saving')
    case 'downloading':
      return dl.total.value > 0 ? t('download.downloading') : t('download.unknownSize')
    default:
      return t('download.done')
  }
})

const formatSpeed = (bps: number): string => {
  const mb = bps / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.max(1, Math.round(bps / 1024))} KB/s`
}

const formatDuration = (sec: number): string => {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  return `${m}m${String(sec % 60).padStart(2, '0')}s`
}

const onClick = async () => {
  // ⚠️ 同步链第一句：见文件头注释
  const p = dl.run({
    url: props.url,
    filename: props.filename,
    headers: props.headers,
    transform: props.transform,
  })
  const out = await p
  if (out) emit('done', out)
  else if (dl.error.value) emit('error', dl.error.value)
}
</script>

<style scoped>
.download-btn-wrap {
  display: inline-flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.dl-progress {
  min-width: 160px;
}

.dl-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.dl-error { color: var(--color-danger); }
.dl-handoff { color: var(--color-text-secondary); }
.dl-status { color: var(--color-text-regular); }
</style>
