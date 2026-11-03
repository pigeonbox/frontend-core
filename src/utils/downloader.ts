/**
 * 统一下载器（2026-11-03）——四条下载路径（取件页普通 / 取件页 E2E / 打包 zip /
 * 管理台文件）的唯一出口。
 *
 * 设计要点（详见 PigeonBox/docs/specs/2026-11-03-upload-download-progress-design.md）：
 * 1. **三档落盘**：fs（文件系统 API 流式写盘，内存零占用）/ blob（内存）/ native
 *    （退回浏览器原生下载，页面内无 %）。fs 档的存在是为了让大文件下载不爆内存。
 * 2. **先取保存句柄、再发请求**：showSaveFilePicker 受 transient activation 约束，
 *    必须在用户点击的同步链内调用 ⇒ 用户取消保存则一个字节都不会下载。
 * 3. **降级链**：fetch 失败（跨域 S3 未开 CORS / 网络）⇒ 关闭并删除已建空文件 ⇒
 *    退回 native。**transform 失败不降级**（降级会把密文交给用户，无意义）。
 * 4. **DOM 能力走可注入 seam**：本仓 vitest 跑在 node 环境（无 DOM），
 *    且各浏览器能力差异大 ⇒ 能力探测与落地动作全部走 env 参数，默认实现才碰 DOM。
 */
import { withBase } from '@/utils/base'

export type DownloadSink = 'fs' | 'blob' | 'native'

export type DownloadPhase =
  | 'preparing'
  | 'downloading'
  | 'transforming'
  | 'saving'
  | 'done'
  | 'handed-off'

export interface DownloadProgress {
  loaded: number
  /** 服务端未给 Content-Length 时为 0（不确定态） */
  total: number
  /** 0-100；total 未知时为 -1（调用方渲染不确定态） */
  percent: number
  bytesPerSecond: number
  etaSeconds: number | null
  phase: DownloadPhase
}

export interface DownloadRequest {
  url: string
  /** 兜底文件名；服务端 Content-Disposition 优先（仅 blob 档能拿到） */
  filename: string
  headers?: Record<string, string>
  signal?: AbortSignal
  /** 后处理（E2E 解密）。仅内存档可用——流式写盘无法在解密后改写 */
  transform?: (bytes: ArrayBuffer) => Promise<ArrayBuffer>
  onProgress?: (p: DownloadProgress) => void
}

export interface DownloadOutcome {
  sink: DownloadSink
  bytes: number
  /** true = 已移交浏览器原生下载，页面内没有百分比 */
  handedOff: boolean
}

/** 文件系统写入句柄（只声明用到的最小面，避免依赖 lib.dom 的最新类型） */
export interface FsWritable {
  write(chunk: Uint8Array): Promise<void>
  close(): Promise<void>
  abort?(): Promise<void>
}

/** fs 档的落地目标：writable 写内容，remove 删掉半截/空文件 */
export interface FsTarget {
  writable: FsWritable
  remove(): Promise<void>
}

export interface DownloaderEnv {
  fetchImpl: typeof fetch
  /** 浏览器是否支持文件系统访问 API */
  hasFsApi: boolean
  /** 取保存目标；返回 null = 用户取消 */
  pickTarget?: (suggestedName: string) => Promise<FsTarget | null>
  /** 内存档落盘 */
  saveBlob: (blob: Blob, filename: string) => void
  /** 降级：交给浏览器原生下载 */
  nativeDownload: (url: string, filename: string) => void
  /**
   * 内存档体积上限（字节），默认 MEMORY_SINK_LIMIT。
   * 做成可注入是为了让「超限降级」这条路径**不必分配几十 MB 内存**就能测。
   */
  memoryLimit?: number
}

/** 内存档体积上限（字节）：超过即降级 native */
export const MEMORY_SINK_LIMIT = 64 * 1024 * 1024

/** 取消错误（与 src/api/_xhr.ts 的 code=-1 约定一致） */
export class DownloadCancelledError extends Error {
  code = -1
  constructor() {
    super('Cancelled')
    this.name = 'DownloadCancelledError'
  }
}

/**
 * 解析 Content-Disposition 里的文件名。
 * 优先级：filename*=UTF-8''<pct-encoded> → filename="..." → null（调用方兜底）。
 * 解析失败**静默降级**到下一优先级，不抛错。
 */
export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*([^']*)'([^']*)'([^;]+)/i.exec(header)
  if (star) {
    try {
      const raw = star[3].trim().replace(/^["']|["']$/g, '')
      const decoded = star[1].toLowerCase().includes('utf-8') ? decodeURIComponent(raw) : raw
      if (decoded) return decoded
    } catch {
      // 百分号解码失败 → 落到 filename 分支
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|([^;]*))/i.exec(header)
  if (plain) {
    const v = (plain[2] ?? plain[3] ?? '').trim()
    if (v) return v
  }
  return null
}

/** 由已传字节与总字节算百分比 / 速度 / 剩余时间 */
export function computeProgress(
  loaded: number,
  total: number,
  startedAt: number,
  now: number
): { percent: number; bytesPerSecond: number; etaSeconds: number | null } {
  const elapsedSec = Math.max(now - startedAt, 0) / 1000
  const bytesPerSecond = elapsedSec > 0 ? loaded / elapsedSec : 0
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : -1
  const etaSeconds =
    total > 0 && bytesPerSecond > 0 ? Math.max(0, Math.round((total - loaded) / bytesPerSecond)) : null
  return { percent, bytesPerSecond, etaSeconds }
}

/** 选落盘档位：fs 优先，其次按体积在 blob / native 之间分 */
export function pickSink(hasFsApi: boolean, total: number, limit: number = MEMORY_SINK_LIMIT): DownloadSink {
  if (hasFsApi) return 'fs'
  if (total > 0 && total > limit) return 'native'
  return 'blob'
}

/** 绝对 URL 原样；根绝对路径补部署前缀（统一网关场景漏前缀会 404） */
export function resolveDownloadUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return withBase(url)
}

/** 进度回报节流（毫秒）：避免大文件每 chunk 都触发 Vue 更新 */
const REPORT_THROTTLE_MS = 80

/** 默认 env：只在浏览器里才碰 DOM（node 环境测试全部走注入） */
function defaultEnv(): DownloaderEnv {
  const w = globalThis as unknown as {
    showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<{
      createWritable(): Promise<FsWritable>
      remove(): Promise<void>
    }>
  }
  return {
    fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
    hasFsApi: typeof w.showSaveFilePicker === 'function',
    pickTarget: async (suggestedName: string) => {
      if (!w.showSaveFilePicker) return null
      const handle = await w.showSaveFilePicker({ suggestedName })
      const writable = await handle.createWritable()
      return { writable, remove: () => handle.remove() }
    },
    saveBlob: (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
    nativeDownload: (url: string, filename: string) => {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
  }
}

const isAbortLike = (e: unknown): boolean =>
  e instanceof Error && (e.name === 'AbortError' || e.message === 'Cancelled' || e.message === 'Aborted')

/**
 * 统一下载入口。
 *
 * 次序（不可调换）：先取保存目标（用户手势同步链内）→ 再发请求 → 选档位 → 流式读取。
 */
export async function download(req: DownloadRequest, env?: Partial<DownloaderEnv>): Promise<DownloadOutcome> {
  const e: DownloaderEnv = { ...defaultEnv(), ...env }
  const url = resolveDownloadUrl(req.url)
  const startedAt = Date.now()

  let loaded = 0
  let total = 0
  let phase: DownloadPhase = 'preparing'
  let lastReportAt = 0

  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - lastReportAt < REPORT_THROTTLE_MS) return
    lastReportAt = now
    const p = computeProgress(loaded, total, startedAt, now)
    req.onProgress?.({
      loaded,
      total,
      phase,
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      etaSeconds: p.etaSeconds,
    })
  }

  // ① fs 档：保存目标必须在用户手势的同步链内取（transient activation）
  let target: FsTarget | null = null
  if (e.hasFsApi && e.pickTarget) {
    try {
      target = await e.pickTarget(req.filename)
    } catch (err) {
      if (isAbortLike(err)) throw new DownloadCancelledError()
      throw err
    }
    if (!target) throw new DownloadCancelledError()
  }

  const cleanupFs = async () => {
    if (!target) return
    try {
      await target.writable.abort?.()
    } catch {
      // ignore
    }
    try {
      await target.remove()
    } catch {
      // ignore
    }
    target = null
  }

  // ② 发请求
  let resp: Response
  try {
    resp = await e.fetchImpl(url, {
      method: 'GET',
      headers: req.headers,
      signal: req.signal,
      credentials: 'same-origin',
    })
  } catch (err) {
    if (isAbortLike(err) || req.signal?.aborted) {
      await cleanupFs()
      throw new DownloadCancelledError()
    }
    // 降级：网络失败 / 跨域 CORS 未开 ⇒ 交回浏览器原生下载
    await cleanupFs()
    phase = 'handed-off'
    report(true)
    e.nativeDownload(url, req.filename)
    return { sink: 'native', bytes: 0, handedOff: true }
  }

  if (!resp.ok) {
    await cleanupFs()
    const err = new Error(`HTTP ${resp.status}`) as Error & { code: number }
    err.code = resp.status
    throw err
  }

  const contentLength = Number(resp.headers.get('Content-Length') || '') || 0
  total = contentLength
  const serverName = parseContentDispositionFilename(resp.headers.get('Content-Disposition'))
  const finalName = serverName || req.filename

  const sink: DownloadSink = target ? 'fs' : pickSink(false, total, e.memoryLimit ?? MEMORY_SINK_LIMIT)

  // 体积已知超限（且无文件系统 API）⇒ 立刻交回浏览器原生下载：
  // 不占用本页内存，也不必在本页把同一份数据再下一遍。
  if (sink === 'native') {
    phase = 'handed-off'
    report(true)
    e.nativeDownload(url, req.filename)
    return { sink: 'native', bytes: 0, handedOff: true }
  }

  // ③ 流式读取
  const chunks: Uint8Array[] = []
  let accumulated = 0
  phase = 'downloading'
  report(true)

  const reader = resp.body?.getReader()
  if (!reader) {
    // 无流式 body 的环境：退回一次性读（仍有 %，只是不增量）
    const buf = await resp.arrayBuffer()
    loaded = buf.byteLength
    total = total || loaded
    chunks.push(new Uint8Array(buf))
    accumulated = loaded
    report(true)
  } else {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        loaded += value.byteLength
        if (sink === 'fs') {
          await target!.writable.write(value)
        } else {
          chunks.push(value)
          accumulated += value.byteLength
          if (sink === 'blob' && accumulated > (e.memoryLimit ?? MEMORY_SINK_LIMIT)) {
            // 内存档撑不住 ⇒ 丢弃缓冲、降级原生（不落半截文件）
            await reader.cancel().catch(() => {})
            phase = 'handed-off'
            report(true)
            e.nativeDownload(url, req.filename)
            return { sink: 'native', bytes: loaded, handedOff: true }
          }
        }
        report()
      }
    } catch (err) {
      await cleanupFs()
      if (isAbortLike(err) || req.signal?.aborted) throw new DownloadCancelledError()
      throw err
    }
  }

  // ④ 落地
  if (sink === 'fs') {
    phase = 'saving'
    report(true)
    await target!.writable.close()
    target = null
  } else {
    const merged = new Uint8Array(accumulated)
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.byteLength
    }
    const buf = merged.buffer
    if (req.transform) {
      phase = 'transforming'
      report(true)
      const out = await req.transform(buf)
      phase = 'saving'
      report(true)
      e.saveBlob(new Blob([out]), finalName)
    } else {
      phase = 'saving'
      report(true)
      e.saveBlob(new Blob([buf]), finalName)
    }
  }

  phase = 'done'
  report(true)
  return { sink, bytes: loaded, handedOff: false }
}
