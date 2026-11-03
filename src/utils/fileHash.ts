// 整文件 SHA-256 增量计算（2026-11-03 Phase 3 秒传强化）。
//
// 替换「整读 ArrayBuffer 一次性 subtle.digest」的旧口径：4GB 文件会打满内存
// （O(file) 峰值）。现在分片读（8MB slice）增量哈希，峰值 O(slice)；
// Worker 可用时算力进 worker（主线程不卡），不可用降级主线程分片（每片让出
// 事件循环）。crypto.subtle 不支持流式 ⇒ 增量用 @noble/hashes（e2e.ts 同款依赖）。
//
// 用途：multi-chunk 上传**并行**算整文件 hash——hash 先出即探秒传快速通道
// （见 useUploadQueue），以及 presign 通道的秒传指纹（时序不变：hash 后 init）。
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/** 每次读取的分片大小（增量哈希粒度；也是 worker 报进度粒度） */
export const HASH_SLICE_SIZE = 8 * 1024 * 1024

export interface HashFileOptions {
  onProgress?: (hashedBytes: number, totalBytes: number) => void
  signal?: AbortSignal
}

/** Worker 通道可用性（vitest node 环境无 Worker ⇒ 走主线程降级路径） */
export function workerHashAvailable(): boolean {
  return typeof Worker !== 'undefined' && typeof URL !== 'undefined'
}

/**
 * 增量 SHA-256（hex）。分片读文件，不整读；支持进度回调与中断。
 * Worker 启动失败（CSP/资源缺失）自动降级主线程，不抛。
 */
export async function hashFileSha256(file: Blob, opts: HashFileOptions = {}): Promise<string> {
  if (workerHashAvailable()) {
    try {
      return await hashInWorker(file, opts)
    } catch {
      /* Worker 通道不可用 ⇒ 降级主线程（结果一致，只是主线程多干点活） */
    }
  }
  return hashInMainThread(file, opts)
}

/** 主线程增量哈希（每片 await 让出事件循环） */
async function hashInMainThread(file: Blob, opts: HashFileOptions): Promise<string> {
  const h = sha256.create()
  let offset = 0
  while (offset < file.size) {
    if (opts.signal?.aborted) throw new Error('Cancelled')
    const end = Math.min(offset + HASH_SLICE_SIZE, file.size)
    const buf = await file.slice(offset, end).arrayBuffer()
    h.update(new Uint8Array(buf))
    offset = end
    opts.onProgress?.(offset, file.size)
  }
  // 空文件也要出正确向量（e3b0c4…）：digest 不可省
  if (file.size === 0) opts.onProgress?.(0, 0)
  return bytesToHex(h.digest())
}

interface HashWorkerRequest {
  file: Blob
  sliceSize: number
}

interface HashWorkerResponse {
  type: 'progress' | 'done' | 'error'
  hashed?: number
  total?: number
  hex?: string
  message?: string
}

function hashInWorker(file: Blob, opts: HashFileOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./hashWorker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => {
      worker.terminate()
      opts.signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new Error('Cancelled'))
    }
    opts.signal?.addEventListener('abort', onAbort)
    worker.onmessage = (e: MessageEvent<HashWorkerResponse>) => {
      const m = e.data
      if (m.type === 'progress') opts.onProgress?.(m.hashed ?? 0, m.total ?? 0)
      else if (m.type === 'done') {
        cleanup()
        if (m.hex) resolve(m.hex)
        else reject(new Error('hash worker returned no digest'))
      } else {
        cleanup()
        reject(new Error(m.message || 'hash worker failed'))
      }
    }
    worker.onerror = (e) => {
      cleanup()
      reject(new Error(`hash worker error: ${e.message || 'unknown'}`))
    }
    const req: HashWorkerRequest = { file, sliceSize: HASH_SLICE_SIZE }
    worker.postMessage(req)
  })
}
