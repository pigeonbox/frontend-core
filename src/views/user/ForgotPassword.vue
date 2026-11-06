<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-header">
        <div class="logo-icon">
          <BrandLogo class="logo-img" />
        </div>
        <h1>{{ t('forgot.title') }}</h1>
      </div>

      <p class="auth-desc">{{ t('forgot.desc') }}</p>

      <!-- 提交后一律显示这一句（不区分邮箱是否存在）：服务端 forgot 恒成功，
           任何「该邮箱未登记」的差异提示都等于把注册用户表交出去。 -->
      <el-alert
        v-if="submitted"
        type="success"
        :closable="false"
        show-icon
        :title="t('forgot.sent')"
        class="auth-alert"
      />

      <el-form
        v-else
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        hide-required-asterisk
        @submit.prevent="handleSubmit"
      >
        <el-form-item :label="t('forgot.email')" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            :placeholder="t('forgot.emailPlaceholder')"
            prefix-icon="Message"
            size="large"
            clearable
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" class="submit-btn" @click="handleSubmit">
            {{ t('forgot.submit') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="auth-footer">
        <el-link type="primary" underline="never" @click="$router.push('/user/login')">
          {{ t('forgot.backToLogin') }}
        </el-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { userApi } from '@/api/user'
import { translateError } from '@/utils/api-interceptor'

const { t, te } = useI18n()

const formRef = ref<FormInstance>()
const loading = ref(false)
const submitted = ref(false)

const form = reactive({ email: '' })

const rules: FormRules = {
  email: [
    { required: true, message: () => t('forgot.emailPlaceholder'), trigger: 'blur' },
    { type: 'email', message: () => t('forgot.emailRule'), trigger: 'blur' },
  ],
}

const handleSubmit = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  loading.value = true
  try {
    await userApi.forgotPassword(form.email.trim())
    // 恒成功 —— 无论邮箱是否存在，界面走同一分支
    submitted.value = true
  } catch (error) {
    const translated = translateError(error as never)
    ElMessage.error(
      translated.i18nKey
        ? te(translated.i18nKey)
          ? t(translated.i18nKey)
          : translated.fallback
        : translated.fallback || t('forgot.failed')
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
