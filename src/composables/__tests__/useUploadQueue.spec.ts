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
  note: '',
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
      code: 'A1', url: 'http://x/#/share/A1',
    })
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 5 * MB)])
    const out = await q.start()
    expect(out).toMatchObject({ code: 'A1', full_share_url: 'http://x/#/share/A1', e2e_key: undefined })
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    const [file, callOpts] = mocked.uploadFile.mock.calls[0]!
    expect(file.name).toBe('a.txt')
    expect(callOpts.expire_style).toBe('day')
    expect(callOpts.encrypted).toBe(false)
    expect(q.tasks.value[0]!.status).toBe('success')
    expect(mocked.ElMessageSuccess).toHaveBeenCalled()
  })

  it('presign 分支：走 opts.presign 且结果取 url', async () => {
    const presign = vi.fn().mockResolvedValue({ code: 'P1', url: 'http://x/#/share/P1', file_name: 'big.bin', file_size: 200 * MB, download_url: '' })
    const q = useUploadQueue({ settings: baseSettings(), t, presignThreshold: 1 * MB, presign })
    q.addFiles([mkFile('big.bin', 200 * MB)])
    const out = await q.start()
    expect(presign).toHaveBeenCalledOnce()
    expect(out).toMatchObject({ code: 'P1', share_url: 'http://x/#/share/P1', full_share_url: 'http://x/#/share/P1' })
    expect(mocked.uploadFile).not.toHaveBeenCalled()
  })

  it('多文件小体积 → multi-direct 一次调用，全部 success', async () => {
    mocked.multiDirect.mockResolvedValue({ code: 'M1', url: 'http://x/#/share/M1', share_url: '', file_count: 2 })
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB), mkFile('b.txt', 2 * MB)])
    const out = await q.start()
    expect(mocked.multiDirect).toHaveBeenCalledOnce()
    expect(out).toMatchObject({ code: 'M1', full_share_url: 'http://x/#/share/M1' })
    expect(q.tasks.value.every((f) => f.status === 'success')).toBe(true)
  })

  it('多文件超 bodyCap → 逐文件 chunk + multiBind 一次', async () => {
    mocked.chunkUploadFile.mockResolvedValue('uid')
    mocked.multiBind.mockResolvedValue({ code: 'C1', url: 'http://x/#/share/C1', share_url: '', file_count: 2 })
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
    mocked.uploadFile.mockResolvedValue({ code: 'E1', url: 'http://x/#/share/E1' })
    const q = useUploadQueue({ settings: { ...baseSettings(), e2e: true }, t })
    q.addFiles([mkFile('a.txt', 5 * MB)])
    const out = await q.start()
    expect(out).toMatchObject({ code: 'E1', e2e_key: 'k-e2e' })
    const [file] = mocked.uploadFile.mock.calls[0]!
    expect(file).toBe(cipher)
    expect(file).not.toBe(q.tasks.value[0]!.file)
    expect(mocked.uploadFile.mock.calls[0]![1]!.encrypted).toBe(true)
  })

  it('上传失败：任务标 error + 不再弹全局 toast（行内已有逐条错误文本）+ start 返回 null', async () => {
    mocked.uploadFile.mockRejectedValue(new Error('boom'))
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB)])
    const out = await q.start()
    expect(out).toBeNull()
    expect(q.tasks.value[0]!.status).toBe('error')
    expect(q.tasks.value[0]!.error).toBe('boom')
    // 2026-10-22：全局 toast 与行内错误文本重复 → 去掉全局 toast
    expect(mocked.ElMessageError).not.toHaveBeenCalled()
  })

  it('cancel：uploading 任务标 error 并写入取消文案', () => {
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB)])
    const id = q.tasks.value[0]!.id
    q.tasks.value[0]!.status = 'uploading'
    q.cancel(id)
    expect(q.tasks.value[0]!.status).toBe('error')
    expect(q.tasks.value[0]!.error).toBe('upload_view.presign.abort')
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
    // 取消文案统一走 upload_view.presign.abort（不再裸抛英文 Cancelled）
    expect(q.tasks.value[1]!.error).toBe('upload_view.presign.abort')
    // 2026-10-22：整批收敛——被点的与未到的都落终态，
    // 否则其余停在 uploading/binding → isUploading 恒真、按钮永久 loading
    expect(q.tasks.value[0]!.status).toBe('error')
    expect(q.isUploading.value).toBe(false)
    expect(q.canStart.value).toBe(true)
  })

  it('retry：失败任务复位并重跑该文件（单文件队列）', async () => {
    mocked.uploadFile.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      code: 'R1', url: 'http://x/#/share/R1',
    })
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB)])
    const first = await q.start()
    expect(first).toBeNull()
    expect(q.tasks.value[0]!.status).toBe('error')
    const id = q.tasks.value[0]!.id
    const out = await q.retry(id)
    expect(out).toMatchObject({ code: 'R1' })
    expect(q.tasks.value[0]!.status).toBe('success')
    expect(q.tasks.value[0]!.error).toBe('')
  })

  it('retry：多文件批量语义下不自动发起（只复位，交主按钮整批重跑）', async () => {
    mocked.multiDirect.mockRejectedValue(new Error('boom'))
    const q = useUploadQueue({ settings: baseSettings(), t })
    q.addFiles([mkFile('a.txt', 1 * MB), mkFile('b.txt', 2 * MB)])
    await q.start()
    expect(q.tasks.value.every((f) => f.status === 'error')).toBe(true)
    const out = await q.retry(q.tasks.value[0]!.id)
    expect(out).toBeNull()
    expect(q.tasks.value[0]!.status).toBe('pending')
    expect(q.tasks.value[1]!.status).toBe('error')
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

/**
 * 单文件上限预检（2026-10-23）。
 * 背景：单文件上限（upload.max_file_size）此前只有服务端在 presign init 阶段拒
 * （错误码 30008），反代 nginx 反而是唯一有硬顶的一层 ⇒ 大文件传一半被 nginx
 * 拒成 413。改成「服务端为权威 + 前端上传前本地拦截」，本组用例钉死前端行为。
 */
describe('useUploadQueue — 单文件上限预检', () => {
  it('超限文件在 addFiles 即落 blocked 态（选完文件就能看见）', () => {
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => 10 * MB })
    q.addFiles([mkFile('big.bin', 20 * MB)])
    expect(q.tasks.value[0]!.status).toBe('blocked')
    expect(q.tasks.value[0]!.error).toContain('upload.maxFileExceeded')
    expect(mocked.ElMessageError).toHaveBeenCalled()
  })

  it('全部文件超限 ⇒ canStart=false（发送按钮禁用）且 blockedCount 可告知原因', () => {
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => 10 * MB })
    q.addFiles([mkFile('a.bin', 20 * MB), mkFile('b.bin', 30 * MB)])
    expect(q.canStart.value).toBe(false)
    expect(q.blockedCount.value).toBe(2)
  })

  it('超限文件 start 时被剔除：不发任何请求', async () => {
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => 10 * MB })
    q.addFiles([mkFile('big.bin', 20 * MB)])
    const out = await q.start()
    expect(out).toBeNull()
    expect(mocked.uploadFile).not.toHaveBeenCalled()
    expect(mocked.multiDirect).not.toHaveBeenCalled()
    expect(mocked.chunkUploadFile).not.toHaveBeenCalled()
    expect(q.tasks.value[0]!.status).toBe('blocked')
  })

  it('上限为 0（不限）时大文件照常走普通通道，不被预检拦下', async () => {
    mocked.uploadFile.mockResolvedValue({ code: 'U1', url: 'http://x/#/share/U1' })
    const q = useUploadQueue({
      settings: baseSettings(), t,
      maxFileSize: () => 0,
      bodyCap: () => 30 * MB,
    })
    q.addFiles([mkFile('huge.bin', 20 * MB)])
    const out = await q.start()
    expect(out).not.toBeNull()
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
  })

  it('混合批次：超限的剔除，未超限的照常上传', async () => {
    mocked.uploadFile.mockResolvedValue({ code: 'M1', url: 'http://x/#/share/M1' })
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => 10 * MB })
    q.addFiles([mkFile('ok.txt', 1 * MB), mkFile('big.bin', 20 * MB)])
    const out = await q.start()
    expect(out).not.toBeNull()
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    const over = q.tasks.value.find((f) => f.file.name === 'big.bin')!
    expect(over.status).toBe('blocked')
  })

  it('上限被调大后：此前 blocked 的任务在 start 时可发（start 的待发集合须含 blocked）', async () => {
    mocked.uploadFile.mockResolvedValue({ code: 'R1', url: 'http://x/#/share/R1' })
    let limit = 10 * MB
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => limit })
    q.addFiles([mkFile('big.bin', 20 * MB)])
    expect(q.tasks.value[0]!.status).toBe('blocked')
    expect(q.blockedCount.value).toBe(1)
    limit = 50 * MB // 管理员把上限调大了
    const out = await q.start()
    expect(out).not.toBeNull()
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    expect(q.tasks.value[0]!.status).toBe('success')
  })

  it('blocked 的行内重试：仍超限则保持 blocked 且不发请求', async () => {
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => 10 * MB })
    // ⚠️ 必须**多文件**：多文件语义下 retry 只复位不自动发（单文件会走 start()，
    // 被 start 的预检兜回 ⇒ retry 自身的判定在单文件场景不可观测）
    q.addFiles([mkFile('ok.txt', 1 * MB), mkFile('big.bin', 20 * MB)])
    const id = q.tasks.value.find((f) => f.file.name === 'big.bin')!.id
    const out = await q.retry(id)
    expect(out).toBeNull()
    expect(mocked.uploadFile).not.toHaveBeenCalled()
    const over = q.tasks.value.find((f) => f.file.name === 'big.bin')!
    expect(over.status).toBe('blocked')
    expect(over.error).toContain('upload.maxFileExceeded')
    // 仍超限时必须**立即**保持 blocked：若被重置成 pending，UI 的「N 个文件超限」
    // 提示条会先消失、用户以为该文件已就绪（整批重跑时才被拦回）
    expect(q.blockedCount.value).toBe(1)
  })

  it('blocked 的行内重试：上限已调大则恢复发送', async () => {
    mocked.uploadFile.mockResolvedValue({ code: 'R2', url: 'http://x/#/share/R2' })
    let limit = 10 * MB
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => limit })
    q.addFiles([mkFile('big.bin', 20 * MB)])
    const id = q.tasks.value[0]!.id
    limit = 50 * MB
    const out = await q.retry(id)
    expect(out).not.toBeNull()
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    expect(q.tasks.value[0]!.status).toBe('success')
  })

  it('排队期间上限被调低：start 时重新判定（防绕过）', async () => {
    let limit = 0
    const q = useUploadQueue({ settings: baseSettings(), t, maxFileSize: () => limit })
    q.addFiles([mkFile('a.txt', 5 * MB)])
    limit = 1 * MB // 管理员在排队期间把上限调低
    const out = await q.start()
    expect(out).toBeNull()
    expect(mocked.uploadFile).not.toHaveBeenCalled()
    expect(q.tasks.value[0]!.status).toBe('blocked')
  })
})

// ---- 单次发送**总量**上限（2026-10-30） ----
// 与「单文件上限」是两个不同的闸：单文件闸管单个文件，总量闸管一次发送的合计体积
// （只约束登录用户；匿名走访客日配额）。
// ⚠️ 前端只**提示**、不阻断：站点级默认可能比用户的**用户级**上限宽松
// （users.max_upload_size）⇒ 硬拦会误杀合法上传；服务端 413 才是权威。
describe('单次发送总量上限', () => {
  it('cap=0（不限）⇒ 合计照算，但不提示', () => {
    const q = useUploadQueue({ settings: baseSettings(), t, batchSizeCap: () => 0 })
    q.addFiles([mkFile('a.txt', 100 * MB), mkFile('b.txt', 100 * MB)])
    expect(q.totalSize.value).toBe(200 * MB)
    expect(q.batchOverLimit.value).toBe(false)
  })

  it('合计未超上限 ⇒ 不提示', () => {
    const q = useUploadQueue({ settings: baseSettings(), t, batchSizeCap: () => 300 * MB })
    q.addFiles([mkFile('a.txt', 100 * MB), mkFile('b.txt', 100 * MB)])
    expect(q.totalSize.value).toBe(200 * MB)
    expect(q.batchOverLimit.value).toBe(false)
  })

  it('合计超上限 ⇒ 提示，但**不阻断**（canStart 仍为 true）', () => {
    const q = useUploadQueue({ settings: baseSettings(), t, batchSizeCap: () => 50 * MB })
    q.addFiles([mkFile('a.txt', 30 * MB), mkFile('b.txt', 30 * MB)])
    expect(q.totalSize.value).toBe(60 * MB)
    expect(q.batchOverLimit.value).toBe(true)
    // 用户级上限可能更宽松 ⇒ 不硬拦（服务端 413 才是权威）
    expect(q.canStart.value).toBe(true)
  })

  it('被单文件上限拦下的文件（blocked）不进合计（它不参与发送）', () => {
    const q = useUploadQueue({
      settings: baseSettings(),
      t,
      maxFileSize: () => 50 * MB,
      batchSizeCap: () => 100 * MB,
    })
    q.addFiles([mkFile('ok.txt', 10 * MB), mkFile('too-big.txt', 80 * MB)])
    expect(q.blockedCount.value).toBe(1)
    expect(q.totalSize.value).toBe(10 * MB)
    expect(q.batchOverLimit.value).toBe(false)
  })
})
