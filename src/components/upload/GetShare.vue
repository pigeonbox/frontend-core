<template>
  <div class="get-share-container">
    <!-- 统一取件入口（2026-10-09 融合 /retrieve 执行逻辑：就地 Peek 预检，
         无密码一键取件，有密码就地展开密码框；8 位码仍跳分享详情页） -->
    <div class="pickup-section" @keydown.enter="onEnter">
      <CodeBoxes
        ref="codeBoxesRef"
        v-model="code"
        :length="boxLength"
        :disabled="pickupPhase !== 'input'"
        :aria-label="t('home.getShare.pickupTitle')"
        @complete="onComplete"
        @paste-code="onPasteCode"
        @expand="onExpand"
      />
      <p class="pickup-hint">{{ hintText }}</p>

      <!-- 密码相位：就地输密码（分享要求取件密码时 Peek 预检展开） -->
      <div v-if="pickupPhase === 'needPassword'" class="pickup-password">
        <el-input
          ref="passwordInputRef"
          v-model="pickupPassword"
          type="password"
          show-password
          size="large"
          class="pw-input"
          :placeholder="t('anonymous.passwordPlaceholder')"
          @keyup.enter="confirmPassword"
        >
          <template #prefix>
            <el-icon><Lock /></el-icon>
          </template>
        </el-input>
        <a class="pw-cancel" @click="onCancelPassword">{{ t('common.cancel') }}</a>
      </div>

      <el-button
        type="primary"
        size="large"
        class="get-btn"
        :loading="pickupPhase === 'submitting'"
        :disabled="pickupPhase === 'needPassword' ? !pickupPassword : !code"
        @click="onSubmitClick"
      >
        <template v-if="pickupPhase !== 'submitting'" #icon>
          <el-icon><Download /></el-icon>
        </template>
        {{ t('anonymous.submit') }}
      </el-button>
    </div>

    <LocalHistoryDialog ref="historyDialog" @pickup="onHistoryPickup" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Download, Lock } from '@element-plus/icons-vue'
import CodeBoxes from '@/components/retrieve/CodeBoxes.vue'
import LocalHistoryDialog from '@/components/history/LocalHistoryDialog.vue'
import { useConfigStore } from '@/stores/config'
import { usePickup } from '@/composables/usePickup'
import {
  AUTO_SUBMIT_MS,
  MAX_BOXES,
  PICKUP_LEN,
  planPaste,
  resolveDispatch,
} from '@/utils/codeInput'

interface Props {
  /** 深链接码（/?code=，联邦/旧收藏落地）：一律走就地取件，任意 3-64 位 */
  deepCode?: string
}

const props = defineProps<Props>()
const router = useRouter()
const { t } = useI18n()
const configStore = useConfigStore()

const {
  phase: pickupPhase,
  password: pickupPassword,
  submit: submitPickup,
  confirmPassword,
  cancelPassword,
} = usePickup()

const code = ref('')
const boxLength = ref(PICKUP_LEN)
const codeBoxesRef = ref<InstanceType<typeof CodeBoxes>>()
const passwordInputRef = ref<{ focus: () => void }>()
const historyDialog = ref<InstanceType<typeof LocalHistoryDialog>>()

// 大小写提示跟随后台配置；旧后端未下发时中性表述
const hintText = computed(() => {
  const base = t('home.getShare.autoHint')
  const fold = configStore.config?.codeCaseInsensitive
  if (fold === undefined) return base
  return `${base}；${t(fold ? 'home.getShare.caseInsensitive' : 'home.getShare.caseSensitive')}`
})

const goShare = (c: string) => {
  router.push(`/share/${c}`)
}

const follow = (target: NonNullable<ReturnType<typeof resolveDispatch>>) => {
  if (target.kind === 'retrieve') void submitPickup(target.code)
  else goShare(target.code)
}

// 按码长分派：6 位 → 就地匿名取件（Peek 预检，密码就地展开）；
// 其余 → 分享详情页（/share/select 查库）
const dispatchCode = (raw: string) => {
  cancelAutoSubmit()
  const target = resolveDispatch(raw)
  if (!target) {
    ElMessage.warning(t('home.getShare.emptyCode'))
    return
  }
  follow(target)
}

const onSubmitClick = () => {
  if (pickupPhase.value === 'needPassword') {
    void confirmPassword()
    return
  }
  dispatchCode(code.value)
}

const onEnter = () => {
  if (pickupPhase.value === 'needPassword') {
    if (pickupPassword.value) void confirmPassword()
    return
  }
  if (code.value) dispatchCode(code.value)
}

// ---- 防抖自动提交：填满后短暂停顿才分派，续输即取消（防手输 8 位码在第 6 位误触发） ----
let autoTimer: ReturnType<typeof setTimeout> | null = null
const cancelAutoSubmit = () => {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
}
const scheduleAutoSubmit = (value: string) => {
  cancelAutoSubmit()
  autoTimer = setTimeout(() => {
    autoTimer = null
    if (value.length === PICKUP_LEN) void submitPickup(value)
    else if (value.length === MAX_BOXES) goShare(value)
  }, AUTO_SUBMIT_MS)
}

const onComplete = (value: string) => scheduleAutoSubmit(value)

// 手输第 7 位：扩到 8 格，焦点跟进；满 8 位重新挂防抖
const onExpand = (value: string) => {
  cancelAutoSubmit()
  boxLength.value = MAX_BOXES
  code.value = value.slice(0, MAX_BOXES)
  nextTick(() => codeBoxesRef.value?.focus(code.value.length))
  if (code.value.length === MAX_BOXES) scheduleAutoSubmit(code.value)
}

// 粘贴整段：6 位 → 立即取件；7 位 → 扩格回显等按钮；≥8 位 → 显示前 8 位、整串走分享
const onPasteCode = (text: string) => {
  cancelAutoSubmit()
  const plan = planPaste(text)
  if (plan.expand) boxLength.value = MAX_BOXES
  code.value = plan.display
  if (plan.target) {
    follow(plan.target)
    return
  }
  nextTick(() => codeBoxesRef.value?.focus(plan.display.length))
}

// 中途删改时撤掉待发的自动提交
watch(code, (v) => {
  if (v.length !== boxLength.value) cancelAutoSubmit()
})

const onHistoryPickup = (c: string) => {
  const target = resolveDispatch(c)
  if (target) follow(target)
}

// 深链接码（联邦口令/旧收藏 ?code= 落地）：任意 3-64 位都走就地取件
watch(() => props.deepCode, (c) => {
  const clean = (c || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  if (!clean) return
  cancelAutoSubmit()
  if (clean.length > PICKUP_LEN) boxLength.value = MAX_BOXES
  code.value = clean.slice(0, MAX_BOXES)
  void submitPickup(clean)
}, { immediate: true })

const onCancelPassword = () => {
  cancelPassword()
  nextTick(() => codeBoxesRef.value?.focus())
}

// 密码相位展开时聚焦密码框
watch(pickupPhase, (p) => {
  if (p === 'needPassword') {
    nextTick(() => passwordInputRef.value?.focus?.())
  }
})

onMounted(() => {
  if (!props.deepCode) codeBoxesRef.value?.focus()
})

defineExpose({
  /** 顶栏「取件」按钮：聚焦取件输入框 */
  focus: () => codeBoxesRef.value?.focus(),
  /** 卡内页脚「取件 / 发件记录」链接：打开本机记录弹窗 */
  openHistory: () => historyDialog.value?.open('pickup'),
})
</script>

<style scoped>
.get-share-container {
  padding: 0;
}

.pickup-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: var(--spacing-md) 0 var(--spacing-xs);
}

.pickup-hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.pickup-password {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 360px;
}

.pw-input :deep(.el-input__wrapper) {
  padding: 8px 14px;
  border-radius: var(--radius-md);
}

.pw-cancel {
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.pw-cancel:hover {
  color: var(--primary-color);
}

.get-btn {
  width: 100%;
  max-width: 500px;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 999px;
  background: var(--primary-color);
  border: none;
  transition: opacity 0.2s ease;
}

.get-btn:hover:not(:disabled) {
  opacity: 0.92;
}
</style>
