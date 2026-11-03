/**
 * XHR 封装——上传类请求的统一出口（2026-10-06 W2 收口：此前 4 处裸 XHR 各自手写
 * CSRF 头/进度/中断/JSON 解析/成功码判断）。
 *
 * 两个导出：
 *  - xhrSend：JSON API 通道（multipart 或 JSON 体），响应为 ApiResponse 形状，
 *    成功码归一 0|200（与 utils/request.ts axios 拦截器同一 house rule）。
 *  - xhrRaw：裸请求通道（presign PUT 到预签名 URL，响应非 JSON、头部服务端签发）。
 *
 * 错误一律 reject Error(message)，并附带 code 属性（errcode 或 HTTP 状态；
 * 网络类=0、取消=-1）——调用方经 translateError 统一翻译成 i18n 文案，
 * 裸英文 message 不再直接上屏（2026-10-15 易用性修复）。
 */

const DEFAULT_TIMEOUT = 300000

/**
 * 大文件直传的超时预算（2026-11-03）。
 *
 * 缺陷：presign 直传的 PUT 原先吃固定 DEFAULT_TIMEOUT(300s)——**与文件大小无关**。
 * 而实测家宽上行仅 ~0.86MB/s（1.35GB 需 ~26 分钟）⇒ 300s 必然中途掐断，
 * 表现为「上传失败」，且大文件越大越必然失败。nginx 两层的 proxy_send_timeout
 * 同为 300s，是同一个天花板的两端。
 *
 * 修法：按**文件大小**给预算，留足余量。基准速度取保守的 1MB/s（低于实测
 * 0.86MB/s？——刻意再留 1/2 余量），乘 3 倍冗余覆盖抖动与慢启动；下限仍是
 * 300s（小文件行为不变），上限 2 小时（防挂死）。
 */
export const UPLOAD_MIN_TIMEOUT_MS = 300000
export const UPLOAD_MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000
/** 基准速率 1MB/s：故意低于实测 0.86MB/s 的常见家宽上行，再乘冗余系数 */
const UPLOAD_BASE_BYTES_PER_SEC = 1024 * 1024
const UPLOAD_SPEED_MARGIN = 3

/**
 * 按文件字节数计算上传超时预算（毫秒）。
 * - 小文件（≤ ~100MB@1MB/s×3）→ 300s，与旧行为一致（不改变既有语义）
 * - 大文件 → 按体积线性放大，1.35GB ⇒ ~72 分钟
 * - 超过 2h → 截到 2h
 */
export function uploadTimeoutForSize(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return UPLOAD_MIN_TIMEOUT_MS
  const need = (bytes / UPLOAD_BASE_BYTES_PER_SEC) * 1000 * UPLOAD_SPEED_MARGIN
  const budget = Math.max(UPLOAD_MIN_TIMEOUT_MS, Math.ceil(need))
  return Math.min(budget, UPLOAD_MAX_TIMEOUT_MS)
}

/** 业务成功码：新版 resp.Success 返回 0，旧式 handler 返回 200 */
const isOkCode = (code?: number) => code === 0 || code === 200

/** 构造带错误码的 Error（translateError 据此映射 i18n key） */
const fail = (message: string, code: number): Error => {
  const err = new Error(message) as Error & { code: number }
  err.code = code
  return err
}

export interface XhrSendOptions {
  url: string
  method?: string
  form?: FormData
  timeout?: number
  signal?: AbortSignal
  onProgress?: (loaded: number, total: number) => void
}

export function xhrSend<T>(opts: XhrSendOptions): Promise<{ code: number; message?: string; data?: T }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(opts.method || 'POST', opts.url)
    // Cookie 认证的写请求须带 CSRF 自定义头（与 axios 拦截器对齐；GET 携带无副作用）
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    xhr.timeout = opts.timeout ?? DEFAULT_TIMEOUT
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => xhr.abort())
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total)
    }
    xhr.onload = () => {
      // 先解析（body 可能非 JSON，如网关 HTML 错误页——此时按 HTTP 状态报错而非 Parse error）
      let data: { code: number; message?: string; data?: T } | null = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && data && isOkCode(data.code)) {
        resolve(data)
      } else {
        reject(fail(data?.message || `HTTP ${xhr.status}`, data?.code ?? xhr.status))
      }
    }
    xhr.onerror = () => reject(fail('Network error', 0))
    xhr.onabort = () => reject(fail('Cancelled', -1))
    xhr.ontimeout = () => reject(fail('Timeout', 0))
    xhr.send(opts.form)
  })
}

export interface XhrRawOptions {
  url: string
  method: string
  headers?: Record<string, string>
  body?: XMLHttpRequestBodyInit
  timeout?: number
  signal?: AbortSignal
  onProgress?: (loaded: number, total: number) => void
}

/** 裸请求：2xx 即成功（不解析响应体）——presign PUT 直传对象存储用 */
export function xhrRaw(opts: XhrRawOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(opts.method, opts.url)
    for (const [k, v] of Object.entries(opts.headers || {})) {
      xhr.setRequestHeader(k, v)
    }
    xhr.timeout = opts.timeout ?? DEFAULT_TIMEOUT
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => xhr.abort())
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(fail(`Upload failed: ${xhr.status}`, xhr.status))
      }
    }
    xhr.onerror = () => reject(fail('Network error', 0))
    xhr.onabort = () => reject(fail('Cancelled', -1))
    xhr.ontimeout = () => reject(fail('Timeout', 0))
    xhr.send(opts.body)
  })
}
