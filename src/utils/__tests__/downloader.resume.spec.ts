import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOWNLOAD_MAX_RETRIES,
  DownloadCancelledError,
  DownloadInterruptedError,
  download,
  parseContentRangeTotal,
  type DownloaderEnv,
  type DownloadProgress,
  type FsTarget,
} from '@/utils/downloader'
import { retryDelayMs, RETRY_BASE_MS, RETRY_CAP_MS } from '@/utils/backoff'
import { resetBaseCache } from '@/utils/base'

const enc = new TextEncoder()

afterEach(() => {
  ;(globalThis as { window?: unknown }).window = { location: { pathname: '/' } }
  resetBaseCache()
  vi.useRealTimers()
})

/** 先吐 chunks、再以网络错误中断的响应（模拟弱网中途断流） */
const failingResponse = (chunks: string[], headers: Record<string, string> = {}) => {
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]!))
        return
      }
      controller.error(new TypeError('network error'))
    },
  })
  const h = new Headers()
  for (const [k, v] of Object.entries(headers)) h.set(k, v)
  return new Response(body, { status: 200, headers: h })
}

const okResponse = (
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {}
) => {
  const h = new Headers()
  for (const [k, v] of Object.entries(init.headers ?? {})) h.set(k, v)
  return new Response(enc.encode(body), { status: init.status ?? 200, headers: h })
}

const baseEnv = (over: Partial<DownloaderEnv> = {}): DownloaderEnv => ({
  fetchImpl: vi.fn(async () => okResponse('hello world')) as unknown as typeof fetch,
  hasFsApi: false,
  saveBlob: vi.fn(),
  nativeDownload: vi.fn(),
  ...over,
})

/**
 * 跑一个含退避的下载：假时钟推进全部 setTimeout，微任务同步排空。
 * download() 内部的 fetch/流读取都是微任务 ⇒ advance(0) 先把链推到 delay 上。
 */
async function runWithFakeTimers(p: () => Promise<unknown>): Promise<{ ok: true; v: unknown } | { ok: false; e: unknown }> {
  vi.useFakeTimers()
  const settled = p().then(
    (v) => ({ ok: true as const, v }),
    (e) => ({ ok: false as const, e }),
  )
  await vi.advanceTimersByTimeAsync(0)
  await vi.runAllTimersAsync()
  return await settled
}

describe('retryDelayMs（退避口径）', () => {
  it('指数增长 + 半区间抖动：rng 取 0/1 得上下界', () => {
    expect(retryDelayMs(1, () => 0)).toBe(RETRY_BASE_MS / 2)
    expect(retryDelayMs(1, () => 1)).toBe(RETRY_BASE_MS)
    expect(retryDelayMs(2, () => 0)).toBe(RETRY_BASE_MS)
    expect(retryDelayMs(2, () => 1)).toBe(RETRY_BASE_MS * 2)
  })

  it('单次退避被 CAP 钳住（断网 30s 恢复必须够得着）', () => {
    expect(retryDelayMs(10, () => 1)).toBe(RETRY_CAP_MS)
    expect(RETRY_CAP_MS).toBeGreaterThanOrEqual(15000)
  })

  it('attempt<=0 按 1 处理', () => {
    expect(retryDelayMs(0, () => 1)).toBe(RETRY_BASE_MS)
    expect(retryDelayMs(-3, () => 1)).toBe(RETRY_BASE_MS)
  })
})

describe('parseContentRangeTotal', () => {
  it('解析 bytes 6-10/11 → 11', () => {
    expect(parseContentRangeTotal('bytes 6-10/11')).toBe(11)
  })

  it('解析 416 形态 bytes */11 → 11', () => {
    expect(parseContentRangeTotal('bytes */11')).toBe(11)
  })

  it('缺头/垃圾值 → null', () => {
    expect(parseContentRangeTotal(null)).toBeNull()
    expect(parseContentRangeTotal(undefined)).toBeNull()
    expect(parseContentRangeTotal('nonsense')).toBeNull()
  })
})

describe('下载中断 → Range 断点续传', () => {
  it('中途断流自动退避重试：第二次请求带 Range: bytes=<loaded>-，内容拼全、进度单调', async () => {
    const seen: DownloadProgress[] = []
    const headersSeen: Array<Record<string, string>> = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      headersSeen.push({ ...(init?.headers as Record<string, string>) })
      if (headersSeen.length === 1) {
        return failingResponse(['hello '], { 'Content-Length': '11' })
      }
      return okResponse('world', {
        status: 206,
        headers: { 'Content-Length': '5', 'Content-Range': 'bytes 6-10/11' },
      })
    }) as unknown as typeof fetch
    const saveBlob = vi.fn()
    const env = baseEnv({ fetchImpl, saveBlob })

    const r = await runWithFakeTimers(() =>
      download({ url: '/x', filename: 'a.txt', onProgress: (p) => seen.push(p) }, env),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const out = r.v as { bytes: number; sink: string }
    expect(out.bytes).toBe(11)
    expect(headersSeen).toHaveLength(2)
    expect(headersSeen[1]!.Range).toBe('bytes=6-')
    // 完整内容落盘
    const blob = saveBlob.mock.calls[0]![0] as Blob
    expect(await blob.text()).toBe('hello world')
    expect(saveBlob.mock.calls[0]![1]).toBe('a.txt')
    // 相位可感知：retrying 带重试序号；百分比全程单调
    const retry = seen.find((p) => p.phase === 'retrying')
    expect(retry).toBeTruthy()
    expect(retry!.retryAttempt).toBe(1)
    const percents = seen.filter((p) => p.percent >= 0).map((p) => p.percent)
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]!).toBeGreaterThanOrEqual(percents[i - 1]!)
    }
    expect(percents[percents.length - 1]).toBe(100)
  })

  it('退避预算耗尽 ⇒ DownloadInterruptedError 携带断点（blob 缓冲与进度保留）', async () => {
    // 首轮拿到响应后断流；此后断网 ⇒ 重试轮 fetch 直接抛（连不上，不给响应）
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      if (calls === 1) return failingResponse(['hello '], { 'Content-Length': '11' })
      throw new TypeError('network error')
    }) as unknown as typeof fetch
    const saveBlob = vi.fn()
    const env = baseEnv({ fetchImpl, saveBlob })

    const r = await runWithFakeTimers(() => download({ url: '/x', filename: 'a.txt' }, env))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.e).toBeInstanceOf(DownloadInterruptedError)
    const err = r.e as DownloadInterruptedError
    expect(err.loaded).toBe(6)
    expect(err.resume).toBeTruthy()
    expect(new TextDecoder().decode(err.resume!.chunks![0]!)).toBe('hello ')
    expect(err.resume!.total).toBe(11)
    // 1 次首发 + 6 次重试
    expect(fetchImpl).toHaveBeenCalledTimes(1 + DOWNLOAD_MAX_RETRIES)
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('断点回传（resume.chunks）续传：只请求缺失段，合成完整内容', async () => {
    const headersSeen: Array<Record<string, string>> = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      headersSeen.push({ ...(init?.headers as Record<string, string>) })
      return okResponse('world', {
        status: 206,
        headers: { 'Content-Length': '5', 'Content-Range': 'bytes 6-10/11' },
      })
    }) as unknown as typeof fetch
    const saveBlob = vi.fn()
    const env = baseEnv({ fetchImpl, saveBlob })

    const out = await download(
      {
        url: '/x',
        filename: 'a.txt',
        resume: { loaded: 6, total: 11, chunks: [enc.encode('hello ')], filename: 'a.txt' },
      },
      env,
    )
    expect(out.bytes).toBe(11)
    expect(headersSeen[0]!.Range).toBe('bytes=6-')
    const blob = saveBlob.mock.calls[0]![0] as Blob
    expect(await blob.text()).toBe('hello world')
    expect(saveBlob.mock.calls[0]![1]).toBe('a.txt')
  })

  it('fs 档：中断保留句柄，续传不重弹保存框、写入接在断点后', async () => {
    const written: string[] = []
    let closed = 0
    let removed = 0
    const target: FsTarget = {
      writable: {
        write: async (c: Uint8Array) => { written.push(new TextDecoder().decode(c)) },
        close: async () => { closed++ },
        abort: async () => {},
      },
      remove: async () => { removed++ },
    }
    const pickTarget = vi.fn(async () => target)
    // 第一轮：首响断流后持续断网（重试轮 fetch 直接抛）⇒ 耗尽预算；第二轮网络恢复给 206
    let run1 = true
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string> | undefined)?.Range
      if (run1) {
        if (!range) return failingResponse(['hello '], { 'Content-Length': '11' })
        throw new TypeError('network error')
      }
      expect(range).toBe('bytes=6-')
      return okResponse('world', {
        status: 206,
        headers: { 'Content-Length': '5', 'Content-Range': 'bytes 6-10/11' },
      })
    }) as unknown as typeof fetch
    const env = baseEnv({ hasFsApi: true, pickTarget, fetchImpl })

    // 第一轮：断流 + 预算耗尽 ⇒ 中断，句柄原样保留
    const r1 = await runWithFakeTimers(() => download({ url: '/x', filename: 'a.bin' }, env))
    expect(r1.ok).toBe(false)
    if (r1.ok) return
    const err = r1.e as DownloadInterruptedError
    expect(err.resume?.target).toBe(target)
    expect(written.join('')).toBe('hello ')
    expect(removed).toBe(0)
    expect(pickTarget).toHaveBeenCalledTimes(1)

    // 第二轮：网络恢复 ⇒ 回传 resume，不再 pickTarget，同一句柄续写
    run1 = false
    const out = await download({ url: '/x', filename: 'a.bin', resume: err.resume! }, env)
    expect(out.sink).toBe('fs')
    expect(out.bytes).toBe(11)
    expect(pickTarget).toHaveBeenCalledTimes(1)
    expect(written.join('')).toBe('hello world')
    expect(closed).toBe(1)
    expect(removed).toBe(0)
  })

  it('服务端忽略 Range（返回 200 全量）且句柄可截断 ⇒ truncate(0) 后从头重写，文件不损坏', async () => {
    const written: string[] = []
    const target: FsTarget = {
      writable: {
        write: async (c: Uint8Array) => { written.push(new TextDecoder().decode(c)) },
        close: async () => {},
        truncate: async (size: number) => { expect(size).toBe(0); written.length = 0 },
      },
      remove: async () => {},
    }
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Range).toBe('bytes=6-')
      // 200 = 忽略 Range，给的是全量
      return okResponse('hello world', { headers: { 'Content-Length': '11' } })
    }) as unknown as typeof fetch
    const saveBlob = vi.fn()
    const env = baseEnv({ hasFsApi: true, pickTarget: async () => target, fetchImpl, saveBlob })

    const out = await download(
      { url: '/x', filename: 'a.bin', resume: { loaded: 6, total: 11, target } },
      env,
    )
    expect(out.bytes).toBe(11)
    expect(written.join('')).toBe('hello world')
  })

  it('退避等待期间用户取消 ⇒ DownloadCancelledError（不留断点按钮）', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async () => failingResponse(['hello '], { 'Content-Length': '11' })) as unknown as typeof fetch
    const env = baseEnv({ fetchImpl })

    vi.useFakeTimers()
    const settled = download({ url: '/x', filename: 'a.txt', signal: controller.signal }, env).then(
      () => ({ ok: true as const }),
      (e: unknown) => ({ ok: false as const, e }),
    )
    // 推到 delay 已排上、尚未触发
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    const r = await settled
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.e).toBeInstanceOf(DownloadCancelledError)
  })
})
