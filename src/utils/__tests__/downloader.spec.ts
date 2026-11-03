import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MEMORY_SINK_LIMIT,
  DownloadCancelledError,
  computeProgress,
  download,
  parseContentDispositionFilename,
  pickSink,
  resolveDownloadUrl,
  type DownloaderEnv,
  type DownloadRequest,
} from '@/utils/downloader'
import { resetBaseCache } from '@/utils/base'

const setLocation = (pathname: string) => {
  ;(globalThis as { window?: unknown }).window = { location: { pathname } }
  resetBaseCache()
}

afterEach(() => setLocation('/'))

describe('parseContentDispositionFilename', () => {
  it('优先取 filename* 的 UTF-8 百分号编码名并解码', () => {
    expect(parseContentDispositionFilename("attachment; filename*=UTF-8''%E4%B8%AD%E6%96%87.txt"))
      .toBe('中文.txt')
  })

  it('filename* 解析失败时降级到 filename', () => {
    expect(parseContentDispositionFilename("attachment; filename*=UTF-8''%E4%zz; filename=\"fallback.txt\""))
      .toBe('fallback.txt')
  })

  it('只有 filename 时取它（含引号包裹）', () => {
    expect(parseContentDispositionFilename('attachment; filename="plain.txt"')).toBe('plain.txt')
  })

  it('无 filename 段时返回 null', () => {
    expect(parseContentDispositionFilename('attachment')).toBeNull()
    expect(parseContentDispositionFilename(null)).toBeNull()
    expect(parseContentDispositionFilename(undefined)).toBeNull()
  })

  it('不会把 filename* 误当成 filename', () => {
    expect(parseContentDispositionFilename("attachment; filename*=UTF-8''a.txt")).toBe('a.txt')
  })
})

describe('computeProgress', () => {
  it('total 已知时给出百分比并钳位 0-100', () => {
    expect(computeProgress(50, 100, 0, 1000).percent).toBe(50)
    expect(computeProgress(150, 100, 0, 1000).percent).toBe(100)
    expect(computeProgress(-5, 100, 0, 1000).percent).toBe(0)
  })

  it('total 未知时 percent 为 -1（不确定态）', () => {
    expect(computeProgress(500, 0, 0, 1000).percent).toBe(-1)
  })

  it('按耗时算速度与剩余时间', () => {
    const r = computeProgress(1000, 4000, 0, 2000)
    expect(r.bytesPerSecond).toBe(500)
    expect(r.etaSeconds).toBe(6)
  })

  it('零耗时或零速度时 ETA 为 null', () => {
    expect(computeProgress(1000, 4000, 0, 0).etaSeconds).toBeNull()
    expect(computeProgress(0, 4000, 0, 1000).etaSeconds).toBeNull()
  })
})

describe('pickSink', () => {
  it('有文件系统 API 一律走 fs（内存零占用）', () => {
    expect(pickSink(true, 0)).toBe('fs')
    expect(pickSink(true, 999 * 1024 * 1024)).toBe('fs')
  })

  it('无文件系统 API：体积超限走 native，否则走 blob', () => {
    expect(pickSink(false, 10)).toBe('blob')
    expect(pickSink(false, MEMORY_SINK_LIMIT)).toBe('blob')
    expect(pickSink(false, MEMORY_SINK_LIMIT + 1)).toBe('native')
  })

  it('体积未知时先按 blob 试（超限再降级）', () => {
    expect(pickSink(false, 0)).toBe('blob')
  })
})

describe('resolveDownloadUrl', () => {
  it('绝对 URL 原样返回（服务端下发的 download_url）', () => {
    expect(resolveDownloadUrl('https://host.example/share/download?code=AB12CD&token=TK'))
      .toBe('https://host.example/share/download?code=AB12CD&token=TK')
  })

  it('根绝对路径补部署前缀（统一网关 /app/pigeonbox/ 场景）', () => {
    setLocation('/app/pigeonbox/')
    expect(resolveDownloadUrl('/share/download?code=AB12CD')).toBe('/app/pigeonbox/share/download?code=AB12CD')
  })

  it('根路径部署时前缀为空', () => {
    setLocation('/')
    expect(resolveDownloadUrl('/share/download?code=AB12CD')).toBe('/share/download?code=AB12CD')
  })
})

/** 造一个分块可控的 Response（Content-Length 可选） */
const chunkedResponse = (chunks: string[], contentLength?: number) => {
  const encoder = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[i]!))
      i++
    },
  })
  const headers = new Headers()
  if (contentLength !== undefined) headers.set('Content-Length', String(contentLength))
  return new Response(body, { status: 200, headers })
}

const baseEnv = (over: Partial<DownloaderEnv> = {}): DownloaderEnv => ({
  fetchImpl: vi.fn(async () => chunkedResponse(['hello ', 'world'], 11)) as unknown as typeof fetch,
  hasFsApi: false,
  saveBlob: vi.fn(),
  nativeDownload: vi.fn(),
  ...over,
})

describe('download', () => {
  it('blob 档：读完整流并落盘，进度回调单调递增', async () => {
    const saveBlob = vi.fn()
    const env = baseEnv({ saveBlob })
    const seen: number[] = []
    const req: DownloadRequest = {
      url: '/share/download?code=AB12CD',
      filename: 'a.txt',
      onProgress: (p) => seen.push(p.percent),
    }
    const out = await download(req, env)
    expect(out.sink).toBe('blob')
    expect(out.bytes).toBe(11)
    expect(out.handedOff).toBe(false)
    expect(saveBlob).toHaveBeenCalledTimes(1)
    const percents = seen.filter((p) => p >= 0)
    expect(percents.length).toBeGreaterThan(0)
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]!).toBeGreaterThanOrEqual(percents[i - 1]!)
    }
    expect(seen[seen.length - 1]).toBe(100)
  })

  it('fs 档：先取保存目标再发请求，内容写进 writable', async () => {
    const written: string[] = []
    const remove = vi.fn(async () => {})
    const pickTarget = vi.fn(async () => ({
      writable: {
        write: async (c: Uint8Array) => { written.push(new TextDecoder().decode(c)) },
        close: async () => {},
      },
      remove,
    }))
    const env = baseEnv({ hasFsApi: true, pickTarget })
    const out = await download({ url: '/x', filename: 'a.txt' }, env)
    expect(out.sink).toBe('fs')
    expect(written.join('')).toBe('hello world')
    expect(pickTarget).toHaveBeenCalledTimes(1)
  })

  it('用户取消保存 ⇒ 零请求、零字节', async () => {
    const fetchImpl = vi.fn()
    const env = baseEnv({ hasFsApi: true, pickTarget: async () => null, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(download({ url: '/x', filename: 'a.txt' }, env)).rejects.toBeInstanceOf(DownloadCancelledError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetch 失败 ⇒ 删除已建文件并降级 native', async () => {
    const remove = vi.fn(async () => {})
    const nativeDownload = vi.fn()
    const pickTarget = vi.fn(async () => ({
      writable: { write: async () => {}, close: async () => {} },
      remove,
    }))
    const env = baseEnv({
      hasFsApi: true,
      pickTarget,
      nativeDownload,
      fetchImpl: vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch,
    })
    const out = await download({ url: '/x', filename: 'a.txt' }, env)
    expect(out.sink).toBe('native')
    expect(out.handedOff).toBe(true)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(nativeDownload).toHaveBeenCalledTimes(1)
  })

  it('transform 失败 ⇒ 直接报错，不降级 native', async () => {
    const nativeDownload = vi.fn()
    const env = baseEnv({ nativeDownload })
    await expect(
      download(
        { url: '/x', filename: 'a.txt', transform: async () => { throw new Error('口令错误') } },
        env,
      ),
    ).rejects.toThrow('口令错误')
    expect(nativeDownload).not.toHaveBeenCalled()
  })

  it('体积已知超限 ⇒ 立刻交回浏览器原生下载（不读进内存、不重复下一遍）', async () => {
    const nativeDownload = vi.fn()
    const saveBlob = vi.fn()
    const big = 'x'.repeat(1024)
    const env = baseEnv({
      saveBlob,
      nativeDownload,
      // 上限做成可注入 ⇒ 这条路径不必真分配几十 MB 内存就能测
      memoryLimit: 4 * 1024,
      fetchImpl: vi.fn(async () => chunkedResponse(Array.from({ length: 80 }, () => big), 80 * 1024)) as unknown as typeof fetch,
    })
    const out = await download({ url: '/x', filename: 'a.bin' }, env)
    expect(out.sink).toBe('native')
    expect(out.handedOff).toBe(true)
    expect(saveBlob).not.toHaveBeenCalled()
    expect(nativeDownload).toHaveBeenCalledTimes(1)
  })

  it('体积未知、传输中撑过上限 ⇒ 丢弃缓冲并降级 native', async () => {
    const nativeDownload = vi.fn()
    const saveBlob = vi.fn()
    const big = 'x'.repeat(1024)
    const env = baseEnv({
      saveBlob,
      nativeDownload,
      memoryLimit: 4 * 1024,
      // 无 Content-Length ⇒ 体积未知 ⇒ 先按 blob 试，边下边看是否撑爆
      fetchImpl: vi.fn(async () => chunkedResponse(Array.from({ length: 80 }, () => big))) as unknown as typeof fetch,
    })
    const out = await download({ url: '/x', filename: 'a.bin' }, env)
    expect(out.sink).toBe('native')
    expect(out.handedOff).toBe(true)
    expect(saveBlob).not.toHaveBeenCalled()
    expect(nativeDownload).toHaveBeenCalledTimes(1)
  })

  it('blob 档用服务端 Content-Disposition 的文件名（优先于兜底名）', async () => {
    const saveBlob = vi.fn()
    const env = baseEnv({
      saveBlob,
      fetchImpl: vi.fn(async () => {
        const r = chunkedResponse(['x'], 1)
        r.headers.set('Content-Disposition', "attachment; filename*=UTF-8''%E6%B5%8B%E8%AF%95.txt")
        return r
      }) as unknown as typeof fetch,
    })
    await download({ url: '/x', filename: 'fallback.txt' }, env)
    expect(saveBlob.mock.calls[0]![1]).toBe('测试.txt')
  })

  it('abort ⇒ 抛 DownloadCancelledError', async () => {
    const controller = new AbortController()
    const env = baseEnv({
      fetchImpl: vi.fn(async () => {
        controller.abort()
        throw new DOMException('Aborted', 'AbortError')
      }) as unknown as typeof fetch,
    })
    await expect(
      download({ url: '/x', filename: 'a.txt', signal: controller.signal }, env),
    ).rejects.toBeInstanceOf(DownloadCancelledError)
  })
})
