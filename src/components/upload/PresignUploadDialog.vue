<template>
  <el-dialog
    v-model="visible"
    :title="t('upload.presign.init')"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="presign-dialog">
      <div class="file-summary">
        <el-icon size="32" class="icon-primary"><Document /></el-icon>
        <div class="file-info">
          <div class="file-name">{{ file?.name }}</div>
          <div class="file-size">{{ formatFileSize(file?.size || 0) }}</div>
        </div>
      </div>

      <el-progress
        :percentage="progress"
        :stroke-width="10"
        :status="progressStatus"
        class="upload-progress"
      />

      <div class="status-text">
        <el-icon v-if="!failed"><Loading /></el-icon>
        <el-icon v-else color="#f56c6c"><CircleCloseFilled /></el-icon>
        <span>{{ statusText }}</span>
      </div>

      <div v-if="failed" class="error-detail">
        <el-alert
          :title="errorMessage"
          type="error"
          :closable="false"
          show-icon
        />
      </div>
    </div>

    <template #footer>
      <el-button v-if="!completed" @click="handleCancel" :disabled="cancelling">
        {{ t('common.cancel') }}
      </el-button>
      <el-button v-if="failed" type="primary" @click="retry">
        {{ t('common.confirm') }}
      </el-button>
      <el-button v-if="completed" type="primary" @click="close">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { formatFileSize } from '@/utils/format'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  Document, Loading, CircleCloseFilled
} from '@element-plus/icons-vue'
import { presignApi, type PresignCompleteData } from '@/api/presign'
import { xhrRaw } from '@/api/_xhr'

/**
 * 预签名直传对话框（2026-10-06 W2 Promise 化：调用方 `ref.open(file, options)` 拿
 * Promise，成功 resolve/终失败 reject 并自动关闭——此前调用方用 200ms setInterval
 * 轮询组件状态。内部保留重试≤2 与秒传快路径；取消/中断类错误直接 reject 不重试
 * （原实现 abort 后会落进重试分支静默重传，属存量 bug）。
 */
const { t } = useI18n()

export interface PresignOptions {
  expire_value: number
  expire_style: string
  require_auth: boolean
  password?: string
}

const file = ref<File | null>(null)
const options = ref<PresignOptions>({ expire_value: 24, expire_style: 'hour', require_auth: false })

const visible = ref(false)

const progress = ref(0)
const statusText = ref('')
const failed = ref(false)
const errorMessage = ref('')
const completed = ref(false)
const cancelling = ref(false)

const progressStatus = computed(() => {
  if (failed.value) return 'exception'
  if (completed.value) return 'success'
  return ''
})

let activeResolve: ((r: PresignCompleteData) => void) | null = null
let activeReject: ((e: unknown) => void) | null = null

const open = (f: File, opts: PresignOptions): Promise<PresignCompleteData> => {
  file.value = f
  options.value = opts
  failed.value = false
  completed.value = false
  errorMessage.value = ''
  visible.value = true
  return new Promise<PresignCompleteData>((resolve, reject) => {
    activeResolve = resolve
    activeReject = reject
    void doUpload(0)
  })
}

const finish = (result: PresignCompleteData) => {
  activeResolve?.(result)
  activeResolve = null
  activeReject = null
  close()
}

const fail = (e: unknown) => {
  activeReject?.(e)
  activeResolve = null
  activeReject = null
  close()
}

let putAbort: AbortController | null = null
let currentUploadId = ''
let currentToken = ''

const doUpload = async (retryCount = 0) => {
  const f = file.value
  if (!f) return
  failed.value = false
  completed.value = false
  progress.value = 0
  statusText.value = t('upload.presign.init')

  try {
    // 0. 计算秒传指纹（大文件跳过，避免整文件进内存）
    statusText.value = t('upload.presign.hashing')
    const fileHash = await presignApi.computeFileHash(f)

    // 1. 申请预签名 URL
    const initRes = await presignApi.init({
      file_name: f.name,
      file_size: f.size,
      content_type: f.type || 'application/octet-stream',
      expire_value: options.value.expire_value || 24,
      expire_style: options.value.expire_style || 'hour',
      require_auth: options.value.require_auth,
      password: options.value.password,
      file_hash: fileHash || undefined,
    })
    if (!presignApi.isOk(initRes.code) || !initRes.data) {
      throw new Error(initRes.message || 'Init failed')
    }
    const initData = initRes.data

    // 1.5 秒传命中：服务端已有相同哈希+大小的分享，免直传直接出码
    if (initData.existed && initData.share_code) {
      progress.value = 100
      completed.value = true
      statusText.value = t('upload.quickUploadHit')
      finish({
        code: initData.share_code,
        url: initData.share_url || '',
        file_name: f.name,
        file_size: f.size,
        download_url: initData.share_url || '',
      })
      return
    }

    currentUploadId = initData.upload_id
    currentToken = initData.token

    // 2. PUT 直传（xhrRaw：进度 + 中断 + 自定义签发头；进度封顶 95% 留给 complete）
    statusText.value = t('upload.presign.upload')
    putAbort = new AbortController()
    await xhrRaw({
      url: initData.upload_url,
      method: initData.method || 'PUT',
      headers: {
        ...(initData.headers || {}),
        ...(f.type ? { 'Content-Type': f.type } : {}),
      },
      body: f,
      signal: putAbort.signal,
      onProgress: (loaded, total) => {
        progress.value = Math.round((loaded / total) * 95)
      },
    })
    putAbort = null

    // 3. Complete
    statusText.value = t('upload.presign.complete')
    progress.value = 97
    const completeRes = await presignApi.complete({
      upload_id: initData.upload_id,
      token: initData.token,
      object_key: initData.object_key,
    })
    if (!presignApi.isOk(completeRes.code) || !completeRes.data) {
      throw new Error(completeRes.message || 'Complete failed')
    }

    progress.value = 100
    completed.value = true
    statusText.value = t('upload.success')
    finish(completeRes.data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    // 取消/中断不重试（原实现会落进重试分支静默重传）
    if (msg === 'Cancelled' || msg === 'Aborted') {
      fail(new Error(msg))
      return
    }
    if (retryCount < 2) {
      statusText.value = `Retrying (${retryCount + 1}/3)...`
      void doUpload(retryCount + 1)
      return
    }
    failed.value = true
    errorMessage.value = msg
    statusText.value = t('upload.presign.failed')
    fail(e)
  }
}

const retry = () => {
  void doUpload(0)
}

const handleCancel = async () => {
  cancelling.value = true
  try {
    if (putAbort) {
      putAbort.abort()
      putAbort = null
    }
    if (currentUploadId && currentToken) {
      try {
        await presignApi.abort({
          upload_id: currentUploadId,
          token: currentToken,
        })
      } catch {
        // ignore abort failure
      }
    }
    ElMessage.info(t('upload.presign.abort'))
    fail(new Error('Cancelled'))
  } finally {
    cancelling.value = false
  }
}

const close = () => {
  visible.value = false
  // 重置
  progress.value = 0
  failed.value = false
  completed.value = false
  errorMessage.value = ''
}

defineExpose({ open })
</script>

<style scoped>
.presign-dialog {
  padding: 0 4px;
}

.file-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-muted);
  border-radius: var(--radius-lg);
  margin-bottom: 24px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 600;
  color: var(--color-text-primary);
  word-break: break-all;
  margin-bottom: 4px;
}

.file-size {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.upload-progress {
  margin-bottom: 16px;
}

.status-text {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  font-size: 14px;
  color: var(--color-text-regular);
}

.error-detail {
  margin-top: 16px;
}

.icon-primary {
  color: var(--primary-color);
}
</style>
