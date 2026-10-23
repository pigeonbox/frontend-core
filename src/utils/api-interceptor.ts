// Axios 统一响应拦截器：把 {code, data, message, trace_id} 转换成可读错误
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

export interface BizResponse<T = unknown> {
  code: number
  data: T
  message: string
  trace_id?: string
  success?: boolean
}

// 业务错误码 → i18n key（覆盖后端 errcode 全部错误码）
const ERRCODE_KEY_MAP: Record<number, string> = {
  10000: 'errcode.10000',
  10001: 'errcode.10001',
  10002: 'errcode.10002',
  10003: 'errcode.10003',
  10004: 'errcode.10004',
  10005: 'errcode.10005',
  10006: 'errcode.10006',
  10007: 'errcode.10007',
  10008: 'errcode.10008',
  10009: 'errcode.10009',
  10010: 'errcode.10010',
  10011: 'errcode.10011',
  10012: 'errcode.10012',
  10013: 'errcode.10013',
  10014: 'errcode.10014',
  10015: 'errcode.10015',
  10016: 'errcode.10016',
  20001: 'errcode.20001',
  20002: 'errcode.20002',
  20003: 'errcode.20003',
  20004: 'errcode.20004',
  20005: 'errcode.20005',
  20006: 'errcode.20006',
  20007: 'errcode.20007',
  20008: 'errcode.20008',
  20009: 'errcode.20009',
  20010: 'errcode.20010',
  20011: 'errcode.20011',
  20012: 'errcode.20012',
  20013: 'errcode.20013',
  30001: 'errcode.30001',
  30002: 'errcode.30002',
  30003: 'errcode.30003',
  30004: 'errcode.30004',
  30005: 'errcode.30005',
  30006: 'errcode.30006',
  30007: 'errcode.30007',
  30008: 'errcode.30008',
  30009: 'errcode.30009',
  30010: 'errcode.30010',
  30011: 'errcode.30011',
  30012: 'errcode.30012',
  30013: 'errcode.30013',
  40001: 'errcode.40001',
  40002: 'errcode.40002',
  40003: 'errcode.40003',
  40004: 'errcode.40004',
  40005: 'errcode.40005',
  40006: 'errcode.40006',
  40007: 'errcode.40007',
  40008: 'errcode.40008',
  40009: 'errcode.40009',
  40010: 'errcode.40010',
  40011: 'errcode.40011',
  50001: 'errcode.50001',
  50002: 'errcode.50002',
  50003: 'errcode.50003',
  50004: 'errcode.50004',
  50005: 'errcode.50005',
  50006: 'errcode.50006',
  90001: 'errcode.90001',
  90002: 'errcode.90002',
  90003: 'errcode.90003',
}

// 非业务码的兜底映射：网络层（request.ts/_xhr.ts 网络/超时失败 code=0）
// 与纯 HTTP 语义码——没有 errcode 可查时也得给人话，不能裸露英文原文
const HTTP_FALLBACK_KEY_MAP: Record<number, string> = {
  0: 'errcode.network_error',
  401: 'error.unauthorized',
  403: 'error.forbidden',
}

// 段位兜底：未逐码登记的错误，按业务段位落到该段的通用文案。
// 背景（2026-10-22 审计）：后端错误码有 63 个，前端逐码登记会漂移
// （漏登的码直接回落英文原文，英文界面夹中文）。段位兜底保证
// 「没登记过的码」也落到**本地化**的段位通用文案，而不是裸露后端英文。
const SEGMENT_FALLBACK_KEY_MAP: { from: number; to: number; key: string }[] = [
  { from: 10000, to: 19999, key: 'errcode.10000' }, // 1xxxx 通用
  { from: 20000, to: 29999, key: 'errcode.20001' }, // 2xxxx 分享/取件
  { from: 30000, to: 39999, key: 'errcode.30001' }, // 3xxxx 存储
  { from: 40000, to: 49999, key: 'errcode.40001' }, // 4xxxx 用户/认证
  { from: 50000, to: 59999, key: 'errcode.50001' }, // 5xxxx 系统
  { from: 90000, to: 99999, key: 'errcode.unknown' }, // 9xxxx 第三方
]

// 这些码的后端文案**带动态信息**（具体数字/文件名/时长），前端通用文案
// 会把关键细节抹掉（例：后端「站点存储空间已满（已用 123 / 上限 456 字节）」
// 被覆盖成「存储配额超限」——用户既不知道超了多少，也不知道找谁）。
// 对这些码**优先用后端原文**（后端已本地化成中文），不再被 i18n 覆盖。
const DYNAMIC_MESSAGE_CODES = new Set([
  10010, // 上传大小超过限制（后端带 MB 数）
  10011, // 尝试过于频繁（后端带秒数）
  10014, // 今日上传次数上限（后端带次数）
  20001, // 分享不存在/未完成上传（后端区分「不存在或已过期」与「未完成上传」两种原文）
  20009, // 分片未传完（后端带已传/总数）
  30002, // 存储空间已满（后端带已用/上限）
  30011, // 文件类型禁止（后端带文件名）
  30013, // 内容未通过审核
  20012, // 分享被管理员禁用
  20013, // 分享待审核
])

const resolveErrorKey = (code: number): string | null =>
  ERRCODE_KEY_MAP[code] ??
  HTTP_FALLBACK_KEY_MAP[code] ??
  SEGMENT_FALLBACK_KEY_MAP.find((s) => code >= s.from && code <= s.to)?.key ??
  (code >= 500 && code <= 599 ? 'error.server' : null)

export class BizError extends Error {
  readonly code: number
  readonly traceId: string
  readonly raw: BizResponse | null

  constructor(opts: { code: number; message: string; traceId: string; raw?: BizResponse | null }) {
    super(opts.message)
    this.name = 'BizError'
    this.code = opts.code
    this.traceId = opts.traceId
    this.raw = opts.raw ?? null
  }
}

export interface ResolvedError {
  code: number | null
  message: string
  traceId: string
  httpStatus: number | null
}

function resolveErrorMessage(code: number | null, fallback: string): string {
  // 这个函数在 axios 拦截器里调用，但 i18n 是 vue 的，
  // 因此这里只返回原始 code + fallback message；
  // 实际翻译由 useErrorHandler 在组件上下文里完成。
  if (code === null) return fallback
  return fallback
}

export interface AxiosBizError extends Omit<AxiosError, 'response'> {
  biz?: ResolvedError
}

export function onFulfilled(response: AxiosResponse): AxiosResponse {
  // 后端约定：HTTP 200 + {code, data, message, trace_id}。
  // 成功码：200（旧式 handler）或 0（新版 resp.Success / contracts errcode）。
  const body = response.data as unknown as BizResponse
  if (body && typeof body === 'object' && 'code' in body) {
    if (body.code === 200 || body.code === 0) {
      return response
    }
    // 业务错误
    const traceId = body.trace_id || (response.headers?.['x-trace-id'] as string | undefined) || ''
    const message = body.message || 'Error'
    const err = new BizError({
      code: body.code,
      message: resolveErrorMessage(body.code, message),
      traceId,
      raw: body,
    })
    throw err
  }
  return response
}

export function onRejected(error: AxiosError): Promise<never> {
  const traceId =
    (error.response?.headers?.['x-trace-id'] as string | undefined) ||
    ((error.response?.data as { trace_id?: string } | undefined)?.trace_id ?? '') ||
    ''
  const status = error.response?.status ?? null
  const body = (error.response?.data as BizResponse | undefined) ?? null

  if (body && typeof body.code === 'number') {
    throw new BizError({
      code: body.code,
      message: body.message || error.message,
      traceId,
      raw: body,
    })
  }

  throw new BizError({
    code: status ?? -1,
    message: error.message || 'Network error',
    traceId,
    raw: null,
  })
}

// 类型扩展
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _silent?: boolean
  }
}

/** 标记该请求失败不弹 toast（默认会弹） */
export function silentRequest(cfg: import('axios').AxiosRequestConfig): import('axios').AxiosRequestConfig {
  return { ...cfg, _silent: true } as import('axios').AxiosRequestConfig & {
    _silent?: boolean
  }
}

/** 给 useErrorHandler 在 setup 上下文里调用的工具 */
export function translateError(err: BizError | Error | unknown): {
  i18nKey: string | null
  fallback: string
  code: number | null
  traceId: string
} {
  if (err instanceof BizError) {
    const i18nKey = resolveErrorKey(err.code)
    // 带动态信息的后端文案优先（见 DYNAMIC_MESSAGE_CODES 注释）：
    // i18n 的通用文案会抹掉「超了多少/找谁」这类关键细节。
    const keepBackend = DYNAMIC_MESSAGE_CODES.has(err.code)
    return {
      i18nKey: keepBackend ? null : i18nKey,
      fallback: err.message,
      code: err.code,
      traceId: err.traceId,
    }
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const anyErr = err as { message?: string; code?: number; trace_id?: string }
    // request.ts 拦截器包装的 {code, message, trace_id} 普通对象同样要吃错误码映射，
    // 否则 toast 落英文原文（"pickup code not found" 事件，2026-10-12）
    const i18nKey = anyErr.code != null ? resolveErrorKey(anyErr.code) : null
    const keepBackend = anyErr.code != null && DYNAMIC_MESSAGE_CODES.has(anyErr.code)
    return {
      i18nKey: keepBackend ? null : i18nKey,
      fallback: anyErr.message || 'Unknown error',
      code: anyErr.code ?? null,
      traceId: anyErr.trace_id ?? '',
    }
  }
  return { i18nKey: null, fallback: 'Unknown error', code: null, traceId: '' }
}

export { ERRCODE_KEY_MAP }
export type { InternalAxiosRequestConfig }
