<template>
  <div class="oidc-callback-container">
    <div class="callback-card">
      <template v-if="error">
        <el-result icon="error" :title="t('login.oidcCallback.failTitle')" :sub-title="error">
          <template #extra>
            <el-button type="primary" @click="$router.push('/user/login')">{{ t('login.oidcCallback.backLogin') }}</el-button>
          </template>
        </el-result>
      </template>
      <!-- 管理员 OIDC 二验（core#180 / frontend-core#108）：后端只签发了半会话，
           此刻任何业务接口都 401（半会话被中间件一律拒绝），必须先换发正式会话。 -->
      <template v-else-if="mfaPending">
        <div class="mfa-form">
          <el-icon class="mfa-icon" :size="40"><Key /></el-icon>
          <h2 class="mfa-title">{{ t('login.oidcCallback.mfaTitle') }}</h2>
          <p class="mfa-desc">{{ t('login.oidcCallback.mfaDesc') }}</p>
          <el-input
            ref="mfaInputRef"
            v-model="mfaCode"
            class="mfa-input"
            size="large"
            maxlength="20"
            :placeholder="t('login.oidcCallback.mfaPlaceholder')"
            :disabled="submitting"
            @keyup.enter="submitMfa"
          />
          <el-alert
            v-if="mfaError"
            class="mfa-error"
            :title="mfaError"
            type="error"
            :closable="false"
          />
          <el-button
            type="primary"
            size="large"
            class="mfa-submit"
            :loading="submitting"
            @click="submitMfa"
          >
            {{ submitting ? t('login.oidcCallback.mfaSubmitting') : t('login.oidcCallback.mfaSubmit') }}
          </el-button>
          <el-button link type="primary" class="mfa-back" @click="$router.push('/user/login')">
            {{ t('login.oidcCallback.backLogin') }}
          </el-button>
        </div>
      </template>
      <template v-else>
        <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
        <p>{{ t('login.oidcCallback.redirecting') }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { userApi } from '@/api/user'
import { useUserStore } from '@/stores/user'
import { isOidcErrorRedirect, oidcErrorI18nKey } from '@/utils/oidcError'
import { isMfaPending, stripQueryParams } from '@/utils/oidcMfa'
import { Key, Loading } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const userStore = useUserStore()
const error = ref('')

// 二验状态（仅 mfa_pending=1 时进入）：半会话换发前不得把用户当已登录
const mfaPending = ref(false)
const mfaCode = ref('')
const mfaError = ref('')
const submitting = ref(false)
const mfaInputRef = ref<{ focus?: () => void }>()

/** 去掉 hash query 里的 OIDC 错误参数（保留路由段本身） */
const stripOidcErrorParams = (hash: string): string =>
  hash
    .replace(/([?&])oidc_error=[^&]*/g, '$1')
    .replace(/([?&])oidc_code=[^&]*/g, '$1')
    .replace(/([?&])msg=[^&]*/g, '$1')
    .replace(/\?&/g, '?')
    .replace(/[?&]+$/, '')

/** 会话已建立：换成正式会话后再清掉地址栏的 mfa_pending（刷新不回二验页） */
const clearMfaFromUrl = () => {
  history.replaceState(
    null,
    '',
    location.pathname + stripQueryParams(location.hash, ['mfa_pending', 'token'])
  )
}

/** 用现有会话进应用（userInfo + userRole + markSessionActive 一体灌入） */
const enterApp = async () => {
  const res = await userApi.getUserInfo()
  if (res.code !== 200) throw new Error('session not established')
  userStore.applyExternalSession(res.data)
  ElMessage.success(t('login.success'))
  router.push('/user/dashboard')
}

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
  // 半会话：**先不要**打 /user/info（必然 401，且会触发刷新/登出分支），
  // 直接进二验。刷新页面时半会话 Cookie 仍在 ⇒ 重新进入这里，输入框可恢复。
  if (isMfaPending(route.query)) {
    mfaPending.value = true
    // 只摘 token=（老版本回跳位），mfa_pending 留着：刷新后仍停在二验页
    history.replaceState(null, '', location.pathname + stripQueryParams(location.hash, ['token']))
    await nextTick()
    mfaInputRef.value?.focus?.()
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
    await enterApp()
  } catch {
    error.value = t('login.oidcCallback.sessionFailed')
  }
})

/**
 * 提交二验并换发正式会话。
 *
 * 分流与服务端同口径：40012 = 缺码（**不是失败**，保留输入框、不清空已填内容）；
 * 40013 = 错码（清空重试）；401 = 半会话失效（回登录起点，不能假装还能验）。
 * 这两个码都在 @/utils/request 的错误归一化里以 `code` 透出；401 已在
 * isAuthEndpointUrl 豁免，不会触发刷新/登出副作用。
 */
const submitMfa = async () => {
  if (submitting.value) return
  const code = mfaCode.value.trim()
  if (!code) {
    mfaError.value = t('login.oidcCallback.mfaRequired')
    return
  }
  submitting.value = true
  mfaError.value = ''
  try {
    await userApi.oidcMfaComplete({ code })
  } catch (e) {
    const code = (e as { code?: number })?.code
    if (code === 40012) {
      mfaError.value = t('login.oidcCallback.mfaRequired')
    } else if (code === 40013) {
      mfaCode.value = ''
      mfaError.value = t('login.oidcCallback.mfaInvalid')
    } else if (code === 401) {
      // 半会话失效（过期/已消费）：清标记回登录起点，别让用户卡在死表单上
      clearMfaFromUrl()
      mfaPending.value = false
      error.value = t('login.oidcCallback.mfaExpired')
    } else {
      mfaError.value = t('login.oidcCallback.sessionFailed')
    }
    submitting.value = false
    return
  }
  clearMfaFromUrl()
  mfaPending.value = false
  submitting.value = false
  try {
    await enterApp()
  } catch {
    error.value = t('login.oidcCallback.sessionFailed')
  }
}
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
.mfa-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(360px, 88vw);
}
.mfa-icon {
  color: var(--primary-color);
}
.mfa-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, var(--color-text));
}
.mfa-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
.mfa-input :deep(.el-input__inner) {
  text-align: center;
  letter-spacing: 2px;
}
.mfa-error,
.mfa-submit {
  width: 100%;
}
.mfa-back {
  margin-top: 4px;
}
@media (prefers-reduced-motion: reduce) {
  .loading-icon {
    animation: none;
  }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
