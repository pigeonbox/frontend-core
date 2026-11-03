import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * ⚠️ 用 vi.mock 工厂而不是 vi.spyOn：`download` 是 ESM 具名导出，
 * 在 vitest 里对 ESM 导出做 spyOn 会抛「not declared configurable」⇒
 * 工厂 mock 才是可靠写法。工厂里用 importOriginal 保留其余真实导出
 * （DownloadCancelledError 必须是真类，否则 catch 分支判不出来）。
 */
const downloadMock = vi.fn()

vi.mock('@/utils/downloader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/downloader')>()
  return {
    ...actual,
    download: (...args: unknown[]) => downloadMock(...args),
  }
})

const { useDownloadProgress } = await import('@/composables/useDownloadProgress')
const { DownloadCancelledError } = await import('@/utils/downloader')

const t = (k: string) => k

beforeEach(() => {
  downloadMock.mockReset()
})

describe('useDownloadProgress', () => {
  it('初始态：idle、不确定、百分比 -1、不忙', () => {
    const d = useDownloadProgress(t)
    expect(d.phase.value).toBe('idle')
    expect(d.percent.value).toBe(-1)
    expect(d.busy.value).toBe(false)
    expect(d.error.value).toBe('')
  })

  it('run 成功 ⇒ phase=done、busy 归 false', async () => {
    downloadMock.mockResolvedValue({ sink: 'blob', bytes: 10, handedOff: false })
    const d = useDownloadProgress(t)
    const out = await d.run({ url: '/x', filename: 'a.txt' })
    expect(downloadMock).toHaveBeenCalledTimes(1)
    expect(out?.bytes).toBe(10)
    expect(d.phase.value).toBe('done')
    expect(d.busy.value).toBe(false)
    expect(d.error.value).toBe('')
  })

  it('progress 回调写入响应式状态', async () => {
    downloadMock.mockImplementation(async (req: { onProgress?: (p: unknown) => void }) => {
      req.onProgress?.({ loaded: 50, total: 100, percent: 50, bytesPerSecond: 100, etaSeconds: 1, phase: 'downloading' })
      return { sink: 'blob', bytes: 100, handedOff: false }
    })
    const d = useDownloadProgress(t)
    await d.run({ url: '/x', filename: 'a.txt' })
    expect(d.percent.value).toBe(50)
    expect(d.loaded.value).toBe(50)
    expect(d.total.value).toBe(100)
    expect(d.etaSeconds.value).toBe(1)
  })

  it('取消 ⇒ error 为取消文案、busy 归 false', async () => {
    downloadMock.mockRejectedValue(new DownloadCancelledError())
    const d = useDownloadProgress(t)
    const out = await d.run({ url: '/x', filename: 'a.txt' })
    expect(out).toBeNull()
    expect(d.error.value).toBe('download.cancelled')
    expect(d.busy.value).toBe(false)
  })

  it('失败 ⇒ error 上屏、busy 归 false', async () => {
    downloadMock.mockRejectedValue(new Error('boom'))
    const d = useDownloadProgress(t)
    const out = await d.run({ url: '/x', filename: 'a.txt' })
    expect(out).toBeNull()
    expect(d.error.value).toBe('download.failed')
    expect(d.busy.value).toBe(false)
  })

  it('handedOff ⇒ phase=handed-off（页面内无百分比，如实呈现）', async () => {
    downloadMock.mockResolvedValue({ sink: 'native', bytes: 0, handedOff: true })
    const d = useDownloadProgress(t)
    await d.run({ url: '/x', filename: 'a.txt' })
    expect(d.handedOff.value).toBe(true)
    expect(d.phase.value).toBe('handed-off')
  })
})
