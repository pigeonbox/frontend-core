<template>
  <div class="system-config">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <h3>{{ t('admin.configPage.title') }}</h3>
        </div>
      </template>

      <!-- 左侧分区导航 + 右侧表单：原 11 个横向 tab 收敛为 6 个分区，
           分区与 URL ?section= 同步，支持深链/刷新不丢位置 -->
      <div class="config-layout">
        <nav class="config-nav">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            class="config-nav-item"
            :class="{ active: activeSection === item.id }"
            :title="t(item.labelKey)"
            @click="activeSection = item.id"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span class="config-nav-label">{{ t(item.labelKey) }}</span>
          </button>
        </nav>

        <div class="config-content">
          <!-- 窄屏导航收为图标栏时，分区名在内容区顶部补显示（宽屏隐藏，导航自带文字） -->
          <h4 class="section-title">{{ t(navLabelKey) }}</h4>
          <p class="section-desc">{{ t(navDescKey) }}</p>

          <!-- ============ 站点与外观（base + ui） ============ -->
          <el-form v-if="activeSection === 'site'" label-width="180px" class="config-form">
            <el-divider content-position="left">{{ t('admin.configPage.sections.site') }}</el-divider>
            <el-form-item :label="t('admin.configPage.basic.siteName')">
              <el-input v-model="configForm.base.name" />
            </el-form-item>

            <el-form-item :label="t('admin.configPage.basic.siteDescription')">
              <el-input v-model="configForm.base.description" type="textarea" :rows="3" />
            </el-form-item>

            <el-form-item :label="t('admin.configPage.basic.port')">
              <el-input-number v-model="configForm.base.port" :min="1" :max="65535" />
            </el-form-item>

            <el-divider content-position="left">{{ t('admin.configPage.sections.appearance') }}</el-divider>
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

          <!-- ============ 上传与分享（upload_ex + transfer + local_import） ============ -->
          <el-form v-else-if="activeSection === 'share'" label-width="180px" class="config-form">
            <el-divider content-position="left">{{ t('admin.configPage.sections.uploadGate') }}</el-divider>
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
            <el-form-item :label="t('admin.configPage.transfer.uploadGates')">
              <span class="field-hint">
                {{ t('admin.configPage.transfer.uploadGatesHint') }}
              </span>
            </el-form-item>

            <el-divider content-position="left">{{ t('admin.configPage.sections.shareDefault') }}</el-divider>
            <el-form-item :label="t('admin.configPage.transfer.maxCount')">
              <el-input-number v-model="configForm.transfer.max_count" :min="0" controls-position="right" />
              <span class="field-hint">{{ t('admin.configPage.transfer.maxCountHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.transfer.expireDefault')">
              <el-input-number v-model="configForm.transfer.expire_default" :min="1" controls-position="right" />
              <span class="field-hint">{{ t('admin.configPage.transfer.days') }}</span>
            </el-form-item>

            <el-divider content-position="left">{{ t('admin.configPage.sections.localImport') }}</el-divider>
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

          <!-- ============ 下载与直传（download） ============ -->
          <el-form v-else-if="activeSection === 'download'" label-width="180px" class="config-form">
            <el-divider content-position="left">{{ t('admin.configPage.sections.download') }}</el-divider>
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

            <el-divider content-position="left">{{ t('admin.configPage.sections.direct') }}</el-divider>
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

          <!-- ============ 用户与登录（user + oidc） ============ -->
          <el-form v-else-if="activeSection === 'account'" label-width="180px" class="config-form">
            <el-divider content-position="left">{{ t('admin.configPage.sections.user') }}</el-divider>
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
              <span class="field-hint">{{ t('admin.configPage.user.bytesDefault') }}</span>
            </el-form-item>

            <el-form-item :label="t('admin.configPage.user.storageQuota')">
              <el-input-number
                v-model="configForm.user.userstoragequota"
                :min="1048576"
                :step="1048576"
                controls-position="right"
              />
              <span class="field-hint">{{ t('admin.configPage.user.quotaDefault') }}</span>
            </el-form-item>

            <el-form-item :label="t('admin.configPage.user.sessionExpiry')">
              <el-input-number
                v-model="configForm.user.sessionexpiryhours"
                :min="1"
                :max="720"
                controls-position="right"
              />
              <span class="field-hint">{{ t('admin.configPage.user.hours') }}</span>
            </el-form-item>

            <el-divider content-position="left">{{ t('admin.configPage.sections.oidc') }}</el-divider>
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

          <!-- ============ 安全与限流（ratelimit + api_token） ============ -->
          <el-form v-else-if="activeSection === 'security'" label-width="180px" class="config-form">
            <el-divider content-position="left">{{ t('admin.configPage.sections.ratelimit') }}</el-divider>
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
                   rate_limit.use_redis / PB_RATE_LIMIT_USE_REDIS 决定 -->
              <span class="field-hint">
                {{ t('admin.configPage.ratelimit.redisHint') }}
              </span>
            </el-form-item>
            <el-form-item>
              <el-button :loading="rlStatusLoading" @click="fetchRateLimitStatus">{{ t('admin.configPage.ratelimit.viewStatus') }}</el-button>
            </el-form-item>
            <el-form-item v-if="rlStatus" :label="t('admin.configPage.ratelimit.status')">
              <pre class="rl-status">{{ rlStatusText }}</pre>
            </el-form-item>

            <el-divider content-position="left">{{ t('admin.configPage.sections.apitoken') }}</el-divider>
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

          <!-- ============ 通知与邮件（notify） ============ -->
          <el-form v-else-if="activeSection === 'notify'" label-width="180px" class="config-form">
            <el-divider content-position="left">{{ t('admin.configPage.sections.webhook') }}</el-divider>
            <el-form-item :label="t('admin.configPage.notify.webhook')">
              <el-input v-model="exForm.notify.webhook_url" :placeholder="t('admin.configPage.notify.webhookPlaceholder')" clearable />
            </el-form-item>

            <el-divider content-position="left">{{ t('admin.configPage.sections.smtp') }}</el-divider>
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

          <el-form v-else-if="activeSection === 'p2p'" label-width="180px" class="config-form">
            <!-- P2P 与联邦（p2p.federation；直传操作页随 P2a）——注释须在元素内，独立注释行会打断 v-if 链 -->
            <el-divider content-position="left">{{ t('admin.configPage.sections.federation') }}</el-divider>
            <el-form-item :label="t('admin.configPage.p2p.fedEnabled')">
              <el-switch v-model="exForm.p2p.federation.enabled" />
              <span class="field-hint">{{ t('admin.configPage.p2p.fedEnabledHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.p2p.registryUrl')">
              <el-input
                v-model="exForm.p2p.federation.registry_url"
                :placeholder="t('admin.configPage.p2p.registryUrlPlaceholder')"
                style="width: 360px"
              />
              <span class="field-hint">{{ t('admin.configPage.p2p.registryUrlHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.p2p.publicUrl')">
              <el-input
                v-model="exForm.p2p.federation.public_url"
                :placeholder="t('admin.configPage.p2p.publicUrlPlaceholder')"
                style="width: 360px"
              />
              <span class="field-hint">{{ t('admin.configPage.p2p.publicUrlHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.p2p.minEntropy')">
              <el-input-number v-model="exForm.p2p.federation.announce_min_entropy_bits" :min="0" :max="256" />
              <span class="field-hint">{{ t('admin.configPage.p2p.minEntropyHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.p2p.nodeKeyPath')">
              <el-input
                v-model="exForm.p2p.federation.node_key_path"
                :placeholder="t('admin.configPage.p2p.nodeKeyPathPlaceholder')"
                style="width: 360px"
              />
              <span class="field-hint">{{ t('admin.configPage.p2p.nodeKeyPathHint') }}</span>
            </el-form-item>
          </el-form>

          <div class="config-save-bar">
            <el-button type="primary" :loading="saving" @click="saveCurrent">
              {{ t('admin.configPage.save') }}
            </el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Picture, Upload, Download, User, Lock, Message, Connection } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { THEMES, matchThemePreset, type ThemePreset } from '@/config/themes'
import { adminApi } from '@/api/admin'
import { useConfigStore } from '@/stores/config'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()

// ==================== 分区导航（原 11 tab 收敛 6 分区，?section= 深链） ====================
const SECTION_IDS = ['site', 'share', 'download', 'account', 'security', 'notify', 'p2p'] as const
type SectionId = (typeof SECTION_IDS)[number]

const navItems: { id: SectionId; labelKey: string; descKey: string; icon: Component }[] = [
  { id: 'site', labelKey: 'admin.configPage.nav.site', descKey: 'admin.configPage.navDesc.site', icon: Picture },
  { id: 'share', labelKey: 'admin.configPage.nav.share', descKey: 'admin.configPage.navDesc.share', icon: Upload },
  { id: 'download', labelKey: 'admin.configPage.nav.download', descKey: 'admin.configPage.navDesc.download', icon: Download },
  { id: 'account', labelKey: 'admin.configPage.nav.account', descKey: 'admin.configPage.navDesc.account', icon: User },
  { id: 'security', labelKey: 'admin.configPage.nav.security', descKey: 'admin.configPage.navDesc.security', icon: Lock },
  { id: 'notify', labelKey: 'admin.configPage.nav.notify', descKey: 'admin.configPage.navDesc.notify', icon: Message },
  { id: 'p2p', labelKey: 'admin.configPage.nav.p2p', descKey: 'admin.configPage.navDesc.p2p', icon: Connection },
]

const route = useRoute()
const router = useRouter()
const sectionFromQuery = (() => {
  const s = route.query.section
  return typeof s === 'string' && (SECTION_IDS as readonly string[]).includes(s) ? (s as SectionId) : 'site'
})()
const activeSection = ref<SectionId>(sectionFromQuery)
const navDescKey = computed(() => navItems.find((n) => n.id === activeSection.value)!.descKey)
const navLabelKey = computed(() => navItems.find((n) => n.id === activeSection.value)!.labelKey)

watch(activeSection, (v) => {
  if (route.query.section !== v) router.replace({ query: { ...route.query, section: v } })
})

// URL → 视图反向同步：深链/前进后退改 ?section= 时页面要跟随（hash 导航不重载组件，
// 只在挂载时读一次 query 会脱节——同 useSendTab 历史坑）
watch(
  () => route.query.section,
  (s) => {
    if (typeof s === 'string' && (SECTION_IDS as readonly string[]).includes(s)) {
      const next = s as SectionId
      if (next !== activeSection.value) activeSection.value = next
    }
  },
)

const loading = ref(false)
const saving = ref(false)
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

// ==================== 用户配置（/admin/config/user，独立端点） ====================
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
  p2p: {
    federation: { enabled: false, registry_url: '', public_url: '', node_key_path: '', announce_min_entropy_bits: 40 },
  },
})

// 主题预设（2026-10-07 轻量主题包）：选择=写 ui.accent_color 走既有持久化与热应用
const themePresetKey = computed(() => matchThemePreset(exForm.ui.accent_color))
const applyThemePreset = (th: ThemePreset) => {
  exForm.ui.accent_color = th.accent
}

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
  if (sec.p2p?.federation) {
    Object.assign(exForm.p2p.federation, sec.p2p.federation)
    // 旧库无 p2p 段/缺键 null 归一（后端 env 种子回填见 ensureConfigLoaded）
    if (exForm.p2p.federation.enabled == null) exForm.p2p.federation.enabled = false
    // 注意用 == null 而非 !x：合法 0（禁用熵门槛）不能被显示成默认 40
    if (exForm.p2p.federation.announce_min_entropy_bits == null) exForm.p2p.federation.announce_min_entropy_bits = 40
  }
}

// ==================== 统一分区保存（一页一保存按钮，按分区聚合后端配置段） ====================
// 写入辅助：非成功码抛错，供多段/多端点分区串联，失败即中断并统一走 handleError
const putConfig = async (payload: Record<string, unknown>) => {
  const res = await adminApi.updateConfig(payload)
  if (!(res.code === 0 || res.code === 200)) {
    throw new Error(res.message || t('admin.configPage.saveFailed'))
  }
}

const putUserSettings = async () => {
  const res = await adminApi.updateUserSettings({
    allowuserregistration: Number(configForm.user.allowuserregistration) === 1,
    useruploadsize: configForm.user.useruploadsize,
    userstoragequota: configForm.user.userstoragequota,
    sessionexpiryhours: configForm.user.sessionexpiryhours
  })
  if (!(res.code === 0 || res.code === 200)) {
    throw new Error(res.message || t('admin.configPage.saveFailed'))
  }
}

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

const putRateLimit = async () => {
  // 后端绑定结构为 {config: RateLimitConfig}，扁平体会因 required 缺失被 400
  const res = await adminApi.updateRateLimitConfig({
    config: { ...rlSnapshot, ...rlForm }
  })
  if (!(res.code === 0 || res.code === 200)) {
    throw new Error(res.message || t('admin.configPage.saveFailed'))
  }
}

const saveCurrent = async () => {
  saving.value = true
  try {
    switch (activeSection.value) {
      case 'site':
        await putConfig({ base: configForm.base, ui: { ...exForm.ui } })
        break
      case 'share':
        await putConfig({
          upload_ex: { ...exForm.upload_ex },
          transfer: configForm.transfer,
          local_import: { enabled: exForm.local_import.enabled, roots: exForm.local_import.roots },
        })
        break
      case 'download':
        await putConfig({ download: { ...exForm.download } })
        break
      case 'account':
        // 用户配置走专属端点，OIDC 走通用配置段，两段串行提交
        await putUserSettings()
        await putConfig({ oidc: { ...exForm.oidc } })
        break
      case 'security':
        // 限流走专属端点（{config: …} 包裹），API Token 走通用配置段
        await putRateLimit()
        await putConfig({ api_token: { ...exForm.api_token } })
        break
      case 'notify':
        await putConfig({
          notify: { webhook_url: exForm.notify.webhook_url, smtp: { ...exForm.notify.smtp } },
        })
        break
      case 'p2p':
        await putConfig({ p2p: { federation: { ...exForm.p2p.federation } } })
        break
    }
    ElMessage.success(t('admin.configPage.saved'))
    await configStore.refreshConfig()
    // 回读服务端（含旧库 null 归一逻辑），避免本地表单与持久化值漂移
    await fetchConfig()
    await fetchRateLimit()
  } catch (e) {
    handleError(e)
  } finally {
    saving.value = false
  }
}

// ==================== 安全与限流（/admin/ratelimit/*，独立于通用配置保存） ====================
const rlStatusLoading = ref(false)
const rlStatus = ref<Record<string, unknown> | null>(null)

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

// ==================== 通知与 OIDC 连通性测试 ====================
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

onMounted(() => {
  fetchConfig()
  fetchRateLimit()
})
</script>

<style scoped>
/* 表单标签防折行（#488 后台可读性）：固定 label-width 下长标签（如"允许访客
   （未登录）上传"）被折成两行错位；标签列统一 180px 按最长标签放宽，这里再兜底禁换行 */
.system-config :deep(.el-form-item__label) {
  white-space: nowrap;
}
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

/* ===== 布局：左侧分区导航 + 右侧表单 ===== */
.config-layout {
  display: flex;
  gap: 28px;
  align-items: flex-start;
}

.config-nav {
  width: 188px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 0;
}

/* 导航项与 admin 侧栏菜单同视觉语言（Linear 风：hover 灰底、激活 primary 浅底） */
.config-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.config-nav-item:hover {
  background: var(--color-muted);
  color: var(--color-text-primary);
}

.config-nav-item.active {
  background: var(--primary-bg);
  color: var(--primary-color);
}

.config-nav-item :deep(.el-icon) {
  font-size: 16px;
  flex-shrink: 0;
}

.config-nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-content {
  flex: 1;
  min-width: 0;
}

.section-title {
  display: none;
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.config-form {
  max-width: 780px;
}

.config-form :deep(.el-divider__text) {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* 小节标题与描述行/标签列左缘对齐（is-left 文本自带 left:20px+padding 20px，
   标题会浮在半空；is-left 类在 .el-divider__text 上而非分隔线容器上） */
.config-form :deep(.el-divider__text.is-left) {
  left: 0;
  margin-left: 0;
  padding-left: 0;
}

.config-form :deep(.el-divider) {
  margin: 24px 0 18px;
}

.config-form :deep(.el-divider:first-child) {
  margin-top: 0;
}

.config-save-bar {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

/* 窄屏：导航收为左侧图标栏——「在左侧」的形态全宽度保持（横排降级会让
   窄窗/侧边面板用户以为左导航没了）；悬停 title 提示分区名，内容区顶部补显示 */
@media (max-width: 900px) {
  .config-layout {
    gap: 16px;
  }

  .config-nav {
    width: 52px;
    gap: 4px;
  }

  .config-nav-item {
    justify-content: center;
    padding: 10px 0;
  }

  .config-nav-label {
    display: none;
  }

  .section-title {
    display: block;
  }

  .config-form {
    max-width: none;
  }
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
