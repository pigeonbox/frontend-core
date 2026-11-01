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
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { userApi } from '@/api/user'
import { isOidcErrorRedirect, oidcErrorI18nKey } from '@/utils/oidcError'
import { Loading } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const error = ref('')

/** 去掉 hash query 里的 OIDC 错误参数（保留路由段本身） */
const stripOidcErrorParams = (hash: string): string =>
  hash
    .replace(/([?&])oidc_error=[^&]*/g, '$1')
    .replace(/([?&])oidc_code=[^&]*/g, '$1')
    .replace(/([?&])msg=[^&]*/g, '$1')
    .replace(/\?&/g, '?')
    .replace(/[?&]+$/, '')

// 会话已由后端回调以 HttpOnly Cookie 下发（2026-10-05 遗留修复：回跳不再
// 携带 token）。本页只负责确认登录态后进入应用。
onMounted(async () => {
  // ⚠️ OIDC 失败回跳：core 带 oidc_error/oidc_code ⇒ 按码显示**可区分**的提示
  // （账号被禁用 / state 过期 / 授权码缺失 / 登录失败）。
  // ⚠️ 应用是 hash 路由 ⇒ query 都在 '#' 之后 ⇒ 必须读 route.query
  // （location.search 恒为空）。
  if (isOidcErrorRedirect(route.query)) {
    error.value = t(oidcErrorI18nKey(route.query.oidc_code))
    history.replaceState(null, '', location.pathname + stripOidcErrorParams(location.hash))
    return
  }
  // 清理遗留的历史 URL（老版本回跳带 ?token=）
  // ⚠️ hash 路由下 query 在 '#' 之后 ⇒ `location.pathname + location.search`
  // 会把**整段 hash 路由**抹掉（search 恒空）⇒ 必须保留 hash 段。
  history.replaceState(
    null,
    '',
    location.pathname + location.hash.replace(/([?&])token=[^&]*/, '$1')
  )
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
