/**
 * 本机取件/发件记录（对标上游"取件记录/发件记录"模式，2026-10-07）。
 * 仅存 localStorage，永不上传；不存密码/密钥（只有 code + 元数据）。
 */

export interface LocalShareRecord {
  code: string
  /** 文件名（取件记录）/ 无 */
  name?: string
  /** 发件记录的完整分享链接 */
  url?: string
  size?: number
  time: number
}

const PICKUP_KEY = 'pigeonbox.local.pickup'
const SEND_KEY = 'pigeonbox.local.send'
const CAP = 20

function read(key: string): LocalShareRecord[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LocalShareRecord[]) : []
  } catch {
    return []
  }
}

function write(key: string, list: LocalShareRecord[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, CAP)))
  } catch {
    /* 存储满/隐私模式：静默丢弃（记录是锦上添花，不应打扰主流程） */
  }
}

function push(key: string, rec: LocalShareRecord): void {
  const list = read(key).filter((r) => r.code !== rec.code)
  list.unshift(rec)
  write(key, list)
}

export const localHistory = {
  pushPickup(rec: Omit<LocalShareRecord, 'time'>): void {
    push(PICKUP_KEY, { ...rec, time: Date.now() })
  },
  pushSend(rec: Omit<LocalShareRecord, 'time'>): void {
    push(SEND_KEY, { ...rec, time: Date.now() })
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
