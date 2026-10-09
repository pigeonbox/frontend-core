<template>
  <div class="setup-container">
    <div class="setup-card">
      <!-- Logo 区 -->
      <div class="setup-header">
        <div class="logo-icon">
          <img src="/favicon.svg" alt="PigeonBox" class="logo-img" />
        </div>
        <h1>{{ t('setup.title') }}</h1>
        <p class="setup-desc">{{ t('setup.description') }}</p>
      </div>

      <el-alert
        v-if="alreadyInitialized"
        :title="t('setup.alreadyInitialized')"
        type="info"
        show-icon
        :closable="false"
        class="setup-alert"
      />

      <el-form
        ref="setupFormRef"
        :model="setupForm"
        :rules="rules"
        label-position="top"
        :disabled="alreadyInitialized"
        @submit.prevent="handleSetup"
      >
        <el-form-item :label="t('setup.adminUsername')" prop="adminUsername">
          <el-input
            v-model="setupForm.adminUsername"
            :placeholder="t('setup.adminUsername')"
            prefix-icon="User"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item :label="t('setup.adminEmail')" prop="adminEmail">
          <el-input
            v-model="setupForm.adminEmail"
            type="email"
            :placeholder="t('setup.adminEmail')"
            prefix-icon="Message"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item :label="t('setup.adminPassword')" prop="adminPassword">
          <el-input
            v-model="setupForm.adminPassword"
            type="password"
            :placeholder="t('setup.adminPassword')"
            prefix-icon="Lock"
            size="large"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item :label="t('setup.confirmPassword')" prop="confirmPassword">
          <el-input
            v-model="setupForm.confirmPassword"
            type="password"
            :placeholder="t('setup.confirmPassword')"
            prefix-icon="Lock"
            size="large"
            show-password
            clearable
            @keyup.enter="handleSetup"
          />
        </el-form-item>

        <!-- 站点预配置（可选；对标上游首启向导，策略一页配完） -->
        <el-divider content-position="left">
          <span class="section-title">{{ t('setup.siteSection') }}</span>
        </el-divider>

        <el-form-item :label="t('setup.siteName')">
          <el-input
            v-model="setupForm.siteName"
            :placeholder="t('setup.siteNamePlaceholder')"
            size="large"
            clearable
            maxlength="80"
          />
        </el-form-item>

        <el-form-item :label="t('setup.uploadSizeLabel')">
          <el-input-number
            v-model="setupForm.uploadSizeMb"
            :min="1"
            :max="10240"
            size="large"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item :label="t('setup.openUploadLabel')">
          <el-switch v-model="setupForm.openUpload" />
          <span class="switch-hint">{{ t('setup.openUploadHint') }}</span>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="submit-btn"
            @click="handleSetup"
          >
            {{ t('setup.submit') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="setup-footer">
        <el-link type="primary" underline="never" @click="$router.push('/user/login')">
          {{ t('setup.goLogin') }}
        </el-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { publicApi } from '@/api/public'

const router = useRouter()
const { t } = useI18n()

const setupFormRef = ref<FormInstance>()
const loading = ref(false)
const alreadyInitialized = ref(false)

const setupForm = reactive({
  adminUsername: '',
  adminEmail: '',
  adminPassword: '',
  confirmPassword: '',
  // 站点预配置（可选段）
  siteName: '',
  uploadSizeMb: 100,
  openUpload: true
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (err?: Error) => void) => {
  if (value !== setupForm.adminPassword) {
    callback(new Error(t('setup.passwordMismatch')))
  } else {
    callback()
  }
}

// 校验规则与后端 validateInitializeRequest 对齐（用户名≥3 / 密码≥6 / 邮箱含@）
const rules: FormRules = {
  adminUsername: [
    { required: true, message: () => t('setup.adminUsername'), trigger: 'blur' },
    { min: 3, max: 32, message: t('setup.usernameRule'), trigger: 'blur' }
  ],
  adminEmail: [
    { required: true, message: () => t('setup.adminEmail'), trigger: 'blur' },
    { type: 'email', message: t('setup.emailRule'), trigger: 'blur' }
  ],
  adminPassword: [
    { required: true, message: () => t('setup.adminPassword'), trigger: 'blur' },
    { min: 6, max: 64, message: t('setup.passwordRule'), trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: () => t('setup.confirmPassword'), trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

// 已初始化则直接回首页（不做全局守卫强跳，避免路由里发请求）
onMounted(async () => {
  try {
    const res = await publicApi.checkInitialization()
    if (res.initialized) {
      alreadyInitialized.value = true
      router.replace('/')
    }
  } catch {
    // 检查失败不阻断页面（后端不可达时用户可看到表单）
  }
})

const handleSetup = async () => {
  if (!setupFormRef.value || alreadyInitialized.value) return

  try {
    await setupFormRef.value.validate()
    loading.value = true

    // 成功：HTTP 200 + {message, username}；失败：拦截器抛错（HTTP 400/403/500）
    const res = await publicApi.initializeSystem({
      admin_username: setupForm.adminUsername,
      admin_password: setupForm.adminPassword,
      admin_email: setupForm.adminEmail,
      // 站点预配置：站点名非空才携带 base_config；其余两项始终携带
      // thriftgo required 字段需显式存在；port/host 后端以现网配置覆盖
      ...(setupForm.siteName.trim()
        ? { base_config: { name: setupForm.siteName.trim(), description: '', port: 0, host: '' } }
        : {}),
      site_config: {
        upload_size_mb: setupForm.uploadSizeMb,
        open_upload: setupForm.openUpload
      }
    })
    ElMessage.success(res.message || t('setup.success'))
    router.push('/user/login')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : ''
    ElMessage.error(msg || t('setup.failed'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.setup-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--color-bg);
  padding: var(--spacing-xl);
}

.setup-card {
  width: 100%;
  max-width: 460px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-2xl);
}

.setup-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.logo-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.logo-img {
  width: 100%;
  height: 100%;
  display: block;
}

.setup-header h1 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.setup-desc {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.setup-alert {
  margin-bottom: var(--spacing-lg);
}

.submit-btn {
  width: 100%;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.switch-hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.setup-footer {
  text-align: center;
  margin-top: var(--spacing-sm);
}
</style>
