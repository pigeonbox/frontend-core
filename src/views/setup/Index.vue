<template>
  <div class="setup-container">
    <div class="setup-card">
      <!-- Logo 区 -->
      <div class="setup-header">
        <div class="logo-icon">
          <BrandLogo class="logo-img" />
        </div>
        <h1>{{ t('setup.title') }}</h1>
        <p class="setup-desc">{{ t('setup.description') }}</p>
      </div>

      <el-alert
        v-if="alreadyInitialized"
        :title="t('setup.alreadyInitialized')"
        type="info"
        show-icon
        :closable="false"
        class="setup-alert"
      />

      <!-- 步骤条：管理员 → 站点地址 → 投递策略 → 完成 -->
      <el-steps :active="step" align-center finish-status="success" class="setup-steps">
        <el-step :title="t('setup.stepAdmin')" />
        <el-step :title="t('setup.stepSite')" />
        <el-step :title="t('setup.stepPolicy')" />
        <el-step :title="t('setup.stepDone')" />
      </el-steps>

      <el-form
        ref="setupFormRef"
        :model="setupForm"
        :rules="rules"
        label-position="top"
        :disabled="alreadyInitialized"
        @submit.prevent="handleSubmit"
      >
        <!-- 步骤 1：管理员账号 -->
        <div v-show="step === 0" class="setup-step-body">
          <el-form-item :label="t('setup.adminUsername')" prop="adminUsername">
            <el-input v-model="setupForm.adminUsername" size="large" autocomplete="username" />
          </el-form-item>

          <el-form-item :label="t('setup.adminEmail')" prop="adminEmail">
            <el-input v-model="setupForm.adminEmail" size="large" autocomplete="email" />
          </el-form-item>

          <el-form-item :label="t('setup.adminPassword')" prop="adminPassword">
            <el-input
              v-model="setupForm.adminPassword"
              type="password"
              size="large"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>

          <el-form-item :label="t('setup.confirmPassword')" prop="confirmPassword">
            <el-input
              v-model="setupForm.confirmPassword"
              type="password"
              size="large"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>
        </div>

        <!-- 步骤 2：站点地址（站点名 + 公网取件地址） -->
        <div v-show="step === 1" class="setup-step-body">
          <el-form-item :label="t('setup.siteName')">
            <el-input v-model="setupForm.siteName" size="large" />
          </el-form-item>

          <el-form-item :label="t('setup.publicUrlLabel')" prop="publicUrl">
            <el-input
              v-model="setupForm.publicUrl"
              size="large"
              clearable
              :placeholder="detectedOrigin"
            />
            <span class="field-hint">{{ t('setup.publicUrlHint') }}</span>
            <span class="field-hint">{{ t('setup.publicUrlDetected') }}：{{ detectedOrigin }}</span>
          </el-form-item>

          <!-- 首启令牌：仅服务端要求时出现（PB_SETUP_TOKEN 已设） -->
          <el-form-item v-if="tokenRequired" :label="t('setup.tokenLabel')" prop="setupToken">
            <el-input
              v-model="setupForm.setupToken"
              size="large"
              clearable
              autocomplete="off"
              :placeholder="t('setup.tokenHint')"
            />
            <span class="field-hint">{{ t('setup.tokenHint') }}</span>
          </el-form-item>
        </div>

        <!-- 步骤 3：投递策略 -->
        <div v-show="step === 2" class="setup-step-body">
          <el-form-item :label="t('setup.uploadSizeLabel')">
            <el-input-number
              v-model="setupForm.uploadSizeMb"
              :min="1"
              :max="102400"
              size="large"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item :label="t('setup.openUploadLabel')">
            <el-switch v-model="setupForm.openUpload" />
            <span class="switch-hint">{{ t('setup.openUploadHint') }}</span>
          </el-form-item>

          <el-form-item :label="t('setup.expireStylesLabel')">
            <el-checkbox-group v-model="setupForm.expireStyles">
              <el-checkbox v-for="s in expireStyleOptions" :key="s" :label="s" :value="s">
                {{ expireStyleText(s) }}
              </el-checkbox>
            </el-checkbox-group>
            <div class="field-hint">{{ t('setup.expireStylesHint') }}</div>
          </el-form-item>

          <el-form-item :label="t('setup.maxSaveDaysLabel')">
            <el-input-number
              v-model="setupForm.maxSaveDays"
              :min="0"
              :max="3650"
              size="large"
              style="width: 100%"
            />
            <div class="field-hint">{{ t('setup.maxSaveDaysHint') }}</div>
          </el-form-item>

          <el-form-item :label="t('setup.extensionsLabel')">
            <el-input
              v-model="setupForm.extensionsText"
              :placeholder="t('setup.extensionsPlaceholder')"
              size="large"
              clearable
            />
            <div class="field-hint">{{ t('setup.extensionsHint') }}</div>
          </el-form-item>

          <el-form-item :label="t('setup.allowRegistrationLabel')">
            <el-switch v-model="setupForm.allowRegistration" />
            <span class="switch-hint">{{ t('setup.allowRegistrationHint') }}</span>
          </el-form-item>
        </div>

        <!-- 步骤 4：完成 -->
        <div v-show="step === 3" class="setup-step-body setup-done">
          <el-result icon="success" :title="t('setup.doneTitle')" :sub-title="t('setup.doneSummary')" />
          <div class="setup-done-rows">
            <div class="setup-done-row">
              <span class="setup-done-label">{{ t('setup.doneSiteAddress') }}</span>
              <span class="setup-done-value mono">{{ setupForm.publicUrl.trim() || detectedOrigin }}</span>
            </div>
            <div class="setup-done-row">
              <span class="setup-done-label">{{ t('setup.adminUsername') }}</span>
              <span class="setup-done-value mono">{{ setupForm.adminUsername }}</span>
            </div>
          </div>
          <el-alert
            v-if="!urlSaved"
            :title="t('setup.doneUrlNotSaved')"
            type="warning"
            show-icon
            :closable="false"
          />

          <!-- 端到端自检（2026-10-22）：发一个测试文件并立刻取回。
               首启是最容易"看着成功、实际不通"的时刻（存储不可写、地址填错、
               取件码没铸上……）——自检把这三件事当场验掉，比任何文档都有效。 -->
          <div class="setup-selfcheck">
            <div class="setup-selfcheck-head">
              <span class="setup-selfcheck-label">{{ t('setup.selfCheckLabel') }}</span>
              <el-button
                size="small"
                :loading="selfCheck.state === 'running'"
                @click="runSelfCheck"
              >
                {{ t('setup.selfCheckRun') }}
              </el-button>
            </div>
            <p class="field-hint">{{ t('setup.selfCheckHint') }}</p>
            <el-alert
              v-if="selfCheck.state === 'pass'"
              :title="selfCheck.message"
              type="success"
              show-icon
              :closable="false"
            />
            <el-alert
              v-else-if="selfCheck.state === 'warn'"
              :title="selfCheck.message"
              type="warning"
              show-icon
              :closable="false"
            />
            <el-alert
              v-else-if="selfCheck.state === 'fail'"
              :title="selfCheck.message"
              type="error"
              show-icon
              :closable="false"
            />
            <p v-if="selfCheck.detail" class="field-hint">{{ selfCheck.detail }}</p>
          </div>

          <div class="setup-done-actions">
            <el-button type="primary" size="large" @click="$router.push('/')">
              {{ t('setup.goHome') }}
            </el-button>
            <el-button size="large" @click="$router.push('/send')">
              {{ t('setup.tryShare') }}
            </el-button>
            <el-button size="large" @click="$router.push('/user/login')">
              {{ t('setup.goLogin') }}
            </el-button>
          </div>
        </div>
      </el-form>

      <!-- 步骤导航 -->
      <div v-if="step < 3" class="setup-actions">
        <el-button v-if="step > 0" size="large" @click="step -= 1">
          {{ t('setup.prev') }}
        </el-button>
        <el-button v-if="step < 2" type="primary" size="large" @click="nextStep">
          {{ t('setup.next') }}
        </el-button>
        <el-button
          v-else
          type="primary"
          size="large"
          :loading="loading"
          class="submit-btn"
          @click="handleSubmit"
        >
          {{ t('setup.finish') }}
        </el-button>
      </div>

      <div v-else class="setup-footer">
        <el-link type="primary" underline="never" @click="$router.push('/user/login')">
          {{ t('setup.goLogin') }}
        </el-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { publicApi } from '@/api/public'
import { adminApi } from '@/api/admin'
import { uploadFile } from '@/api/share'
import { anonymousApi } from '@/api/anonymous'
import { useUserStore } from '@/stores/user'
import { EXPIRE_STYLE_KEYS, EXPIRE_STYLE_I18N_KEYS, type ExpireStyleKey } from '@/config/expireStyles'

/**
 * 首启向导（2026-10-22 重做）：一张长表单 → 四步。
 *
 * 为什么要分步：原来「管理员 + 站点策略 + 政策」全挤在一张表单里，用户
 * 面对十几个字段不知道哪些必填、哪些可跳过；首启这种「一辈子做一次」的
 * 流程反而最难做。分步后每步只问一件事，且**最后一步还能验一次**。
 *
 * 第 2 步的「站点公网地址」是本轮新增的关键项：分享链接此前按请求 origin
 * 拼（前端 ShareResultDialog），NAS 内网部署时生成的链接带内网 IP，发给
 * 外部用户打不开。**这个值没有 IDL 字段可存**（setup.thrift 的 BaseConfig
 * 是强类型的，加字段要走 contracts 发布 + 前端抬钉版），所以走
 * 「建号 → 登录 → admin config API 存 base.public_url」三步落库。
 */
const router = useRouter()
const { t } = useI18n()
const userStore = useUserStore()

const setupFormRef = ref<FormInstance>()
const loading = ref(false)
const alreadyInitialized = ref(false)
/** 当前步骤（0 管理员 / 1 站点地址 / 2 投递策略 / 3 完成） */
const step = ref(0)
/** 服务端是否要求首启令牌（401 时置位，令牌输入框随即出现） */
const tokenRequired = ref(false)
/** 站点公网地址是否已落库（登录或配置写入失败时为 false） */
const urlSaved = ref(true)
/** 端到端自检态：idle / running / pass / warn / fail */
const selfCheck = ref<{ state: 'idle' | 'running' | 'pass' | 'warn' | 'fail'; message: string; detail: string }>({
  state: 'idle',
  message: '',
  detail: ''
})

// 过期样式多选：默认全选（=不限）；取消勾选即裁剪用户可选项。
// 「按取件次数」(count) 后端支持（pkg/utils/expire.go），此前漏在选项外 ⇒
// 用户想用「对方只能取 N 次」这道护栏，首启时根本选不到，只能事后去后台加
// （2026-10-22 易用性审计）。
// 2026-10-22：样式全集与文案键改用**共享常量**（config/expireStyles.ts），
// 管理台的过期样式编辑器共用同一份 ⇒ 不再是"向导一份、管理台没有"。
const expireStyleOptions = [...EXPIRE_STYLE_KEYS]
const expireStyleText = (s: string) =>
  t(EXPIRE_STYLE_I18N_KEYS[s as ExpireStyleKey] ?? 'common.forever')

/** 探测到的当前地址（留空时的回退值，也是提示里给用户看的"本机地址"） */
const detectedOrigin = computed(() => window.location.origin)

const setupForm = reactive({
  adminUsername: '',
  adminEmail: '',
  adminPassword: '',
  confirmPassword: '',
  // 站点
  siteName: '',
  publicUrl: '',
  // 首启令牌（服务端要求时才需要）
  setupToken: '',
  // 站点预配置（可选段）
  uploadSizeMb: 100,
  openUpload: true,
  // 政策段（2026-10-12）
  expireStyles: [...expireStyleOptions] as string[],
  maxSaveDays: 0,
  extensionsText: '',
  allowRegistration: true
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (err?: Error) => void) => {
  if (value !== setupForm.adminPassword) {
    callback(new Error(t('setup.passwordMismatch')))
  } else {
    callback()
  }
}

// 公网地址只允许 http/https（与后端 base.public_url 的校验同口径：
// 挡掉 javascript:/data: 这类可执行 scheme；局域网地址放行）
const validatePublicUrl = (_rule: unknown, value: string, callback: (err?: Error) => void) => {
  const v = (value || '').trim()
  if (!v) {
    callback()
    return
  }
  if (!/^https?:\/\/[^\s/]+/i.test(v)) {
    callback(new Error(t('setup.publicUrlInvalid')))
    return
  }
  callback()
}

// 校验规则与后端 validateInitializeRequest 对齐（用户名≥3 / 密码≥6 / 邮箱含@）
const rules: FormRules = {
  adminUsername: [
    { required: true, message: () => t('setup.adminUsername'), trigger: 'blur' },
    { min: 3, max: 32, message: t('setup.usernameRule'), trigger: 'blur' }
  ],
  adminEmail: [
    { required: true, message: () => t('setup.adminEmail'), trigger: 'blur' },
    { type: 'email', message: t('setup.emailRule'), trigger: 'blur' }
  ],
  adminPassword: [
    { required: true, message: () => t('setup.adminPassword'), trigger: 'blur' },
    { min: 6, max: 64, message: t('setup.passwordRule'), trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: () => t('setup.confirmPassword'), trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ],
  publicUrl: [{ validator: validatePublicUrl, trigger: 'blur' }]
}

// 已初始化则回首页（不做全局守卫强跳，避免路由里发请求）
onMounted(async () => {
  try {
    const res = await publicApi.checkInitialization()
    if (res.initialized) {
      alreadyInitialized.value = true
      router.replace('/')
    }
  } catch {
    // 检查失败不阻断页面（后端不可达时用户可看到表单）
  }
  // 「开放注册」开关的默认值**跟随站点实际配置**，不要硬编码 true：
  // NAS 打包面刻意把注册关掉（PB_USER_ALLOW_REGISTRATION=false，管理员建号），
  // 向导若默认 true 就会在用户走完向导时静默把注册打开（2026-10-22 审计 F6）。
  // 注：/api/config 走 resp.Success → 返回信封 {code,message,data}，字段在 data 里。
  try {
    const cfg = await publicApi.getConfig()
    const enabled = cfg?.data?.registerEnabled
    if (typeof enabled === 'boolean') {
      setupForm.allowRegistration = enabled
    }
  } catch {
    // 拉不到就沿用默认值，不阻断首启
  }
  // 服务端若要求首启令牌，页面应直接能看到令牌输入框而不是等提交后报错
  const fromQuery = new URLSearchParams(window.location.search).get('token')
  if (fromQuery) {
    setupForm.setupToken = fromQuery
    tokenRequired.value = true
  }
})

/** 下一步：先校验当前步的字段 */
const nextStep = async () => {
  if (step.value === 0) {
    const form = setupFormRef.value
    if (!form) return
    const valid = await form.validateField(['adminUsername', 'adminEmail', 'adminPassword', 'confirmPassword']).catch(() => false)
    if (!valid) return
  }
  if (step.value === 1) {
    const form = setupFormRef.value
    if (form) {
      const valid = await form.validateField(['publicUrl']).catch(() => false)
      if (!valid) return
    }
  }
  step.value += 1
}

/** 落库站点公网地址：建号 → 登录 → admin config 整段提交 base */
const persistPublicUrl = async (): Promise<boolean> => {
  const url = setupForm.publicUrl.trim()
  if (!url) return true
  try {
    await userStore.login(setupForm.adminUsername, setupForm.adminPassword)
    // getConfig() 返回的是信封 {code,message,data}，base 在 data 里。
    // 此前误读 cfg.base（恒 undefined）⇒ 展开成空对象 ⇒ 只剩 {public_url}，
    // 整段 base 被覆盖 ⇒ **用户刚填的站点名/描述/端口静默归零**（2026-10-22 审计 F1）。
    const res = await adminApi.getConfig()
    const base = { ...(res.data?.base ?? {}), public_url: url }
    await adminApi.updateConfig({ base })
    return true
  } catch {
    return false
  }
}

/** 取 URL 的 origin（无 origin 时返回空串） */
const originOf = (raw: string): string => {
  const v = (raw || '').trim()
  if (!v) return ''
  try {
    return new URL(v).origin
  } catch {
    return ''
  }
}

/**
 * 端到端自检：发一个测试文件并立刻取回。
 *
 * 为什么首启要做这件事：首启是最容易「看着成功、实际不通」的时刻——
 * 存储不可写、取件码没铸上、公网地址填错（分享出去打不开），这三件事
 * 在控制台上都看不出来，只有真跑一次投递→取件才暴露。自检同时核对
 * 「服务端生成的分享链接地址」与「你填的公网地址」是否一致：不一致时
 * 分享出去就是打不开的链接。
 */
const runSelfCheck = async () => {
  selfCheck.value = { state: 'running', message: t('setup.selfCheckRunning'), detail: '' }
  const started = Date.now()
  try {
    const file = new File(
      [new TextEncoder().encode('PigeonBox setup self-check')],
      'pigeonbox-selfcheck.txt',
      { type: 'text/plain' }
    )
    // 走与寄件台**同一条**上传通道（XHR），不是另起一条路——自检要验的是
    // 用户真正会走的那条链路。
    const res = await uploadFile(file, {
      expire_value: 1,
      expire_style: 'hour',
      require_auth: false,
      encrypted: false
    })
    const pickup = res.pickup_code || res.code
    if (!pickup) throw new Error(t('setup.selfCheckNoCode'))
    const got = await anonymousApi.retrieve({ code: pickup })
    if (!got?.data?.file_name) throw new Error(t('setup.selfCheckRetrieveFailed'))
    const cost = Date.now() - started

    // 地址一致性：服务端生成的分享链接 origin vs 你填的公网地址
    const linkOrigin = originOf(res.url)
    const cfgOrigin = originOf(setupForm.publicUrl.trim())
    if (linkOrigin && cfgOrigin && linkOrigin !== cfgOrigin) {
      selfCheck.value = {
        state: 'warn',
        message: t('setup.selfCheckUrlMismatch'),
        detail: `${t('setup.selfCheckLinkOrigin')}: ${linkOrigin} · ${t('setup.selfCheckCfgOrigin')}: ${cfgOrigin}`
      }
      return
    }
    selfCheck.value = {
      state: 'pass',
      message: t('setup.selfCheckPassed'),
      detail: `${t('setup.doneSiteAddress')}: ${cfgOrigin || linkOrigin} · ${t('setup.donePickupCode')}: ${pickup} · ${cost}ms`
    }
  } catch (error: unknown) {
    const msg = (error as { message?: string })?.message || ''
    selfCheck.value = {
      state: 'fail',
      message: t('setup.selfCheckFailed'),
      detail: msg
    }
  }
}

const handleSubmit = async () => {
  if (!setupFormRef.value || alreadyInitialized.value) return

  try {
    await setupFormRef.value.validate()
    loading.value = true

    // 首启令牌走 Cookie 通道（不改 IDL 契约的请求体：setup.thrift 的
    // InitializeReq 是强类型的，加字段要走 contracts 发布 + 前端抬钉版）。
    if (setupForm.setupToken.trim()) {
      document.cookie = `pb_setup_token=${encodeURIComponent(setupForm.setupToken.trim())}; path=/; max-age=600`
    }

    // 成功：HTTP 200 + {message, username}；失败：拦截器抛错（HTTP 400/403/500）
    const exts = setupForm.extensionsText
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const res = await publicApi.initializeSystem({
      admin_username: setupForm.adminUsername,
      admin_password: setupForm.adminPassword,
      admin_email: setupForm.adminEmail,
      // 站点预配置：站点名非空才携带 base_config；其余两项始终携带
      // thriftgo required 字段需显式存在；port/host 后端以现网配置覆盖
      ...(setupForm.siteName.trim()
        ? { base_config: { name: setupForm.siteName.trim(), description: '', port: 0, host: '' } }
        : {}),
      site_config: {
        upload_size_mb: setupForm.uploadSizeMb,
        open_upload: setupForm.openUpload,
        // 政策段（可选；不传 = 保持默认）：全选过期=不限、0 天=不限、空扩展名=不限类型
        allowed_expire_styles: setupForm.expireStyles,
        ...(setupForm.maxSaveDays > 0 ? { max_save_days: setupForm.maxSaveDays } : {}),
        ...(exts.length > 0 ? { allowed_extensions: exts } : {}),
        allow_registration: setupForm.allowRegistration
      }
    })

    // 令牌是一次性的：建号成功即清（避免长期留在浏览器里）
    document.cookie = 'pb_setup_token=; path=/; max-age=0'

    // 站点公网地址落库（建号后用刚建的账号登录 → admin config API）
    urlSaved.value = await persistPublicUrl()

    ElMessage.success(res.message || t('setup.success'))
    step.value = 3
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string }
    const msg = err?.message || ''
    // 401 = 首启令牌缺失/错误（服务端门禁）：不是会话问题，令牌输入框即刻出现
    if (err?.code === 401) {
      tokenRequired.value = true
      step.value = 1
      ElMessage.error(t('setup.tokenInvalid'))
      return
    }
    ElMessage.error(msg || t('setup.failed'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.setup-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--color-bg);
  padding: var(--spacing-xl);
}

.setup-card {
  width: 100%;
  max-width: 560px;
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-2xl);
  box-shadow: var(--shadow-md);
}

.setup-header {
  text-align: center;
  margin-bottom: var(--spacing-lg);
}

.logo-icon {
  display: flex;
  justify-content: center;
  margin-bottom: var(--spacing-sm);
}

.logo-img {
  width: 48px;
  height: 48px;
}

.setup-header h1 {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
}

.setup-desc {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.setup-alert {
  margin-bottom: var(--spacing-md);
}

.setup-steps {
  margin-bottom: var(--spacing-xl);
}

.setup-step-body {
  min-height: 260px;
}

.field-hint {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-top: var(--spacing-xs);
  line-height: 1.5;
}

.switch-hint {
  margin-left: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.setup-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

.submit-btn {
  flex: 1;
}

.setup-done-rows {
  margin: var(--spacing-md) 0;
}

.setup-done-row {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.setup-done-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.setup-done-value {
  font-size: var(--font-size-sm);
  word-break: break-all;
  text-align: right;
}

.setup-done-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

/* 端到端自检块 */
.setup-selfcheck {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.setup-selfcheck-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.setup-selfcheck-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: 600;
}

.setup-footer {
  margin-top: var(--spacing-lg);
  text-align: center;
}

@media (max-width: 640px) {
  .setup-container {
    padding: var(--spacing-md);
    align-items: flex-start;
  }

  .setup-card {
    padding: var(--spacing-lg);
  }

  .setup-step-body {
    min-height: 0;
  }
}
</style>
