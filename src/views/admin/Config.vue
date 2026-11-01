<template>
  <div class="system-config">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <h3>{{ t('admin.configPage.title') }}</h3>
        </div>
      </template>

      <!-- 左侧分区导航 + 右侧表单：原 11 个横向 tab 收敛为 7 个分区，
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
            <!-- 未配置公网地址时告警：分享链接会带内网地址，外部用户打不开 -->
            <el-alert
              v-if="publicUrlMissing"
              type="warning"
              :closable="false"
              show-icon
              style="margin-bottom: 16px"
              :title="t('admin.configPage.basic.publicUrlWarn')"
            />
            <el-divider content-position="left">{{ t('admin.configPage.sections.site') }}</el-divider>
            <el-form-item :label="t('admin.configPage.basic.siteName')">
              <el-input v-model="configForm.base.name" />
            </el-form-item>

            <el-form-item :label="t('admin.configPage.basic.siteDescription')">
              <el-input v-model="configForm.base.description" type="textarea" :rows="3" />
            </el-form-item>

            <el-form-item :label="t('admin.configPage.basic.publicUrl')">
              <el-input
                v-model="configForm.base.public_url"
                :placeholder="t('admin.configPage.basic.publicUrlPlaceholder')"
                clearable
                style="max-width: 360px"
              />
              <span class="field-hint">{{ t('admin.configPage.basic.publicUrlHint') }}</span>
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
              <el-input v-model="exForm.ui.accent_color" placeholder="#0e9f6e" style="width: 220px" />
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
            <!-- require_login 开关已收敛（2026-10-16 拍板）：与 open_upload 对匿名
                 上传效果完全等价，服务端 apply 时恒派生自单开关，双开关只制造矛盾态 -->
            <el-form-item :label="t('admin.configPage.upload.anonymousDailyCount')">
              <el-input-number v-model="exForm.upload_ex.anonymous_daily_count" :min="0" :max="100000" />
              <span class="field-hint">{{ t('admin.configPage.upload.anonymousDailyCountHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.upload.anonymousDailyBytes')">
              <el-input-number v-model="exForm.upload_ex.anonymous_daily_bytes" :min="0" :max="107374182400" />
              <span class="field-hint">{{ t('admin.configPage.upload.anonymousDailyBytesHint') }}</span>
            </el-form-item>
            <!-- 单文件上限（upload_ex.max_file_size，字节）：此前后端能存能热应用，
                 但管理台没有入口 ⇒ 管理员改不动，实际由反代层的 nginx 硬顶，
                 表现是「大文件上传到一半被 nginx 拒成 413」。这里给出业务侧权威入口。 -->
            <el-form-item :label="t('admin.configPage.upload.maxFileSize')">
              <el-input-number v-model="maxFileSizeMb" :min="0" :max="1048576" :step="1024" />
              <span class="field-hint">{{ t('admin.configPage.upload.maxFileSizeHint') }}</span>
            </el-form-item>
            <!-- 单次发送**总量**上限（user.user_upload_size）：与上面的「单文件上限」是
                 **两个不同的闸**——单文件上限管单个文件，本项管一次发送（多文件合计）的
                 体积，只约束登录用户（匿名走访客日配额）。
                 配成「总量 < 单文件」⇒ 超过单文件上限的文件永远发不出去（先被总量闸拒），
                 而界面仍在宣称单文件上限有效 ⇒ 这里告警 + 一键对齐。
                 编辑入口在「账户与登录」分区（user 段，PUT /admin/config/user）。 -->
            <el-form-item :label="t('admin.configPage.upload.batchCap')">
              <span class="field-hint">{{ t('admin.configPage.upload.batchCapCurrent', { size: batchCapText }) }}</span>
              <el-button
                v-if="uploadCapConflict"
                size="small"
                type="warning"
                plain
                :loading="aligningCap"
                @click="alignUploadCap"
              >
                {{ t('admin.configPage.upload.batchCapAlign') }}
              </el-button>
              <el-alert
                v-if="uploadCapConflict"
                type="warning"
                :closable="false"
                show-icon
                class="cap-conflict-alert"
              >
                {{ t('admin.configPage.upload.batchCapConflict', { total: batchCapText, perFile: maxFileSizeText }) }}
              </el-alert>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.upload.allowedExpireStyles')">
              <el-select
                v-model="exForm.upload_ex.allowed_expire_styles"
                multiple
                clearable
                collapse-tags
                collapse-tags-tooltip
                :placeholder="t('admin.configPage.upload.allowedExpireStylesPlaceholder')"
                class="expire-style-select"
              >
                <el-option
                  v-for="s in EXPIRE_STYLE_KEYS"
                  :key="s"
                  :label="t(EXPIRE_STYLE_I18N_KEYS[s])"
                  :value="s"
                />
              </el-select>
              <span class="field-hint">{{ t('admin.configPage.upload.allowedExpireStylesHint') }}</span>
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
                <el-option :label="t('admin.configPage.download.policyEveryone')" value="everyone" />
                <el-option :label="t('admin.configPage.download.policyAuthenticated')" value="authenticated" />
                <el-option :label="t('admin.configPage.download.policyDisabled')" value="disabled" />
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
                v-model="userUploadSizeMb"
                :min="0"
                :max="1048576"
                :step="1024"
                controls-position="right"
              />
              <span class="field-hint">{{ t('admin.configPage.user.uploadLimitHint') }}</span>
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
              <!-- 后端发给 IdP 的 redirect_uri = base_url + /api/v1/user/oidc/callback（oidc/service.go RedirectURI）；
                   前端 #/oidc/callback 只是后端 302 的落地页，无需注册 -->
              <el-input :model-value="`${origin}/api/v1/user/oidc/callback`" readonly />
              <span class="field-hint">{{ t('admin.configPage.oidc.callbackHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('admin.configPage.oidc.test')">
              <el-button :loading="oidcTesting" @click="doOIDCTest">{{ t('admin.configPage.oidc.testButton') }}</el-button>
            </el-form-item>
          </el-form>

          <!-- ============ 安全与限流（ratelimit + api_token） ============ -->
          <el-form v-else-if="activeSection === 'security'" label-width="180px" class="config-form">
            <el-alert
              type="info"
              :closable="false"
              style="margin-bottom: 16px"
              :title="t('admin.configPage.yamlOnlyHint')"
            />
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
            <el-alert
              type="info"
              :closable="false"
              style="margin-bottom: 16px"
              :title="t('admin.configPage.envPriorityHint')"
            />
            <!-- 白话导航卡：跨站联邦（Wave B'：设备直传面已拆为 PigeonBeam，本区只留联邦） -->
            <div class="p2p-intro">
              <div class="p2p-feature-card">
                <div class="p2p-feature-head">
                  <span class="p2p-feature-title">{{ t('admin.configPage.p2p.introFedTitle') }}</span>
                  <el-tag size="small" type="info">{{ t('admin.configPage.p2p.introFedBadge') }}</el-tag>
                </div>
                <p class="p2p-feature-desc">{{ t('admin.configPage.p2p.introFedDesc') }}</p>
                <el-link type="primary" @click="goFederationOps">{{ t('admin.configPage.p2p.openOpsPage') }} →</el-link>
              </div>
            </div>

            <!-- 跨站联邦（Wave B'：设备直传面已拆为独立应用 PigeonBeam，p2p 分区只留联邦） -->
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
            <el-collapse class="p2p-advanced">
              <el-collapse-item name="fed-advanced" :title="t('admin.configPage.p2p.fedAdvancedTitle')">
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
                  <span class="field-hint p2p-danger-hint">{{ t('admin.configPage.p2p.nodeKeyPathHint') }}</span>
                </el-form-item>
              </el-collapse-item>
            </el-collapse>
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
import { ref, computed, watch, onMounted, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Picture, Upload, Download, User, Lock, Message, Connection } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { THEMES, matchThemePreset, type ThemePreset } from '@/config/themes'
import { EXPIRE_STYLE_KEYS, EXPIRE_STYLE_I18N_KEYS } from '@/config/expireStyles'
import { adminApi } from '@/api/admin'
import { useConfigStore } from '@/stores/config'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { uploadCapMismatch, alignedUploadCap } from '@/utils/uploadCap'
import { formatFileSize } from '@/utils/format'

const { t } = useI18n()
const { handleError } = useErrorHandler()

// ==================== 分区导航（原 11 tab 收敛 7 分区，?section= 深链） ====================
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

const configForm = ref({
  base: {
    name: '',
    description: '',
    port: 12346,
    // 站点公网地址（base 值段字段，整段随 base 提交；空串=未配置→前端回退 location.origin）
    public_url: ''
  },
  transfer: {
    max_count: 100,
    expire_default: 7
  },
  user: {
    allowuserregistration: 0,
    // 单次发送总量上限（字节，0 = 不限）：2026-10-30 起出厂默认即为不限
    // （此前默认 50MB，与单文件上限默认「不限」自相矛盾）。
    useruploadsize: 0,
    userstoragequota: 1073741824,
    sessionexpiryhours: 168
  }
})

// 公网地址未配置告警（内网部署时分享链接会带内网地址，外部用户打不开）
const publicUrlMissing = computed(() => !configForm.value.base.public_url.trim())

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await adminApi.getConfig()
    if (res.code === 200 && res.data) {
      // 映射配置数据
      if (res.data.base) {
        Object.assign(configForm.value.base, res.data.base)
        // 后端可能下发 null（未配置）→ 归一为空串，避免把 null 提交回配置段
        if (!configForm.value.base.public_url) configForm.value.base.public_url = ''
      }
      if (res.data.transfer) {
        Object.assign(configForm.value.transfer, res.data.transfer)
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
    if ((res.code === 200) && res.data) {
      const d = res.data as Record<string, unknown>
      configForm.value.user.allowuserregistration = Number(d.allowuserregistration === true || d.allowuserregistration === 1)
      // ⚠️ 0 是合法值（不限）——此前用 `> 0` 过滤 ⇒ 0 被当成「没值」而跳过，
      // 表单永远停在默认的 52428800 ⇒ **管理员根本表达不了「不限」**。
      if (typeof d.useruploadsize === 'number' && d.useruploadsize >= 0) configForm.value.user.useruploadsize = d.useruploadsize
      if (typeof d.userstoragequota === 'number' && d.userstoragequota > 0) configForm.value.user.userstoragequota = d.userstoragequota
      if (typeof d.sessionexpiryhours === 'number' && d.sessionexpiryhours > 0) configForm.value.user.sessionexpiryhours = d.sessionexpiryhours
    }
  } catch (error) {
    console.error('fetch user settings failed:', error)
  }
}

// ==================== v0.7.3 扩容设置段（ui/download/notify/oidc/local_import/api_token）====================
// 扁平契约：每段独立保存（adminApi.updateConfig({ 段名: 值 })），后端 nil-保留未提交段
const exForm = ref({
  ui: { background: '', accent_color: '', show_admin_addr: true, robots_text: '' },
  upload_ex: {
    open_upload: true,
    require_login: false,
    anonymous_daily_count: 0,
    anonymous_daily_bytes: 0,
    // 单文件上限（字节，0=不限）。服务端 presign init 阶段即按此值拒超限文件
    // （错误码 30008），零流量拒绝；反代 nginx 上限须 ≥ 本值。
    max_file_size: 0,
    // 允许用户选择的过期样式；**空 = 全部允许**（服务端 effectiveExpireStyles 语义）。
    // 此前管理台没有这个字段的编辑器（后端接受、界面不暴露）⇒ 管理员改不动，
    // 老实例若白名单不含 count（「按取件次数」）就永远加不回来（2026-10-22）。
    allowed_expire_styles: [] as string[],
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
    // Wave B'：设备直传面（p2p.direct）已拆为独立应用 PigeonBox，Box 侧只留联邦
    federation: { enabled: false, registry_url: '', public_url: '', node_key_path: '', announce_min_entropy_bits: 40 },
  },
})

// 主题预设（2026-10-07 轻量主题包）：选择=写 ui.accent_color 走既有持久化与热应用
const themePresetKey = computed(() => matchThemePreset(exForm.value.ui.accent_color))
const applyThemePreset = (th: ThemePreset) => {
  exForm.value.ui.accent_color = th.accent
}

const origin = window.location.origin
// 白名单目录 textarea ↔ roots 数组(逗号分隔,自动去空)
const localImportRootsText = computed({
  get: () => exForm.value.local_import.roots.join(', '),
  set: (v: string) => {
    exForm.value.local_import.roots = v.split(',').map((x) => x.trim()).filter(Boolean)
  },
})

// 单文件上限：配置以字节存储，界面以 MB 编辑（0 = 不限）。
// 存回时按 1MB=1048576 字节换算并取整（4GiB 上限 = 4096MB = 4294967296 精确无误差）。
const maxFileSizeMb = computed({
  get: () => {
    const bytes = exForm.value.upload_ex.max_file_size ?? 0
    return bytes > 0 ? Math.round((bytes / 1024 / 1024) * 100) / 100 : 0
  },
  set: (v: number | undefined) => {
    const mb = Number(v) || 0
    exForm.value.upload_ex.max_file_size = mb > 0 ? Math.round(mb * 1024 * 1024) : 0
  },
})

// 单次发送**总量**上限（user.user_upload_size）：配置以字节存储，界面以 MB 编辑（0 = 不限）。
//
// ⚠️ 2026-10-30 前该字段是「字节直填 + min=1MB + 表单把 0 当没值」⇒
// 既显示 52428800 这种看不懂的数字，又**根本表达不了「不限」**（0）。
const userUploadSizeMb = computed({
  get: () => {
    const bytes = configForm.value.user.useruploadsize ?? 0
    return bytes > 0 ? Math.round((bytes / 1024 / 1024) * 100) / 100 : 0
  },
  set: (v: number | undefined) => {
    const mb = Number(v) || 0
    configForm.value.user.useruploadsize = mb > 0 ? Math.round(mb * 1024 * 1024) : 0
  },
})

/**
 * 两个上传闸口是否矛盾：「单次发送总量上限」低于「单文件上限」
 * ⇒ 超过单文件上限的文件**永远发不出去**（先被总量闸拒）。
 */
const uploadCapConflict = computed(() =>
  uploadCapMismatch(configForm.value.user.useruploadsize ?? 0, exForm.value.upload_ex.max_file_size ?? 0)
)

/** 展示用的上限文本（不限时给「不限」二字，而不是 0 字节） */
const batchCapText = computed(() => {
  const bytes = configForm.value.user.useruploadsize ?? 0
  return bytes > 0 ? formatFileSize(bytes) : t('admin.configPage.upload.batchCapUnlimited')
})
const maxFileSizeText = computed(() => {
  const bytes = exForm.value.upload_ex.max_file_size ?? 0
  return bytes > 0 ? formatFileSize(bytes) : t('admin.configPage.upload.batchCapUnlimited')
})

// 联邦管理台入口（Wave B'：直传操作页已退役，/admin/p2p 现指联邦页）
const goFederationOps = () => {
  const m = router.currentRoute.value.path.match(/^(.*?\/admin)/)
  router.push(`${m ? m[1] : '/admin'}/p2p`)
}

const fetchExSections = (data: Record<string, unknown>) => {
  const sec = data as Record<string, any>
  if (sec.ui) {
    Object.assign(exForm.value.ui, sec.ui)
    // 旧库 ui 段无 show_admin_addr 键（后端缺省=展示），归一为开避免开关显示与实际相反
    if (exForm.value.ui.show_admin_addr == null) exForm.value.ui.show_admin_addr = true
  }
  if (sec.upload_ex) {
    Object.assign(exForm.value.upload_ex, sec.upload_ex)
    if (exForm.value.upload_ex.open_upload == null) exForm.value.upload_ex.open_upload = true
    if (exForm.value.upload_ex.require_login == null) exForm.value.upload_ex.require_login = false
    if (!exForm.value.upload_ex.anonymous_daily_count) exForm.value.upload_ex.anonymous_daily_count = 0
    if (!exForm.value.upload_ex.anonymous_daily_bytes) exForm.value.upload_ex.anonymous_daily_bytes = 0
    // 旧库/空值归一为空数组（=全部允许）；否则多选框拿到 null 会渲染异常
    if (!Array.isArray(exForm.value.upload_ex.allowed_expire_styles)) {
      exForm.value.upload_ex.allowed_expire_styles = []
    }
  }
  if (sec.download) {
    Object.assign(exForm.value.download, sec.download)
    // 旧库 download 段无直传新键 → 后端下发 null：归一为默认值（nil 语义=开启/100MB/600s）
    // 旧开关 presign_anonymous_enabled 已退役（2026-10-26）：后端读配置时已把它的
    // 语义并入 presign_policy，前端不再二次推导。
    if (!exForm.value.download.presign_policy) {
      exForm.value.download.presign_policy = 'everyone'
    }
    if (!exForm.value.download.presign_threshold_mb) exForm.value.download.presign_threshold_mb = 100
    if (!exForm.value.download.presign_expire_seconds) exForm.value.download.presign_expire_seconds = 600
    // 旧库无 code_case_insensitive 键 → 后端下发 null：归一为默认值（nil 语义=开启）
    if (exForm.value.download.code_case_insensitive == null) exForm.value.download.code_case_insensitive = true
  }
  if (sec.notify) {
    Object.assign(exForm.value.notify, sec.notify)
    if (sec.notify.smtp) Object.assign(exForm.value.notify.smtp, sec.notify.smtp)
  }
  if (sec.oidc) Object.assign(exForm.value.oidc, sec.oidc)
  if (sec.local_import) Object.assign(exForm.value.local_import, sec.local_import)
  if (sec.api_token) Object.assign(exForm.value.api_token, sec.api_token)
  if (sec.p2p?.federation) {
    Object.assign(exForm.value.p2p.federation, sec.p2p.federation)
    // 旧库无 p2p 段/缺键 null 归一（后端 env 种子回填见 ensureConfigLoaded）
    if (exForm.value.p2p.federation.enabled == null) exForm.value.p2p.federation.enabled = false
    // 注意用 == null 而非 !x：合法 0（禁用熵门槛）不能被显示成默认 40
    if (exForm.value.p2p.federation.announce_min_entropy_bits == null) exForm.value.p2p.federation.announce_min_entropy_bits = 40
  }
}

// ==================== 统一分区保存（一页一保存按钮，按分区聚合后端配置段） ====================
// 写入辅助：非成功码抛错，供多段/多端点分区串联，失败即中断并统一走 handleError
const putConfig = async (payload: Record<string, unknown>) => {
  const res = await adminApi.updateConfig(payload)
  if (!(res.code === 200)) {
    throw new Error(res.message || t('admin.configPage.saveFailed'))
  }
}

const putUserSettings = async () => {
  const res = await adminApi.updateUserSettings({
    allowuserregistration: Number(configForm.value.user.allowuserregistration) === 1,
    useruploadsize: configForm.value.user.useruploadsize,
    userstoragequota: configForm.value.user.userstoragequota,
    sessionexpiryhours: configForm.value.user.sessionexpiryhours
  })
  if (!(res.code === 200)) {
    throw new Error(res.message || t('admin.configPage.saveFailed'))
  }
}

// ==================== 一键对齐「单次发送总量上限」（2026-10-30） ====================
// 矛盾态：单次发送总量上限 < 单文件上限 ⇒ 超过单文件上限的文件永远发不出去。
// 对齐动作 = 把总量上限抬到与单文件上限一致（即「允许发一个最大文件」）。
// ⚠️ 写在 **user 段**（PUT /admin/config/user），与本分区保存的 upload_ex 段
// 是两个端点 ⇒ 独立动作，不随本分区「保存」一起提交。
const aligningCap = ref(false)
const alignUploadCap = async () => {
  const target = alignedUploadCap(exForm.value.upload_ex.max_file_size ?? 0)
  if (target <= 0) return
  aligningCap.value = true
  try {
    configForm.value.user.useruploadsize = target
    await putUserSettings()
    ElMessage.success(t('admin.configPage.upload.capAligned'))
    await fetchUserSettings()
  } catch (e) {
    handleError(e)
  } finally {
    aligningCap.value = false
  }
}

// GET 快照：契约存在 required 字段（如 block_on_limit）且不在 rlForm 中，
// 保存时合并快照，避免缺 required 被 400
let rlSnapshot: Record<string, unknown> = {}
const rlForm = ref({
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
  if (!(res.code === 200)) {
    throw new Error(res.message || t('admin.configPage.saveFailed'))
  }
}

const saveCurrent = async () => {
  saving.value = true
  try {
    switch (activeSection.value) {
      case 'site':
        await putConfig({ base: configForm.value.base, ui: { ...exForm.value.ui } })
        break
      case 'share':
        await putConfig({
          upload_ex: { ...exForm.value.upload_ex },
          transfer: configForm.value.transfer,
          local_import: { enabled: exForm.value.local_import.enabled, roots: exForm.value.local_import.roots },
        })
        break
      case 'download':
        await putConfig({ download: { ...exForm.value.download } })
        break
      case 'account':
        // 用户配置走专属端点，OIDC 走通用配置段，两段串行提交
        await putUserSettings()
        await putConfig({ oidc: { ...exForm.value.oidc } })
        break
      case 'security':
        // 限流走专属端点（{config: …} 包裹），API Token 走通用配置段
        await putRateLimit()
        await putConfig({ api_token: { ...exForm.value.api_token } })
        break
      case 'notify':
        await putConfig({
          notify: { webhook_url: exForm.value.notify.webhook_url, smtp: { ...exForm.value.notify.smtp } },
        })
        break
      case 'p2p':
        await putConfig({ p2p: { federation: { ...exForm.value.p2p.federation } } })
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
    if (res.code === 200) {
      const data = (res.data || {}) as Record<string, unknown>
      rlSnapshot = { ...data }
      for (const k of Object.keys(rlForm.value) as (keyof typeof rlForm.value)[]) {
        if (typeof data[k] === 'boolean' || typeof data[k] === 'number') {
          ;(rlForm.value as Record<string, unknown>)[k] = data[k]
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
    if (res.code === 200) {
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
    if (res.code === 200) ElMessage.success(t('admin.configPage.notify.testSent'))
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
    if (res.code === 200) ElMessage.success(t('admin.configPage.oidc.testOk'))
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
/* P2P 分区：两功能白话导航卡（设备直传=推荐 / 跨站联邦=进阶折叠），2026-10-15 重设计 */
.p2p-intro {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
@media (max-width: 900px) {
  .p2p-intro {
    grid-template-columns: 1fr;
  }
}
.p2p-feature-card {
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--primary-color);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  background: var(--color-muted);
}
.p2p-feature-card.is-muted {
  border-left-color: var(--color-text-tertiary);
  opacity: 0.88;
}
.p2p-feature-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.p2p-feature-title {
  font-weight: 600;
  color: var(--color-text-primary);
}
.p2p-feature-desc {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.p2p-feature-steps {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  line-height: 1.7;
}
.p2p-advanced {
  margin: 4px 0 12px;
  border: none;
}
.p2p-advanced :deep(.el-collapse-item__header) {
  color: var(--color-text-secondary);
  font-size: 13px;
  border-bottom: 1px dashed var(--color-border);
}
.p2p-advanced :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
.p2p-danger-hint {
  color: var(--el-color-danger, #f56c6c);
}
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
/* 过期样式多选：8 个标签一行放不下，给个宽度让标签换行 */
.expire-style-select {
  width: 420px;
  max-width: 100%;
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

/* 窄屏：表单标签**移到输入框上方**——label-width="180px" 是写死在 el-form 上的
   属性，媒体查询改不了 ⇒ 窄屏下标签占掉大半宽度、输入框被挤到视口外
   （390px 真机实测：配置表单输入框宽度为 0，手机上一个设置项都改不了）。
   这里用 display:block 让 label 与 content 上下排列，并解除固定标签宽。 */
@media (max-width: 768px) {
  .config-form :deep(.el-form-item) {
    display: block;
  }

  .config-form :deep(.el-form-item__label) {
    display: flex;
    width: auto !important;
    height: auto;
    line-height: 1.5;
    text-align: left;
    justify-content: flex-start;
    padding-bottom: 4px;
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
