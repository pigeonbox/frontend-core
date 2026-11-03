// 上传任务 store（2026-11-03 Phase 2 上传工作台）：把上传任务从「页面内存态」升格为
// 可持久化记录，支撑断点续传与刷新恢复。
//
// 持久化：localStorage `pb.uploadTasks.v1`（写穿——每次 mutation 后序列化）。
// 重启恢复时把 `uploading` 归一为 `interrupted`：刷新瞬间正在传的任务实际已断
// （File 对象不跨刷新存活），保留续传坐标（uploadId/sessionToken/uploadedIndexes）
// 等用户重选同指纹文件后续传。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const UPLOAD_TASKS_KEY = 'pb.uploadTasks.v1'

export type UploadTaskStatus =
  | 'pending'
  | 'uploading'
  | 'paused'
  | 'error'
  | 'success'
  | 'interrupted'

export interface UploadTaskRecord {
  id: string
  /** 续传匹配指纹（buildFingerprint：name|size|lastModified） */
  fingerprint: string
  fileName: string
  fileSize: number
  fileLastModified: number
  channel: 'direct' | 'presign' | 'multi-chunk'
  status: UploadTaskStatus
  /** 分片会话坐标（断点续传三件套；失败/中断时保留） */
  uploadId?: string
  sessionToken?: string
  chunkSize?: number
  totalChunks?: number
  uploadedIndexes: number[]
  fileHash?: string
  pickupCode?: string
  shareUrl?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export type NewUploadTaskRecord = Omit<UploadTaskRecord, 'id' | 'createdAt' | 'updatedAt' | 'uploadedIndexes'> & {
  uploadedIndexes?: number[]
}

const UNFINISHED_STATUSES: ReadonlySet<UploadTaskStatus> = new Set([
  'pending',
  'uploading',
  'paused',
  'error',
  'interrupted',
])

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 读回持久化；损坏 JSON/缺字段不炸（回空列表） */
function readPersisted(): UploadTaskRecord[] {
  try {
    const raw = localStorage.getItem(UPLOAD_TASKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { tasks?: unknown }
    if (!Array.isArray(parsed.tasks)) return []
    return parsed.tasks.filter(
      (t): t is UploadTaskRecord =>
        !!t && typeof t === 'object' && typeof (t as UploadTaskRecord).id === 'string'
    )
  } catch {
    return []
  }
}

export const useUploadTasksStore = defineStore('uploadTasks', () => {
  // 重启归一：uploading ⇒ interrupted（刷新即断；paused/error/interrupted 原样保留）
  const tasks = ref<UploadTaskRecord[]>(
    readPersisted().map((t) => (t.status === 'uploading' ? { ...t, status: 'interrupted' as const } : t))
  )

  const unfinished = computed(() => tasks.value.filter((t) => UNFINISHED_STATUSES.has(t.status)))

  function persist() {
    try {
      localStorage.setItem(UPLOAD_TASKS_KEY, JSON.stringify({ version: 1, tasks: tasks.value }))
    } catch {
      /* 存储满/隐私模式：尽力而为，不阻断上传 */
    }
  }

  function create(record: NewUploadTaskRecord): UploadTaskRecord {
    const now = Date.now()
    const rec: UploadTaskRecord = {
      ...record,
      uploadedIndexes: record.uploadedIndexes ?? [],
      id: newId(),
      createdAt: now,
      updatedAt: now,
    }
    tasks.value.push(rec)
    persist()
    return rec
  }

  function update(id: string, patch: Partial<Omit<UploadTaskRecord, 'id' | 'createdAt'>>) {
    const rec = tasks.value.find((t) => t.id === id)
    if (!rec) return
    Object.assign(rec, patch, { updatedAt: Date.now() })
    persist()
  }

  function remove(id: string) {
    tasks.value = tasks.value.filter((t) => t.id !== id)
    persist()
  }

  function clearFinished() {
    tasks.value = tasks.value.filter((t) => UNFINISHED_STATUSES.has(t.status))
    persist()
  }

  /** 指纹匹配未完成任务（完成的不算——它的会话已消费完毕） */
  function findByFingerprint(fingerprint: string): UploadTaskRecord | undefined {
    return tasks.value.find((t) => t.fingerprint === fingerprint && UNFINISHED_STATUSES.has(t.status))
  }

  return { tasks, unfinished, create, update, remove, clearFinished, findByFingerprint }
})
