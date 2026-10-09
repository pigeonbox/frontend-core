import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUploadQueue } from '../useUploadQueue'
import type { ShareSettings } from '../useShareSettings'

// ---- mocks ----
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/share', () => ({
  uploadFile: vi.fn(),
}))
vi.mock('@/api/multifile', () => ({
  multiDirect: vi.fn(),
  chunkUploadFile: vi.fn(),
  multiBind: vi.fn(),
}))
vi.mock('@/utils/e2e', () => ({
  generateKeyB64: vi.fn(),
  encryptFile: vi.fn(),
}))

import { ElMessage } from 'element-plus'
import { uploadFile } from '@/api/share'
import { multiDirect, chunkUploadFile, multiBind } from '@/api/multifile'
import { generateKeyB64, encryptFile } from '@/utils/e2e'

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
  custom_code: '',
})

const mocked = {
  uploadFile: vi.mocked(uploadFile),
  multiDirect: vi.mocked(multiDirect),
  chunkUploadFile: vi.mocked(chunkUploadFile),
  multiBind: vi.mocked(multiBind),
  generateKeyB64: vi.mocked(generateKeyB64),
  encryptFile: vi.mocked(encryptFile),
  ElMessageError: vi.mocked(ElMessage.error),
  ElMessageSuccess: vi.mocked(ElMessage.success),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUploadQueue', () => {
  it('单文件直传：uploadFile 收到 payload/settings，结果映射正确', async () => {
    mocked.uploadFile.mockResolvedValue({
      code: 'A1', url: 'http://x/share/A1',
    })
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 5 * MB)])
    const out = await q.start()
    expect(out).toMatchObject({ code: 'A1', full_share_url: 'http://x/share/A1', e2e_key: undefined })
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    const [file, callOpts] = mocked.uploadFile.mock.calls[0]!
    expect(file.name).toBe('a.txt')
    expect(callOpts.expire_style).toBe('day')
    expect(callOpts.encrypted).toBe(false)
    expect(q.tasks.value[0]!.status).toBe('success')
    expect(mocked.ElMessageSuccess).toHaveBeenCalled()
  })

  it('presign 分支：走 opts.presign 且结果取 url', async () => {
    const presign = vi.fn().mockResolvedValue({ code: 'P1', url: 'http://x/share/P1', file_name: 'big.bin', file_size: 200 * MB, download_url: '' })
    const q = useUploadQueue({ settings: baseSettings(), t, presignThreshold: 1 * MB, presign })
    q.addFiles([mkFile('big.bin', 200 * MB)])
    const out = await q.start()
    expect(presign).toHaveBeenCalledOnce()
    expect(out).toMatchObject({ code: 'P1', share_url: 'http://x/share/P1', full_share_url: 'http://x/share/P1' })
    expect(mocked.uploadFile).not.toHaveBeenCalled()
  })

  it('多文件小体积 → multi-direct 一次调用，全部 success', async () => {
    mocked.multiDirect.mockResolvedValue({ code: 'M1', url: 'http://x/share/M1', share_url: '', file_count: 2 })
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB), mkFile('b.txt', 2 * MB)])
    const out = await q.start()
    expect(mocked.multiDirect).toHaveBeenCalledOnce()
    expect(out).toMatchObject({ code: 'M1', full_share_url: 'http://x/share/M1' })
    expect(q.tasks.value.every((f) => f.status === 'success')).toBe(true)
  })

  it('多文件超 bodyCap → 逐文件 chunk + multiBind 一次', async () => {
    mocked.chunkUploadFile.mockResolvedValue('uid')
    mocked.multiBind.mockResolvedValue({ code: 'C1', url: 'http://x/share/C1', share_url: '', file_count: 2 })
    const q = useUploadQueue({ settings: baseSettings(), t, bodyCap: () => 6 * MB })
    q.addFiles([mkFile('a.txt', 5 * MB), mkFile('b.txt', 5 * MB)])
    const out = await q.start()
    expect(mocked.chunkUploadFile).toHaveBeenCalledTimes(2)
    expect(mocked.multiBind).toHaveBeenCalledOnce()
    const entries = mocked.multiBind.mock.calls[0]![0]
    expect(entries).toHaveLength(2)
    expect(out).toMatchObject({ code: 'C1' })
  })

  it('E2E 超限整体拒绝：零 API 调用 + error toast', async () => {
    const q = useUploadQueue({ settings: { ...baseSettings(), e2e: true }, t })
    q.addFiles([mkFile('huge.bin', 200 * MB)])
    const out = await q.start()
    expect(out).toBeNull()
    expect(mocked.ElMessageError).toHaveBeenCalledWith('upload.e2e.tooLarge')
    expect(mocked.uploadFile).not.toHaveBeenCalled()
  })

  it('E2E 加密顺序：payload 为密文且 e2e_key 进结果', async () => {
    mocked.generateKeyB64.mockResolvedValue('k-e2e')
    const cipher = mkFile('a.txt.enc', 5 * MB)
    mocked.encryptFile.mockResolvedValue(cipher)
    mocked.uploadFile.mockResolvedValue({ code: 'E1', url: 'http://x/share/E1' })
    const q = useUploadQueue({ settings: { ...baseSettings(), e2e: true }, t })
    q.addFiles([mkFile('a.txt', 5 * MB)])
    const out = await q.start()
    expect(out).toMatchObject({ code: 'E1', e2e_key: 'k-e2e' })
    const [file] = mocked.uploadFile.mock.calls[0]!
    expect(file).toBe(cipher)
    expect(file).not.toBe(q.tasks.value[0]!.file)
    expect(mocked.uploadFile.mock.calls[0]![1]!.encrypted).toBe(true)
  })

  it('上传失败：任务标 error + ElMessage.error + start 返回 null', async () => {
    mocked.uploadFile.mockRejectedValue(new Error('boom'))
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB)])
    const out = await q.start()
    expect(out).toBeNull()
    expect(q.tasks.value[0]!.status).toBe('error')
    expect(q.tasks.value[0]!.error).toBe('boom')
    expect(mocked.ElMessageError).toHaveBeenCalledWith('boom')
  })

  it('cancel：uploading 任务标 error 并写入取消文案', () => {
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB)])
    const id = q.tasks.value[0]!.id
    q.tasks.value[0]!.status = 'uploading'
    q.cancel(id)
    expect(q.tasks.value[0]!.status).toBe('error')
    expect(q.tasks.value[0]!.error).toBe('upload.presign.abort')
  })

  it('W3 语义：multi 进行中取消任一任务=中止整批（其余任务标 Cancelled）', async () => {
    // chunkUploadFile 挂起直到 signal abort
    mocked.chunkUploadFile.mockImplementation((_f, _id, _c, _p, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('Cancelled')))
      })
    )
    const q = useUploadQueue({ settings: baseSettings(), t, bodyCap: () => 1 * MB })
    q.addFiles([mkFile('a.bin', 5 * MB), mkFile('b.bin', 5 * MB)])
    const startPromise = q.start()
    await new Promise((r) => setTimeout(r, 20)) // 等第一个文件进入上传
    q.cancel(q.tasks.value[0]!.id)
    const out = await startPromise
    expect(out).toBeNull()
    expect(q.tasks.value[1]!.status).toBe('error')
    expect(q.tasks.value[1]!.error).toBe('Cancelled')
  })

  it('canStart/isUploading 计算正确', () => {
    const q = useUploadQueue({ settings: baseSettings(), t })
    expect(q.canStart.value).toBe(false)
    q.addFiles([mkFile('a.txt', 1 * MB)])
    expect(q.canStart.value).toBe(true)
    q.tasks.value[0]!.status = 'uploading'
    expect(q.isUploading.value).toBe(true)
    expect(q.canStart.value).toBe(false)
  })
})
