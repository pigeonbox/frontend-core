import { describe, it, expect, vi, beforeEach } from 'vitest'

// useFileDrop 依赖 useI18n（paste 命中文件时 toast），单测中 mock
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

import { createFileDropState } from '../useFileDrop'

/** 造一个带 dataTransfer 桩的拖拽事件（node 环境无 DragEvent 构造器） */
function dragEvt(type: string, dt?: Partial<DataTransfer>, relatedTarget: EventTarget | null = null): DragEvent {
  const e = new Event(type) as DragEvent
  if (dt) Object.defineProperty(e, 'dataTransfer', { value: dt })
  Object.defineProperty(e, 'relatedTarget', { value: relatedTarget })
  return e
}

const filesOf = (n: number): FileList =>
  Array.from({ length: n }, (_, i) => new File(['x'], `f${i}.txt`)) as unknown as FileList

describe('useFileDrop（createFileDropState）', () => {
  let target: EventTarget
  let onFiles: ReturnType<typeof vi.fn>
  let state: ReturnType<typeof createFileDropState>

  beforeEach(() => {
    target = new EventTarget()
    onFiles = vi.fn()
    state = createFileDropState({ onFiles: onFiles as (files: File[] | FileList) => void })
    state.attach(target)
  })

  it('dragover 携带 Files 点亮遮罩；dragleave 离开窗口（relatedTarget=null）撤遮罩', () => {
    target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
    expect(state.isDragging.value).toBe(true)
    target.dispatchEvent(dragEvt('dragleave', undefined, null))
    expect(state.isDragging.value).toBe(false)
  })

  it('窗口内元素间移动（relatedTarget 非空）不误撤遮罩', () => {
    target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
    target.dispatchEvent(dragEvt('dragleave', undefined, new EventTarget()))
    expect(state.isDragging.value).toBe(true)
  })

  it('drop 携带文件：接收 onFiles 且撤遮罩', () => {
    target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
    target.dispatchEvent(dragEvt('drop', { types: ['Files'], files: filesOf(2) }))
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(state.isDragging.value).toBe(false)
  })

  it('守卫回归：drop 但 files 为空（文件夹/拖拽被取消等）也必须撤遮罩——否则 fixed 全屏遮罩卡死全页', () => {
    target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
    expect(state.isDragging.value).toBe(true)
    target.dispatchEvent(dragEvt('drop', { types: ['Files'], files: filesOf(0) }))
    expect(state.isDragging.value).toBe(false)
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('守卫回归：窗口失焦（拖拽中 alt-tab/切窗）撤遮罩', () => {
    target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
    expect(state.isDragging.value).toBe(true)
    target.dispatchEvent(new Event('blur'))
    expect(state.isDragging.value).toBe(false)
  })
})
