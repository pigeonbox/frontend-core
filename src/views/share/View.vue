<template>
  <div class="share-view-container">
    <!-- 主容器 -->
    <div class="main-wrapper">
      <div class="glass-card">
        <!-- 加载状态 -->
        <div v-if="loading" class="loading-section">
          <el-icon class="loading-icon" :size="60"><Loading /></el-icon>
          <p>{{ t('share.loading') }}</p>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="error" class="error-section">
          <el-result icon="error" :title="error">
            <template #extra>
              <el-button type="primary" @click="$router.push('/')">{{ t('share.backHome') }}</el-button>
            </template>
          </el-result>
        </div>

        <!-- 需要密码 -->
        <div v-else-if="needPassword" class="password-section">
          <el-result icon="warning" :title="t('share.passwordTitle')">
            <template #sub-title>
              {{ t('share.passwordDesc') }}
            </template>
            <template #extra>
              <el-input
                v-model="password"
                type="password"
                :placeholder="t('share.passwordPlaceholder')"
                show-password
                @keyup.enter="fetchShareWithPassword"
                style="width: 300px; margin-bottom: 16px;"
              />
              <br />
              <el-button type="primary" @click="fetchShareWithPassword" :loading="loading">
                {{ t('share.confirmAccess') }}
              </el-button>
            </template>
          </el-result>
        </div>

        <!-- 分享内容 -->
        <div v-else-if="shareData" class="content-section">
          <!-- E2E 缺密钥提示 -->
          <el-alert
            v-if="shareData.encrypted && !e2eKey"
            type="warning"
            :title="t('share.e2eKeyMissing')"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-alert
            v-else-if="e2eError"
            type="error"
            :title="e2eError"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <!-- 头部 -->
          <div class="share-header">
            <div class="logo-section">
              <div class="logo-icon">
                <img src="/favicon.svg" alt="PigeonBox" class="logo-img" />
              </div>
              <div class="logo-text">
                <h1>{{ t('share.contentTitle') }}</h1>
                <p>{{ t('share.codeWithLabel', { code: shareCode }) }}</p>
              </div>
            </div>
            <el-button class="home-btn" @click="$router.push('/')">
              <el-icon><HomeFilled /></el-icon>
              {{ t('share.backHome') }}
            </el-button>
          </div>

          <el-divider />

          <!-- 文件分享（回归：select 响应恒带 url/download_url，不能作文件判据；
               文本分享 = 有 text 且无 file_name/files，否则文本被当文件渲染） -->
          <div v-if="hasFileContent" class="file-share-content">
            <!-- 多文件列表（P0 多文件）：逐文件下载 + 打包 zip -->
            <div v-if="shareFiles.length > 1" class="multi-file-section">
              <div class="multi-header">
                <div class="multi-title">
                  <el-icon class="icon-primary"><Folder /></el-icon>
                  <span>{{ t('share.filesCount', { n: shareFiles.length }) }}</span>
                  <el-tag type="info" size="small">{{ formatFileSize(totalShareSize) }}</el-tag>
                  <el-tag v-if="shareData.encrypted" type="warning" size="small">{{ t('share.e2eTag') }}</el-tag>
                </div>
                <el-button
                  v-if="!shareData.encrypted"
                  type="primary"
                  class="download-btn"
                  @click="downloadAll"
                >
                  <el-icon><Download /></el-icon>
                  {{ t('share.zipDownload') }}
                </el-button>
              </div>
              <div class="multi-file-list">
                <div v-for="f in shareFiles" :key="f.id" class="multi-file-item">
                  <el-icon class="icon-secondary"><Document /></el-icon>
                  <span class="m-name" :title="f.name">{{ f.name }}</span>
                  <span class="m-size">{{ formatFileSize(f.size) }}</span>
                  <el-button size="small" text type="primary" :loading="e2eBusy" @click="downloadFile(f.id, f.name)">
                    <el-icon><Download /></el-icon>
                    下载
                  </el-button>
                </div>
              </div>
            </div>

            <!-- 单文件卡片 -->
            <div v-else class="file-card">
              <div class="file-icon">
                <el-icon :size="80" class="icon-primary"><Folder /></el-icon>
              </div>
              <div class="file-info">
                <h3 class="file-name">{{ shareData.name || shareData.file_name || shareData.text }}</h3>
                <div class="file-meta">
                  <el-tag type="info" size="large">
                    {{ formatFileSize(shareData.size || shareData.file_size || 0) }}
                  </el-tag>
                  <el-tag v-if="shareData.upload_type" type="success" size="large">
                    {{ shareData.upload_type === 'text' ? t('share.textShare') : t('share.fileShare') }}
                  </el-tag>
                </div>
              </div>
              <el-button type="primary" size="large" class="download-btn" @click="downloadFile()">
                <el-icon><Download /></el-icon>
                {{ t('share.downloadFile') }}
              </el-button>
            </div>
          </div>

          <!-- 文本分享 -->
          <div v-else-if="hasTextContent" class="text-share-content">
            <div class="content-label">
              <el-icon><Document /></el-icon>
              <span>{{ t('share.textContent') }}</span>
              <el-tag v-if="shareData.encrypted" type="warning" size="small">{{ t('share.e2eTag') }}</el-tag>
            </div>
            <div class="text-box">
              <pre>{{ displayText }}</pre>
            </div>
            <div class="actions">
              <el-button type="primary" @click="copyText">
                <el-icon><CopyDocument /></el-icon>
                {{ t('share.copyText') }}
              </el-button>
            </div>
          </div>

          <!-- 分享信息 -->
          <div class="share-info">
            <el-descriptions :column="2" border>
              <el-descriptions-item :label="t('share.codeLabel')">
                <el-tag>{{ shareCode }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item :label="t('share.typeLabel')">
                <el-tag :type="hasFileContent ? 'primary' : 'success'">
                  {{ hasFileContent ? t('share.typeFile') : t('share.typeText') }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize } from '@/utils/format'
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  HomeFilled, Document, Folder, Download, CopyDocument, Loading
} from '@element-plus/icons-vue'
import { shareApi } from '@/api/share'
import { decryptBytes, decryptText } from '@/utils/e2e'
import { copyToClipboard } from '@/utils/clipboard'

const route = useRoute()
const { t } = useI18n()

const shareCode = ref('')
const loading = ref(false)
const error = ref('')
const needPassword = ref(false)
const password = ref('')
const shareData = ref<any>(null)

// 多文件列表（后端 /share/select 的 files 数组；旧单文件分享为空 → 走单文件卡片）
const shareFiles = computed<any[]>(() =>
  Array.isArray(shareData.value?.files) ? shareData.value.files : []
)
const totalShareSize = computed(() =>
  shareFiles.value.reduce((s, f) => s + (Number(f.size) || 0), 0)
)


const fetchShare = async (pwd?: string) => {
  loading.value = true
  error.value = ''
  needPassword.value = false

  try {
    const res = await shareApi.getShare(shareCode.value, pwd)

    if (res.code === 200) {
      shareData.value = res.data
      // E2E 文本解密（密文 base64 存于 text 字段）
      if (res.data?.encrypted && res.data?.text && e2eKey.value) {
        decryptedText.value = ''
        try {
          decryptedText.value = await decryptText(e2eKey.value, res.data.text)
        } catch {
          e2eError.value = t('share.decryptFailed')
        }
      }
    } else if (res.code === 403 || res.data?.has_password) {
      needPassword.value = true
    } else if (res.code === 404) {
      error.value = res.message || t('share.not_found')
    } else {
      error.value = res.message || t('share.not_found')
    }
  } catch (err: any) {
    // /share/select 的密码族错误（需要密码/密码错误）返回 HTTP 401，经响应
    // 拦截器包装后 reject 到这里——一律回到密码输入分支并提示，而非错误页
    // （2026-10-05 浏览器 E2E 发现的历史 bug：此前密码框永远不出现，输错密码
    // 还会困死在错误页无法重试）
    const status = err?.response?.status
    if (err?.code === 403 || status === 401) {
      needPassword.value = true
      if (err?.message && err.message !== '需要密码') {
        ElMessage.error(err.message)
      }
      return
    }
    error.value = err.message || t('share.fetchFailed')
  } finally {
    loading.value = false
  }
}

const fetchShareWithPassword = () => {
  if (!password.value.trim()) {
    ElMessage.warning(t('share.passwordPlaceholder'))
    return
  }
  fetchShare(password.value)
}

const copyText = async () => {
  const text = displayText.value
  if (!text) return

  const ok = await copyToClipboard(text)
  if (ok) ElMessage.success(t('share.copyTextOk'))
  else ElMessage.error(t('share.copyFailed'))
}

const buildDownloadUrl = (fileId?: number): string => {
  // 优先使用取件接口下发的带令牌 download_url（security.download_token.enabled 时必需）；
  // 旧后端无此字段时回退到手工拼接
  const data = shareData.value as Record<string, unknown> | null
  let url = (data?.download_url as string | undefined) || `/share/download?code=${encodeURIComponent(shareCode.value)}`
  if (password.value && !url.includes('password=')) {
    url += `&password=${encodeURIComponent(password.value)}`
  }
  if (fileId != null && fileId > 0) {
    url += `&file=${fileId}`
  }
  return url
}

// ===== E2E 解密（端到端加密分享） =====
// 密钥来自分享链接 hash 路由的 query（#/share/CODE?key=xxx），服务端不可见
const e2eKey = computed(() => (typeof route.query.key === 'string' ? route.query.key : ''))
const e2eError = ref('')
const e2eBusy = ref(false)
// 解密后的文本（未加密分享直接用原文）
const decryptedText = ref('')
const hasTextContent = computed(() => !!shareData.value?.text)
// 文件分享判据：有文件名或文件列表（url/download_url 恒存在，不可作判据）
const hasFileContent = computed(() =>
  !!shareData.value?.file_name || shareFiles.value.length > 0
)
const displayText = computed(() => {
  if (shareData.value?.encrypted) return decryptedText.value || t2ePendingText()
  return shareData.value?.text || ''
})
const t2ePendingText = () => (e2eKey.value ? t('share.decrypting') : t('share.noKeyNoDecrypt'))

const isEncrypted = computed(() => !!shareData.value?.encrypted)

/** 解密并保存文件（E2E 分享：服务端流返回密文） */
const fetchDecryptSave = async (url: string, name: string) => {
  e2eBusy.value = true
  e2eError.value = ''
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(t('share.downloadFailedHttp', { status: resp.status }))
    const buf = await resp.arrayBuffer()
    const plain = await decryptBytes(e2eKey.value, buf)
    const blob = new Blob([plain], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  } catch (e: unknown) {
    e2eError.value = e instanceof Error ? t('share.decryptFailedMsg', { msg: e.message }) : t('share.decryptFailedShort')
  } finally {
    e2eBusy.value = false
  }
}

const downloadFile = (fileId?: number, name?: string) => {
  if (!shareCode.value) return
  // 文件分享的原始名存 text 字段（E2E 文本分享的 text 是密文，但文本分支不走下载）
  const fallbackName = name || shareData.value?.file_name || shareData.value?.name
    || (shareData.value?.encrypted && shareFiles.value.length === 0 ? '' : shareData.value?.text)
    || `${shareCode.value}.bin`
  if (isEncrypted.value) {
    if (!e2eKey.value) {
      e2eError.value = t('share.keyMissingParam')
      return
    }
    void fetchDecryptSave(buildDownloadUrl(fileId), fallbackName)
    return
  }
  window.open(buildDownloadUrl(fileId), '_blank')
}

// 打包下载（多文件分享；服务端流式 zip。E2E 分享服务端无法打包，按钮已隐藏）
const downloadAll = () => {
  if (!shareCode.value) return
  window.open(buildDownloadUrl(), '_blank')
}

onMounted(() => {
  const code = route.params.code as string
  if (code) {
    shareCode.value = code
    fetchShare()
  } else {
    error.value = t('share.codeRequired')
  }
})
</script>

<style scoped>
.share-view-container {
  position: relative;
  min-height: 100vh;
  background: var(--color-bg);
  overflow-x: hidden;
}

/* 主容器 */
.main-wrapper {
  position: relative;
  z-index: 1;
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-card {
  width: 100%;
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: 40px;
  box-shadow: var(--shadow-xs);
}

/* 加载状态 */
.loading-section {
  text-align: center;
  padding: 60px 20px;
}

.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--primary-color);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-section p {
  margin-top: 20px;
  font-size: 16px;
  color: var(--color-text-secondary);
}

/* 错误状态 */
.error-section {
  padding: 20px;
}

/* 密码状态 */
.password-section {
  padding: 20px;
  text-align: center;
}

/* 头部 */
.share-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.logo-img {
  width: 100%;
  height: 100%;
  display: block;
}

.logo-text h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.logo-text p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.home-btn {
  background: var(--primary-color);
  border: none;
  color: white;
  border-radius: var(--radius-lg);
  font-weight: 500;
}

/* 文本分享 */
.text-share-content {
  margin-top: 30px;
}

.content-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-weight: 600;
  font-size: 16px;
  color: var(--color-text-regular);
}

.text-box {
  background: var(--color-muted);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 20px;
}

.text-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-primary);
}

.actions {
  display: flex;
  gap: 12px;
}

/* 文件分享 */
.file-share-content {
  margin-top: 30px;
}

/* 多文件列表 */
.multi-file-section {
  background: var(--color-muted);
  border-radius: var(--radius-xl);
  padding: 24px;
}

.multi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.multi-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.multi-file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.multi-file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
}

.multi-file-item .m-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--color-text-primary);
}

.multi-file-item .m-size {
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  background: var(--color-muted);
  border-radius: var(--radius-xl);
}

.file-icon {
  margin-bottom: 24px;
}

.file-info {
  text-align: center;
  margin-bottom: 24px;
}

.file-name {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.file-meta {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.download-btn {
  background: var(--primary-color);
  border: none;
  border-radius: var(--radius-lg);
  padding: 12px 32px;
  font-weight: 600;
}

.icon-secondary {
  color: var(--color-text-secondary);
}

.icon-primary {
  color: var(--primary-color);
}

/* 分享信息 */
.share-info {
  margin-top: 30px;
}

/* 响应式 */
@media (max-width: 768px) {
  .main-wrapper {
    padding: 20px 16px;
  }

  .glass-card {
    padding: 24px;
  }

  .share-header {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }

  .file-card {
    padding: 24px;
  }
}
</style>
