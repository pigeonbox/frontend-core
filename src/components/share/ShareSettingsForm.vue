<template>
  <div class="share-settings">
    <div class="setting-group expire-row">
      <label class="setting-label">
        <el-icon><Clock /></el-icon>
        {{ t('upload.expire') }}
      </label>
      <div class="expire-inputs">
        <el-input-number
          v-model="settings.expire_value"
          :min="1"
          :max="999"
          controls-position="right"
        />
        <el-select v-model="settings.expire_style" class="expire-select">
          <el-option v-for="u in units" :key="u" :label="unitLabel(u)" :value="u" />
        </el-select>
      </div>
    </div>

    <!-- 更多设置（默认折叠，对标上游"主面只留有效期"的极简一卡） -->
    <el-collapse v-if="showPassword || showCustom || showE2e" class="more-settings">
      <el-collapse-item :title="t('upload.moreSettings')" name="more">
        <div v-if="showPassword" class="setting-group">
          <label class="setting-label">
            <el-icon><Lock /></el-icon>
            {{ t('upload.requirePassword') }}
          </label>
          <el-switch
            v-model="settings.require_auth"
            :active-text="t('upload.needPassword')"
            :inactive-text="t('upload.publicAccess')"
          />
          <el-input
            v-if="settings.require_auth"
            v-model="settings.password"
            type="password"
            :placeholder="t('upload.passwordPlaceholder')"
            show-password
            maxlength="64"
            style="margin-top: 8px"
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
          <label class="setting-label">
            <el-icon><Key /></el-icon>
            {{ t('upload.e2e.title') }}
          </label>
          <el-switch
            v-model="settings.e2e"
            :active-text="t('upload.e2e.on')"
            :inactive-text="t('upload.e2e.off')"
          />
          <div class="e2e-hint">{{ t('upload.e2e.hint') }}</div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, Lock, EditPen, Key } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'
import type { ShareSettings, ShareExpireStyle } from '@/composables/useShareSettings'

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
  units?: ShareExpireStyle[]
}>(), {
  showPassword: true,
  showCustomCode: 'auto',
  showE2e: true,
  // 对标上游：管理台"允许的过期样式"白名单驱动前端可选集（/api/config.expireStyle）
  units: () => {
    const allowed = useConfigStore().config?.expireStyle
    if (allowed && allowed.length) return allowed as ShareExpireStyle[]
    return ['minute', 'hour', 'day', 'week', 'month', 'year', 'forever']
  },
})

const userStore = useUserStore()
const { t } = useI18n()

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
}
const unitLabel = (u: ShareExpireStyle) => t(UNIT_KEYS[u])
</script>

<style scoped>
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
  background: var(--color-muted);
}

.e2e-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>
