<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-header">
        <div class="logo-icon">
          <BrandLogo class="logo-img" />
        </div>
        <h1>{{ t('reset.title') }}</h1>
      </div>

      <!-- 缺 token：链接被截断/手输地址。不给表单——填完也必然失败。 -->
      <el-alert
        v-if="!token"
        type="error"
        :closable="false"
        show-icon
        :title="t('reset.missingToken')"
        class="auth-alert"
      />

      <template v-else>
        <p class="auth-desc">{{ t('reset.desc') }}</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          hide-required-asterisk
          @submit.prevent="handleSubmit"
        >
          <el-form-item :label="t('reset.newPassword')" prop="newPassword">
            <el-input
              v-model="form.newPassword"
              type="password"
              :placeholder="t('reset.newPasswordPlaceholder')"
              prefix-icon="Lock"
              size="large"
              show-password
            />
          </el-form-item>

          <el-form-item :label="t('reset.confirmPassword')" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              :placeholder="t('reset.confirmPasswordPlaceholder')"
              prefix-icon="Lock"
              size="large"
              show-password
              @keyup.enter="handleSubmit"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" size="large" :loading="loading" class="submit-btn" @click="handleSubmit">
              {{ t('reset.submit') }}
            </el-button>
          </el-form-item>
        </el-form>
      </template>

      <div class="auth-footer">
        <el-link type="primary" underline="never" @click="$router.push('/user/login')">
          {{ t('reset.backToLogin') }}
        </el-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { userApi } from '@/api/user'
import { translateError } from '@/utils/api-interceptor'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()

const formRef = ref<FormInstance>()
const loading = ref(false)

/**
 * 重置 token（由找回邮件里的链接带入）。
 *
 * 链接形态是 /#/reset-password?token=…（**hash 路由**）：token 落在 fragment 里，
 * 不会进服务端访问日志、也不会随 Referer 外发。
 * ⚠️ 应用是 hash 路由 ⇒ 必须读 route.query（location.search 恒为空）。
 */
const token = computed(() => {
  const v = route.query.token
  return (Array.isArray(v) ? v[0] : v) || ''
})

const form = reactive({ newPassword: '', confirmPassword: '' })

const validateConfirm = (_r: unknown, value: string, cb: (e?: Error) => void) => {
  if (value !== form.newPassword) cb(new Error(t('reset.passwordMismatch')))
  else cb()
}

const rules: FormRules = {
  newPassword: [
    { required: true, message: () => t('reset.newPasswordPlaceholder'), trigger: 'blur' },
    // 与服务端 resetPasswordMinLen=6 对齐：前端先拦，省一次往返
    { min: 6, max: 64, message: () => t('reset.passwordRule'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: () => t('reset.confirmPasswordPlaceholder'), trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
}

const handleSubmit = async () => {
  if (!formRef.value || !token.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  loading.value = true
  try {
    await userApi.resetPassword({ token: token.value, new_password: form.newPassword })
    ElMessage.success(t('reset.success'))
    // 重置成功不等同于登录：token 已被 MarkUsed 抢占，直接回登录页走一次正常登录
    router.replace('/user/login')
  } catch (error) {
    const translated = translateError(error as never)
    ElMessage.error(
      translated.i18nKey
        ? te(translated.i18nKey)
          ? t(translated.i18nKey)
          : translated.fallback
        : translated.fallback || t('reset.failed')
    )
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-bg);
  padding: var(--spacing-2xl) var(--spacing-xl);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-2xl);
}

.auth-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
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

.auth-header h1 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.auth-desc {
  margin: 0 0 var(--spacing-lg);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.auth-alert {
  margin-bottom: var(--spacing-lg);
}

.submit-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 999px;
}

.auth-footer {
  text-align: center;
  margin-top: var(--spacing-sm);
}
</style>
