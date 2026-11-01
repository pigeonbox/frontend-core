<template>
  <div class="text-share-container">
    <!-- 访客准入：管理后台关闭匿名上传时，未登录用户显示提示而非输入区（与 FileUpload 对齐；
         此前文本 tab 不提示,访客填完提交才吃 403） -->
    <el-alert
      v-if="visitorUploadBlocked"
      type="warning"
      :title="t('upload.visitorDisabled')"
      :closable="false"
      show-icon
      class="visitor-blocked"
    />
    <div v-else class="text-input-area">
      <el-input
        v-model="textContent"
        type="textarea"
        :rows="4"
        :placeholder="t('upload.textPlaceholder')"
        resize="none"
        class="text-area"
      >
        <!-- 字节口径计数（2026-10-22）：上限判定本就是字节（textMaxBytes），
             此前 maxlength="10000"（字符）会把超长文本静默截断，
             字节预检永远触发不到；改为不设字符上限 + 显示字节数。 -->
        <template #counter>
          <span :class="{ 'over-limit': byteLength > textMaxBytes }">
            {{ formatSize(byteLength) }} / {{ formatSize(textMaxBytes) }}
          </span>
        </template>
      </el-input>
    </div>

    <!-- 分享设置（与 FileUpload 共用 ShareSettingsForm；text 场景,E2E 提示不带文件体积限制） -->
    <ShareSettingsForm :settings="settings" context="text" />

    <el-button
      v-if="!visitorUploadBlocked"
      type="primary"
      size="large"
      class="share-btn"
      :loading="sharing"
      :disabled="!textContent.trim()"
      @click="handleShare"
    >
      <template #icon>
        <el-icon v-if="!sharing"><Promotion /></el-icon>
      </template>
      {{ sharing ? t('upload.textSharing') : t('upload.textShareBtn') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { shareApi } from '@/api/share'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '@/stores/config'
import { Promotion } from '@element-plus/icons-vue'
import { encryptText, generateKeyB64 } from '@/utils/e2e'
import { useUserStore } from '@/stores/user'
import { useShareSettings } from '@/composables/useShareSettings'
import { translateError } from '@/utils/api-interceptor'
import { formatFileSize as formatSize } from '@/utils/format'
import ShareSettingsForm from '@/components/share/ShareSettingsForm.vue'

const { t } = useI18n()
const userStore = useUserStore()
const configStore = useConfigStore()

// 与 FileUpload 同款访客准入判定：公开配置 openUpload=false 时未登录不可上传
const visitorUploadBlocked = computed(
  () => !userStore.isLoggedIn && configStore.config?.openUpload === false
)

const emit = defineEmits<{
  success: [result: {
    code: string
    share_url: string
    full_share_url: string
    e2e_key?: string
    file_name?: string
    has_password?: boolean
    pickup_code?: string
    /** 过期样式与数值：成功弹窗据此回显「对方最多可取 N 次」（count 样式） */
    expire_style?: string
    expire_value?: number
  }]
}>()

const textContent = ref('')
const sharing = ref(false)

// 文本上限：字节口径（后端公开配置 textMaxBytes，缺省 222KB）
const textMaxBytes = computed(() => configStore.config?.textMaxBytes || 222 * 1024)
// 当前文本字节数（UTF-8，与后端入库口径一致）
const byteLength = computed(() => new TextEncoder().encode(textContent.value).length)

// 分享设置（过期/密码/自定义码/E2E）——与 FileUpload 共用同一状态机
const { settings, validate } = useShareSettings()

const handleShare = async () => {
  if (!textContent.value.trim()) {
    ElMessage.warning(t('upload.textRequired'))
    return
  }
  if (!validate()) {
    ElMessage.warning(t('upload.passwordRequired'))
    return
  }

  // 超限预检（对标上游"内容过多，建议改用文件"引导）：byte 级而非字符级
  if (byteLength.value > textMaxBytes.value) {
    ElMessage.warning(t('upload.textTooLargeHint'))
    return
  }

  sharing.value = true

  try {
    // E2E：生成密钥并加密文本（密文 base64 作为分享内容；密钥随链接传递）
    let e2eKey = ''
    let payloadText = textContent.value
    if (settings.e2e) {
      e2eKey = await generateKeyB64()
      payloadText = await encryptText(e2eKey, textContent.value)
    }

    const res = await shareApi.shareText({
      text: payloadText,
      ...settings,
      encrypted: settings.e2e,
      custom_code: userStore.isLoggedIn ? settings.custom_code : '',
    })

    if (res.code === 200) {
      ElMessage.success(t('upload.textShared'))

      emit('success', {
        code: res.data.code,
        share_url: res.data.url,
        full_share_url: res.data.url,
        e2e_key: e2eKey || undefined,
        // file_name 故意不传：文本分享无直链下载端点，成功弹窗据此隐藏命令行 Tab
        has_password: !!settings.password,
        // 文本/文件分享同权铸造 6 位取件码（E2E 密文分享为空），成功弹窗展示快捷卡
        pickup_code: res.data.pickup_code || undefined,
        // 过期样式与数值：成功弹窗据此回显「对方最多可取 N 次」（count 样式）
        // ——服务端只给时间，次数语义必须由本地选择值带过去（2026-10-22）
        expire_style: settings.expire_style,
        expire_value: settings.expire_value,
      })

      // 重置
      textContent.value = ''
    } else {
      throw new Error(res.message || t('upload.textShareFailed'))
    }
  } catch (error: unknown) {
    // 错误码统一翻译（errcode/网络/HTTP 兜底），不裸抛后端英文原文
    const tr = translateError(error)
    ElMessage.error(tr.i18nKey ? t(tr.i18nKey) : tr.fallback || t('upload.textShareFailed'))
  } finally {
    sharing.value = false
  }
}
</script>

<style scoped>
.text-share-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}

/* 文本框弹性填充:等高 tab 方案下与文件 tab 拖拽区同高(容器高度由 grid 叠放统一),
   替代旧"实测 224px"硬编码对齐——那会随拖拽区样式漂移 */
.text-input-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-bottom: 24px;
}

.text-area {
  flex: 1;
  display: flex;
}

.text-area :deep(.el-textarea__inner) {
  flex: 1;
  min-height: 180px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  font-size: 15px;
  line-height: 1.6;
  transition: border-color 0.2s ease;
}

.text-area :deep(.el-textarea__inner:focus) {
  border-color: var(--primary-color);
}

/* 字节计数超限标红（提示改用文件分享） */
.over-limit {
  color: var(--color-danger);
}

/* 设置表单样式内聚于 ShareSettingsForm 组件 */

.share-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-md);
  background: var(--primary-color);
  border: none;
  transition: opacity 0.2s ease;
}

.share-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.share-btn:disabled {
  opacity: 0.5;
}

.icon-primary {
  color: var(--primary-color);
}
</style>
