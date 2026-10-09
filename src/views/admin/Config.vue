<template>
  <div class="system-config">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <h3>{{ t('admin.configPage.title') }}</h3>
          <el-button type="primary" @click="saveConfig" :loading="saving">
            {{ t('admin.configPage.save') }}
          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <!-- 基础配置 -->
        <el-tab-pane :label="t('admin.configPage.tabs.basic')" name="basic">
          <el-form :model="configForm.base" label-width="140px" style="max-width: 600px">
            <el-form-item :label="t('admin.configPage.basic.siteName')">
              <el-input v-model="configForm.base.name" />
            </el-form-item>

            <el-form-item :label="t('admin.configPage.basic.siteDescription')">
              <el-input v-model="configForm.base.description" type="textarea" :rows="3" />
            </el-form-item>

            <el-form-item :label="t('admin.configPage.basic.port')">
              <el-input-number v-model="configForm.base.port" :min="1" :max="65535" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 传输配置（SystemConfig.Transfer 段；旧上传门禁字段属部署配置，不在线编辑） -->
        <el-tab-pane :label="t('admin.configPage.tabs.upload')" name="upload">
          <el-form label-width="150px">
            <el-form-item :label="t('admin.configPage.upload.openUpload')">
              <el-switch v-model="exForm.upload_ex.open_upload" />
              <span class="field-hint">{{ t('admin.configPage.upload.openUploadHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.upload.requireLogin')">
              <el-switch v-model="exForm.upload_ex.require_login" />
              <span class="field-hint">{{ t('admin.configPage.upload.requireLoginHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.upload.anonymousDailyCount')">
              <el-input-number v-model="exForm.upload_ex.anonymous_daily_count" :min="0" :max="100000" />
              <span class="field-hint">{{ t('admin.configPage.upload.anonymousDailyCountHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.upload.anonymousDailyBytes')">
              <el-input-number v-model="exForm.upload_ex.anonymous_daily_bytes" :min="0" :max="107374182400" />
              <span class="field-hint">{{ t('admin.configPage.upload.anonymousDailyBytesHint') }}</span>
            </el-form-item>
            <el-divider content-position="left">{{ t('admin.configPage.upload.directSection') }}</el-divider>
          </el-form>
          <el-button
            type="primary"
            :loading="exSaving.upload || exSaving.download"
            @click="saveUploadSettings"
          >{{ t('admin.configPage.upload.save') }}</el-button>
        </el-tab-pane>
        <el-tab-pane :label="t('admin.configPage.tabs.transfer')" name="transfer">
          <el-form :model="configForm.transfer" label-width="140px" style="max-width: 600px">
            <el-form-item :label="t('admin.configPage.transfer.maxCount')">
              <el-input-number v-model="configForm.transfer.max_count" :min="0" controls-position="right" />
              <span style="margin-left: 10px; color: var(--color-text-secondary)">{{ t('admin.configPage.transfer.maxCountHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.transfer.expireDefault')">
              <el-input-number v-model="configForm.transfer.expire_default" :min="1" controls-position="right" />
              <span style="margin-left: 10px; color: var(--color-text-secondary)">{{ t('admin.configPage.transfer.days') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.transfer.uploadGates')">
              <span class="form-hint" style="color: var(--color-text-secondary)">
                {{ t('admin.configPage.transfer.uploadGatesHint') }}
              </span>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 用户配置 -->
        <el-tab-pane :label="t('admin.configPage.tabs.user')" name="user">
          <div style="margin-bottom: 12px">
            <el-button type="primary" :loading="userSaving" @click="saveUserSettings">{{ t('admin.configPage.user.save') }}</el-button>
            <span style="margin-left: 10px; color: var(--color-text-secondary); font-size: 12px">{{ t('admin.configPage.user.saveHint') }}</span>
          </div>
          <el-form :model="configForm.user" label-width="140px" style="max-width: 600px">
            <el-form-item :label="t('admin.configPage.user.allowRegistration')">
              <el-switch v-model="configForm.user.allowuserregistration" :active-value="1" :inactive-value="0" />
            </el-form-item>

            <el-form-item :label="t('admin.configPage.user.uploadLimit')">
              <el-input-number
                v-model="configForm.user.useruploadsize"
                :min="1048576"
                :step="1048576"
                controls-position="right"
              />
              <span style="margin-left: 10px; color: var(--color-text-secondary)">{{ t('admin.configPage.user.bytesDefault') }}</span>
            </el-form-item>

            <el-form-item :label="t('admin.configPage.user.storageQuota')">
              <el-input-number
                v-model="configForm.user.userstoragequota"
                :min="1048576"
                :step="1048576"
                controls-position="right"
              />
              <span style="margin-left: 10px; color: var(--color-text-secondary)">{{ t('admin.configPage.user.quotaDefault') }}</span>
            </el-form-item>

            <el-form-item :label="t('admin.configPage.user.sessionExpiry')">
              <el-input-number
                v-model="configForm.user.sessionexpiryhours"
                :min="1"
                :max="720"
                controls-position="right"
              />
              <span style="margin-left: 10px; color: var(--color-text-secondary)">{{ t('admin.configPage.user.hours') }}</span>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <!-- 安全与限流（读写 /admin/ratelimit/*，独立保存） -->
        <el-tab-pane :label="t('admin.configPage.tabs.ratelimit')" name="ratelimit">
          <el-form :model="rlForm" label-width="160px" style="max-width: 640px">
            <el-form-item :label="t('admin.configPage.ratelimit.enabled')">
              <el-switch v-model="rlForm.enabled" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.ratelimit.globalQps')">
              <el-input-number v-model="rlForm.global_qps" :min="1" :max="100000" controls-position="right" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.ratelimit.uploadQps')">
              <el-input-number v-model="rlForm.upload_qps" :min="1" :max="100000" controls-position="right" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.ratelimit.downloadQps')">
              <el-input-number v-model="rlForm.download_qps" :min="1" :max="100000" controls-position="right" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.ratelimit.loginQps')">
              <el-input-number v-model="rlForm.login_qps" :min="1" :max="10000" controls-position="right" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.ratelimit.burst')">
              <el-input-number v-model="rlForm.burst" :min="1" :max="100000" controls-position="right" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.ratelimit.blockSeconds')">
              <el-input-number v-model="rlForm.block_seconds" :min="0" :max="86400" controls-position="right" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.ratelimit.redisShared')">
              <!-- 契约无 use_redis 字段（GET 不返回/PUT 不采纳），由部署配置
                   rate_limit.use_redis / FCB_RATE_LIMIT_USE_REDIS 决定 -->
              <span class="form-hint" style="color: var(--color-text-secondary)">
                {{ t('admin.configPage.ratelimit.redisHint') }}
              </span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="rlSaving" @click="saveRateLimit">{{ t('admin.configPage.ratelimit.save') }}</el-button>
              <el-button :loading="rlStatusLoading" @click="fetchRateLimitStatus">{{ t('admin.configPage.ratelimit.viewStatus') }}</el-button>
            </el-form-item>
            <el-form-item v-if="rlStatus" :label="t('admin.configPage.ratelimit.status')">
              <pre class="rl-status">{{ rlStatusText }}</pre>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane :label="t('admin.configPage.tabs.appearance')" name="appearance">
          <el-form label-width="150px">
            <el-form-item :label="t('admin.configPage.appearance.bgUrl')">
              <el-input v-model="exForm.ui.background" :placeholder="t('admin.configPage.appearance.bgUrlPlaceholder')" clearable />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.themes.label')">
              <div class="theme-presets">
                <div
                  v-for="th in THEMES"
                  :key="th.key"
                  class="theme-swatch"
                  :class="{ active: themePresetKey === th.key }"
                  :title="t(th.labelKey)"
                  @click="applyThemePreset(th)"
                >
                  <span class="swatch-dot" :style="{ background: th.swatch }" />
                  <span class="swatch-name">{{ t(th.labelKey) }}</span>
                </div>
              </div>
              <span class="field-hint">{{ t('admin.configPage.themes.hint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.appearance.accentColor')">
              <el-input v-model="exForm.ui.accent_color" placeholder="#409eff" style="width: 220px" />
              <span class="field-hint">{{ t('admin.configPage.appearance.accentHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.appearance.showAdminEntry')">
              <el-switch v-model="exForm.ui.show_admin_addr" />
              <span class="field-hint">{{ t('admin.configPage.appearance.showAdminEntryHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.appearance.robots')">
              <el-input
                v-model="exForm.ui.robots_text"
                type="textarea"
                :rows="3"
                placeholder="User-agent: *&#10;Disallow: /"
                style="max-width: 520px; font-family: 'SF Mono', Menlo, monospace; font-size: 12px"
              />
              <span class="field-hint">{{ t('admin.configPage.appearance.robotsHint') }}</span>
            </el-form-item>
          </el-form>
          <el-button type="primary" :loading="exSaving.ui" @click="saveSection('ui', exForm.ui, t('admin.configPage.appearance.saved'))">{{ t('admin.configPage.appearance.save') }}</el-button>
        </el-tab-pane>

        <el-tab-pane :label="t('admin.configPage.tabs.download')" name="download">
          <el-form label-width="150px">
            <el-form-item :label="t('admin.configPage.download.s3Direct')">
              <el-switch v-model="exForm.download.s3_direct_download" />
              <span class="field-hint">{{ t('admin.configPage.download.s3DirectHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.download.timeout')">
              <el-input-number v-model="exForm.download.download_timeout" :min="30" :max="3600" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.download.requireLogin')">
              <el-switch v-model="exForm.download.require_login" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.download.codeFold')">
              <el-switch v-model="exForm.download.code_case_insensitive" />
              <span class="field-hint">{{ t('admin.configPage.download.codeFoldHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.download.presignPolicy')">
              <el-select v-model="exForm.download.presign_policy" style="width: 280px">
                <el-option label="所有人可直传" value="everyone" />
                <el-option label="仅登录用户可直传" value="authenticated" />
                <el-option label="关闭直传（全部走服务器）" value="disabled" />
              </el-select>
              <span class="field-hint">{{ t('admin.configPage.download.presignPolicyHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.download.presignThreshold')">
              <el-input-number v-model="exForm.download.presign_threshold_mb" :min="1" :max="5120" />
              <span class="field-hint">{{ t('admin.configPage.download.presignThresholdHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.download.presignTTL')">
              <el-input-number v-model="exForm.download.presign_expire_seconds" :min="60" :max="3600" :step="60" />
              <span class="field-hint">{{ t('admin.configPage.download.presignTTLHint') }}</span>
            </el-form-item>
          </el-form>
          <el-button type="primary" :loading="exSaving.download" @click="saveSection('download', exForm.download, t('admin.configPage.download.saved'))">{{ t('admin.configPage.download.save') }}</el-button>
        </el-tab-pane>

        <el-tab-pane :label="t('admin.configPage.tabs.notify')" name="notify">
          <el-form label-width="150px">
            <el-form-item :label="t('admin.configPage.notify.webhook')">
              <el-input v-model="exForm.notify.webhook_url" :placeholder="t('admin.configPage.notify.webhookPlaceholder')" clearable />
            </el-form-item>
            <el-divider content-position="left">{{ t('admin.configPage.notify.smtpSection') }}</el-divider>
            <el-form-item :label="t('admin.configPage.notify.smtpHost')">
              <el-input v-model="exForm.notify.smtp.host" placeholder="smtp.example.com:465" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.notify.username')">
              <el-input v-model="exForm.notify.smtp.username" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.notify.password')">
              <el-input v-model="exForm.notify.smtp.password" type="password" show-password />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.notify.sender')">
              <el-input v-model="exForm.notify.smtp.from" :placeholder="t('admin.configPage.notify.senderPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.notify.testTo')">
              <el-input v-model="smtpTestTo" :placeholder="t('admin.configPage.notify.testToPlaceholder')" style="width: 260px" />
              <el-button class="ml8" :loading="smtpTesting" @click="doSMTPTest">{{ t('admin.configPage.notify.testSend') }}</el-button>
              <span class="field-hint">{{ t('admin.configPage.notify.testHint') }}</span>
            </el-form-item>
          </el-form>
          <el-button type="primary" :loading="exSaving.notify" @click="saveNotify">{{ t('admin.configPage.notify.save') }}</el-button>
        </el-tab-pane>

        <el-tab-pane :label="t('admin.configPage.tabs.oidc')" name="oidc">
          <el-form label-width="150px">
            <el-form-item :label="t('admin.configPage.oidc.enabled')">
              <el-switch v-model="exForm.oidc.enabled" />
            </el-form-item>
            <el-form-item label="Issuer">
              <el-input v-model="exForm.oidc.issuer" placeholder="https://sso.example.com/realms/main" />
            </el-form-item>
            <el-form-item label="Client ID">
              <el-input v-model="exForm.oidc.client_id" />
            </el-form-item>
            <el-form-item label="Client Secret">
              <el-input v-model="exForm.oidc.client_secret" type="password" show-password />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.oidc.callback')">
              <el-input :model-value="`${origin}/#/oidc/callback`" readonly />
              <span class="field-hint">{{ t('admin.configPage.oidc.callbackHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.oidc.test')">
              <el-button :loading="oidcTesting" @click="doOIDCTest">{{ t('admin.configPage.oidc.testButton') }}</el-button>
            </el-form-item>
          </el-form>
          <el-button type="primary" :loading="exSaving.oidc" @click="saveSection('oidc', exForm.oidc, t('admin.configPage.oidc.saved'))">{{ t('admin.configPage.oidc.save') }}</el-button>
        </el-tab-pane>

        <el-tab-pane :label="t('admin.configPage.tabs.localimport')" name="localimport">
          <el-form label-width="150px">
            <el-form-item :label="t('admin.configPage.localimport.enabled')">
              <el-switch v-model="exForm.local_import.enabled" />
              <span class="field-hint">{{ t('admin.configPage.localimport.enabledHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.localimport.roots')">
              <el-input
                v-model="localImportRootsText"
                type="textarea"
                :rows="3"
                :placeholder="t('admin.configPage.localimport.rootsPlaceholder')"
              />
            </el-form-item>
          </el-form>
          <el-button type="primary" :loading="exSaving.local_import" @click="saveLocalImport">{{ t('admin.configPage.localimport.save') }}</el-button>
        </el-tab-pane>

        <el-tab-pane label="API Token" name="apitoken">
          <el-form label-width="150px">
            <el-form-item :label="t('admin.configPage.apitoken.enabled')">
              <el-switch v-model="exForm.api_token.enabled" />
              <span class="field-hint">{{ t('admin.configPage.apitoken.enabledHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.apitoken.perKeyQps')">
              <el-input-number v-model="exForm.api_token.per_key_qps" :min="1" :max="1000" />
            </el-form-item>
            <el-form-item :label="t('admin.configPage.apitoken.perKeyBurst')">
              <el-input-number v-model="exForm.api_token.per_key_burst" :min="1" :max="5000" />
            </el-form-item>
          </el-form>
          <el-button type="primary" :loading="exSaving.api_token" @click="saveSection('api_token', exForm.api_token, t('admin.configPage.apitoken.saved'))">{{ t('admin.configPage.apitoken.save') }}</el-button>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { THEMES, matchThemePreset, type ThemePreset } from '@/config/themes'
import { adminApi } from '@/api/admin'
import { useConfigStore } from '@/stores/config'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()

const loading = ref(false)
const saving = ref(false)
const activeTab = ref('basic')
const configStore = useConfigStore()

const configForm = reactive({
  base: {
    name: '',
    description: '',
    port: 12346
  },
  transfer: {
    max_count: 100,
    expire_default: 7
  },
  user: {
    allowuserregistration: 0,
    useruploadsize: 52428800,
    userstoragequota: 1073741824,
    sessionexpiryhours: 168
  }
})

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await adminApi.getConfig()
    if (res.code === 200 && res.data) {
      // 映射配置数据
      if (res.data.base) {
        Object.assign(configForm.base, res.data.base)
      }
      if (res.data.transfer) {
        Object.assign(configForm.transfer, res.data.transfer)
      }
      // v0.7.3 扩容设置段预填
      fetchExSections(res.data as Record<string, unknown>)
      // 用户配置走独立端点（此前随通用配置保存会被后端丢弃——假开关）
      await fetchUserSettings()
    }
  } catch (error) {
    console.error('fetch config failed:', error)
    ElMessage.error(t('admin.configPage.fetchFailed'))
  } finally {
    loading.value = false
  }
}

// ==================== 用户配置（/admin/config/user，独立保存） ====================
const fetchUserSettings = async () => {
  try {
    const res = await adminApi.getUserSettings()
    if ((res.code === 0 || res.code === 200) && res.data) {
      const d = res.data as Record<string, unknown>
      configForm.user.allowuserregistration = Number(d.allowuserregistration === true || d.allowuserregistration === 1)
      if (typeof d.useruploadsize === 'number' && d.useruploadsize > 0) configForm.user.useruploadsize = d.useruploadsize
      if (typeof d.userstoragequota === 'number' && d.userstoragequota > 0) configForm.user.userstoragequota = d.userstoragequota
      if (typeof d.sessionexpiryhours === 'number' && d.sessionexpiryhours > 0) configForm.user.sessionexpiryhours = d.sessionexpiryhours
    }
  } catch (error) {
    console.error('fetch user settings failed:', error)
  }
}

const userSaving = ref(false)
const saveUserSettings = async () => {
  userSaving.value = true
  try {
    const res = await adminApi.updateUserSettings({
      allowuserregistration: Number(configForm.user.allowuserregistration) === 1,
      useruploadsize: configForm.user.useruploadsize,
      userstoragequota: configForm.user.userstoragequota,
      sessionexpiryhours: configForm.user.sessionexpiryhours
    })
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.configPage.user.saved'))
      await configStore.refreshConfig()
    } else {
      handleError(new Error(res.message || t('admin.configPage.saveFailed')))
    }
  } catch (error) {
    handleError(error)
  } finally {
    userSaving.value = false
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    // 只携带本页管辖的段（user 走 /admin/config/user 专属端点，避免双路径互踩）
    const res = await adminApi.updateConfig({
      base: configForm.base,
      transfer: configForm.transfer
    })
    if (res.code === 200) {
      ElMessage.success(t('admin.configPage.saved'))
      // 刷新全局配置
      await configStore.refreshConfig()
      await fetchConfig()
    } else {
      handleError(new Error(res.message || t('admin.configPage.saveFailed')))
    }
  } catch (error) {
    handleError(error)
  } finally {
    saving.value = false
  }
}

// ==================== v0.7.3 扩容设置段（ui/download/notify/oidc/local_import/api_token）====================
// 扁平契约：每段独立保存（adminApi.updateConfig({ 段名: 值 })），后端 nil-保留未提交段
const exForm = reactive({
  ui: { background: '', accent_color: '', show_admin_addr: true, robots_text: '' },
  upload_ex: {
    open_upload: true,
    require_login: false,
    anonymous_daily_count: 0,
    anonymous_daily_bytes: 0,
  },
  download: {
    s3_direct_download: false,
    download_timeout: 300,
    require_login: false,
    presign_policy: 'everyone',
    presign_threshold_mb: 100,
    presign_expire_seconds: 600,
    code_case_insensitive: true,
  },
  notify: { webhook_url: '', smtp: { host: '', port: 465, username: '', password: '', from: '' } },
  oidc: { enabled: false, issuer: '', client_id: '', client_secret: '', scopes: 'openid profile email', frontend_callback: '' },
  local_import: { enabled: false, roots: [] as string[] },
  api_token: { enabled: true, per_key_qps: 20, per_key_burst: 40 },
})

// 主题预设（2026-10-07 轻量主题包）：选择=写 ui.accent_color 走既有持久化与热应用
const themePresetKey = computed(() => matchThemePreset(exForm.ui.accent_color))
const applyThemePreset = (th: ThemePreset) => {
  exForm.ui.accent_color = th.accent
}

const exSaving = reactive<Record<string, boolean>>({})

const origin = window.location.origin
// 白名单目录 textarea ↔ roots 数组(逗号分隔,自动去空)
const localImportRootsText = computed({
  get: () => exForm.local_import.roots.join(', '),
  set: (v: string) => {
    exForm.local_import.roots = v.split(',').map((x) => x.trim()).filter(Boolean)
  },
})

const fetchExSections = (data: Record<string, unknown>) => {
  const sec = data as Record<string, any>
  if (sec.ui) {
    Object.assign(exForm.ui, sec.ui)
    // 旧库 ui 段无 show_admin_addr 键（后端缺省=展示），归一为开避免开关显示与实际相反
    if (exForm.ui.show_admin_addr == null) exForm.ui.show_admin_addr = true
  }
  if (sec.upload_ex) {
    Object.assign(exForm.upload_ex, sec.upload_ex)
    if (exForm.upload_ex.open_upload == null) exForm.upload_ex.open_upload = true
    if (exForm.upload_ex.require_login == null) exForm.upload_ex.require_login = false
    if (!exForm.upload_ex.anonymous_daily_count) exForm.upload_ex.anonymous_daily_count = 0
    if (!exForm.upload_ex.anonymous_daily_bytes) exForm.upload_ex.anonymous_daily_bytes = 0
  }
  if (sec.download) {
    Object.assign(exForm.download, sec.download)
    // 旧库 download 段无直传新键 → 后端下发 null：归一为默认值（nil 语义=开启/100MB/600s）
    if (!exForm.download.presign_policy) {
      // 旧库无 presign_policy 键：按旧匿名开关推导（false=authenticated，否则 everyone）
      const legacy = (exForm.download as Record<string, unknown>).presign_anonymous_enabled
      exForm.download.presign_policy = legacy === false ? 'authenticated' : 'everyone'
    }
    if (!exForm.download.presign_threshold_mb) exForm.download.presign_threshold_mb = 100
    if (!exForm.download.presign_expire_seconds) exForm.download.presign_expire_seconds = 600
    // 旧库无 code_case_insensitive 键 → 后端下发 null：归一为默认值（nil 语义=开启）
    if (exForm.download.code_case_insensitive == null) exForm.download.code_case_insensitive = true
  }
  if (sec.notify) {
    Object.assign(exForm.notify, sec.notify)
    if (sec.notify.smtp) Object.assign(exForm.notify.smtp, sec.notify.smtp)
  }
  if (sec.oidc) Object.assign(exForm.oidc, sec.oidc)
  if (sec.local_import) Object.assign(exForm.local_import, sec.local_import)
  if (sec.api_token) Object.assign(exForm.api_token, sec.api_token)
}

const saveSection = async (section: string, payload: Record<string, unknown>, msg: string) => {
  exSaving[section] = true
  try {
    const res = await adminApi.updateConfig({ [section]: payload })
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(msg)
      await configStore.refreshConfig()
      const res2 = await adminApi.getConfig()
      if (res2.code === 200 && res2.data) fetchExSections(res2.data as Record<string, unknown>)
    } else {
      handleError(new Error(res.message || t('admin.configPage.saveFailed')))
    }
  } catch (e) {
    handleError(e)
  } finally {
    exSaving[section] = false
  }
}

// 上传设置整段保存（upload_ex 准入 + download 直传策略两段串行提交）
const saveUploadSettings = async () => {
  await saveSection('upload_ex', exForm.upload_ex, t('admin.configPage.upload.saved'))
  await saveSection('download', exForm.download, t('admin.configPage.download.saved'))
}

const saveNotify = async () => {
  const payload: Record<string, unknown> = {
    webhook_url: exForm.notify.webhook_url,
    smtp: { ...exForm.notify.smtp },
  }
  await saveSection('notify', payload, t('admin.configPage.notify.saved'))
}

const saveLocalImport = async () => {
  await saveSection('local_import', {
    enabled: exForm.local_import.enabled,
    roots: exForm.local_import.roots,
  }, t('admin.configPage.localimport.saved'))
}

const smtpTestTo = ref('')
const smtpTesting = ref(false)
const doSMTPTest = async () => {
  if (!smtpTestTo.value) {
    ElMessage.warning(t('admin.configPage.notify.fillTo'))
    return
  }
  smtpTesting.value = true
  try {
    const res = await adminApi.testSMTP(smtpTestTo.value)
    if (res.code === 0 || res.code === 200) ElMessage.success(t('admin.configPage.notify.testSent'))
    else handleError(new Error(res.message || t('admin.configPage.notify.sendFailed')))
  } catch (e) {
    handleError(e)
  } finally {
    smtpTesting.value = false
  }
}

const oidcTesting = ref(false)
const doOIDCTest = async () => {
  oidcTesting.value = true
  try {
    const res = await adminApi.testOIDC()
    if (res.code === 0 || res.code === 200) ElMessage.success(t('admin.configPage.oidc.testOk'))
    else handleError(new Error(res.message || t('admin.configPage.oidc.testFailed')))
  } catch (e) {
    handleError(e)
  } finally {
    oidcTesting.value = false
  }
}

// ==================== 安全与限流（/admin/ratelimit/*，独立于通用配置保存） ====================
const rlSaving = ref(false)
const rlStatusLoading = ref(false)
const rlStatus = ref<Record<string, unknown> | null>(null)
// GET 快照：契约存在 required 字段（如 block_on_limit）且不在 rlForm 中，
// 保存时合并快照，避免缺 required 被 400
let rlSnapshot: Record<string, unknown> = {}
const rlForm = reactive({
  enabled: true,
  global_qps: 100,
  upload_qps: 10,
  download_qps: 50,
  login_qps: 5,
  burst: 20,
  block_seconds: 60
})

const fetchRateLimit = async () => {
  try {
    const res = await adminApi.getRateLimitConfig()
    if (res.code === 0 || res.code === 200) {
      const data = (res.data || {}) as Record<string, unknown>
      rlSnapshot = { ...data }
      for (const k of Object.keys(rlForm) as (keyof typeof rlForm)[]) {
        if (typeof data[k] === 'boolean' || typeof data[k] === 'number') {
          ;(rlForm as Record<string, unknown>)[k] = data[k]
        }
      }
    }
  } catch (error) {
    console.error('fetch ratelimit config failed:', error)
  }
}

const saveRateLimit = async () => {
  rlSaving.value = true
  try {
    // 后端绑定结构为 {config: RateLimitConfig}，扁平体会因 required 缺失被 400
    const res = await adminApi.updateRateLimitConfig({
      config: { ...rlSnapshot, ...rlForm }
    })
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.configPage.ratelimit.saved'))
    } else {
      handleError(new Error(res.message || t('admin.configPage.saveFailed')))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    rlSaving.value = false
  }
}

const rlStatusText = computed(() => JSON.stringify(rlStatus.value, null, 2))

const fetchRateLimitStatus = async () => {
  rlStatusLoading.value = true
  try {
    const res = await adminApi.getRateLimitStatus()
    if (res.code === 0 || res.code === 200) {
      rlStatus.value = res.data || null
    } else {
      handleError(new Error(res.message || t('admin.configPage.ratelimit.fetchStatusFailed')))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    rlStatusLoading.value = false
  }
}

onMounted(() => {
  fetchConfig()
  fetchRateLimit()
})
</script>

<style scoped>
.field-hint {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.ml8 {
  margin-left: 8px;
}

.system-config {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.rl-status {
  background: var(--color-muted);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  max-height: 260px;
  overflow: auto;
  width: 100%;
  margin: 0;
}

/* 主题预设色板 */
.theme-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.theme-swatch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-secondary);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.theme-swatch:hover {
  border-color: var(--primary-color);
}

.theme-swatch.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-bg);
  color: var(--color-text-primary);
}

.swatch-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}
</style>
