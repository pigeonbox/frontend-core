import { beforeEach, describe, expect, it } from 'vitest'
import { getSession, localHistory, newSessionKey, putSession } from '../localHistory'

// node 环境无 localStorage/sessionStorage：内存桩
class MemoryStorage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
  /** 测试用：列出已写入的 key */
  keys() {
    return Array.from(this.map.keys())
  }
}

let store: MemoryStorage

beforeEach(() => {
  store = new MemoryStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = store
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage = new MemoryStorage()
})

describe('localHistory（2026-10-22：部署段 key + 双码 + 过期标识）', () => {
  it('storage key 带部署段与版本段（老 key 的历史记录不再读取）', () => {
    localHistory.pushSend({ code: 'ABCD1234', pickup_code: 'VNXT8S' })
    const keys = store.keys()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^pigeonbox\.local\.v2\..+\.send$/)
    expect(keys[0]).not.toBe('pigeonbox.local.send')
  })

  it('发件记录同时存 6 位取件码与 8 位分享码', () => {
    localHistory.pushSend({ code: 'ABCD1234', pickup_code: 'VNXT8S', name: 'a.txt' })
    const [rec] = localHistory.getSend()
    expect(rec!.code).toBe('ABCD1234')
    expect(rec!.pickup_code).toBe('VNXT8S')
    expect(rec!.name).toBe('a.txt')
  })

  it('取件记录与发件记录互不串味', () => {
    localHistory.pushPickup({ code: 'PICKUP1' })
    localHistory.pushSend({ code: 'SEND0001' })
    expect(localHistory.getPickup().map((r) => r.code)).toEqual(['PICKUP1'])
    expect(localHistory.getSend().map((r) => r.code)).toEqual(['SEND0001'])
  })

  it('读取时标 expired（过期记录置灰）；未过期为 false', () => {
    localHistory.pushSend({ code: 'OLD00001', expire_at: Date.now() - 1000 })
    localHistory.pushSend({ code: 'NEW00001', expire_at: Date.now() + 60_000 })
    const list = localHistory.getSend()
    const old = list.find((r) => r.code === 'OLD00001')!
    const fresh = list.find((r) => r.code === 'NEW00001')!
    expect(old.expired).toBe(true)
    expect(fresh.expired).toBe(false)
  })

  it('expire_at 缺省时按创建时间 + 默认有效期近似（不立即过期）', () => {
    localHistory.pushSend({ code: 'DEF00001' })
    const [rec] = localHistory.getSend()
    expect(rec!.expire_at).toBeGreaterThan(rec!.time)
    expect(rec!.expired).toBe(false)
  })

  it('同码重复写入只保留一条（去重）', () => {
    localHistory.pushSend({ code: 'DUP00001' })
    localHistory.pushSend({ code: 'DUP00001' })
    expect(localHistory.getSend().filter((r) => r.code === 'DUP00001')).toHaveLength(1)
  })
})

describe('会话级一次性数据（取件结果页：URL 只带不透明 key）', () => {
  it('put/get 往返', () => {
    const key = newSessionKey()
    putSession(key, { file_name: 'a.txt' })
    expect(getSession<{ file_name: string }>(key)).toEqual({ file_name: 'a.txt' })
  })

  it('key 互不串味；读不到返回 null（链接已失效/跨标签页）', () => {
    const k1 = newSessionKey()
    const k2 = newSessionKey()
    putSession(k1, { file_name: 'a.txt' })
    expect(getSession(k2)).toBeNull()
    expect(getSession('never-written')).toBeNull()
  })

  it('key 不含任何元信息（仅不透明串）', () => {
    const key = newSessionKey()
    expect(key).not.toContain('a.txt')
    expect(key.length).toBeGreaterThan(8)
  })
})
