// 秒传早命中赛跑（2026-11-03 Phase 3 Task 1）：上传与整文件 hash 并行，
// hash 先出 ⇒ 探秒传快速通道（init 带 file_hash+expire 元数据）：
//   · 命中 ⇒ 中止冗余传输、回收半途会话、直接出码（免 multi-bind）；
//   · 落空 ⇒ 回收探测空会话、按坐标恢复上传；
//   · 上传先完成/匿名/多文件 ⇒ 不探测。
// hash 时序由 mock 控制（真 hash 的正确性归 fileHash.spec）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUploadQueue } from '../useUploadQueue'
import type { ShareSettings } from '../useShareSettings'
import type { UploadTaskRecord, NewUploadTaskRecord } from '@/stores/uploadTasks'
import { buildFingerprint } from '@/api/multifile'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/share', () => ({ uploadFile: vi.fn() }))
vi.mock('@/api/multifile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/multifile')>()
  return {
    ...actual,
    multiDirect: vi.fn(),
    chunkUploadFile: vi.fn(),
    multiBind: vi.fn(),
    getChunkStatus: vi.fn(),
    chunkQuickProbe: vi.fn(),
    chunkCancelSession: vi.fn(),
  }
})
vi.mock('@/utils/fileHash', () => ({
  hashFileSha256: vi.fn(),
  HASH_SLICE_SIZE: 8 * 1024 * 1024,
  workerHashAvailable: () => false,
}))

import { chunkUploadFile, multiBind, getChunkStatus, chunkQuickProbe, chunkCancelSession } from '@/api/multifile'
import { hashFileSha256 } from '@/utils/fileHash'

const MB = 1024 * 1024
const t = (k: string) => k

const mkFile = (name: string, size: number): File => {
  const f = new File([new ArrayBuffer(8)], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const baseSettings = (): ShareSettings => ({
  expire_value: 1,
  expire_style: 'day',
  require_auth: false,
  password: '',
  e2e: false,
  e2e_password: '',
  e2e_password_confirm: '',
  custom_code: '',
  note: '',
})

const mkRec = (over: Partial<UploadTaskRecord> = {}): UploadTaskRecord => ({
  id: 'r1',
  fingerprint: '',
  fileName: 'big.bin',
  fileSize: 40 * MB,
  fileLastModified: 1,
  channel: 'multi-chunk',
  status: 'interrupted',
  uploadedIndexes: [],
  createdAt: 1,
  updatedAt: 2,
  ...over,
})

const mkStore = (initial: UploadTaskRecord[] = []) => {
  const recs = [...initial]
  const create = vi.fn((record: NewUploadTaskRecord): UploadTaskRecord => {
    const rec = mkRec({ ...record, id: `t${recs.length + 1}`, uploadedIndexes: record.uploadedIndexes ?? [] })
    recs.push(rec)
    return rec
  })
  const update = vi.fn((id: string, patch: Partial<Omit<UploadTaskRecord, 'id' | 'createdAt'>>) => {
    const rec = recs.find((r) => r.id === id)
    if (rec) Object.assign(rec, patch, { updatedAt: Date.now() })
  })
  const findByFingerprint = vi.fn((fp: string) =>
    recs.find((r) => r.fingerprint === fp && r.status !== 'success')
  )
  return { recs, create, update, findByFingerprint }
}

const mocked = {
  chunkUploadFile: vi.mocked(chunkUploadFile),
  multiBind: vi.mocked(multiBind),
  getChunkStatus: vi.mocked(getChunkStatus),
  chunkQuickProbe: vi.mocked(chunkQuickProbe),
  chunkCancelSession: vi.mocked(chunkCancelSession),
  hashFileSha256: vi.mocked(hashFileSha256),
}

const BIG = 40 * MB

/** 可手动放行的 promise（控赛跑时序） */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.chunkCancelSession.mockResolvedValue(undefined)
  mocked.getChunkStatus.mockRejectedValue(new Error('no session'))
})

describe('秒传早命中赛跑', () => {
  it('hash 先出 + 命中 ⇒ 中止冗余传输、回收半途会话、直接出码（免绑定）', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore([mkRec({ fingerprint: buildFingerprint(file), fileLastModified: file.lastModified })])
    const upload = deferred<{ uploadId: string; sessionToken?: string }>()
    mocked.chunkUploadFile.mockImplementation((_f, _id, _cs, _cb, _sig, opts) => {
      opts?.onSession?.({ uploadId: 'S1', sessionToken: 'T1' })
      return upload.promise
    })
    mocked.hashFileSha256.mockResolvedValue('h1')
    mocked.chunkQuickProbe.mockResolvedValue({ hit: true, shareCode: 'P9', shareUrl: 'http://x/#/share/P9' })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store, isLoggedIn: () => true })
    q.addFiles([file])
    const out = await q.start()

    expect(mocked.chunkQuickProbe).toHaveBeenCalledOnce()
    // 探测输入：整文件 hash + 分享元数据（expire_style 齐全=启用快速通道）
    const [, ph, , meta] = mocked.chunkQuickProbe.mock.calls[0]!
    expect(ph).toBe('h1')
    expect(meta.expire_style).toBe('day')
    // 半途会话被回收
    expect(mocked.chunkCancelSession).toHaveBeenCalledWith('S1', 'T1')
    // 直接出码、免绑定
    expect(out?.pickup_code).toBe('P9')
    expect(mocked.multiBind).not.toHaveBeenCalled()
    expect(store.recs[0]!.status).toBe('success')
    expect(store.recs[0]!.pickupCode).toBe('P9')
    expect(q.tasks.value[0]!.status).toBe('success')
  })

  it('hash 先出 + 落空 ⇒ 回收探测空会话、按坐标恢复上传（不重复探测）', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore([mkRec({ fingerprint: buildFingerprint(file), fileLastModified: file.lastModified })])
    let call = 0
    mocked.chunkUploadFile.mockImplementation((_f, _id, _cs, _cb, _sig, opts) => {
      call++
      opts?.onSession?.({ uploadId: call === 1 ? 'S1' : 'S1', sessionToken: 'T1' })
      if (call === 1) {
        // 首跑挂起（被赛跑中止）
        return new Promise((_res, rej) => {
          setTimeout(() => rej(new Error('Cancelled')), 50)
        })
      }
      return Promise.resolve({ uploadId: 'S1', sessionToken: 'T1' })
    })
    mocked.hashFileSha256.mockResolvedValue('h1')
    mocked.chunkQuickProbe.mockResolvedValue({ hit: false, missSessionId: 'MISS' })
    mocked.multiBind.mockResolvedValue({ code: 'C1', url: 'http://x/#/share/C1', share_url: '', file_count: 1 })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store, isLoggedIn: () => true })
    q.addFiles([file])
    const out = await q.start()

    expect(mocked.chunkQuickProbe).toHaveBeenCalledOnce()
    // 落空空会话被回收
    expect(mocked.chunkCancelSession).toHaveBeenCalledWith('MISS')
    // 恢复上传：第二跑沿用会话坐标（同 S1）
    expect(mocked.chunkUploadFile).toHaveBeenCalledTimes(2)
    const opts2 = mocked.chunkUploadFile.mock.calls[1]![5]!
    expect(opts2.resumeSessionId).toBe('S1')
    // 绑定走完整流程
    expect(mocked.multiBind).toHaveBeenCalledOnce()
    expect(out?.code).toBe('C1')
  })

  it('上传先完成 ⇒ 不探测（hash 迟到无价值，且晚探会真建分享=双分享）', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore()
    mocked.chunkUploadFile.mockResolvedValue({ uploadId: 'S1', sessionToken: 'T1' })
    // hash 挂起（永不先出）
    mocked.hashFileSha256.mockReturnValue(new Promise(() => {}))
    mocked.multiBind.mockResolvedValue({ code: 'C1', url: 'http://x/#/share/C1', share_url: '', file_count: 1 })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store, isLoggedIn: () => true })
    q.addFiles([file])
    await q.start()

    expect(mocked.chunkQuickProbe).not.toHaveBeenCalled()
    expect(mocked.multiBind).toHaveBeenCalledOnce()
  })

  it('匿名/多文件 ⇒ 不探测（D1 同用户去重；multi-bind 无 share_code 形态）', async () => {
    const f1 = mkFile('a.bin', BIG)
    const f2 = mkFile('b.bin', BIG)
    const store = mkStore()
    mocked.chunkUploadFile.mockResolvedValue({ uploadId: 'S1', sessionToken: 'T1' })
    mocked.hashFileSha256.mockResolvedValue('h1')
    mocked.multiBind.mockResolvedValue({ code: 'C1', url: 'http://x/#/share/C1', share_url: '', file_count: 2 })

    // 匿名（isLoggedIn=false）
    const q1 = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store, isLoggedIn: () => false })
    q1.addFiles([mkFile('solo.bin', BIG)])
    await q1.start()
    expect(mocked.chunkQuickProbe).not.toHaveBeenCalled()
    expect(mocked.hashFileSha256).not.toHaveBeenCalled()

    // 多文件（登录）：也不探
    const q2 = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store, isLoggedIn: () => true })
    q2.addFiles([f1, f2])
    await q2.start()
    expect(mocked.chunkQuickProbe).not.toHaveBeenCalled()
    // q1（匿名单文件）与 q2（多文件）各绑定一次
    expect(mocked.multiBind).toHaveBeenCalledTimes(2)
  })
})
