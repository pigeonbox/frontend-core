<template>
  <div class="security-page">
    <div class="page-head">
      <h2>{{ t('security.title') }}</h2>
      <p class="page-desc">{{ t('security.subtitle') }}</p>
    </div>

    <!-- ============ 二次验证（TOTP）============ -->
    <el-card class="sec-card" shadow="never">
      <template #header>
        <div class="card-head">
          <span class="card-title">{{ t('security.twoFactor.title') }}</span>
          <el-tag :type="totpEnabled ? 'success' : 'info'" size="small" effect="plain">
            {{ totpEnabled ? t('security.twoFactor.on') : t('security.twoFactor.off') }}
          </el-tag>
        </div>
      </template>

      <p class="card-desc">{{ t('security.twoFactor.desc') }}</p>

      <!-- 未开启：显示「开始绑定」 -->
      <div v-if="!totpEnabled && !setupData">
        <el-button type="primary" :loading="busy" @click="startSetup">
          {{ t('security.twoFactor.enable') }}
        </el-button>
      </div>

      <!-- 绑定中：二维码 + 密钥 + 验证码输入 -->
      <div v-if="setupData" class="setup-block">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          :title="t('security.twoFactor.scanHint')"
          class="setup-alert"
        />
        <div class="qr-row">
          <img v-if="qrUrl" :src="qrUrl" :alt="t('security.twoFactor.title')" class="qr-img" />
          <div class="secret-col">
            <div class="field-label">{{ t('security.twoFactor.manualHint') }}</div>
            <code class="secret-text">{{ setupData.secret }}</code>
            <el-button link type="primary" size="small" @click="copySecret">
              {{ t('security.twoFactor.copy') }}
            </el-button>
          </div>
        </div>
        <el-form label-position="top" hide-required-asterisk @submit.prevent="confirmEnable">
          <el-form-item :label="t('security.twoFactor.codeLabel')">
            <el-input
              v-model="enableCode"
              :placeholder="t('security.twoFactor.codePlaceholder')"
              maxlength="9"
              size="large"
              class="code-input"
              @keyup.enter="confirmEnable"
            />
          </el-form-item>
          <el-button type="primary" :loading="busy" @click="confirmEnable">
            {{ t('security.twoFactor.confirm') }}
          </el-button>
          <el-button :disabled="busy" @click="cancelSetup">{{ t('security.cancel') }}</el-button>
        </el-form>
      </div>

      <!-- 已开启：关闭入口 -->
      <div v-if="totpEnabled">
        <el-button type="danger" plain @click="disableVisible = true">
          {{ t('security.twoFactor.disable') }}
        </el-button>
      </div>
    </el-card>

    <!-- ============ 登录设备 ============ -->
    <el-card class="sec-card" shadow="never">
      <template #header>
        <div class="card-head">
          <span class="card-title">{{ t('security.sessions.title') }}</span>
          <el-button
            v-if="sessions.length > 1"
            type="danger"
            link
            size="small"
            @click="confirmRevokeAll"
          >
            {{ t('security.sessions.revokeAll') }}
          </el-button>
        </div>
      </template>

      <p class="card-desc">{{ t('security.sessions.desc') }}</p>

      <el-table v-loading="sessionsLoading" :data="sessions" size="small" class="sess-table">
        <el-table-column prop="ip" :label="t('security.sessions.ip')" min-width="130" />
        <el-table-column :label="t('security.sessions.agent')" min-width="220">
          <template #default="{ row }">
            <span class="ua-text" :title="row.user_agent">{{ shortAgent(row.user_agent) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="last_seen_at" :label="t('security.sessions.lastSeen')" min-width="160" />
        <el-table-column prop="created_at" :label="t('security.sessions.createdAt')" min-width="160" />
        <el-table-column :label="t('security.sessions.actions')" width="110" align="right">
          <template #default="{ row }">
            <!-- 当前会话不给踢：踢自己 = 立刻退出登录，用户以为「点了就坏」 -->
            <el-tag v-if="row.current" type="success" size="small" effect="plain">
              {{ t('security.sessions.current') }}
            </el-tag>
            <el-button v-else type="danger" link size="small" @click="revokeOne((row as SessionRow))">
              {{ t('security.sessions.revoke') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <span class="empty-text">{{ t('security.sessions.empty') }}</span>
        </template>
      </el-table>

      <!-- 窄屏（≤1024px）卡片形态：本表 5 列在手机/折叠屏内屏/平板竖屏放不下，
           只留表格会被右侧裁掉（与 Shares/Tokens 同款处置，守卫是枚举式的）。 -->
      <div class="sess-cards">
        <div v-for="row in sessions" :key="row.id" class="sess-card">
          <div class="sess-card-head">
            <span class="sess-card-ip">{{ row.ip }}</span>
            <el-tag v-if="row.current" type="success" size="small" effect="plain">
              {{ t('security.sessions.current') }}
            </el-tag>
            <el-button v-else type="danger" link size="small" @click="revokeOne(row)">
              {{ t('security.sessions.revoke') }}
            </el-button>
          </div>
          <div class="sess-card-row">
            <span class="sess-card-label">{{ t('security.sessions.agent') }}</span>
            <span>{{ shortAgent(row.user_agent) }}</span>
          </div>
          <div class="sess-card-row">
            <span class="sess-card-label">{{ t('security.sessions.lastSeen') }}</span>
            <span>{{ row.last_seen_at }}</span>
          </div>
          <div class="sess-card-row">
            <span class="sess-card-label">{{ t('security.sessions.createdAt') }}</span>
            <span>{{ row.created_at }}</span>
          </div>
        </div>
        <div v-if="!sessions.length" class="empty-text">
          {{ t('security.sessions.empty') }}
        </div>
      </div>
    </el-card>

    <!-- 关闭二验：双因子（口令 + 当前码） -->
    <el-dialog
      v-model="disableVisible"
      :title="t('security.twoFactor.disableTitle')"
      width="420px"
      align-center
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="t('security.twoFactor.disableHint')"
        class="dialog-alert"
      />
      <el-form label-position="top" hide-required-asterisk>
        <el-form-item :label="t('security.twoFactor.passwordLabel')">
          <el-input v-model="disablePassword" type="password" show-password size="large" />
        </el-form-item>
        <el-form-item :label="t('security.twoFactor.codeLabel')">
          <el-input v-model="disableCode" maxlength="9" size="large" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="disableVisible = false">{{ t('security.cancel') }}</el-button>
        <el-button type="danger" :loading="busy" @click="confirmDisable">
          {{ t('security.twoFactor.disable') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 恢复码：**只显示这一次**（库内只存哈希，关掉即永久不可再取） -->
    <el-dialog
      v-model="recoveryVisible"
      :title="t('security.twoFactor.recoveryTitle')"
      width="460px"
      :close-on-click-modal="false"
      align-center
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="t('security.twoFactor.recoveryHint')"
        class="dialog-alert"
      />
      <div class="recovery-grid">
        <code v-for="c in recoveryCodes" :key="c">{{ c }}</code>
      </div>
      <div class="recovery-actions">
        <el-button link type="primary" @click="copyRecovery">
          {{ t('security.twoFactor.copyAll') }}
        </el-button>
      </div>
      <template #footer>
        <el-button type="primary" @click="recoveryVisible = false">
          {{ t('security.twoFactor.recoverySaved') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { userApi } from '@/api/user'
import { useUserStore } from '@/stores/user'
import { translateError } from '@/utils/api-interceptor'

const { t, te } = useI18n()
const userStore = useUserStore()

const busy = ref(false)

// ---------- 二次验证 ----------
const totpEnabled = computed(() => userStore.userInfo?.totp_enabled === true)
const setupData = ref<{ secret: string; otpauth_url: string } | null>(null)
const qrUrl = ref('')
const enableCode = ref('')

const disableVisible = ref(false)
const disablePassword = ref('')
const disableCode = ref('')

const recoveryVisible = ref(false)
const recoveryCodes = ref<string[]>([])

// ---------- 登录设备 ----------
interface SessionRow {
  id: number
  ip: string
  user_agent: string
  created_at: string
  last_seen_at: string
  current: boolean
}
const sessions = ref<SessionRow[]>([])
const sessionsLoading = ref(false)

/** 统一错误提示（走 errcode→i18n 映射，英文界面不显示后端中文原文）。 */
const showError = (error: unknown) => {
  const translated = translateError(error as never)
  ElMessage.error(
    translated.i18nKey
      ? te(translated.i18nKey)
        ? t(translated.i18nKey)
        : translated.fallback
      : translated.fallback || t('security.actionFailed')
  )
}

/** UA 压缩成一眼能认的形态（完整串放 title，鼠标悬停可看）。 */
const shortAgent = (ua: string) => {
  if (!ua) return '—'
  // 顺序有讲究：Edge/Chrome 串里都含 Safari 与 Chrome，必须先判更具体的
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  if (/curl|Wget|python|Go-http/i.test(ua)) return t('security.sessions.apiClient')
  return ua.slice(0, 40)
}

const startSetup = async () => {
  busy.value = true
  try {
    const res = await userApi.totpSetup()
    setupData.value = res.data
    // 二维码内容就是 otpauth:// URL（认证器 App 的通用格式）
    qrUrl.value = await QRCode.toDataURL(res.data.otpauth_url, { width: 200, margin: 1 })
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}

const cancelSetup = () => {
  // 只是本地收起：服务端此时 totp_enabled 仍为 false，密钥未启用即自然作废
  // （下次 setup 会重新生成并覆盖）
  setupData.value = null
  qrUrl.value = ''
  enableCode.value = ''
}

const copySecret = async () => {
  if (!setupData.value) return
  try {
    await navigator.clipboard.writeText(setupData.value.secret)
    ElMessage.success(t('security.copied'))
  } catch {
    // 非安全上下文（http 内网）下 clipboard 不可用 ⇒ 让用户手动选
    ElMessage.warning(t('security.copyFailed'))
  }
}

const confirmEnable = async () => {
  const code = enableCode.value.trim()
  if (!code) {
    ElMessage.warning(t('security.twoFactor.codePlaceholder'))
    return
  }
  busy.value = true
  try {
    const res = await userApi.totpEnable(code)
    recoveryCodes.value = res.data?.recovery_codes ?? []
    recoveryVisible.value = true
    setupData.value = null
    qrUrl.value = ''
    enableCode.value = ''
    await userStore.fetchUserInfo()
    ElMessage.success(t('security.twoFactor.enabled'))
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}

const confirmDisable = async () => {
  if (!disablePassword.value || !disableCode.value.trim()) {
    ElMessage.warning(t('security.twoFactor.disableIncomplete'))
    return
  }
  busy.value = true
  try {
    await userApi.totpDisable({
      password: disablePassword.value,
      code: disableCode.value.trim(),
    })
    disableVisible.value = false
    disablePassword.value = ''
    disableCode.value = ''
    await userStore.fetchUserInfo()
    ElMessage.success(t('security.twoFactor.disabled'))
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}

const copyRecovery = async () => {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    ElMessage.success(t('security.copied'))
  } catch {
    ElMessage.warning(t('security.copyFailed'))
  }
}

// ---------- 会话 ----------
const loadSessions = async () => {
  sessionsLoading.value = true
  try {
    const res = await userApi.listSessions()
    sessions.value = res.data?.sessions ?? []
  } catch (e) {
    showError(e)
  } finally {
    sessionsLoading.value = false
  }
}

const revokeOne = async (row: SessionRow) => {
  try {
    await ElMessageBox.confirm(
      t('security.sessions.revokeConfirm', { ip: row.ip }),
      t('security.sessions.revoke'),
      { type: 'warning' }
    )
  } catch {
    return // 用户取消
  }
  try {
    await userApi.revokeSession(row.id)
    ElMessage.success(t('security.sessions.revoked'))
    await loadSessions()
  } catch (e) {
    showError(e)
  }
}

const confirmRevokeAll = async () => {
  try {
    await ElMessageBox.confirm(t('security.sessions.revokeAllConfirm'), t('security.sessions.revokeAll'), {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await userApi.revokeAllSessions()
    ElMessage.success(t('security.sessions.revokedAll'))
    // 全撤包含**本会话**（服务端撤全部 + 会话纪元 +1）⇒ 必须回登录页，
    // 否则界面会停在一个已经失效的会话上，下一步任何操作都 401。
    userStore.logout()
    window.location.hash = '#/user/login'
  } catch (e) {
    showError(e)
  }
}

onMounted(() => {
  // 用户信息里带 totp_enabled（首次进入本页也可能还没拉过）
  userStore.fetchUserInfo().catch(() => {})
  loadSessions()
})
</script>

<style scoped>
.security-page {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--spacing-lg);
}

.page-head h2 {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--text-xl);
}

.page-desc {
  margin: 0 0 var(--spacing-lg);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.sec-card {
  margin-bottom: var(--spacing-lg);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.card-title {
  font-weight: 600;
}

.card-desc {
  margin: 0 0 var(--spacing-md);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.setup-block {
  margin-top: var(--spacing-md);
}

.setup-alert,
.dialog-alert {
  margin-bottom: var(--spacing-md);
}

.qr-row {
  display: flex;
  gap: var(--spacing-lg);
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--spacing-md);
}

.qr-img {
  width: 160px;
  height: 160px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: #fff;
}

.secret-col {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-label {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.secret-text {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm);
  letter-spacing: 0.04em;
  word-break: break-all;
  background: var(--color-bg);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
}

.code-input {
  max-width: 240px;
}

.ua-text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-text {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.recovery-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
}

.recovery-grid code {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  text-align: center;
}

.recovery-actions {
  margin-top: var(--spacing-sm);
  text-align: right;
}

/* 卡片形态默认不显示：宽屏只留表格，避免两套形态同时出现 */
.sess-cards {
  display: none;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* ≤1024px：表格隐藏 + 卡片显示（互斥开关；断点与 Shares/Tokens 保持一致） */
@media (max-width: 1024px) {
  .sess-table {
    display: none;
  }

  .sess-cards {
    display: flex;
  }

  .sess-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .sess-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }

  .sess-card-ip {
    font-weight: 600;
  }

  /* 行方向容器 ⇒ flex-basis 是**宽**（label 定宽对齐） */
  .sess-card-row {
    display: flex;
    gap: var(--spacing-sm);
    padding: 2px 0;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .sess-card-label {
    flex: 0 0 76px;
    color: var(--color-text-secondary);
  }
}
</style>
