// 整文件 SHA-256 增量哈希 worker（2026-11-03 Phase 3）。
// 主线程把 File 结构化克隆过来（不拷贝内容字节），worker 自行分片读+增量哈希，
// 按片报进度，完成回传 hex。协议见 fileHash.ts 的 HashWorkerRequest/Response。
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

interface WorkerCtx {
  onmessage: ((e: MessageEvent<{ file: Blob; sliceSize: number }>) => void) | null
  postMessage(message: unknown): void
}

const ctx = self as unknown as WorkerCtx

ctx.onmessage = async (e) => {
  const { file, sliceSize } = e.data
  try {
    const h = sha256.create()
    let offset = 0
    while (offset < file.size) {
      const end = Math.min(offset + sliceSize, file.size)
      const buf = await file.slice(offset, end).arrayBuffer()
      h.update(new Uint8Array(buf))
      offset = end
      ctx.postMessage({ type: 'progress', hashed: offset, total: file.size })
    }
    ctx.postMessage({ type: 'done', hex: bytesToHex(h.digest()) })
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
