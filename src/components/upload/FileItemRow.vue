<template>
  <div
    class="file-item"
    :class="{
      uploading: isBusy,
      success: task.status === 'success',
      error: task.status === 'error',
      blocked: task.status === 'blocked',
    }"
  >
    <div class="file-icon">
      <el-icon size="32"><Document /></el-icon>
    </div>
    <div class="file-info">
      <!-- 目录上传（5.3.0）：名字前面带相对目录，否则一个文件夹里 20 个同名
           index.html 在列表里完全无法区分（用户会以为重复添加了） -->
      <div class="file-name" :title="task.relDir ? `${task.relDir}/${task.file.name}` : task.file.name">
        <span v-if="task.relDir" class="file-dir">{{ task.relDir }}/</span>{{ task.file.name }}
      </div>
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
        <!-- blocked：因单文件上限被本地拦下（不是「上传失败」）——
             与 error 分开展示，避免用户误以为重试就能发出去 -->
        <span v-else-if="task.status === 'blocked'" class="status blocked">
          <el-icon><WarningFilled /></el-icon> {{ task.error || t('upload.maxFileExceededShort') }}
        </span>
        <!-- paused（2026-11-03 Phase 3）：分片通道暂停，坐标保留、可续传 -->
        <span v-else-if="task.status === 'paused'" class="status paused">
          <el-icon><VideoPause /></el-icon> {{ t('upload.paused') }}
        </span>
        <span v-else class="status pending">
          {{ t('upload.pendingStatus') }}
        </span>
      </div>
      <el-progress
        v-if="showProgressBar"
        :percentage="task.status === 'encrypting' ? 0 : task.progress"
        :indeterminate="task.status === 'encrypting'"
        :stroke-width="4"
        :show-text="false"
        :status="task.status === 'success' ? 'success' : ''"
        class="file-progress"
      />
    </div>
    <div class="row-actions">
      <!-- 行内续传（2026-11-03 Phase 2）：失败行从断点继续——multi-chunk 分支按
           任务记录的续传坐标（服务端分片位图）跳过已传分片，同页面内 File 尚在
           内存，直接复位重跑即可，不必重新选文件。 -->
      <el-button
        v-if="task.status === 'error'"
        type="primary"
        circle
        size="small"
        :title="t('upload.resume')"
        @click="emit('resume', task.id)"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
      <!-- 单文件重试（2026-10-22）：blocked（超限/禁传被拦）行的重试 = 按**当前**
           限制重新判定，管理员调大上限后用户就地重发即可，不必移除重加。
           多文件批量语义下不提供行内重试（批量分享需整批文件同时成享，
           批量重跑走底部主按钮）。 -->
      <el-button
        v-if="task.status === 'blocked' && !multiMode"
        type="primary"
        circle
        size="small"
        :title="t('upload.retry')"
        @click="emit('retry', task.id)"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
      <!-- 复制诊断（2026-11-03 失败动作）：code/message/trace_id 一键复制，
           贴给管理员即可对服务端日志检索定位 -->
      <el-button
        v-if="task.status === 'error'"
        type="info"
        circle
        size="small"
        :title="t('upload.copyDiag')"
        @click="copyDiag"
      >
        <el-icon><CopyDocument /></el-icon>
      </el-button>
      <!-- 用 PigeonBeam 加速传（2026-11-03 Phase 3）：失败时跳转交接设备直传客户端。
           beamBaseUrl 空=零渲染。仅跳转交接，不编排 Beam 传输。 -->
      <el-button
        v-if="task.status === 'error' && beamBaseUrl"
        type="primary"
        circle
        size="small"
        :title="t('upload.useBeam')"
        @click="openBeam"
      >
        <el-icon><Promotion /></el-icon>
      </el-button>
      <!-- 暂停（2026-11-03 Phase 3）：仅分片通道（multi-chunk）可暂停——
           direct/presign/multi-direct 是单请求体，中途只能 abort=丢弃，
           给假按钮是欺骗。canPause 判定通道，不可暂停通道不渲染。 -->
      <el-button
        v-if="isBusy && canPause"
        type="warning"
        circle
        size="small"
        :title="t('upload.pause')"
        @click="emit('pause', task.id)"
      >
        <el-icon><VideoPause /></el-icon>
      </el-button>
      <!-- 恢复（2026-11-03 Phase 3）：paused 行从断点补缺片续传 -->
      <el-button
        v-if="task.status === 'paused'"
        type="primary"
        circle
        size="small"
        :title="t('upload.resume')"
        @click="emit('resume', task.id)"
      >
        <el-icon><VideoPlay /></el-icon>
      </el-button>
      <el-button
        v-if="isBusy"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Document, Close, CircleCheckFilled, CircleCloseFilled, Refresh, WarningFilled, CopyDocument, VideoPause, VideoPlay, Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { formatFileSize } from '@/utils/format'
import { copyToClipboard } from '@/utils/clipboard'
import { useConfigStore } from '@/stores/config'
import type { UploadTask } from '@/composables/useUploadQueue'

/** 上传队列单文件行（2026-10-06 W2 自 FileUpload.vue 列表块抽出） */
const props = defineProps<{ task: UploadTask; multiMode?: boolean }>()
const emit = defineEmits<{ remove: [id: string]; cancel: [id: string]; retry: [id: string]; resume: [id: string]; pause: [id: string] }>()

const { t } = useI18n()

const isBusy = computed(() =>
  props.task.status === 'uploading' || props.task.status === 'encrypting' || props.task.status === 'binding'
)

/** 可暂停（2026-11-03 Phase 3）：仅 multi-chunk 通道能在片间边界停下续传 */
const canPause = computed(() => props.task.channel === 'multi-chunk')

// PigeonBeam 加速传（2026-11-03 Phase 3）：失败时跳转交接到 Beam 设备直传客户端。
// 空 = 未配置 ⇒ 零渲染（不给必然打不开的坏入口）。仅跳转交接，浏览器端不编排 Beam 传输。
const configStore = useConfigStore()
const beamBaseUrl = computed(() => configStore.beamBaseUrl)
const openBeam = () => {
  const base = beamBaseUrl.value
  if (!base) return
  window.open(`${base}${base.includes('?') ? '&' : '?'}source=web-upload`, '_blank', 'noopener,noreferrer')
}

/** 复制诊断信息（失败行）：diag 为空（取消/老任务）时退化为复制错误文本 */
const copyDiag = async () => {
  const ok = await copyToClipboard(props.task.diag || props.task.error || '')
  ElMessage[ok ? 'success' : 'error'](t(ok ? 'upload.diagCopied' : 'upload.diagCopyFailed'))
}

/**
 * 行内进度条是否可信（2026-11-03）。
 *
 * `percentValid=false` ⇒ 该行百分比是假的（multi-direct 单请求的聚合字节被按文件
 * 顺序均摊 ⇒ 首个文件先冲 100%、其余长期 0%）⇒ 不渲染条，改由列表顶部的
 * 批次总进度条呈现真聚合值。
 *
 * success 行仍渲染（进度 100% 是真的）；paused 行也渲染（暂停点进度是真值，
 * Phase 3 续传语义要靠它显示「传到哪了」）。
 *
 * ⚠️ encrypting 行走**不确定态**：加密阶段没有百分比可报（整块 AES-GCM 加密，
 * 进度恒 0）⇒ 用脉冲条表示「在动」，别显示一个恒为 0 的条（1.35GB 加密几十秒
 * 界面零反馈）。
 */
const showProgressBar = computed(() => {
  if (props.task.status === 'success' || props.task.status === 'paused') return true
  return isBusy.value && props.task.percentValid !== false
})

// 类型标签走 i18n（键名小写映射），不再硬编码英文
const getFileType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const typeMap: Record<string, string> = {
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
    pdf: 'pdf', doc: 'word', docx: 'word',
    xls: 'excel', xlsx: 'excel',
    zip: 'zip', rar: 'zip',
    mp4: 'video', mp3: 'audio',
  }
  return t(`upload.fileType.${typeMap[ext] || 'file'}`)
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

/* 相对目录：与文件名同色但更浅，读起来是「路径 + 名字」而不是两个并列标题 */
.file-dir {
  font-weight: 400;
  color: var(--color-text-secondary);
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
/* blocked = 被单文件上限拦下：用警示色与「失败」区分（用户不该以为重试能发出去） */
.status.blocked { color: var(--el-color-warning); }
.status.paused { color: var(--el-color-warning); }
.status.uploading { color: var(--primary-color); }
.status.pending { color: var(--color-text-secondary); }

.file-progress {
  margin-top: 8px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
