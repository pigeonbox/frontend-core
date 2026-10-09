import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

/**
 * 全局文件拖拽 + 粘贴（2026-10-06 W2 自 FileUpload.vue 内联监听收编，可复用于
 * 任意上传入口）。语义与原实现一致：
 *  - dragover 仅当拖的是 Files 才高亮遮罩；dragleave 仅离开窗口（relatedTarget 为空）才取消高亮
 *  - drop 仅在有文件时 preventDefault 并接收
 *  - paste 收集 kind==='file' 项，命中时 preventDefault + toast（W3 起 i18n 化）
 */
export function useFileDrop(opts: { onFiles: (files: File[] | FileList) => void }): { isDragging: Ref<boolean> } {
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
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      isDragging.value = false
      opts.onFiles(e.dataTransfer.files)
    }
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

  onMounted(() => {
    window.addEventListener('dragover', onWindowDragOver)
    window.addEventListener('dragleave', onWindowDragLeave)
    window.addEventListener('drop', onWindowDrop)
    window.addEventListener('paste', onWindowPaste)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('dragover', onWindowDragOver)
    window.removeEventListener('dragleave', onWindowDragLeave)
    window.removeEventListener('drop', onWindowDrop)
    window.removeEventListener('paste', onWindowPaste)
  })

  return { isDragging }
}
