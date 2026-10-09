<template>
  <div
    class="file-item"
    :class="{
      uploading: isBusy,
      success: task.status === 'success',
      error: task.status === 'error',
    }"
  >
    <div class="file-icon">
      <el-icon size="32"><Document /></el-icon>
    </div>
    <div class="file-info">
      <div class="file-name">{{ task.file.name }}</div>
      <div class="file-meta">
        <span>{{ formatFileSize(task.file.size) }}</span>
        <span class="file-type">{{ getFileType(task.file.name) }}</span>
        <span v-if="task.status === 'uploading' || task.status === 'encrypting' || task.status === 'binding'" class="status uploading">
          {{ task.statusText || t('upload.uploading') }}
        </span>
        <span v-else-if="task.status === 'success'" class="status success">
          <el-icon><CircleCheckFilled /></el-icon> {{ t('common.success') }}
        </span>
        <span v-else-if="task.status === 'error'" class="status error">
          <el-icon><CircleCloseFilled /></el-icon> {{ task.error || t('common.failed') }}
        </span>
        <span v-else class="status pending">
          {{ t('common.optional') }}
        </span>
      </div>
      <el-progress
        v-if="task.status === 'uploading' || task.status === 'encrypting' || task.status === 'binding' || task.status === 'success'"
        :percentage="task.progress"
        :stroke-width="4"
        :show-text="false"
        :status="task.status === 'success' ? 'success' : ''"
        class="file-progress"
      />
    </div>
    <el-button
      v-if="task.status === 'uploading' || task.status === 'encrypting' || task.status === 'binding'"
      type="danger"
      circle
      size="small"
      @click="emit('cancel', task.id)"
    >
      <el-icon><Close /></el-icon>
    </el-button>
    <el-button
      v-else
      type="info"
      circle
      size="small"
      @click="emit('remove', task.id)"
    >
      <el-icon><Close /></el-icon>
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Document, Close, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { formatFileSize } from '@/utils/format'
import type { UploadTask } from '@/composables/useUploadQueue'

/** 上传队列单文件行（2026-10-06 W2 自 FileUpload.vue 列表块抽出） */
const props = defineProps<{ task: UploadTask }>()
const emit = defineEmits<{ remove: [id: string]; cancel: [id: string] }>()

const { t } = useI18n()

const isBusy = computed(() =>
  props.task.status === 'uploading' || props.task.status === 'encrypting' || props.task.status === 'binding'
)

const getFileType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const typeMap: Record<string, string> = {
    jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image',
    pdf: 'PDF', doc: 'Word', docx: 'Word',
    xls: 'Excel', xlsx: 'Excel',
    zip: 'Zip', rar: 'Zip',
    mp4: 'Video', mp3: 'Audio',
  }
  return typeMap[ext] || 'File'
}
</script>

<style scoped>
.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-muted);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  transition: border-color 0.2s ease, background 0.2s ease;
}

.file-item.uploading {
  border-color: var(--primary-color);
  background: var(--color-alert-bg);
}

.file-item.success {
  border-color: var(--color-success);
  background: var(--color-success-bg);
}

.file-item.error {
  border-color: var(--color-danger);
  background: var(--color-danger-bg);
}

.file-icon {
  width: 48px;
  height: 48px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 14px;
  word-break: break-all;
  margin-bottom: 4px;
}

.file-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-wrap: wrap;
  align-items: center;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.status.success { color: var(--color-success); }
.status.error { color: var(--color-danger); }
.status.uploading { color: var(--primary-color); }
.status.pending { color: var(--color-text-secondary); }

.file-progress {
  margin-top: 8px;
}
</style>
