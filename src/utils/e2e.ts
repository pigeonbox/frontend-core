/**
 * 端到端加密（E2E）客户端工具（P1，Gokapi 式可选级）。
 *
 * 模型：AES-256-GCM；密钥 32 字节随机生成、base64url 编码后放入分享链接
 * 的 hash 路由 query（#/share/CODE?key=xxx，hash 段永不发往服务器），
 * 服务端只存密文、零知识。
 *
 * 载荷格式：iv(12B) || ciphertext||tag（WebCrypto 原生输出）。
 * 文本：密文整体 base64 后作为分享文本上传。
 */

const IV_LEN = 12

function toB64Url(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function getCrypto(): SubtleCrypto {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (!c?.subtle) throw new Error('WebCrypto 不可用（需 HTTPS 或 localhost）')
  return c.subtle
}

/**
 * 当前环境**能不能**做端到端加密（供 UI 在开关处就拦住，而不是等发送时炸）。
 *
 * 为什么需要（2026-10-24 真机实测）：`crypto.subtle` 只在**安全上下文**可用
 * （HTTPS 或 localhost）。自托管/NAS 的典型访问方式是 `http://192.168.x.x:12345`
 * ⇒ 明文 HTTP 的局域网访问下 `crypto.subtle` **不存在** ⇒ 端到端加密根本用不了。
 * 而设置面板此前**照常提供这个开关**（能点、能亮）⇒ 用户填完表点「安全寄送」才吃
 * 一个 3 秒 toast（"WebCrypto 不可用"），**分享根本没建** ⇒ 一个走不通的死胡同。
 *
 * 判据用「能力」而非「协议」：既看 `isSecureContext`，也看 `crypto.subtle` 是否真的在
 * （某些浏览器/隐私模式即便标了 secure context 也可能不给 subtle）。
 */
export function e2eSupported(scope?: { isSecureContext?: boolean; crypto?: Crypto }): boolean {
  const s = scope ?? (typeof window !== 'undefined' ? window : undefined)
  if (!s) return false
  if (s.isSecureContext !== true) return false
  const c = s.crypto ?? (typeof crypto !== 'undefined' ? crypto : undefined)
  return !!c?.subtle
}

/** 生成新密钥（base64url，32 字节） */
export async function generateKeyB64(): Promise<string> {
  const raw = new Uint8Array(32)
  crypto.getRandomValues(raw)
  return toB64Url(raw)
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  return getCrypto().importKey('raw', bytesToArrayBuffer(fromB64Url(keyB64)), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

/** 加密任意字节：返回 iv || ciphertext||tag */
export async function encryptBytes(keyB64: string, data: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await importKey(keyB64)
  const iv = new Uint8Array(IV_LEN)
  crypto.getRandomValues(iv)
  const ct = await getCrypto().encrypt({ name: 'AES-GCM', iv }, key, data)
  const out = new Uint8Array(IV_LEN + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), IV_LEN)
  return out.buffer
}

/** 解密 iv || ciphertext||tag 格式载荷 */
export async function decryptBytes(keyB64: string, payload: ArrayBuffer): Promise<ArrayBuffer> {
  if (payload.byteLength <= IV_LEN) throw new Error('密文格式无效')
  const key = await importKey(keyB64)
  const iv = new Uint8Array(payload.slice(0, IV_LEN))
  const ct = payload.slice(IV_LEN)
  return getCrypto().decrypt({ name: 'AES-GCM', iv }, key, ct)
}

/** 文本加密（输出 base64 密文，作为分享文本上传） */
export async function encryptText(keyB64: string, text: string): Promise<string> {
  const payload = await encryptBytes(keyB64, bytesToArrayBuffer(new TextEncoder().encode(text)))
  return toB64Url(new Uint8Array(payload))
}

/** 文本解密 */
export async function decryptText(keyB64: string, b64: string): Promise<string> {
  const plain = await decryptBytes(keyB64, bytesToArrayBuffer(fromB64Url(b64)))
  return new TextDecoder().decode(plain)
}

/** 文件加密（整文件读入内存；建议仅 ≤100MB 启用） */
export async function encryptFile(keyB64: string, file: File): Promise<File> {
  const payload = await encryptBytes(keyB64, await file.arrayBuffer())
  return new File([payload], file.name, { type: 'application/octet-stream' })
}

/** 从当前 hash 路由 query 中取密钥（View 页用） */
export function keyFromHashQuery(queryKey: unknown): string {
  return typeof queryKey === 'string' ? queryKey : ''
}
