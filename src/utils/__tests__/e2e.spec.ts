// 口令型 E2E 的密码学核心守卫（2026-11-01 core#30 / frontend-core#38）。
//
// 演进史：E2E 最初用 WebCrypto AES-256-GCM、密钥放分享链接 hash（#/share/CODE?key=xxx）。
// `crypto.subtle` 只在安全上下文存在 ⇒ `http://192.168.x.x` 的 NAS 访问下整个功能
// 不可用（2026-10-24 实测死胡同，旧版 e2e.spec.ts 甚至把「非安全上下文 ⇒ false」
// 锁成了正确行为）。2026-11-01 起：密码学全部收编纯 JS（@noble/*），密钥用口令包装成
// wrapped_key 落服务端 ⇒ **http 下可用**，且旧「URL-hash key」存量分享照常可取。
//
// 本文件的判据全部打在**真正会被读到的量**上：
//   · 固定向量（旧格式载荷 / PBKDF2 / 参考信封）——用 WebCrypto 独立生成后硬编码，
//     换纯 JS 实现必须逐字节兼容，否则存量分享解不开（负对照＝向量本身）；
//   · 负对照：错误口令必须**抛错**，绝不返回垃圾密钥/垃圾明文；
//   · 纯 JS 路径：把 globalThis.crypto 换成只有 getRandomValues 的替身后全流程仍工作
//     ——谁偷偷用回 crypto.subtle 这条就红。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  e2eSupported,
  generateKeyB64,
  encryptBytes,
  decryptBytes,
  encryptText,
  decryptText,
  encryptFile,
  wrapKey,
  unwrapKey,
  deriveKek,
} from '../e2e'

// PBKDF2-HMAC-SHA256 × 210000 迭代是确定性 CPU 重活（wrapKey/unwrapKey 每次调用
// 两趟派生）：全量并行时多 worker 挤兑下单条可超 vitest 默认 5s ⇒ 偶发 timeout 假红
// （2026-11-03 实录：57 文件并行下 e2e 两 spec 随机 1~7 条转红，单跑恒绿）。
// 断言不动，只给本文件的用例钉 30s 超时。
vi.setConfig({ testTimeout: 30000 })

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('e2eSupported（端到端加密能力判定，2026-11-01 改版）', () => {
  it('非安全上下文（明文 HTTP 的局域网访问）+ 有 getRandomValues ⇒ 可用', () => {
    // 判据不再看 isSecureContext/subtle：纯 JS 密码学在 http 下照常工作
    const scope = {
      isSecureContext: false,
      crypto: { getRandomValues: () => new Uint8Array() },
    }
    expect(e2eSupported(scope)).toBe(true)
    expect(e2eSupported({ ...scope, isSecureContext: undefined })).toBe(true)
  })

  it('没有 getRandomValues ⇒ 不可用（连随机数都取不了，无法生成密钥）', () => {
    expect(e2eSupported({ isSecureContext: true, crypto: {} as Crypto })).toBe(false)
  })

  it('无任何 scope/crypto 线索时不抛异常（返回值只取决于随机数能力）', () => {
    vi.stubGlobal('crypto', undefined)
    expect(() => e2eSupported({})).not.toThrow()
    expect(e2eSupported({})).toBe(false)
  })
})

describe('纯 JS 路径往返（AES-256-GCM）', () => {
  it('文本往返一致（encryptText/decryptText）', async () => {
    const key = await generateKeyB64()
    const text = '零知识分享 · zero-knowledge 2026-11-01'
    const enc = await encryptText(key, text)
    expect(enc).not.toContain(text)
    expect(await decryptText(key, enc)).toBe(text)
  })

  it('字节往返一致（encryptBytes/decryptBytes）', async () => {
    const key = await generateKeyB64()
    const data = new Uint8Array([0, 1, 2, 255, 254, 128, 7]).buffer
    const enc = await encryptBytes(key, data)
    expect(new Uint8Array(enc).byteLength).toBe(7 + 12 + 16) // 明文 + iv + tag
    expect(new Uint8Array(await decryptBytes(key, enc))).toEqual(new Uint8Array([0, 1, 2, 255, 254, 128, 7]))
  })

  it('错钥解密必须抛错（不得返回垃圾明文）', async () => {
    const enc = await encryptText(await generateKeyB64(), 'secret')
    await expect(decryptText(await generateKeyB64(), enc)).rejects.toThrow()
  })
})

describe('wrapped_key 信封（wrapKey/unwrapKey）', () => {
  it('口令往返一致；且信封形状 = 0x01||salt16||nonce12||ct32||tag16（77B，标准 base64）', async () => {
    const contentKey = await generateKeyB64()
    const wrapped = wrapKey('开箱口令-2026', contentKey)
    const raw = Uint8Array.from(atob(wrapped), (c) => c.charCodeAt(0))
    expect(raw.byteLength).toBe(77)
    expect(raw[0]).toBe(0x01)
    expect(unwrapKey('开箱口令-2026', wrapped)).toBe(contentKey)
  })

  it('负对照：错误口令 ⇒ 抛错（不得返回垃圾密钥）', async () => {
    const wrapped = wrapKey('right-password', await generateKeyB64())
    expect(() => unwrapKey('wrong-password', wrapped)).toThrow()
  })

  it('负对照：信封损坏（版本/长度/编码）⇒ 抛可辨识错误', async () => {
    const wrapped = wrapKey('pwd', await generateKeyB64())
    const raw = Uint8Array.from(atob(wrapped), (c) => c.charCodeAt(0))
    // 版本字节篡改
    raw[0] = 0x02
    expect(() => unwrapKey('pwd', btoa(String.fromCharCode(...raw)))).toThrow(/版本/)
    // 长度截断
    expect(() => unwrapKey('pwd', btoa('short'))).toThrow(/长度|格式/)
    // base64 解码失败
    expect(() => unwrapKey('pwd', '!!!not-base64!!!')).toThrow(/格式/)
  })
})

describe('固定向量（WebCrypto 独立生成，换纯 JS 必须逐字节兼容）', () => {
  // 向量由 node:crypto 的 WebCrypto 生成（与旧版 e2e.ts 的 subtle 路径同源）：
  // key = (i*7+3)&0xff, iv = (i*5+1)&0xff, AES-256-GCM
  const LEGACY_KEY_B64URL = 'AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw'
  const LEGACY_TEXT = '你好，PigeonBox — legacy E2E vector 2026-11-01'
  const LEGACY_PAYLOAD_B64URL =
    'AQYLEBUaHyQpLjM4qquYj--VpqPI0Mv8HnVf9c8xiyNPU7NhJsZRfXGSn8WQRjoG7iU-lrz2JkadQIjwe5aqByLEPspaKaaecDUuZNTWyg'

  it('存量兼容：旧「URL-hash key」格式载荷（iv||ct，base64url）可被纯 JS 解开', async () => {
    expect(await decryptText(LEGACY_KEY_B64URL, LEGACY_PAYLOAD_B64URL)).toBe(LEGACY_TEXT)
    const bytes = await decryptBytes(
      LEGACY_KEY_B64URL,
      Uint8Array.from(atob(LEGACY_PAYLOAD_B64URL.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)).buffer
    )
    expect(new TextDecoder().decode(bytes)).toBe(LEGACY_TEXT)
  })

  it('PBKDF2 确定性：同口令同 salt ⇒ 同 KEK（固定向量 + 两次调用一致）', () => {
    const salt = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    const expectKek = 'df5dbe95630b7180cae9e694b5b361870b03950b3df03c55140ef30bea349180'
    expect(hex(deriveKek('pigeonbox-test', salt))).toBe(expectKek)
    expect(hex(deriveKek('pigeonbox-test', salt))).toBe(hex(deriveKek('pigeonbox-test', salt)))
  })

  it('参考信封（WebCrypto 按契约格式打的包）可被 unwrapKey 解开', () => {
    // raw = 0x01 || salt(a0..af) || nonce(b0..bb) || AES-256-GCM(KEK, key)
    const WRAP_ENVELOPE_B64 =
      'AaChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5urvXbaHa7MMqskdpdmNI4u9Aq7qcHJLf7bmpdRdtD0L3+HZph38MG8K/hKgPeHoaa/8='
    expect(unwrapKey('pigeonbox-test', WRAP_ENVELOPE_B64)).toBe('AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw')
  })
})

describe('不触碰 crypto.subtle（http 可用性的守卫）', () => {
  it('把 globalThis.crypto 换成只有 getRandomValues 的替身，全流程仍工作', async () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })

    const key = await generateKeyB64()
    const text = '纯 JS 路径 — no subtle'
    const enc = await encryptText(key, text)
    expect(await decryptText(key, enc)).toBe(text)

    const wrapped = wrapKey('pwd-no-subtle', key)
    expect(unwrapKey('pwd-no-subtle', wrapped)).toBe(key)

    const encFile = await encryptFile(key, new File([new Uint8Array([9, 8, 7])], 'a.bin'))
    const decFile = new Uint8Array(await decryptBytes(key, await encFile.arrayBuffer()))
    expect(decFile).toEqual(new Uint8Array([9, 8, 7]))
  })
})
