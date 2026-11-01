<template>
  <div class="request-pickup-container">
    <div class="main-wrapper">
      <div class="glass-card">
        <!-- 加载中 -->
        <div v-if="loading" class="center-section">
          <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
          <p>{{ t('request.loading') }}</p>
        </div>

        <!-- 链接无效 -->
        <el-result v-else-if="error" icon="error" :title="error">
          <template #extra>
            <el-button type="primary" @click="$router.push('/')">{{ t('request.backHome') }}</el-button>
          </template>
        </el-result>

        <!-- 投递表单 -->
        <template v-else-if="view">
          <div class="header">
            <BrandLogo alt="" class="logo" />
            <div>
              <h1>{{ t('request.pickupTitle') }}</h1>
              <p v-if="view.title">{{ view.title }}</p>
            </div>
          </div>
          <el-divider />
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px"
            :title="t('request.pickupNotice')" />

          <el-upload
            :auto-upload="false"
            :on-change="handleChange"
            :on-remove="handleRemove"
            :show-file-list="true"
            multiple
            drag
          >
            <el-icon size="48" class="icon-primary"><UploadFilled /></el-icon>
            <div class="upload-text">{{ t('request.dragHint') }}</div>
            <template #tip>
              <div class="el-upload__tip">
                <span v-if="view.max_files > 0">{{ t('request.maxFiles', { n: view.max_files }) }}；</span>
                <span v-if="view.max_bytes > 0">{{ t('request.maxBytes', { size: formatSize(view.max_bytes) }) }}</span>
              </div>
            </template>
          </el-upload>

          <el-button
            type="primary"
            size="large"
            class="submit-btn"
            :loading="uploading"
            :disabled="files.length === 0"
            @click="submit"
          >
            {{ uploading ? t('request.submitting', { p: progress }) : t('request.submit') }}
          </el-button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize as formatSize } from '@/utils/format'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, type UploadFile } from 'element-plus'
import { Loading, UploadFilled } from '@element-plus/icons-vue'
import { requestApi, guestSubmit, type RequestPublicView } from '@/api/request'
import { translateError } from '@/utils/api-interceptor'
import { useRouteParam } from '@/composables/useRouteParam'

const route = useRoute()
const { t } = useI18n()
const token = ref('')
const view = ref<RequestPublicView | null>(null)
const loading = ref(true)
const error = ref('')
const uploading = ref(false)
const progress = ref(0)
const files = ref<File[]>([])


const handleChange = (f: UploadFile) => {
  if (f.raw) files.value.push(f.raw)
}

// 列表点 X 移除必须同步待传清单，否则"删掉的"文件仍会被上传
const handleRemove = (f: UploadFile) => {
  if (!f.raw) return
  files.value = files.value.filter((x) => x !== f.raw)
}

const submit = async () => {
  if (files.value.length === 0) return
  // 上限前置校验：别等服务器报错（还叠一层原始报错上屏）
  if (view.value?.max_files && files.value.length > view.value.max_files) {
    ElMessage.warning(t('request.maxFiles', { n: view.value.max_files }))
    return
  }
  if (view.value?.max_bytes) {
    const over = files.value.find((f) => f.size > view.value!.max_bytes)
    if (over) {
      ElMessage.warning(
        t('request.fileTooLarge', { name: over.name, size: formatSize(view.value.max_bytes) }),
      )
      return
    }
  }
  uploading.value = true
  progress.value = 0
  try {
    await guestSubmit(token.value, files.value, (p) => (progress.value = p))
    ElMessage.success(t('request.done'))
    files.value = []
  } catch (e: unknown) {
    const tr = translateError(e)
    ElMessage.error(tr.i18nKey ? t(tr.i18nKey) : tr.fallback || t('request.failed'))
  } finally {
    uploading.value = false
  }
}

const loadRequest = async (tok: string) => {
  loading.value = true
  error.value = ''
  view.value = null
  try {
    const res = await requestApi.getPublic(tok)
    if (res.code === 200) view.value = res.data
    else error.value = res.message || t('request.invalid')
  } catch (e: unknown) {
    const tr = translateError(e)
    error.value = tr.i18nKey ? t(tr.i18nKey) : tr.fallback || t('request.invalid')
  } finally {
    loading.value = false
  }
}

// 路由参数（寄件 token）驱动取数：**参数变化即重取**。
// 此前只在 onMounted 读一次 route.params.token ⇒ 同一路由记录（/request/:token）
// 参数变化时组件被复用、onMounted 不再触发 ⇒ 页面停留在上一份寄件视图上
// （2026-10-23 浏览器实测；与分享页同一坑，本仓第三处复发）。
useRouteParam(
  () => route.params.token as string | undefined,
  (tok) => {
    token.value = tok || ''
    void loadRequest(token.value)
  }
)
</script>

<style scoped>
.request-pickup-container {
  min-height: 100vh;
  background: var(--color-bg);
}
.main-wrapper {
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 20px;
  min-height: 100vh;
  display: flex;
  align-items: center;
}
.glass-card {
  width: 100%;
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: 40px;
  box-shadow: var(--shadow-xs);
}
.center-section {
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
.header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.logo {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
}
.header h1 {
  margin: 0;
  font-size: 22px;
  color: var(--color-text-primary);
}
.header p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}
.upload-text {
  margin-top: 8px;
  color: var(--color-text-secondary);
}
.icon-primary {
  color: var(--primary-color);
}
.submit-btn {
  width: 100%;
  margin-top: 20px;
  height: 48px;
  font-weight: 600;
}
</style>
