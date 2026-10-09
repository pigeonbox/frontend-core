<template>
  <div class="file-upload-container">
    <!-- 全局拖拽高亮 -->
    <transition name="fade">
      <div v-if="isDragging" class="global-drop-overlay">
        <div class="drop-hint">
          <el-icon size="64" class="icon-primary"><UploadFilled /></el-icon>
          <h2>{{ t('upload.dragHint') }}</h2>
        </div>
      </div>
    </transition>

    <!-- 访客准入：管理后台关闭匿名上传时，未登录用户显示提示而非上传区 -->
    <el-alert
      v-if="visitorUploadBlocked"
      type="warning"
      :title="t('upload.visitorDisabled')"
      :closable="false"
      show-icon
      class="visitor-blocked"
    />
    <!-- 选择区 -->
    <el-upload
      v-else
      :auto-upload="false"
      :on-change="handleFileChange"
      :show-file-list="false"
      :multiple="true"
      drag
      class="upload-dragger"
    >
      <div class="upload-content">
        <div class="upload-icon">
          <el-icon size="60" class="icon-primary"><UploadFilled /></el-icon>
        </div>
        <div class="upload-text">
          <h3>{{ t('upload.dragHint') }}</h3>
          <p>{{ t('upload.clickHint') }}</p>
        </div>
      </div>
    </el-upload>

    <!-- 多文件列表 -->
    <transition-group name="file-list" tag="div" class="files-list">
      <FileItemRow
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @remove="remove"
        @cancel="cancel"
      />
    </transition-group>

    <!-- 共享设置（对所有文件生效；常驻——恒定布局，未选文件时 CTA 禁用） -->
    <ShareSettingsForm :settings="settings" />

    <!-- 上传按钮（对标上游"安全寄送"：纸飞机图标 + 寄送语义） -->
    <el-button
      type="primary"
      size="large"
      class="upload-btn"
      :loading="isUploading"
      :disabled="!canStart"
      @click="handleUploadAll"
    >
      <template #icon>
        <el-icon v-if="!isUploading"><Promotion /></el-icon>
      </template>
      {{ isUploading ? t('upload.uploading') : t('upload.secureSend') }}
    </el-button>

    <!-- 预签名直传对话框（单文件 >100MB；Promise 化，由队列经 presign 回调驱动） -->
    <PresignUploadDialog ref="presignDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { UploadFilled, Promotion } from '@element-plus/icons-vue'
import { useConfigStore } from '@/stores/config'
import { useUserStore } from '@/stores/user'
import { useShareSettings } from '@/composables/useShareSettings'
import { useUploadQueue } from '@/composables/useUploadQueue'
import { useFileDrop } from '@/composables/useFileDrop'
import type { ShareResult } from '@/types/share'
import PresignUploadDialog from './PresignUploadDialog.vue'
import ShareSettingsForm from '@/components/share/ShareSettingsForm.vue'
import FileItemRow from './FileItemRow.vue'

/**
 * 文件上传入口（2026-10-06 W2 瘦身为装配层，原 909 行）：
 * 编排=useUploadQueue（E2E/通道决策/进度/中断），设置=useShareSettings，
 * 拖拽粘贴=useFileDrop，单行=FileItemRow，大文件弹窗=PresignUploadDialog（Promise）。
 * emit 契约不变：success: ShareResult（home 页零改动）。
 */
const { t } = useI18n()
const configStore = useConfigStore()
const userStore = useUserStore()
const visitorUploadBlocked = computed(
  () => !userStore.isLoggedIn && configStore.config?.openUpload === false
)

const emit = defineEmits<{ success: [result: ShareResult] }>()

const { settings, validate } = useShareSettings()
const presignDialog = ref<InstanceType<typeof PresignUploadDialog> | null>(null)

// 单请求体上限：后端 Hertz max body = upload_size（未知时保守取 8MB），留 1MB 表单开销余量
const queue = useUploadQueue({
  settings,
  t,
  bodyCap: () => Math.max((configStore.config?.uploadSize || 0) - 1024 * 1024, 0) || 8 * 1024 * 1024,
  // 直传策略（管理后台"下载设置"下发）：disabled=全部关闭/authenticated=仅登录/everyone
  presignAllowed: () => {
    if (userStore.isLoggedIn) return true
    const policy = configStore.config?.presignPolicy
    if (policy) return policy === 'everyone'
    return configStore.config?.presignEnabled ?? true // 旧后端无策略字段时兼容
  },
  presignThreshold: () =>
    (configStore.config?.presignThresholdMb || 100) * 1024 * 1024,
  isLoggedIn: () => userStore.isLoggedIn,
  presign: (file, s) =>
    presignDialog.value!.open(file, {
      expire_value: s.expire_value,
      expire_style: s.expire_style,
      require_auth: s.require_auth,
      password: s.password || undefined,
    }),
})
const { tasks, isUploading, canStart, addFiles, remove, cancel, start, dispose } = queue

const { isDragging } = useFileDrop({ onFiles: addFiles })

const handleFileChange = (uploadFile: UploadFile) => {
  if (uploadFile.raw) {
    addFiles([uploadFile.raw])
  }
}

const handleUploadAll = async () => {
  if (!validate()) {
    ElMessage.warning(t('upload.passwordRequired'))
    return
  }
  const outcome = await start()
  if (outcome) {
    emit('success', outcome)
  }
}

onBeforeUnmount(() => dispose())
</script>

<style scoped>
.file-upload-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 0;
  position: relative;
}

.global-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(var(--primary-color-rgb), 0.08);
  backdrop-filter: blur(4px);
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-hint {
  text-align: center;
  color: var(--primary-color);
  background: var(--color-elevated, white);
  padding: 48px 64px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-xs);
}

.drop-hint h2 {
  margin: 16px 0 0;
  font-size: 24px;
}

/* 拖拽区弹性填充:等高 tab 方案下吸收剩余空间(空态时撑满,队列变长时回落自然高度)。
   注意 EP 结构:自定义 class 落在外层壳 div,真正的 .el-upload 在内一层,flex 链要两层都接上 */
.upload-dragger {
  flex: 1;
  display: flex;
  margin-bottom: 24px;
}

.upload-dragger :deep(.el-upload) {
  flex: 1;
  display: flex;
}

/* 手机端拖拽区收紧:降低留白,避免空拖拽区占满首屏 */
@media (max-width: 768px) {
  .upload-dragger :deep(.el-upload-dragger) {
    padding: 20px 16px;
  }

  .upload-dragger :deep(.upload-icon .el-icon) {
    font-size: 40px !important;
  }
}

.upload-dragger :deep(.el-upload-dragger) {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-muted);
  transition: all 0.2s ease;
  padding: 40px 20px;
}

.upload-dragger :deep(.el-upload-dragger:hover) {
  border-color: var(--primary-color);
}

.upload-content {
  text-align: center;
}

.upload-icon {
  margin-bottom: 16px;
}

.upload-text h3 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--color-text-regular);
}

.upload-text p {
  margin: 0;
  color: var(--color-text-secondary);
}


.files-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

/* 空队列不留幽灵 margin:等高 tab 方案下 16px 空隙会让文件 tab 反超文本 tab */
.files-list:empty {
  margin-bottom: 0;
}

.upload-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-md);
  background: var(--primary-color);
  border: none;
  transition: background 0.2s ease, opacity 0.2s ease;
}

.upload-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.upload-btn:disabled {
  opacity: 0.5;
}

.icon-primary {
  color: var(--primary-color);
}

/* 过渡 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.file-list-enter-active, .file-list-leave-active {
  transition: all 0.3s;
}
.file-list-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.file-list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
