<template>
  <div class="share-settings">
    <div class="setting-group expire-row">
      <label class="setting-label">
        <el-icon><Clock /></el-icon>
        {{ t('upload.expire') }}
      </label>
      <!-- 有效期胶囊预设（1/7/30 天 + 按次数 + 永久）；管理台白名单裁剪掉 day/forever
           或当前值不在预设内时，回落数字+单位表单（保底可编辑）。
           ⚠️ 胶囊分支与兜底分支必须包在 <template v-if>/<template v-else> 里：
           直接在中间插一个 v-if 元素会**抢走 v-else 的配对**，导致兜底表单与
           胶囊同时渲染（2026-10-22 浏览器实测抓到：发件页出现两套重复控件）。 -->
      <template v-if="capsuleMode">
        <el-radio-group v-model="activePreset" class="expire-capsules">
          <el-radio-button v-for="p in availablePresets" :key="p.key" :value="p.key">
            {{ t(p.labelKey) }}
          </el-radio-button>
        </el-radio-group>
        <!-- 「按次数」的次数值：胶囊只能表达样式，取几次要另给输入（2026-10-22） -->
        <div v-if="settings.expire_style === 'count'" class="expire-count-input">
          <el-input-number
            v-model="settings.expire_value"
            :min="1"
            :max="999"
            controls-position="right"
          />
          <span class="expire-count-unit">{{ t('upload.expirePreset.countUnit') }}</span>
        </div>
      </template>
      <div v-else class="expire-inputs">
        <el-input-number
          v-if="settings.expire_style !== 'forever'"
          v-model="settings.expire_value"
          :min="1"
          :max="999"
          controls-position="right"
        />
        <span v-else class="forever-hint">{{ t('common.forever') }}</span>
        <el-select v-model="settings.expire_style" class="expire-select">
          <el-option v-for="u in units" :key="u" :label="unitLabel(u)" :value="u" />
        </el-select>
      </div>
    </div>

    <!-- 更多设置（默认折叠，对标上游"主面只留有效期"的极简一卡） -->
    <el-collapse v-if="showPassword || showCustom || showE2e || showNote" class="more-settings">
      <el-collapse-item :title="t('upload.moreSettings')" name="more">
        <div v-if="showNote" class="setting-group">
          <label class="setting-label">
            <el-icon><Memo /></el-icon>
            {{ t('upload.note') }}
          </label>
          <el-input
            v-model="settings.note"
            type="textarea"
            :rows="2"
            :placeholder="t('upload.notePlaceholder')"
            maxlength="500"
            show-word-limit
          />
        </div>
        <div v-if="showPassword" class="setting-group">
          <div class="setting-row">
            <label class="setting-label">
              <el-icon><Lock /></el-icon>
              {{ t('upload.requirePassword') }}
            </label>
            <el-switch
              v-model="settings.require_auth"
              :active-text="t('upload.needPassword')"
              :inactive-text="t('upload.publicAccess')"
            />
          </div>
          <el-input
            v-if="settings.require_auth"
            v-model="settings.password"
            type="password"
            :placeholder="t('upload.passwordPlaceholder')"
            show-password
            maxlength="64"
            class="password-input"
          />
        </div>

        <div v-if="showCustom" class="setting-group">
          <label class="setting-label">
            <el-icon><EditPen /></el-icon>
            {{ t('upload.customCode') }}
          </label>
          <el-input
            v-model="settings.custom_code"
            :placeholder="t('upload.customCodePlaceholder')"
            maxlength="32"
            style="max-width: 280px"
          />
        </div>

        <div v-if="showE2e" class="setting-group">
          <div class="setting-row">
            <label class="setting-label">
              <el-icon><Key /></el-icon>
              {{ t('upload.e2e.title') }}
            </label>
            <el-switch
              v-model="settings.e2e"
              :active-text="t('upload.e2e.on')"
              :inactive-text="t('upload.e2e.off')"
              :disabled="!e2eAvailable"
            />
          </div>
          <!-- 不可用时（明文 HTTP 的局域网访问 ⇒ 无 WebCrypto）：明说原因，
               别让用户填完表点发送才吃一个 toast（且分享根本没建）。 -->
          <div v-if="!e2eAvailable" class="e2e-hint e2e-hint--warn">
            {{ t('upload.e2e.needSecureContext') }}
          </div>
          <div v-else class="e2e-hint">{{ t(e2eHintKey) }}</div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, Lock, EditPen, Key, Memo } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'
import type { ShareSettings, ShareExpireStyle } from '@/composables/useShareSettings'
import { EXPIRE_STYLE_KEYS } from '@/config/expireStyles'
import { e2eSupported } from '@/utils/e2e'

/**
 * 分享设置表单（过期/密码/自定义码/E2E）——收敛自 FileUpload 与 TextShare 的同构模板块。
 * settings 由调用方经 useShareSettings() 创建并持有，本组件直接双向绑定其字段。
 */
const props = withDefaults(defineProps<{
  settings: ShareSettings
  showPassword?: boolean
  /** 'auto' = 登录用户才显示自定义取件码（原有语义） */
  showCustomCode?: boolean | 'auto'
  showE2e?: boolean
  /** 文件备注（随文件分享展示给取件人）；文本分享不适用不传 */
  showNote?: boolean
  /** 场景：E2E 提示按场景区分（文件有 ≤100MB 限制,文本没有） */
  context?: 'file' | 'text'
  units?: ShareExpireStyle[]
}>(), {
  showPassword: true,
  showCustomCode: 'auto',
  showE2e: true,
  showNote: false,
  context: 'file',
  // 对标上游：管理台"允许的过期样式"白名单驱动前端可选集（/api/config.expireStyle）
  units: () => {
    const allowed = useConfigStore().config?.expireStyle
    if (allowed && allowed.length) return allowed as ShareExpireStyle[]
    // 配置未就绪时的兜底：用共享常量（此前硬编码 7 个 ⇒ 漏了 count，
    // 兜底期间「按取件次数」选不到——2026-10-22 审计）
    return [...EXPIRE_STYLE_KEYS]
  },
})

const userStore = useUserStore()
const { t } = useI18n()

// ==================== 有效期胶囊预设 ====================
// 既有语义：expire_value（数值）+ expire_style（minute/hour/day/week/month/year/forever/count）。
// 胶囊必须成对映射回这两个字段：7 天 = (7, 'day')，永久 = (0, 'forever')，
// 按次数 = (N, 'count')——N 由旁边的次数输入框给（胶囊只表达样式）。
const EXPIRE_PRESETS = [
  { key: 'd1', value: 1, style: 'day', labelKey: 'upload.expirePreset.day1' },
  { key: 'd7', value: 7, style: 'day', labelKey: 'upload.expirePreset.day7' },
  { key: 'd30', value: 30, style: 'day', labelKey: 'upload.expirePreset.day30' },
  // 「按取件次数」：对方最多只能取 N 次（2026-10-22 补进日常发件流）
  { key: 'count', value: 1, style: 'count', labelKey: 'upload.expirePreset.count' },
  { key: 'forever', value: 0, style: 'forever', labelKey: 'upload.expirePreset.forever' },
] as const

// 白名单裁剪：管理台禁用的样式不出现（如禁了 day 则只剩永久）
const availablePresets = computed(() =>
  EXPIRE_PRESETS.filter((p) => props.units.includes(p.style))
)

// 当前值命中的胶囊；未命中（自定义值/白名单裁剪掉了当前样式）→ 回落数字+单位表单
const currentPresetKey = computed(() => {
  const hit = availablePresets.value.find(
    (p) =>
      p.style === props.settings.expire_style &&
      // count 的次数值可由用户自由改 ⇒ 只按样式匹配；其余按（样式,值）精确匹配
      // （否则改一次数就会弹回兜底表单，胶囊选择丢失）
      (p.style === 'count' || p.value === props.settings.expire_value)
  )
  return hit ? hit.key : ''
})

// 胶囊可用条件：至少两个预设（否则胶囊无意义）且当前值能落到某个胶囊上
const capsuleMode = computed(() => availablePresets.value.length >= 2 && currentPresetKey.value !== '')

const activePreset = computed({
  get: () => currentPresetKey.value,
  set: (key: string) => {
    const hit = EXPIRE_PRESETS.find((p) => p.key === key)
    if (!hit) return
    props.settings.expire_value = hit.value
    props.settings.expire_style = hit.style
  },
})

onMounted(() => {
  // 默认有效期 1 天 → 7 天（产品决策：1 天覆盖不了"周末发、周一取"）；
  // 仅在仍是出厂默认(1 天)时改写，调用方传入的自定义初值不动
  if (
    props.settings.expire_value === 1 &&
    props.settings.expire_style === 'day' &&
    props.units.includes('day')
  ) {
    props.settings.expire_value = 7
  }
})

const e2eHintKey = computed(() =>
  props.context === 'text' ? 'upload.e2e.hintText' : 'upload.e2e.hint'
)

// 端到端加密在当前访问方式下**能不能用**（WebCrypto 只在安全上下文可用：
// HTTPS 或 localhost ⇒ 明文 HTTP 的局域网访问用不了）。
// 不可用时开关直接禁用并说明原因，而不是让用户填完表点发送才失败（2026-10-24 实测）。
const e2eAvailable = computed(() => e2eSupported())

const showCustom = computed(() =>
  props.showCustomCode === 'auto' ? userStore.isLoggedIn : props.showCustomCode
)

const UNIT_KEYS: Record<ShareExpireStyle, string> = {
  minute: 'common.minutes',
  hour: 'common.hours',
  day: 'common.days',
  week: 'common.weeks',
  month: 'common.months',
  year: 'common.years',
  forever: 'common.forever',
  // 「按取件次数」：兜底表单（数字+单位）里的单位是「次」
  count: 'upload.expirePreset.countUnit',
}
const unitLabel = (u: ShareExpireStyle) => t(UNIT_KEYS[u])
</script>

<style scoped>
.forever-hint {
  display: inline-flex;
  align-items: center;
  min-width: 90px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
/* 「按次数」的次数输入（胶囊旁） */
.expire-count-input {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
}
.expire-count-unit {
  color: var(--color-text-secondary);
  font-size: 13px;
}
.share-settings {
  margin-bottom: 12px;
}

.setting-group {
  margin-bottom: 16px;
}

/* 有效期行式布局：label 居左，控件居右（对标上游 过期时间 [1][天]） */
.expire-row .setting-label {
  margin-bottom: 8px;
}

/* 有效期胶囊（分段控件）：1/7/30 天 + 永久，窄屏可换行 */
.expire-capsules {
  display: flex;
  flex-wrap: wrap;
}

.expire-capsules :deep(.el-radio-button__inner) {
  padding: 10px 18px;
  font-size: 14px;
}

.expire-row .expire-inputs {
  display: flex;
  align-items: center;
}

.setting-group:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--color-text-regular);
  font-size: 14px;
}

.expire-inputs {
  display: flex;
  gap: 12px;
}

.expire-select {
  width: 120px;
}

.more-settings {
  margin-top: 4px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.more-settings :deep(.el-collapse-item__header) {
  height: 44px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-card-bg);
  border-bottom: none;
}

.more-settings :deep(.el-collapse-item__wrap) {
  border-bottom: none;
  background: var(--color-card-bg);
}

/* EP 默认只有 padding-bottom，内容会贴死左右边框（图标被裁切） */
.more-settings :deep(.el-collapse-item__content) {
  padding: 4px 16px 16px;
}

/* 开关型设置行：label 居左、开关居右（窄屏换行） */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.setting-row .setting-label {
  margin-bottom: 0;
}

.password-input {
  margin-top: 12px;
}

.e2e-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>
