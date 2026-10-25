<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-icon">
          <BrandLogo class="logo-img" />
        </div>
        <h1>PigeonBox</h1>
        <p>{{ t('admin.adminLogin.title') }}</p>
      </div>

      <!-- 一键提权（2026-10-16 双登录拍板）：user login 给 admin 账号签发的会话
           本就携带 role=admin（服务端 AdminMiddleware 只认 token 角色），双登录
           摩擦纯属客户端 userRole 标记缺失。已登录用户经服务端确认角色后免密放行，
           会话模型/时效/审计零改动 -->
      <div v-if="elevateAvailable" class="elevate-card">
        <p class="elevate-text">{{ t('admin.adminLogin.elevateHint', { name: elevateUsername }) }}</p>
        <el-button
          type="primary"
          size="large"
          class="login-button"
          :loading="elevating"
          @click="handleElevate"
        >
          {{ t('admin.adminLogin.elevateGo', { name: elevateUsername }) }}
        </el-button>
        <el-divider class="elevate-divider">{{ t('admin.adminLogin.elevateOr') }}</el-divider>
      </div>

      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        class="login-form"
        label-position="top"
        hide-required-asterisk
      >
        <el-form-item prop="username" :label="t('admin.adminLogin.username')">
          <el-input
            v-model="loginForm.username"
            :placeholder="t('admin.adminLogin.usernamePlaceholder')"
            size="large"
            :prefix-icon="User"
            autofocus
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="password" :label="t('admin.adminLogin.password')">
          <el-input
            v-model="loginForm.password"
            type="password"
            :placeholder="t('admin.adminLogin.passwordPlaceholder')"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <!-- 认证失败就地提示（登录表单的标准形态），不再弹带追踪 ID 的全局大 toast -->
        <el-alert
          v-if="loginError"
          class="login-error"
          :title="loginError"
          type="error"
          :closable="false"
        />

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            {{ loading ? t('admin.adminLogin.submitting') : t('admin.adminLogin.submit') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <el-button link type="primary" underline="never" @click="$router.push('/')">
          <el-icon><Back /></el-icon>
          {{ t('admin.adminLogin.backHome') }}
        </el-button>
      </div>

      <!-- 演示账号提示只在开发构建展示：生产环境展示默认凭证属信息泄露。
           文案必须诚实：启动门禁允许 PB_ADMIN_PASSWORD 覆盖默认口令（今天就有
           照着 admin123 填被拒的实例），提示里写明以 env 为准避免再带偏 -->
      <div v-if="isDev" class="demo-account">
        <el-alert :title="t('admin.adminLogin.demoTitle')" type="info" :closable="false">
          <p>{{ t('admin.adminLogin.demoBody') }}</p>
        </el-alert>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getAdminBase } from '@/router'
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, Back } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '@/api/admin'

const isDev = import.meta.env.DEV
import { useUserStore } from '@/stores/user'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()

const router = useRouter()
const userStore = useUserStore()
const loginFormRef = ref()
const loading = ref(false)
// 认证失败就地展示（401/业务失败）；非认证类异常仍走全局 handleError
const loginError = ref('')

const loginForm = reactive({
  username: '',
  password: ''
})

// 一键提权：已登录会话经 /user/info 服务端确认 admin 角色后，补写客户端
// userRole 标记即入台（服务端每请求仍按 token 角色强制鉴权，此处纯 UX 放行）
const elevateAvailable = ref(false)
const elevating = ref(false)
const elevateUsername = ref('')

onMounted(async () => {
  if (!userStore.isLoggedIn) return
  try {
    await userStore.fetchUserInfo()
    if (userStore.userInfo?.role === 'admin') {
      elevateUsername.value = userStore.userInfo.username || ''
      elevateAvailable.value = true
    }
  } catch {
    /* 会话失效/网络失败：静默回落常规登录表单 */
  }
})

const handleElevate = () => {
  elevating.value = true
  try {
    userStore.markSessionActive()
    localStorage.setItem('userRole', 'admin')
    ElMessage.success(t('admin.adminLogin.success'))
    router.push(getAdminBase())
  } finally {
    elevating.value = false
  }
}

// 登录表单不做密码长度校验：口令由运维设定（PB_ADMIN_PASSWORD 可短于 6 位），
// 客户端长度门禁只会拦下合法口令（长度约束属注册场景）
const loginRules = computed(() => ({
  username: [
    { required: true, message: t('admin.adminLogin.usernameRule'), trigger: 'blur' }
  ],
  password: [
    { required: true, message: t('admin.adminLogin.passwordRule'), trigger: 'blur' }
  ]
}))

const handleLogin = async () => {
  if (!loginFormRef.value) return

  await loginFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    loginError.value = ''
    try {
      const res = await adminApi.login(loginForm)
      if (res.code === 200) {
        // 会话 Cookie 由服务端下发（HttpOnly），前端不再持久化令牌。
        // 会话标记统一入口（ref 响应式 + localStorage 双写）：admin 登录不走
        // userStore.login，直接写 localStorage 会被 isLoggedIn computed 的缓存
        // 击穿（首帧求值 false 后无响应式依赖变更不重算）→ fetchUserInfo 早退
        // → 角色判断恒败 → 管理后台无法登录（v0.13.3 修复）。
        userStore.markSessionActive()

        // 登录后拉取用户信息获取 role（不再浏览器 atob 解析 JWT）
        await userStore.fetchUserInfo()
        if (userStore.userInfo?.role !== 'admin') {
          loginError.value = t('admin.adminLogin.notAdmin')
          userStore.logout()
          return
        }
        localStorage.setItem('userRole', 'admin')

        ElMessage.success(t('admin.adminLogin.success'))
        router.push(getAdminBase())
      } else {
        loginError.value = res.message || t('login.failed')
      }
    } catch (error: any) {
      // 请求层把 HTTP 错误包装成 {code, message, response}；401 = 凭证错误
      const status = error?.response?.status ?? error?.code
      if (status === 401 || status === 400) {
        loginError.value = error?.message || t('login.failed')
      } else {
        handleError(error)
      }
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  /* 品牌色微光晕：primary-bg 随主题变量走，明暗两态都协调 */
  background:
    radial-gradient(1100px 520px at 50% -12%, var(--primary-bg), transparent 62%),
    var(--color-bg);
  padding: var(--spacing-xl);
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
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xl);
}

.logo-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg, 14px);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
  box-shadow: 0 0 0 6px var(--primary-bg);
}

.logo-img {
  width: 100%;
  height: 100%;
  display: block;
}

.login-header h1 {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.login-header p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.login-error {
  margin: 0 0 var(--spacing-md);
  border-radius: var(--radius-md);
}

.login-button {
  width: 100%;
}

.elevate-card {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-md);
  background: var(--primary-bg);
}

.elevate-text {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--text-sm);
  color: var(--color-text-regular);
}

.elevate-divider {
  margin: var(--spacing-md) 0 var(--spacing-xs);
}

.login-footer {
  text-align: center;
  margin-top: var(--spacing-sm);
}

.demo-account {
  margin-top: var(--spacing-xl);
}

.demo-account :deep(.el-alert) {
  border-radius: var(--radius-md);
}

.demo-account p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-regular);
}

@media (max-width: 480px) {
  .login-card {
    padding: var(--spacing-xl);
  }
}
</style>
