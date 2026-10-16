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
 * 事件接线抽为 createFileDropState（attach/detach 显式传 target），既供本
 * composable 挂 window，也供单测在 node 环境对纯 EventTarget 派发事件验证。
 */
export interface FileDropState {
  isDragging: Ref<boolean>
  attach: (target: EventTarget) => void
  detach: (target: EventTarget) => void
}

export function createFileDropState(opts: { onFiles: (files: File[] | FileList) => void }): FileDropState {
  const isDragging = ref(false)
  const { t } = useI18n()

  const onWindowDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      isDragging.value = true
    }
  }

  const onWindowDragLeave = (e: DragEvent) => {
    if (e.relatedTarget === null) {
      isDragging.value = false
    }
  }

  const onWindowDrop = (e: DragEvent) => {
    // 撤遮罩无条件前置：任何形态的 drop（含空 files）都必须熄灭高亮，
    // 否则遮罩卡死全页（2026-10-16 守卫修复）
    isDragging.value = false
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      opts.onFiles(e.dataTransfer.files)
    }
  }

  const onWindowBlur = () => {
    isDragging.value = false
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

  const listeners: Array<[string, EventListener]> = [
    ['dragover', onWindowDragOver as EventListener],
    ['dragleave', onWindowDragLeave as EventListener],
    ['drop', onWindowDrop as EventListener],
    ['blur', onWindowBlur],
    ['paste', onWindowPaste as EventListener],
  ]

  const attach = (target: EventTarget) => {
    for (const [type, fn] of listeners) target.addEventListener(type, fn)
  }
  const detach = (target: EventTarget) => {
    for (const [type, fn] of listeners) target.removeEventListener(type, fn)
  }

  return { isDragging, attach, detach }
}

export function useFileDrop(opts: { onFiles: (files: File[] | FileList) => void }): { isDragging: Ref<boolean> } {
  const state = createFileDropState(opts)

  onMounted(() => state.attach(window))
  onBeforeUnmount(() => state.detach(window))

  return { isDragging: state.isDragging }
}
