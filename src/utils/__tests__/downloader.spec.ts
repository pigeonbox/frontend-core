import { afterEach, describe, expect, it } from 'vitest'
import {
  MEMORY_SINK_LIMIT,
  computeProgress,
  parseContentDispositionFilename,
  pickSink,
  resolveDownloadUrl,
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
