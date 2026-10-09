/**
 * XHR 封装——上传类请求的统一出口（2026-10-06 W2 收口：此前 4 处裸 XHR 各自手写
 * CSRF 头/进度/中断/JSON 解析/成功码判断）。
 *
 * 两个导出：
 *  - xhrSend：JSON API 通道（multipart 或 JSON 体），响应为 ApiResponse 形状，
 *    成功码归一 0|200（与 utils/request.ts axios 拦截器同一 house rule）。
 *  - xhrRaw：裸请求通道（presign PUT 到预签名 URL，响应非 JSON、头部服务端签发）。
 *
 * 错误一律 reject Error(message)——调用方与 catch 块统一只消费 e.message；
 * {code,message} 归一对象是 axios 侧职责，不在此复制。
 */

const DEFAULT_TIMEOUT = 300000

/** 业务成功码：新版 resp.Success 返回 0，旧式 handler 返回 200 */
const isOkCode = (code?: number) => code === 0 || code === 200

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
        reject(new Error(data?.message || `HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.onabort = () => reject(new Error('Cancelled'))
    xhr.ontimeout = () => reject(new Error('Timeout'))
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
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.onabort = () => reject(new Error('Cancelled'))
    xhr.ontimeout = () => reject(new Error('Timeout'))
    xhr.send(opts.body)
  })
}
