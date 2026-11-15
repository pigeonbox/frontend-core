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
import { appBase } from '@/utils/base'
import { delay, retryDelayMs } from '@/utils/backoff'

export type DownloadSink = 'fs' | 'blob' | 'native'

export type DownloadPhase =
  | 'preparing'
  | 'downloading'
  /** 弱网中断、正在退避等待下一次 Range 续传（frontend-core#94） */
  | 'retrying'
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
  /** 正在进行的退避重试序号（1 起；非 retrying 相位为 0/undefined） */
  retryAttempt?: number
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
  /**
   * 断点续传状态（frontend-core#94）：上一轮抛出的 DownloadInterruptedError.resume
   * 原样回传——进度/内存缓冲/文件句柄原样接续，不再弹保存框、不再从 0 开始。
   */
  resume?: DownloadResumeState
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
  /**
   * 截断到指定长度（FileSystemWritableFileStream.truncate 的最小面）。
   * 仅断点续传撞上「服务端忽略 Range（返回 200 全量）」时用：句柄写位置停在
   * 断点处，不截到 0 就直接写全量会把文件写成「断点前缀 + 全量」的损坏体。
   */
  truncate?(size: number): Promise<void>
}

/** fs 档的落地目标：writable 写内容，remove 删掉半截/空文件 */
export interface FsTarget {
  writable: FsWritable
  remove(): Promise<void>
}

/**
 * 断点续传坐标（frontend-core#94）：由 DownloadInterruptedError 携带、
 * UI「继续下载」时原样回传给 download({ resume })。
 *
 * fs 档带 target（打开中的句柄，内容已在文件里）；blob 档带 chunks（内存缓冲）。
 * 两者都不带 = 服务端不接受断点 ⇒ 只能整份重来。
 */
export interface DownloadResumeState {
  /** 已收字节（断点位置） */
  loaded: number
  /** 文件总字节（0=未知） */
  total: number
  /** blob 档已收缓冲（fs 档不带：内容在目标文件里） */
  chunks?: Uint8Array[]
  /** fs 档打开中的保存句柄（不关不删 ⇒ 续写接在断点后） */
  target?: FsTarget
  /** 首轮从 Content-Disposition 解析的文件名（续传轮服务端可能不再下发该头） */
  filename?: string
}

/** 断网重试预算（次，不含首发）：退避 1+2+4+8+15+15=45s，覆盖「断网 30s 恢复」验收场景 */
export const DOWNLOAD_MAX_RETRIES = 6

/**
 * 下载中断（网络失败且退避预算耗尽，或服务端拒绝断点）。
 * 与 DownloadCancelledError（用户主动取消，code=-1）语义分开：
 * 中断 = **进度还在**，UI 应给「继续下载」而不是重来。
 * resume=null 表示断点已不可用（如服务端忽略 Range 且句柄无法截断），重试须从头。
 */
export class DownloadInterruptedError extends Error {
  code = -2
  /** 中断时已收字节 */
  loaded: number
  /** 断点坐标；null=断点已不可用，重试须从头 */
  resume: DownloadResumeState | null
  constructor(loaded: number, resume: DownloadResumeState | null) {
    super('Interrupted')
    this.name = 'DownloadInterruptedError'
    this.loaded = loaded
    this.resume = resume
  }
}

/**
 * 解析 Content-Range 的总字节数：`bytes 5-10/11` → 11；416 形态的星号总长
 * （`bytes *` 与 `/11` 拼合，注释里不能直写星斜杠——会把本注释提前闭合）→ 11。
 * 解析不了返回 null（调用方回退到「已收 + Content-Length」推算）。
 */
export function parseContentRangeTotal(header: string | null | undefined): number | null {
  if (!header) return null
  const m = /bytes\s+(?:\d+-\d+|\*)\s*\/\s*(\d+)/i.exec(header)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : null
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

/**
 * 根绝对路径的部署基址。
 *
 * ⚠️ 必须与 axios 统一实例（src/utils/request.ts）**同一条口径**：
 * `VITE_API_BASE_URL || appBase()`。前者是「前后端分离部署」的绝对 API 地址，
 * 后者是「统一网关下页面挂在 /app/pigeonbox/」的前缀。
 * ⇒ 口径分叉的后果：管理台下载在分离部署下 404（这正是 2026-10-26 审计修复
 *   踩过的坑的同款——那次是裸 axios 丢了前缀）。
 */
function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL || appBase()
}

/** 绝对 URL 原样；根绝对路径补部署基址（统一网关/分离部署两种形态都要对） */
export function resolveDownloadUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  // 协议相对 URL（//host/path）：不是本地根路径，别碰
  if (url.startsWith('//')) return url
  const base = apiBase()
  if (!base) return url
  // 基址本身是绝对地址（前后端分离部署）⇒ 拼绝对 URL
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, '') + url
  return base + url
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
/**
 * 统一下载入口。
 *
 * 次序（不可调换）：先取保存目标（用户手势同步链内）→ 再发请求 → 选档位 → 流式读取。
 *
 * 断点续传（frontend-core#94）：一旦拿到过响应（loaded>0），后续网络失败一律按
 * 弱网处理——退避 + `Range: bytes=<loaded>-` 续传，进度不回退；预算耗尽抛
 * DownloadInterruptedError（fs 句柄 / blob 缓冲原样保留），UI「继续下载」把
 * resume 原样回传即可从断点接着下。首次 fetch 即失败仍走原降级（交浏览器原生
 * 下载）——那更可能是 CORS/跨域，重试无意义。
 */
export async function download(req: DownloadRequest, env?: Partial<DownloaderEnv>): Promise<DownloadOutcome> {
  const e: DownloaderEnv = { ...defaultEnv(), ...env }
  const url = resolveDownloadUrl(req.url)
  const startedAt = Date.now()

  // 断点播种：上一轮中断携带的进度/缓冲/句柄先行恢复
  const baseLoaded = req.resume?.loaded ?? 0
  let loaded = baseLoaded
  let total = req.resume?.total ?? 0
  let finalName = req.resume?.filename || req.filename
  let phase: DownloadPhase = 'preparing'
  let lastReportAt = 0
  // 本轮累计退避次数 / 当前退避序号（0=未在重试；上报 UI 显示「第 N 次」）
  let attempts = 0
  let retryAttempt = 0
  let sink: DownloadSink = 'blob'

  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - lastReportAt < REPORT_THROTTLE_MS) return
    lastReportAt = now
    // 百分比按全量口径（含断点前字节，跨轮单调）；速度/ETA 按**本轮增量**算——
    // 续传一开跑 loaded 带着上一轮的字节，按全量算速度会虚高一个数量级。
    const run = computeProgress(loaded - baseLoaded, Math.max(total - baseLoaded, 0), startedAt, now)
    const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : -1
    req.onProgress?.({
      loaded,
      total,
      phase,
      percent,
      bytesPerSecond: run.bytesPerSecond,
      etaSeconds: run.etaSeconds,
      retryAttempt,
    })
  }

  // ① fs 档：保存目标必须在用户手势的同步链内取（transient activation）
  //    先报一次 preparing：保存对话框可能停留很久，UI 需要有「准备中」的反馈
  //    断点续传时句柄由上一轮携带 ⇒ 不再弹保存框（弹了反而会另起/截断文件）
  report(true)

  let target: FsTarget | null = req.resume?.target ?? null
  if (!target && e.hasFsApi && e.pickTarget) {
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

  const chunks: Uint8Array[] = req.resume?.chunks ? [...req.resume.chunks] : []
  let accumulated = loaded

  /**
   * 中断收口：进度与载体原样保留（fs 句柄不关不删 / blob 缓冲不丢）。
   * fs 档的断点因此会留在磁盘上（半截文件）——这是大文件唯一可行的断点载体
   * （不可能整份拷回内存），「继续下载」后同一句柄续写到完整。
   */
  const interrupt = (): DownloadInterruptedError => {
    const state: DownloadResumeState = target
      ? { loaded, total, filename: finalName, target }
      : { loaded, total, filename: finalName, chunks }
    return new DownloadInterruptedError(loaded, state)
  }

  /** 退避一轮（phase=retrying 上报给 UI）；预算耗尽返回 false。signal 中止 ⇒ 抛取消 */
  const backoffOnce = async (): Promise<boolean> => {
    if (attempts >= DOWNLOAD_MAX_RETRIES) return false
    attempts++
    retryAttempt = attempts
    phase = 'retrying'
    report(true)
    try {
      await delay(retryDelayMs(attempts), req.signal)
    } catch {
      await cleanupFs()
      throw new DownloadCancelledError()
    }
    retryAttempt = 0
    phase = 'downloading'
    report(true)
    return true
  }

  // ② 传输循环：fetch → 流式读取；中断后带 Range 重新进入
  downloadLoop: for (;;) {
    let resp: Response
    try {
      const headers: Record<string, string> = { ...req.headers }
      if (loaded > 0) headers.Range = `bytes=${loaded}-`
      resp = await e.fetchImpl(url, {
        method: 'GET',
        headers,
        signal: req.signal,
        credentials: 'same-origin',
      })
    } catch (err) {
      if (isAbortLike(err) || req.signal?.aborted) {
        await cleanupFs()
        throw new DownloadCancelledError()
      }
      if (loaded > 0) {
        // 断点续传路径上的 fetch 失败 = 纯弱网（CORS 已验证通过）⇒ 退避重试
        if (await backoffOnce()) continue downloadLoop
        throw interrupt()
      }
      // 首次 fetch 失败：降级交回浏览器原生下载（既有语义）
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

    // 断点请求被服务端忽略（200=全量重来）：fs 句柄就地截到 0 重写；
    // 句柄不支持截断则断点已不可用 ⇒ 放弃续传，UI 重试会整份重来。
    if (loaded > 0 && resp.status === 200) {
      if (target) {
        if (!target.writable.truncate) {
          await cleanupFs()
          throw new DownloadInterruptedError(loaded, null)
        }
        await target.writable.truncate(0)
      }
      loaded = 0
      accumulated = 0
      chunks.length = 0
      total = 0
    }

    const contentLength = Number(resp.headers.get('Content-Length') || '') || 0
    if (loaded > 0) {
      // 206 的 Content-Length 是**剩余**字节：总量以 Content-Range 为准，
      // 缺失时用「已收 + 剩余」推算；两者都没有才保持 0（不确定态）
      const crTotal = parseContentRangeTotal(resp.headers.get('Content-Range'))
      if (crTotal !== null) total = crTotal
      else if (total === 0) total = loaded + contentLength
    } else {
      total = contentLength
    }
    const serverName = parseContentDispositionFilename(resp.headers.get('Content-Disposition'))
    if (serverName) finalName = serverName

    sink = target ? 'fs' : pickSink(false, total, e.memoryLimit ?? MEMORY_SINK_LIMIT)

    // 体积已知超限（且无文件系统 API）⇒ 立刻交回浏览器原生下载：
    // 不占用本页内存，也不必在本页把同一份数据再下一遍。
    if (sink === 'native') {
      phase = 'handed-off'
      report(true)
      e.nativeDownload(url, req.filename)
      return { sink: 'native', bytes: 0, handedOff: true }
    }

    // ③ 流式读取
    phase = 'downloading'
    report(true)
    try {
      const reader = resp.body?.getReader()
      if (!reader) {
        // 无流式 body 的环境：退回一次性读（仍有 %，只是不增量）
        const buf = await resp.arrayBuffer()
        loaded += buf.byteLength
        if (total === 0) total = loaded
        chunks.push(new Uint8Array(buf))
        accumulated = loaded
        report(true)
      } else {
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
      }
    } catch (err) {
      if (isAbortLike(err) || req.signal?.aborted) {
        await cleanupFs()
        throw new DownloadCancelledError()
      }
      // 弱网中断：loaded 不回退 ⇒ 下一轮带 Range 从断点续
      if (await backoffOnce()) continue downloadLoop
      throw interrupt()
    }
    break downloadLoop
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
