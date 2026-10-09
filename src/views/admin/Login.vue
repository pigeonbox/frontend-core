<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-icon">
          <img src="/favicon.svg" alt="PigeonBox" class="logo-img" />
        </div>
        <h1>PigeonBox</h1>
        <p>管理后台登录</p>
      </div>

      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        class="login-form"
        label-position="top"
        hide-required-asterisk
      >
        <el-form-item prop="username" label="用户名">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名"
            size="large"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password" label="密码">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            {{ loading ? '登录中...' : '立即登录' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <el-button link type="primary" underline="never" @click="$router.push('/')">
          <el-icon><Back /></el-icon>
          返回首页
        </el-button>
      </div>

      <!-- 演示账号提示只在开发构建展示：生产环境展示默认凭证属信息泄露 -->
      <div v-if="isDev" class="demo-account">
        <el-alert title="演示账号" type="info" :closable="false">
          <p>用户名：admin &nbsp;&nbsp; 密码：admin123</p>
        </el-alert>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, Back } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'

const isDev = import.meta.env.DEV
import { useUserStore } from '@/stores/user'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { handleError } = useErrorHandler()

const router = useRouter()
const userStore = useUserStore()
const loginFormRef = ref()
const loading = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  await loginFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
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
          ElMessage.error('非管理员账号')
          userStore.logout()
          return
        }
        localStorage.setItem('userRole', 'admin')

        ElMessage.success('登录成功')
        router.push('/admin')
      } else {
        handleError(new Error(res.message || '登录失败'))
      }
    } catch (error: any) {
      handleError(error)
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
  background: var(--color-bg);
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
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
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

.login-button {
  width: 100%;
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
