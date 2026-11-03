import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

/**
 * 全局文件拖拽 + 粘贴（2026-10-06 W2 自 FileUpload.vue 内联监听收编，可复用于
 * 任意上传入口）。语义与原实现一致：
 *  - dragover 仅当拖的是 Files 才高亮遮罩；dragleave 仅离开窗口（relatedTarget 为空）才取消高亮
 *  - drop 一律撤遮罩（2026-10-16 守卫修复：此前仅 files>0 才撤，空 files 的
 *    drop——拖文件夹/拖拽被系统取消等——会让 fixed z-9999 全屏遮罩永不熄灭，
 *    整页卡死只能刷新）；仅 files>0 时 preventDefault 并接收
 *  - blur（拖拽中 alt-tab/切窗）撤遮罩兜底
 *  - paste 收集 kind==='file' 项，命中时 preventDefault + toast（W3 起 i18n 化）
 *
 * 2026-11-03 两处卡死形态收口（实证：拖一个文件到页面，遮罩永不熄灭）：
 *  1. **drop 被子元素 stopPropagation 吞掉**——element-plus upload-dragger 的
 *     onDrop 第一件事就是 `e.stopPropagation()`，文件释放在「将文件拖到此处」
 *     拖拽框上（最自然落点）时，冒泡到 window 的 drop 永远不执行 ⇒ 遮罩卡死。
 *     修法：**撤遮罩的 drop 监听挂捕获阶段**——捕获先于任何子元素的
 *     stopPropagation，谁也吞不掉；「接收文件」仍留冒泡阶段：被吞掉的 drop
 *     恰是子组件（el-upload on-change）已自行接走文件的场景 ⇒ 不会双计入队。
 *  2. **拖拽静默结束**——Esc 取消、拖出窗口后在别处释放、原生层（桌面客户端
 *     webview 的 dragDropEnabled）接管 drop 等，drop/dragleave/blur 三条熄灭
 *     路径一条都不会来。修法：**dragover 心跳看门狗**——拖拽期间浏览器会
 *     周期性重发 dragover（HTML 规范约每 350ms），超过约 900ms 无心跳即判
 *     拖拽已结束，无条件下熄灭遮罩。
 *
 * 事件接线抽为 createFileDropState（attach/detach 显式传 target），既供本
 * composable 挂 window，也供单测在 node 环境对纯 EventTarget 派发事件验证。
 */
export interface FileDropState {
  isDragging: Ref<boolean>
  attach: (target: EventTarget) => void
  detach: (target: EventTarget) => void
}

// 看门狗：dragover 心跳缺席多少个 tick（300ms/tick）判拖拽已静默结束。
// 规范心跳约 350ms ⇒ 3 tick（≈900ms）远大于单次心跳间隔，又远小于「遮罩
// 卡死」的体感；负对照（心跳持续不误熄）见单测。
const WATCHDOG_TICK_MS = 300
const STALE_TICKS = 3

export function createFileDropState(opts: { onFiles: (files: File[] | FileList) => void }): FileDropState {
  const isDragging = ref(false)
  const { t } = useI18n()

  // 拖拽心跳看门狗：dragover 重置计数，连续 STALE_TICKS 个 tick 无心跳即熄灭
  let staleTicks = 0
  let watchdog: ReturnType<typeof setInterval> | null = null

  const clear = () => {
    isDragging.value = false
    staleTicks = 0
    if (watchdog !== null) {
      clearInterval(watchdog)
      watchdog = null
    }
  }

  const noteDragOver = () => {
    staleTicks = 0
    isDragging.value = true
    if (watchdog === null) {
      watchdog = setInterval(() => {
        staleTicks += 1
        if (staleTicks >= STALE_TICKS) clear()
      }, WATCHDOG_TICK_MS)
    }
  }

  const onWindowDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      noteDragOver()
    }
  }

  const onWindowDragLeave = (e: DragEvent) => {
    if (e.relatedTarget === null) {
      clear()
    }
  }

  // 捕获阶段只撤遮罩、不接收文件（原因见文件头 2026-11-03 条目）
  const onDropCapture = () => {
    clear()
  }

  const onWindowDrop = (e: DragEvent) => {
    // 撤遮罩无条件前置：任何形态的 drop（含空 files）都必须熄灭高亮，
    // 否则遮罩卡死全页（2026-10-16 守卫修复）
    clear()
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      opts.onFiles(e.dataTransfer.files)
    }
  }

  const onWindowBlur = () => {
    clear()
  }

  const onWindowPaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return
    const clipItems = e.clipboardData.items
    const files: File[] = []
    for (let i = 0; i < clipItems.length; i++) {
      const it = clipItems[i]
      if (!it) continue
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      opts.onFiles(files)
      ElMessage.success(t('upload.pastedCount', files.length))
    }
  }

  const listeners: Array<[string, EventListener, boolean]> = [
    ['dragover', onWindowDragOver as EventListener, false],
    ['dragleave', onWindowDragLeave as EventListener, false],
    // drop 双注册：捕获撤遮罩（吞不掉）在前，冒泡接收文件（不与子组件双计）在后
    ['drop', onDropCapture, true],
    ['drop', onWindowDrop as EventListener, false],
    ['blur', onWindowBlur, false],
    ['paste', onWindowPaste as EventListener, false],
  ]

  const attach = (target: EventTarget) => {
    for (const [type, fn, capture] of listeners) target.addEventListener(type, fn, capture)
  }
  const detach = (target: EventTarget) => {
    clear()
    for (const [type, fn, capture] of listeners) target.removeEventListener(type, fn, capture)
  }

  return { isDragging, attach, detach }
}

export function useFileDrop(opts: { onFiles: (files: File[] | FileList) => void }): { isDragging: Ref<boolean> } {
  const state = createFileDropState(opts)

  onMounted(() => state.attach(window))
  onBeforeUnmount(() => state.detach(window))

  return { isDragging: state.isDragging }
}
