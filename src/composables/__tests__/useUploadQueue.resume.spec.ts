// 续传接线（2026-11-03 Phase 2 Task 4）：multi-chunk 分支的续传坐标贯通——
// 任务记录（localStorage）→ getChunkStatus 服务端位图 → chunkUploadFile 跳片补缺，
// 失败保留坐标、成功收尾。判据锚点：
//   · opts.resumeSessionId 仅在「记录有坐标 + 会话探测成功 + 非 E2E」时出现；
//   · opts.uploaded 只认服务端位图（本地坐标不可信，盲跳会拼出空洞文件）。
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
  }
})
vi.mock('@/utils/e2e', () => ({ generateKeyB64: vi.fn(), encryptFile: vi.fn(), wrapKey: vi.fn() }))

import { chunkUploadFile, multiBind, getChunkStatus } from '@/api/multifile'
import { generateKeyB64, encryptFile, wrapKey } from '@/utils/e2e'

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

// 内存假 store（UploadTasksSink 结构面；unfinished 语义与真 store 一致：success 不算）
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
  generateKeyB64: vi.mocked(generateKeyB64),
  encryptFile: vi.mocked(encryptFile),
  wrapKey: vi.mocked(wrapKey),
}

beforeEach(() => {
  vi.clearAllMocks()
})

// 单文件 40MB（≥32MB 分片续传阈值）⇒ 矩阵恒选 multi-chunk
const BIG = 40 * MB

describe('multi-chunk 续传接线', () => {
  it('断点续传：记录坐标 + 服务端位图 ⇒ resumeSessionId 传入、按位图跳片、绑定沿用会话', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore([
      mkRec({
        fingerprint: buildFingerprint(file),
        fileName: 'big.bin',
        fileSize: BIG,
        fileLastModified: file.lastModified,
        status: 'interrupted',
        uploadId: 'S1',
        sessionToken: 'T1',
        chunkSize: 5 * MB,
        uploadedIndexes: [0],
      }),
    ])
    // 本地坐标只有 [0]，服务端位图 [0,1] ⇒ 以服务端为准
    mocked.getChunkStatus.mockResolvedValue({ uploadId: 'S1', totalChunks: 8, uploadedIndexes: [0, 1], status: 'uploading' })
    mocked.chunkUploadFile.mockResolvedValue({ uploadId: 'S1', sessionToken: 'T1' })
    mocked.multiBind.mockResolvedValue({ code: 'C1', url: 'http://x/#/share/C1', share_url: 'http://x/#/share/C1', file_count: 1, pickup_code: 'P1' })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store })
    q.addFiles([file])
    const out = await q.start()

    expect(mocked.getChunkStatus).toHaveBeenCalledWith('S1', 'T1')
    expect(mocked.chunkUploadFile).toHaveBeenCalledOnce()
    const opts = mocked.chunkUploadFile.mock.calls[0]![5]!
    expect(opts.resumeSessionId).toBe('S1')
    expect(opts.sessionToken).toBe('T1')
    expect(opts.uploaded).toEqual(new Set([0, 1]))
    // 旧记录复用，不再建新记录
    expect(store.create).not.toHaveBeenCalled()
    // 绑定沿用旧会话主键
    expect(mocked.multiBind.mock.calls[0]![0]).toEqual([{ upload_id: 'S1' }])
    // 成功收尾：取件码/链接落记录
    expect(out?.pickup_code).toBe('P1')
    expect(store.recs[0]!.status).toBe('success')
    expect(store.recs[0]!.pickupCode).toBe('P1')
  })

  it('会话探测失败 ⇒ 开新会话全量传（不按本地坐标盲跳）', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore([
      mkRec({
        fingerprint: buildFingerprint(file),
        fileLastModified: file.lastModified,
        uploadId: 'S1',
        sessionToken: 'T1',
        uploadedIndexes: [0, 1, 2],
      }),
    ])
    mocked.getChunkStatus.mockRejectedValue(new Error('session gone'))
    mocked.chunkUploadFile.mockResolvedValue({ uploadId: 'NEW', sessionToken: 'TN' })
    mocked.multiBind.mockResolvedValue({ code: 'C2', url: 'http://x/#/share/C2', share_url: '', file_count: 1 })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store })
    q.addFiles([file])
    await q.start()

    const opts = mocked.chunkUploadFile.mock.calls[0]![5]!
    expect(opts.resumeSessionId).toBeUndefined()
    // 关键判据：探测失败时位图必须为空——本地 [0,1,2] 不可信
    expect(opts.uploaded).toEqual(new Set())
    expect(mocked.multiBind.mock.calls[0]![0]).toEqual([{ upload_id: 'NEW' }])
  })

  it('E2E 不续旧坐标：密文逐次不同，续旧会话会拼出损坏文件 ⇒ 丢弃坐标开新会话', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore([
      mkRec({
        fingerprint: buildFingerprint(file),
        fileLastModified: file.lastModified,
        uploadId: 'S1',
        sessionToken: 'T1',
        uploadedIndexes: [0],
      }),
    ])
    mocked.generateKeyB64.mockResolvedValue('k')
    mocked.wrapKey.mockReturnValue('w')
    // 密文与原文件是不同对象/不同内容（逐次加密字节不同）
    const cipher = new File([new ArrayBuffer(16)], 'big.bin.enc')
    Object.defineProperty(cipher, 'size', { value: BIG + 16 })
    mocked.encryptFile.mockResolvedValue(cipher)
    mocked.chunkUploadFile.mockResolvedValue({ uploadId: 'NEW', sessionToken: 'TN' })
    mocked.multiBind.mockResolvedValue({ code: 'C3', url: 'http://x/#/share/C3', share_url: '', file_count: 1 })

    const q = useUploadQueue({ settings: { ...baseSettings(), e2e: true }, t, uploadTasks: store })
    q.addFiles([file])
    await q.start()

    // 旧会话坐标不参与（连探测都不做）
    expect(mocked.getChunkStatus).not.toHaveBeenCalled()
    const opts = mocked.chunkUploadFile.mock.calls[0]![5]!
    expect(opts.resumeSessionId).toBeUndefined()
    expect(opts.uploaded).toEqual(new Set())
    // 记录坐标被清掉，防下次误续到别的密文
    expect(store.recs[0]!.uploadId).toBeUndefined()
  })

  it('中途失败：onSession 回传的坐标落记录并保留（error 终态可续传）', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore([
      mkRec({ fingerprint: buildFingerprint(file), fileLastModified: file.lastModified }),
    ])
    mocked.getChunkStatus.mockRejectedValue(new Error('no session'))
    mocked.chunkUploadFile.mockImplementation((_f, _id, _cs, _cb, _sig, opts) => {
      opts?.onSession?.({ uploadId: 'S2', sessionToken: 'T2' })
      return Promise.reject(new Error('net down'))
    })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store })
    q.addFiles([file])
    const out = await q.start()

    expect(out).toBeNull()
    // 坐标保留 + error 终态（findByFingerprint 仍可命中 ⇒ 可续传）
    expect(store.recs[0]!.uploadId).toBe('S2')
    expect(store.recs[0]!.sessionToken).toBe('T2')
    expect(store.recs[0]!.status).toBe('error')
    expect(q.tasks.value[0]!.status).toBe('error')
  })

  it('resumeFrom（刷新后重选同指纹文件）：命中的未完成记录提供续传坐标', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore([
      mkRec({
        fingerprint: buildFingerprint(file),
        fileLastModified: file.lastModified,
        uploadId: 'S1',
        sessionToken: 'T1',
        chunkSize: 5 * MB,
        uploadedIndexes: [0, 1],
      }),
    ])
    mocked.getChunkStatus.mockResolvedValue({ uploadId: 'S1', totalChunks: 8, uploadedIndexes: [0, 1], status: 'uploading' })
    mocked.chunkUploadFile.mockResolvedValue({ uploadId: 'S1', sessionToken: 'T1' })
    mocked.multiBind.mockResolvedValue({ code: 'C4', url: 'http://x/#/share/C4', share_url: '', file_count: 1 })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store })
    await q.resumeFrom(file)

    const opts = mocked.chunkUploadFile.mock.calls[0]![5]!
    expect(opts.resumeSessionId).toBe('S1')
    expect(opts.uploaded).toEqual(new Set([0, 1]))
    expect(mocked.multiBind).toHaveBeenCalledOnce()
    expect(store.recs[0]!.status).toBe('success')
  })
})

// ── 暂停/恢复（2026-11-03 Phase 3 · 统任务面）────────────────────────────────
// 判据锚点：
//   · pause 仅 multi-chunk 通道 + uploading 态生效（片间边界抛 'Paused' 停下）；
//   · 暂停**保留续传坐标**（rec 的 uploadId/sessionToken/uploadedIndexes 不清），
//     任务落 paused；恢复走 resumeTask → 按坐标跳片补缺；
//   · 负对照：若暂停清坐标（uploadId 置空），恢复即开新会话全量传 ⇒ 断言转红。
describe('multi-chunk 暂停/恢复', () => {
  it('暂停保留续传坐标、任务落 paused；恢复续传按坐标跳片', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore()
    // 门控 chunkUploadFile：onSession 落坐标后挂起，待测试 pause() 后再判 shouldPause
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    mocked.chunkUploadFile.mockImplementation(async (_p, _id, _cs, onProgress, _sig, opts) => {
      opts?.onSession?.({ uploadId: 'S1', sessionToken: 'T1' })
      onProgress?.(3 * 5 * MB, BIG) // 已传 3 片
      await gate
      if (opts?.shouldPause?.()) throw new Error('Paused') // 片间边界：pause 后停
      return { uploadId: 'S1', sessionToken: 'T1' }
    })

    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store })
    q.addFiles([file])
    const run = q.start()
    // 等 chunkUploadFile 被调到并挂起在 gate
    await new Promise((r) => setTimeout(r, 10))

    const id = q.tasks.value[0]!.id
    q.pause(id) // 置 paused ⇒ shouldPause() 将返回 true
    release()
    const out = await run

    // 暂停：不出码、任务落 paused、坐标保留
    expect(out).toBeNull()
    expect(q.tasks.value[0]!.status).toBe('paused')
    const rec = store.recs[0]!
    expect(rec.uploadId).toBe('S1')
    expect(rec.sessionToken).toBe('T1')
    expect(rec.status).toBe('interrupted') // 可续传

    // 恢复：从断点续传——resumeSessionId 沿用旧会话、按服务端位图跳片
    mocked.getChunkStatus.mockResolvedValue({ uploadId: 'S1', totalChunks: 8, uploadedIndexes: [0, 1, 2], status: 'uploading' })
    mocked.chunkUploadFile.mockResolvedValue({ uploadId: 'S1', sessionToken: 'T1' })
    mocked.multiBind.mockResolvedValue({ code: 'C5', url: 'http://x/#/share/C5', share_url: '', file_count: 1, pickup_code: 'P5' })
    const out2 = await q.resumeTask(id)
    expect(out2?.pickup_code).toBe('P5')
    const opts2 = mocked.chunkUploadFile.mock.calls.at(-1)![5]!
    expect(opts2.resumeSessionId).toBe('S1')
    expect(opts2.uploaded).toEqual(new Set([0, 1, 2]))
    expect(mocked.multiBind.mock.calls.at(-1)![0]).toEqual([{ upload_id: 'S1' }])
  })

  it('pause 对非 multi-chunk 通道或非 uploading 态是 no-op（不误标 paused）', async () => {
    const file = mkFile('big.bin', BIG)
    const store = mkStore()
    const q = useUploadQueue({ settings: baseSettings(), t, uploadTasks: store })
    q.addFiles([file])
    const id = q.tasks.value[0]!.id
    // 还是 pending（未开跑）⇒ pause 不生效
    q.pause(id)
    expect(q.tasks.value[0]!.status).not.toBe('paused')
    // channel 未设为 multi-chunk ⇒ 即便 uploading 也不该 pause（此处仍 pending，双保险）
    expect(q.tasks.value[0]!.channel).not.toBe('multi-chunk')
  })
})
