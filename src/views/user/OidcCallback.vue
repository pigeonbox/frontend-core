<template>
  <div class="oidc-callback-container">
    <div class="callback-card">
      <template v-if="error">
        <el-result icon="error" title="OIDC 登录失败" :sub-title="error">
          <template #extra>
            <el-button type="primary" @click="$router.push('/user/login')">返回登录</el-button>
          </template>
        </el-result>
      </template>
      <template v-else>
        <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
        <p>登录成功，正在跳转...</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { userApi } from '@/api/user'
import { Loading } from '@element-plus/icons-vue'

const router = useRouter()
const error = ref('')

// 会话已由后端回调以 HttpOnly Cookie 下发（2026-10-05 遗留修复：回跳不再
// 携带 token）。本页只负责确认登录态后进入应用。
onMounted(async () => {
  // 清理遗留的历史 URL（老版本回跳带 ?token=）
  history.replaceState(null, '', location.pathname + location.search)
  try {
    const res = await userApi.getUserInfo()
    if (res.code === 200) {
      localStorage.setItem('fcb_session', '1')
      ElMessage.success('登录成功')
      router.push('/user/dashboard')
      return
    }
    error.value = '登录态获取失败，请重新登录'
  } catch {
    error.value = '登录态获取失败，请重新登录'
  }
})
</script>

<style scoped>
.oidc-callback-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
}
.callback-card {
  text-align: center;
  color: var(--color-text-secondary);
}
.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--primary-color);
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
