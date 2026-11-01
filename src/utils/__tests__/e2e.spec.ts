// 端到端加密的**能力判定**守卫（2026-10-24 真机实测出的死胡同）。
//
// 实测事故：自托管/NAS 的典型访问方式是 `http://192.168.x.x:12345`（明文 HTTP 的
// 局域网地址）⇒ 浏览器**不在安全上下文** ⇒ `crypto.subtle` 不存在 ⇒ 端到端加密
// 根本用不了。但设置面板此前**照常提供这个开关**（能点、能亮）⇒ 用户填完表点
// 「安全寄送」才吃一个 3 秒 toast（"WebCrypto 不可用（需 HTTPS 或 localhost）"），
// **分享根本没建** ⇒ 一个走不通的死胡同。
//
// 修法：把「能不能用」抽成纯函数 `e2eSupported(scope)`，UI 在**开关处**就禁用并
// 说明原因 ⇒ 用户不会选到一个交付不了的能力。
//
// 判据用「能力」而非「协议」：既看 isSecureContext，也看 crypto.subtle 是否真的在
// （部分浏览器/隐私模式即便标了 secure context 也可能不给 subtle）。
import { describe, it, expect } from 'vitest'
import { e2eSupported } from '../e2e'

const withSubtle = { isSecureContext: true, crypto: { subtle: {} } as unknown as Crypto }
const noSubtle = { isSecureContext: true, crypto: {} as unknown as Crypto }

describe('e2eSupported（端到端加密能力判定）', () => {
  it('安全上下文 + 有 crypto.subtle ⇒ 可用', () => {
    expect(e2eSupported(withSubtle)).toBe(true)
  })

  it('非安全上下文（明文 HTTP 的局域网访问）⇒ 不可用', () => {
    expect(e2eSupported({ ...withSubtle, isSecureContext: false })).toBe(false)
    expect(e2eSupported({ ...withSubtle, isSecureContext: undefined })).toBe(false)
  })

  it('安全上下文但没有 crypto.subtle ⇒ 不可用（部分浏览器/隐私模式）', () => {
    expect(e2eSupported(noSubtle)).toBe(false)
  })

  it('无 scope（无 window 环境）⇒ 不可用（不得抛异常）', () => {
    expect(e2eSupported(undefined as never)).toBe(false)
  })
})
