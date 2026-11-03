<template>
  <div class="fd-container">
    <!-- 这条路径的语义必须在动手前就说清：文件投到**另一个柜子**，取件码归对方柜 -->
    <p class="fd-intro">{{ t('home.federation.intro') }}</p>

    <el-form label-position="top" class="fd-form" @submit.prevent>
      <el-form-item :label="t('home.federation.targetUrlLabel')" :error="targetUrlError">
        <el-input
          v-model="targetUrl"
          :placeholder="t('home.federation.targetUrlPlaceholder')"
          clearable
          :disabled="submitting"
        />
      </el-form-item>
      <p class="fd-hint">{{ t('home.federation.targetUrlHint') }}</p>

      <el-form-item :label="t('home.federation.titleLabel')">
        <el-input
          v-model="title"
          :placeholder="t('home.federation.titlePlaceholder')"
          maxlength="120"
          :disabled="submitting"
        />
      </el-form-item>

      <el-form-item :label="t('home.federation.noteLabel')">
        <el-input
          v-model="note"
          type="textarea"
          :rows="2"
          :placeholder="t('home.federation.notePlaceholder')"
          maxlength="500"
          :disabled="submitting"
        />
      </el-form-item>

      <el-form-item :label="t('home.federation.filesLabel')">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          :multiple="true"
          :disabled="submitting"
          :on-change="handleFileChange"
        >
          <el-button :disabled="submitting">
            <el-icon><UploadFilled /></el-icon>
            {{ t('home.federation.pickFiles') }}
          </el-button>
        </el-upload>
      </el-form-item>

      <!-- 已选文件（可逐个移除） -->
      <ul v-if="files.length > 0" class="fd-files">
        <li v-for="(f, i) in files" :key="`${f.name}-${f.size}-${i}`" class="fd-file">
          <span class="fd-file-name">{{ f.name }}</span>
          <span class="fd-file-size">{{ formatFileSize(f.size) }}</span>
          <el-button text size="small" :disabled="submitting" @click="removeFile(i)">
            {{ t('home.federation.removeFile') }}
          </el-button>
        </li>
      </ul>

      <el-button
        type="primary"
        size="large"
        class="fd-submit"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ submitting ? t('home.federation.submitting') : t('home.federation.submit') }}
      </el-button>

      <!-- 上传进度（跨站中转：文件要过本站再到对方柜，耗时可能较长） -->
      <el-progress
        v-if="submitting && progressTotal > 0"
        :percentage="progressPercent"
        :show-text="false"
        class="fd-progress"
      />
    </el-form>

    <!-- 失败：服务端文案**照实透传**（前端不发明地址语义：真正的闸在服务端）。
         用行内告警而不是 toast：错误是「这次表单提交」的事，留在表单旁边更贴近上下文
         （也避免与全局 toast 构成双弹）。 -->
    <el-alert
      v-if="errorMessage"
      type="error"
      :title="t('home.federation.deliverFailedTitle')"
      :description="errorMessage"
      :closable="false"
      show-icon
      class="fd-error"
    />

    <!-- 成功：对方柜铸的取件码 + **「此码在对方柜使用」**（产品诚实性） -->
    <div v-if="result" class="fd-result">
      <div class="fd-result-head">
        <el-icon size="20" color="#1677ff"><CircleCheckFilled /></el-icon>
        <span>{{ t('home.federation.deliveredTitle') }}</span>
      </div>

      <template v-if="pickupCode">
        <div class="fd-code-label">{{ t('home.federation.pickupCodeLabel') }}</div>
        <div class="fd-code">{{ pickupCode }}</div>
      </template>
      <p v-else class="fd-no-code">{{ t('home.federation.noPickupCode') }}</p>

      <!-- ⚠️ 这一段是**产品诚实性**，不是文案润色：码是对方柜铸的 ⇒ 访客回本站试
           会「取件码不存在」⇒ 误以为坏了。必须写清「在对方柜使用」。
           ⚠️ 只在**有码**时出现（没码时那句「此取件码…」是无的放矢；
           没码的情形由上面的说明 + 「打开对方柜」按钮交代）。 -->
      <div v-if="pickupCode" class="fd-peer-note">
        <el-icon color="var(--color-warning, #e6a23c)"><WarningFilled /></el-icon>
        <div class="fd-peer-note-text">
          <strong>{{ t('home.federation.codeIsForPeer') }}</strong>
          <p>{{ t('home.federation.codeIsForPeerDesc', { url: peerUrl || t('home.federation.peerUnknown') }) }}</p>
        </div>
      </div>

      <div class="fd-actions">
        <el-button v-if="pickupCode" @click="copyCode">
          {{ t('home.federation.copyCode') }}
        </el-button>
        <el-button v-if="peerUrl" type="primary" @click="openPeer">
          {{ t('home.federation.openPeer') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type UploadFile } from 'element-plus'
import { UploadFilled, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue'
import { federationDeliver, type FederationDeliverData } from '@/api/federation'
import { checkTargetUrl } from '@/components/share/federationTarget'
import { pickupCodeOf } from '@/components/share/federationResult'
import { copyToClipboard } from '@/utils/clipboard'
import { formatFileSize } from '@/utils/format'

const { t } = useI18n()

// 表单状态
const targetUrl = ref('')
const title = ref('')
const note = ref('')
const files = ref<File[]>([])

const submitting = ref(false)
const targetUrlError = ref('')
const errorMessage = ref('')
const result = ref<FederationDeliverData | null>(null)

// 上传进度（xhrSend 的 onProgress：loaded/total）
const loadedBytes = ref(0)
const progressTotal = ref(0)
const progressPercent = computed(() =>
  progressTotal.value > 0 ? Math.min(100, Math.round((loadedBytes.value / progressTotal.value) * 100)) : 0,
)

const canSubmit = computed(() => !submitting.value && files.value.length > 0)

/** 对方柜基址（服务端回显优先；没有就用访客填的那个） */
const peerUrl = computed(() => result.value?.target_url || targetUrl.value.trim())

/**
 * 对方柜铸的取件码。
 *
 * ⚠️ 对方柜**可能不回码**：字段缺省（undefined）与字段空串（''，core 的
 * 「未铸造为空」）**都不是「有码」** ⇒ 不显示空码框，改说「去对方柜查看」。
 */
const pickupCode = computed(() => pickupCodeOf(result.value))

const handleFileChange = (uploadFile: UploadFile) => {
  if (uploadFile.raw) files.value.push(uploadFile.raw)
}

const removeFile = (index: number) => {
  files.value.splice(index, 1)
}

/**
 * 错误文案：服务端回了业务码 ⇒ **照实透传**服务端原文
 * （core 的投递失败原因很具体：「对方柜不在可投递名单」「对方柜收件失败」…，
 * 泛化成「投递失败」会把用户引向错误方向）；
 * 网络/取消类（code=0 / -1）⇒ 用本地化通用文案（此时服务端根本没说话）。
 */
const errorDetail = (e: unknown): string => {
  const err = e as { code?: number; message?: string } | undefined
  const code = err?.code
  const msg = typeof err?.message === 'string' ? err.message.trim() : ''
  if (code === 0 || code === -1 || !msg) return t('home.federation.deliverFailedGeneric')
  return msg
}

const submit = async () => {
  const check = checkTargetUrl(targetUrl.value)
  if (!check.ok) {
    targetUrlError.value = t(
      check.reason === 'empty'
        ? 'home.federation.urlRequired'
        : check.reason === 'credentials'
          ? 'home.federation.urlWithCredentials'
          : 'home.federation.urlInvalid',
    )
    return
  }
  targetUrlError.value = ''

  if (files.value.length === 0) {
    ElMessage.warning(t('home.federation.filesRequired'))
    return
  }

  submitting.value = true
  errorMessage.value = ''
  result.value = null
  loadedBytes.value = 0
  progressTotal.value = 0
  try {
    result.value = await federationDeliver(
      files.value,
      {
        target_url: check.url,
        title: title.value.trim() || undefined,
        note: note.value.trim() || undefined,
      },
      (loaded, total) => {
        loadedBytes.value = loaded
        progressTotal.value = total
      },
    )
  } catch (e) {
    errorMessage.value = errorDetail(e)
  } finally {
    submitting.value = false
  }
}

const copyCode = async () => {
  if (!pickupCode.value) return
  const ok = await copyToClipboard(pickupCode.value)
  ElMessage[ok ? 'success' : 'error'](ok ? t('home.federation.codeCopied') : t('home.federation.copyFailed'))
}

/** 去对方柜取件（取件人站的地方） */
const openPeer = () => {
  if (!peerUrl.value) return
  window.open(peerUrl.value, '_blank', 'noopener')
}
</script>

<style scoped>
.fd-container {
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}

.fd-intro {
  margin: 0 0 var(--spacing-md);
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.fd-form {
  width: 100%;
}

.fd-hint {
  margin: -8px 0 var(--spacing-md);
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.fd-files {
  list-style: none;
  margin: 0 0 var(--spacing-md);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fd-file {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.fd-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fd-file-size {
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.fd-submit {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: var(--radius-md);
  background: var(--primary-color);
  border: none;
}

.fd-submit:hover:not(:disabled) {
  opacity: 0.92;
}

.fd-submit:disabled {
  opacity: 0.5;
}

.fd-progress {
  margin-top: var(--spacing-sm);
}

.fd-error {
  margin-top: var(--spacing-md);
}

.fd-result {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-muted);
}

.fd-result-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.fd-code-label {
  margin-top: var(--spacing-md);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.fd-code {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--primary-color);
  font-variant-numeric: tabular-nums;
}

.fd-no-code {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

/* 「此码在对方柜使用」：限制说明 ⇒ 用警示色区分（与 home.publicUrlNotConfigured 同款口径） */
.fd-peer-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.fd-peer-note-text strong {
  display: block;
  font-size: var(--text-sm);
  color: var(--color-warning, #e6a23c);
}

.fd-peer-note-text p {
  margin: 4px 0 0;
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.fd-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}
</style>
