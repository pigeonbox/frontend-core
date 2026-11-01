/**
 * 本机取件/发件记录（对标上游"取件记录/发件记录"模式，2026-10-07）。
 * 仅存 localStorage，永不上传；不存密码/密钥（只有 code + 元数据）。
 *
 * 2026-10-22 变更：
 *   - storage key 加部署段（v2 + 部署前缀）：同机多部署（统一网关 /app/pigeonbox/
 *     等路径前缀）不再串味。**改 key 是有意的破坏性变更：老 key
 *     （pigeonbox.local.pickup / pigeonbox.local.send）的历史记录不再读取。**
 *   - 记录同时存 6 位取件码（pickup_code）与 8 位分享码（code）——用户手上
 *     真正持有的是 6 位取件码，此前本机发件记录只存 8 位码 = 发件后找不回。
 *   - 记录带过期标识：写入带 expire_at，读取时算 expired（供 UI 置灰）。
 */

import { appBase } from '@/utils/base'

export interface LocalShareRecord {
  /** 8 位分享码（分享详情页 /share/{code} 用） */
  code: string
  /** 6 位取件码（用户手上真正持有的码；未铸造时为空，如 E2E 密文分享） */
  pickup_code?: string
  /** 文件名（取件记录）/ 无 */
  name?: string
  /** 发件记录的完整分享链接 */
  url?: string
  size?: number
  /** 记录创建时间（ms） */
  time: number
  /** 记录过期时间（ms）；调用方未给时按创建时间 + 默认有效期近似 */
  expire_at?: number
  /** 读取时计算：是否已过期（供 UI 置灰；不落盘） */
  expired?: boolean
}

const CAP = 20
/** 记录默认有效期（7 天）：调用方拿不到 expire_at 时按创建时间 + 此值近似过期 */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 部署区分段：同机多部署不串味。localStorage 本身按源隔离，
 * 同源多部署（统一网关路径前缀）靠这一段区分。
 */
const deploymentTag = (): string => {
  const tag = appBase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
  return tag || 'root'
}

/** 2026-10-22 起改 key（含部署段 + v2 版本段）：老 key 的历史记录不再读取 */
const KEY_PREFIX = `pigeonbox.local.v2.${deploymentTag()}`
const PICKUP_KEY = `${KEY_PREFIX}.pickup`
const SEND_KEY = `${KEY_PREFIX}.send`

/** 记录过期时刻：优先调用方给的 expire_at，否则按创建时间 + 默认有效期近似 */
const expireAtOf = (r: LocalShareRecord): number => {
  if (typeof r.expire_at === 'number' && r.expire_at > 0) return r.expire_at
  return (r.time || 0) + DEFAULT_TTL_MS
}

function read(key: string): LocalShareRecord[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    // 读取侧统一算过期标记（expired 不落盘）
    return (parsed as LocalShareRecord[]).map((r) => {
      const expireAt = expireAtOf(r)
      return { ...r, expire_at: expireAt, expired: now > expireAt }
    })
  } catch {
    return []
  }
}

function write(key: string, list: LocalShareRecord[]): void {
  try {
    // 落盘时剔除只在读取侧计算的 expired 标记
    const payload = list.slice(0, CAP).map((r) => {
      const { expired: _expired, ...rest } = r
      return rest
    })
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    /* 存储满/隐私模式：静默丢弃（记录是锦上添花，不应打扰主流程） */
  }
}

function push(key: string, rec: LocalShareRecord): void {
  const list = read(key).filter((r) => {
    if (rec.code && r.code === rec.code) return false
    if (rec.pickup_code && r.pickup_code === rec.pickup_code) return false
    return true
  })
  list.unshift(rec)
  write(key, list)
}

/** 写入时补齐 time 与 expire_at（调用方给了 expire_at 就用它） */
function stamp(rec: Omit<LocalShareRecord, 'time' | 'expired'>): LocalShareRecord {
  const time = Date.now()
  return {
    ...rec,
    time,
    expire_at: typeof rec.expire_at === 'number' && rec.expire_at > 0 ? rec.expire_at : time + DEFAULT_TTL_MS,
  }
}

export const localHistory = {
  pushPickup(rec: Omit<LocalShareRecord, 'time' | 'expired'>): void {
    push(PICKUP_KEY, stamp(rec))
  },
  pushSend(rec: Omit<LocalShareRecord, 'time' | 'expired'>): void {
    push(SEND_KEY, stamp(rec))
  },
  getPickup(): LocalShareRecord[] {
    return read(PICKUP_KEY)
  },
  getSend(): LocalShareRecord[] {
    return read(SEND_KEY)
  },
  clearPickup(): void {
    write(PICKUP_KEY, [])
  },
  clearSend(): void {
    write(SEND_KEY, [])
  },
}

/**
 * 会话级一次性数据（sessionStorage）——取件结果页专用（2026-10-22）。
 *
 * 取件结果（文件名/大小/下载地址等元信息）此前以 JSON 塞在 URL 的 ?data= 里，
 * 地址栏/浏览器历史/Referer 全部留痕。改为：数据落 sessionStorage，
 * URL 只带一个不透明 key（同机同源，sessionStorage 语义匹配"一次性跳转"）。
 * 注意：sessionStorage 按标签页隔离——新开标签页读不到，取件结果页需按
 * "链接已失效"处理（结果页已有该兜底分支）。
 */
const SESSION_PREFIX = 'pigeonbox.session.'

/** 生成不透明的一次性 key（URL 里只出现它，不含任何元信息） */
export function newSessionKey(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 写会话级数据（失败静默：调用方读不到会走"链接已失效"分支） */
export function putSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(value))
  } catch {
    /* 隐私模式/配额：静默丢弃 */
  }
}

/** 读会话级数据（读不到 = 链接已失效 / 跨标签页打开） */
export function getSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
