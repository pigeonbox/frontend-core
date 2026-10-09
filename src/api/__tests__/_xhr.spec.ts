import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { xhrSend, xhrRaw } from '../_xhr'

/**
 * FakeXHR：捕获 open/setRequestHeader/send，测试手工驱动回调。
 * 只实现 _xhr.ts 消费的成员。
 */
class FakeXHR {
  static instances: FakeXHR[] = []
  method = ''
  url = ''
  headers: Record<string, string> = {}
  timeout = 0
  body: unknown = null
  status = 200
  responseText = ''
  sent = false
  aborted = false
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null

  constructor() {
    FakeXHR.instances.push(this)
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  send(body: unknown) {
    this.sent = true
    this.body = body
  }
  abort() {
    this.aborted = true
    this.onabort?.()
  }
  // 测试驱动
  respond(status: number, responseText: string) {
    this.status = status
    this.responseText = responseText
    this.onload?.()
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true } as ProgressEvent)
  }
}

const originalXHR = globalThis.XMLHttpRequest

/** 取当前用例创建的 XHR 实例（noUncheckedIndexedAccess 下标断言） */
const xhr = () => FakeXHR.instances[FakeXHR.instances.length - 1]!

beforeEach(() => {
  FakeXHR.instances = []
  ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR
})
afterEach(() => {
  ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXHR
})

describe('xhrSend（JSON 通道）', () => {
  it('code=0 归一为成功（新版 resp.Success 约定）', async () => {
    const p = xhrSend<{ v: number }>({ url: '/api/x', form: new FormData() })
    const x = xhr()
    x.respond(200, JSON.stringify({ code: 0, message: 'success', data: { v: 1 } }))
    const res = await p
    expect(res.data?.v).toBe(1)
  })

  it('code=200 成功', async () => {
    const p = xhrSend({ url: '/api/x', form: new FormData() })
    xhr().respond(200, JSON.stringify({ code: 200, data: { ok: true } }))
    await expect(p).resolves.toMatchObject({ code: 200 })
  })

  it('业务失败码 reject Error(message)', async () => {
    const p = xhrSend({ url: '/api/x', form: new FormData() })
    xhr().respond(200, JSON.stringify({ code: 10012, message: '管理员已关闭匿名上传功能' }))
    await expect(p).rejects.toThrow('管理员已关闭匿名上传功能')
  })

  it('HTTP 500 且 body 无 message → reject HTTP 码', async () => {
    const p = xhrSend({ url: '/api/x', form: new FormData() })
    xhr().respond(500, 'oops not json')
    await expect(p).rejects.toThrow('HTTP 500')
  })

  it('恒带 X-Requested-With 头；method 默认 POST', async () => {
    const p = xhrSend({ url: '/api/x', form: new FormData() })
    const x = xhr()
    x.respond(200, JSON.stringify({ code: 0 }))
    await p
    expect(x.headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect(x.method).toBe('POST')
  })

  it('progress 回调透传', async () => {
    const seen: Array<[number, number]> = []
    const p = xhrSend({ url: '/api/x', form: new FormData(), onProgress: (l, t) => seen.push([l, t]) })
    const x = xhr()
    x.progress(50, 100)
    x.respond(200, JSON.stringify({ code: 0 }))
    await p
    expect(seen).toEqual([[50, 100]])
  })

  it('signal abort → reject Cancelled', async () => {
    const ctrl = new AbortController()
    const p = xhrSend({ url: '/api/x', form: new FormData(), signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toThrow('Cancelled')
  })
})

describe('xhrRaw（裸通道·presign PUT）', () => {
  it('2xx resolve；自定义 headers 按序注入', async () => {
    const p = xhrRaw({
      url: 'https://bucket.example.com/obj',
      method: 'PUT',
      headers: { 'X-Signed': 'abc', 'Content-Type': 'application/pdf' },
      body: new Blob(['x']),
    })
    const x = xhr()
    expect(x.method).toBe('PUT')
    x.status = 200
    x.onload?.()
    await p
    expect(x.headers['X-Signed']).toBe('abc')
  })

  it('非 2xx reject 带 status', async () => {
    const p = xhrRaw({ url: '/u', method: 'PUT' })
    const x = xhr()
    x.status = 403
    x.onload?.()
    await expect(p).rejects.toThrow('Upload failed: 403')
  })

  it('abort → reject Cancelled', async () => {
    const ctrl = new AbortController()
    const p = xhrRaw({ url: '/u', method: 'PUT', signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toThrow('Cancelled')
  })
})

// 静默 unused 警告占位（vi 供后续 mock 使用）
void vi
