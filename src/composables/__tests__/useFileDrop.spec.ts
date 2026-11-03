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

  it('守卫回归：拖拽静默结束（Esc 取消/拖出窗口释放/原生层吞 drop）由心跳看门狗熄灭遮罩', () => {
    vi.useFakeTimers()
    try {
      target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
      expect(state.isDragging.value).toBe(true)
      // 之后再无 dragover/drop/dragleave/blur —— 此前唯一结果是遮罩永久卡死
      vi.advanceTimersByTime(300 * 3)
      expect(state.isDragging.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('看门狗负对照：拖拽期间 dragover 心跳持续不被误熄（单次心跳间隔 < 熄灭阈值）', () => {
    vi.useFakeTimers()
    try {
      target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(600) // 两个 tick，尚未到 3 tick 阈值
        target.dispatchEvent(dragEvt('dragover', { types: ['Files'] })) // 心跳重置
        expect(state.isDragging.value).toBe(true)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('看门狗熄灭后再次 dragover 可重新点亮（看门狗可重启）', () => {
    vi.useFakeTimers()
    try {
      target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
      vi.advanceTimersByTime(300 * 3)
      expect(state.isDragging.value).toBe(false)
      target.dispatchEvent(dragEvt('dragover', { types: ['Files'] }))
      expect(state.isDragging.value).toBe(true)
      vi.advanceTimersByTime(300 * 3)
      expect(state.isDragging.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('守卫回归：撤遮罩的 drop 监听必须挂捕获阶段——子元素 stopPropagation 吞不掉（el-upload 拖拽区实证行为）', () => {
    // 语义背景：upload-dragger 的 onDrop 会 e.stopPropagation() ⇒ 冒泡到 window 的
    // drop 不执行。捕获监听先于任何子元素 stopPropagation 执行，遮罩才不会卡死。
    // 浏览器级行为断言见 e2e/send.spec.ts 同名守卫。
    const fresh = new EventTarget()
    const addSpy = vi.spyOn(fresh, 'addEventListener')
    const removeSpy = vi.spyOn(fresh, 'removeEventListener')
    const s = createFileDropState({ onFiles: vi.fn() })
    s.attach(fresh)

    const dropRegistrations = addSpy.mock.calls.filter(([type]) => type === 'drop')
    expect(dropRegistrations).toHaveLength(2) // 捕获撤遮罩 + 冒泡接收文件
    expect(dropRegistrations.some(([, , capture]) => capture === true)).toBe(true)
    expect(dropRegistrations.some(([, , capture]) => capture !== true)).toBe(true)

    s.detach(fresh)
    // detach 必须按同样的 capture 标志摘除，否则残留监听变僵尸
    for (const [type, fn, capture] of dropRegistrations as Array<[string, EventListener, boolean]>) {
      expect(removeSpy).toHaveBeenCalledWith(type, fn, capture)
    }
  })
})
