<template>
  <div class="code-boxes" :class="{ 'is-disabled': disabled }">
    <input
      v-for="(_, i) in length"
      :key="i"
      :ref="(el) => setInputRef(i, el)"
      class="code-box"
      type="text"
      :value="chars[i] || ''"
      :disabled="disabled"
      autocomplete="off"
      :aria-label="`${ariaLabel} ${i + 1}`"
      @input="(e) => onInput(i, e as InputEvent)"
      @keydown="onKeydown(i, $event)"
      @paste.prevent="onPaste"
      @focus="(e) => (e.target as HTMLInputElement).select()"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { splitTyping } from '@/utils/codeInput'

/**
 * 分格取件码输入（对标上游 5 格 OTP 输入模式，2026-10-07）：
 * 逐格输入自动推进、退格回退、方向键导航、整段粘贴分发；
 * 填满 emit `complete`（不抢焦点，调用方可防抖分派或继续输入）；
 * 粘贴超长文本整段 emit `paste-code`、末格续输溢出 emit `expand`，
 * 均交由调用方分派（现役调用方锁 6 格：溢出丢弃，超长粘贴按整串跳转）。
 * 取件码字符表全大写（core/app/anonymous/anonymous.go:38）→ 输入大小写不敏感：
 * 输入统一去空格/横杠并转大写（2026-10-22）。
 * autocomplete 不得用 one-time-code：浏览器会把短信验证码自动灌进 6 格并触发
 * 700ms 自动提交（2026-10-22 修正）。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    length?: number
    disabled?: boolean
    ariaLabel?: string
  }>(),
  { length: 6, disabled: false, ariaLabel: '取件码' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  complete: [value: string]
  'paste-code': [value: string]
  expand: [value: string]
}>()

const inputs = ref<HTMLInputElement[]>([])
const setInputRef = (i: number, el: unknown) => {
  if (el) inputs.value[i] = el as HTMLInputElement
}

const chars = computed(() => props.modelValue.split(''))

// 输入归一化（2026-10-22）：取件码字符表全大写 → 去空格/横杠 + 转大写，
// 输入大小写不敏感（「vnxt 8s」/「VNXT-8S」都应命中「VNXT8S」）。
const sanitize = (s: string) =>
  s.replace(/[\s-]+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const focusAt = (i: number) => {
  inputs.value[Math.max(0, Math.min(props.length - 1, i))]?.focus()
}

const onInput = (i: number, e: InputEvent) => {
  const el = e.target as HTMLInputElement
  const typed = sanitize(el.value)
  if (!typed) {
    // 内容被清空（含输入法清除）
    updateAt(i, '')
    el.value = ''
    return
  }
  // 单格只收最后一个字符；多余字符顺延到后续格（快速连续输入）
  const { value, overflow } = splitTyping(props.modelValue, i, typed, props.length)
  emit('update:modelValue', value)
  // 溢出被截断时模型不变 → Vue 不重渲染，原始键入会残留在单格 DOM 里
  // （一格显示 "aaa"）——必须就地把 DOM 值钉回模型字符
  el.value = value[i] ?? ''
  // 顺延超出 length 的溢出上抛（末格续输第 7 位等），由调用方决定扩格
  if (overflow) {
    emit('expand', value + overflow)
    return
  }
  const cursor = i + typed.length
  if (cursor < props.length) {
    focusAt(cursor)
  } else if (value.length === props.length) {
    emit('complete', value)
  }
}

const updateAt = (i: number, ch: string) => {
  const next = chars.value.slice()
  while (next.length < props.length) next.push('')
  next[i] = ch
  emit('update:modelValue', next.slice(0, props.length).join('').slice(0, props.length))
}

const onKeydown = (i: number, e: KeyboardEvent) => {
  if (e.key === 'Backspace') {
    e.preventDefault()
    const next = chars.value.slice()
    while (next.length < props.length) next.push('')
    if (next[i]) {
      next[i] = ''
      emit('update:modelValue', next.join('').slice(0, props.length))
    } else if (i > 0) {
      next[i - 1] = ''
      emit('update:modelValue', next.join('').slice(0, props.length))
      focusAt(i - 1)
    }
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    focusAt(i - 1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    focusAt(i + 1)
  }
}

const onPaste = (e: ClipboardEvent) => {
  const raw = e.clipboardData?.getData('text') || ''
  const text = sanitize(raw)
  if (!text) return
  // 超长整段交给调用方分派（避免截断成前 6 位误触发匿名取件）；
  // 传原始串而非归一化串——分享码/自定义口令区分大小写且可含 -/_，
  // 由调用方的 planPaste 按码长决定归一化口径。
  if (text.length > props.length) {
    emit('paste-code', raw)
    return
  }
  emit('update:modelValue', text.slice(0, props.length))
  if (text.length === props.length) {
    emit('complete', text)
  } else {
    focusAt(text.length)
  }
}

const focus = (i = 0) => focusAt(i)
defineExpose({ focus })
</script>

<style scoped>
.code-boxes {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.code-box {
  width: 52px;
  height: 64px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-card-bg);
  color: var(--color-text-primary);
  text-align: center;
  font-size: 26px;
  font-weight: 700;
  font-family: 'SF Mono', Menlo, Monaco, Consolas, monospace;
  outline: none;
  caret-color: var(--primary-color);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.code-box:hover:not(:disabled) {
  border-color: var(--color-text-tertiary);
}

.code-box:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-bg);
}

.code-box:disabled {
  opacity: 0.5;
}

@media (max-width: 480px) {
  .code-boxes {
    gap: 6px;
  }
  .code-box {
    width: 42px;
    height: 56px;
    font-size: 22px;
  }
}
</style>
