import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// node 环境无 localStorage：内存桩（沿用 localHistory.spec 的既有惯例）
class MemoryStorage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

import { useUploadTasksStore, UPLOAD_TASKS_KEY } from '../uploadTasks'

describe('uploadTasks store（持久化 + 恢复归一）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    setActivePinia(createPinia())
  })

  it('create/update 写穿 localStorage', () => {
    const s = useUploadTasksStore()
    const rec = s.create({ fingerprint: 'a|1|1', fileName: 'a', fileSize: 1, fileLastModified: 1, channel: 'multi-chunk', status: 'pending' })
    const raw = JSON.parse(localStorage.getItem(UPLOAD_TASKS_KEY) || '{}')
    expect(raw.tasks).toHaveLength(1)
    expect(raw.tasks[0].id).toBe(rec.id)
    s.update(rec.id, { uploadId: 'u1', status: 'uploading' })
    const raw2 = JSON.parse(localStorage.getItem(UPLOAD_TASKS_KEY) || '{}')
    expect(raw2.tasks[0].uploadId).toBe('u1')
  })

  it('重启恢复：uploading 归一为 interrupted（刷新即断），续传坐标保留', () => {
    localStorage.setItem(UPLOAD_TASKS_KEY, JSON.stringify({
      version: 1,
      tasks: [{ id: 'x', fingerprint: 'a|1|1', fileName: 'a', fileSize: 1, fileLastModified: 1, channel: 'multi-chunk', status: 'uploading', uploadedIndexes: [0, 1], createdAt: 0, updatedAt: 0 }],
    }))
    const s = useUploadTasksStore()
    expect(s.tasks[0]!.status).toBe('interrupted')
    expect(s.tasks[0]!.uploadedIndexes).toEqual([0, 1])
  })

  it('findByFingerprint 命中未完成任务；完成的不算', () => {
    const s = useUploadTasksStore()
    const rec = s.create({ fingerprint: 'a|1|1', fileName: 'a', fileSize: 1, fileLastModified: 1, channel: 'multi-chunk', status: 'pending' })
    expect(s.findByFingerprint('a|1|1')?.id).toBe(rec.id)
    s.update(rec.id, { status: 'success' })
    expect(s.findByFingerprint('a|1|1')).toBeUndefined()
  })

  it('unfinished getter：pending/uploading/paused/error/interrupted 算未完成，success 不算', () => {
    const s = useUploadTasksStore()
    s.create({ fingerprint: 'a|1|1', fileName: 'a', fileSize: 1, fileLastModified: 1, channel: 'multi-chunk', status: 'pending' })
    const b = s.create({ fingerprint: 'b|2|2', fileName: 'b', fileSize: 2, fileLastModified: 2, channel: 'multi-chunk', status: 'error' })
    s.create({ fingerprint: 'c|3|3', fileName: 'c', fileSize: 3, fileLastModified: 3, channel: 'multi-chunk', status: 'success' })
    expect(s.unfinished.map((r) => r.id).sort()).toEqual([s.tasks[0]!.id, b.id].sort())
  })

  it('remove/clearFinished 只动目标，写穿持久化', () => {
    const s = useUploadTasksStore()
    const a = s.create({ fingerprint: 'a|1|1', fileName: 'a', fileSize: 1, fileLastModified: 1, channel: 'multi-chunk', status: 'pending' })
    const b = s.create({ fingerprint: 'b|2|2', fileName: 'b', fileSize: 2, fileLastModified: 2, channel: 'multi-chunk', status: 'success' })
    s.remove(a.id)
    expect(s.tasks.map((r) => r.id)).toEqual([b.id])
    s.create({ fingerprint: 'c|3|3', fileName: 'c', fileSize: 3, fileLastModified: 3, channel: 'multi-chunk', status: 'error' })
    s.clearFinished()
    expect(s.tasks.map((r) => r.id)).toEqual([s.tasks.find((r) => r.status === 'error')!.id])
    const raw = JSON.parse(localStorage.getItem(UPLOAD_TASKS_KEY) || '{}')
    expect(raw.tasks).toHaveLength(1)
  })

  it('损坏 JSON 不炸（回空列表）', () => {
    localStorage.setItem(UPLOAD_TASKS_KEY, '{oops')
    const s = useUploadTasksStore()
    expect(s.tasks).toEqual([])
  })
})
