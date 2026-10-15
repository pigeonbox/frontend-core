<template>
  <div class="get-share-container">
    <!-- 统一取件入口（2026-10-09 融合 /retrieve 执行逻辑：就地 Peek 预检，
         无密码一键取件，有密码就地展开密码框；2026-10-12 起输入锁 6 格，
         旧 8 位码/自定义口令仅粘贴或深链静默兜底走分享详情页） -->
    <div class="pickup-section" @keydown.enter="onEnter">
      <CodeBoxes
        ref="codeBoxesRef"
        v-model="code"
        :length="PICKUP_LEN"
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

// ---- 防抖自动提交：填满后短暂停顿才分派，续输即取消 ----
let autoTimer: ReturnType<typeof setTimeout> | null = null
// 程序化回显守卫：粘贴/溢出后把前 6 位写回分格会触发 code watch，
// 此间不得再排自动提交（整串已按分享详情分派，截断串不许碰取件）
let echoGuard = false
const cancelAutoSubmit = () => {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
}
const scheduleAutoSubmit = (value: string) => {
  cancelAutoSubmit()
  if (echoGuard) return
  autoTimer = setTimeout(() => {
    autoTimer = null
    if (value.length === PICKUP_LEN) void submitPickup(value)
  }, AUTO_SUBMIT_MS)
}

const onComplete = (value: string) => scheduleAutoSubmit(value)

// 键入溢出（末格续输第 7 位等）：与超长粘贴同规整——整串走分享详情页，
// 绝不拿被截断的前 6 位去碰运气取件
const onExpand = (full: string) => {
  cancelAutoSubmit()
  const target = resolveDispatch(full)
  if (!target) return
  echoGuard = true
  code.value = full.slice(0, PICKUP_LEN)
  follow(target)
  nextTick(() => {
    echoGuard = false
  })
}

// 粘贴整段：恰 6 位 → 立即取件；>6 位（旧 8 位码/自定义口令/联邦码）
// → 显示前 6 位、整串静默走分享详情页兜底
const onPasteCode = (text: string) => {
  cancelAutoSubmit()
  const plan = planPaste(text)
  echoGuard = true
  code.value = plan.display
  nextTick(() => {
    echoGuard = false
  })
  if (plan.target) {
    follow(plan.target)
    return
  }
  nextTick(() => codeBoxesRef.value?.focus(plan.display.length))
}

// 任何内容变化都重置自动提交：填满后续输/改格（长度不变但字符变）也必须
// 取消旧定时器，否则会把改格前的旧串（或截断串）拿去取件
watch(code, (v) => {
  cancelAutoSubmit()
  if (v.length === PICKUP_LEN) scheduleAutoSubmit(v)
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
  echoGuard = true
  code.value = clean.slice(0, PICKUP_LEN)
  nextTick(() => {
    echoGuard = false
  })
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
