<template>
  <div class="login-container">
    <div class="login-card">
      <!-- Logo 区 -->
      <div class="login-header">
        <div class="logo-icon">
          <BrandLogo class="logo-img" />
        </div>
        <h1>{{ t('login.title') }}</h1>
      </div>

      <!-- OIDC 失败回跳（core 302 到 /#/user/login?oidc_error=1&oidc_code=…）：
           按 oidc_code 显示**可区分**的提示，不再笼统弹「登录失败」。 -->
      <el-alert
        v-if="oidcErrorKey"
        :title="t(oidcErrorKey)"
        type="error"
        show-icon
        :closable="false"
        class="oidc-error"
      />

      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="rules"
        label-position="top"
        hide-required-asterisk
        @submit.prevent="handleLogin"
      >
        <el-form-item :label="t('login.username')" prop="username">
          <el-input
            v-model="loginForm.username"
            :placeholder="t('login.usernamePlaceholder')"
            prefix-icon="User"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item :label="t('login.password')" prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            :placeholder="t('login.passwordPlaceholder')"
            prefix-icon="Lock"
            size="large"
            show-password
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="submit-btn"
            @click="handleLogin"
          >
            {{ t('login.submit') }}
          </el-button>
        </el-form-item>

        <!-- OIDC 单点登录（P2；security.oidc.enabled 时后端下发 oidcEnabled） -->
        <el-form-item v-if="configStore.config?.oidcEnabled">
          <el-button size="large" class="oidc-btn" @click="startOidcLogin">
            {{ t('login.oidc') }}
          </el-button>
        </el-form-item>

        <div v-if="registerVisible" class="login-footer">
          <el-link type="primary" underline="never" @click="$router.push('/user/register')">
            {{ t('login.noAccount') }}
          </el-link>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { translateError } from '@/utils/api-interceptor'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'
import { withBase } from '@/utils/base'
import { isOidcErrorRedirect, oidcErrorI18nKey } from '@/utils/oidcError'
import { host } from '@/host'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const configStore = useConfigStore()
const { t, te } = useI18n()

/**
 * OIDC 失败回跳的提示 key（空串 = 不是失败回跳）。
 *
 * core 失败时 302 回 `/#/user/login?oidc_error=1&oidc_code=<短码>&msg=<…>`。
 * ⚠️ 应用是 **hash 路由** ⇒ query 都在 `#` 之后 ⇒ 必须读 `route.query`
 * （`location.search` 恒为空）。
 * ⚠️ 只按 `oidc_code` 映射自己的文案——**不展示 core 的 msg**（那是 core 的
 * 措辞、只有中文，且可能变更）。
 */
const oidcErrorKey = ref('')

// 站点关闭注册时隐藏入口（后端 /user/register 也会 403，双保险）
const registerVisible = computed(() => configStore.config?.registerEnabled !== false)

// OIDC：跳转后端授权入口（302 到 IdP；登录回调写 token 后进仪表盘）
const startOidcLogin = () => {
  window.location.href = withBase('/api/v1/user/oidc/login')
}

// 宿主 SSO 静默登录:经统一网关内嵌宿主时,适配器完成免密登录——成功直接
// 进站,失败(无宿主/未启用/网关未注入身份)静默留在账号密码表单
const attemptHostSso = async () => {
  if (userStore.isLoggedIn) return
  const sso = await host.ssoLogin()
  if (!sso) return
  userStore.applyExternalSession(sso)
  ElMessage.success(t('login.success'))
  const redirect = router.currentRoute.value.query.redirect as string
  router.push(redirect || '/')
}

onMounted(() => {
  configStore.fetchConfig().catch(() => {})
  attemptHostSso()
  // OIDC 失败回跳：core 带 oidc_error/oidc_code 302 回到本页 ⇒ 按码选
  // **可区分**的提示（账号被禁用 / state 过期 / 登录失败），不再笼统「登录失败」。
  if (isOidcErrorRedirect(route.query)) {
    oidcErrorKey.value = oidcErrorI18nKey(route.query.oidc_code)
  }
})

const loginFormRef = ref<FormInstance>()
const loading = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const rules: FormRules = {
  username: [
    { required: true, message: () => t('login.usernamePlaceholder'), trigger: 'blur' },
    { min: 3, max: 20, message: t('login.usernameRule'), trigger: 'blur' }
  ],
  password: [
    { required: true, message: () => t('login.passwordPlaceholder'), trigger: 'blur' },
    { min: 6, max: 20, message: t('login.passwordRule'), trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  try {
    await loginFormRef.value.validate()
    loading.value = true

    await userStore.login(loginForm.username, loginForm.password)

    ElMessage.success(t('login.success'))

    // 重定向到目标页面或首页
    const redirect = router.currentRoute.value.query.redirect as string
    router.push(redirect || '/')
  } catch (error: any) {
    // 走统一错误映射（英文界面否则直接显示后端中文原文，2026-10-22 审计）
    // ⚠️ `t(k) || fallback` 是死代码（vue-i18n 缺键返回键名本身，非空串）⇒
    // 用 te() 判存在性（2026-10-26 审计）
    const translated = translateError(error)
    ElMessage.error(
      translated.i18nKey
        ? (te(translated.i18nKey) ? t(translated.i18nKey) : translated.fallback)
        : translated.fallback || t('login.failed')
    )
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-bg);
  padding: var(--spacing-2xl) var(--spacing-xl);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-2xl);
}

/* 头部纵向 flex 居中:logo 是块级元素,text-align 管不到它(错位根因) */
.login-header {
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

.login-header h1 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.submit-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 999px;
}

/* OIDC 失败回跳提示（与表单之间留白） */
.oidc-error {
  margin-bottom: var(--spacing-lg);
}

.login-footer {
  text-align: center;
  margin-top: var(--spacing-sm);
}
</style>
