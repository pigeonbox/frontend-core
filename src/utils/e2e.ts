/**
 * 端到端加密（E2E）客户端工具（口令型，2026-11-01 core#30 / frontend-core#38）。
 *
 * 模型：AES-256-GCM。内容密钥 32 字节随机生成，**不再进分享链接**，改为用
 * 发件人设置的**口令**包装成 wrapped_key 随分享创建提交、落服务端（零知识：
 * 服务端只有密文与口令包装的密钥，两者都解不开内容）；取件人输入口令本地解包。
 *
 * ⚠️ 全部密码学走**纯 JS**（@noble/ciphers + @noble/hashes），**不依赖
 * crypto.subtle**——subtle 只在安全上下文（HTTPS/localhost）存在，而 NAS 典型的
 * `http://192.168.x.x` 访问下整个功能会整个消失（2026-10-24 真机实测的死胡同）。
 * 本模块只用 `crypto.getRandomValues` 取随机数（非安全上下文也可用，MDN）。
 *
 * 载荷格式（与旧版 WebCrypto 输出**逐字节兼容**，存量 URL-hash 密钥分享可继续取）：
 *   payload = iv(12B) || ciphertext||tag（文件=原始字节；文本=整体 base64url 后作分享文本）
 *
 * wrapped_key 信封（与 core/contracts 契约一致，**不得偏离**）：
 *   wrapped_key = base64( raw )                    // 标准 base64
 *   raw = 0x01 || salt(16B) || nonce(12B) || ct(32B)||tag(16B)   // 共 77B
 *   KEK = PBKDF2-HMAC-SHA256(口令, salt, iterations=210000, dkLen=32)
 *   ct = AES-256-GCM-Encrypt(KEK, nonce, content_key)   // tag 16B 追加
 */

import { gcm } from '@noble/ciphers/aes.js'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'

const IV_LEN = 12
const KEY_LEN = 32
const TAG_LEN = 16

// wrapped_key 信封常量（契约固定值，与 core 侧实现必须逐项一致）
const WRAP_VERSION = 0x01
const WRAP_SALT_LEN = 16
const WRAP_NONCE_LEN = 12
const WRAP_RAW_LEN = 1 + WRAP_SALT_LEN + WRAP_NONCE_LEN + KEY_LEN + TAG_LEN // 77B
/** PBKDF2 迭代次数（契约固定 210000，OWASP 2023 对 PBKDF2-HMAC-SHA256 的下限） */
const WRAP_ITERATIONS = 210000

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

/** 标准 base64（带 padding）——wrapped_key 信封的线格式用它，不是 base64url */
function toB64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** 随机字节：只依赖 crypto.getRandomValues（非安全上下文也可用） */
function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (typeof c?.getRandomValues !== 'function') {
    throw new Error('当前浏览器缺少 crypto.getRandomValues，无法生成密钥')
  }
  c.getRandomValues(out)
  return out
}

/**
 * 当前环境**能不能**做端到端加密（供 UI 在开关处就拦住，而不是等发送时炸）。
 *
 * 2026-11-01（core#30）判据改版：全部密码学走纯 JS 后**不再看 isSecureContext /
 * crypto.subtle**——那对组合曾让 `http://192.168.x.x` 的 NAS 访问整个功能不可用
 * （2026-10-24 实测死胡同）。现在唯一的硬依赖是 `crypto.getRandomValues`
 * （浏览器恒有）⇒ 明文 HTTP 的局域网访问下也能用。
 */
export function e2eSupported(scope?: {
  isSecureContext?: boolean
  crypto?: { getRandomValues?: unknown } | Crypto
}): boolean {
  const c = scope?.crypto ?? (typeof crypto !== 'undefined' ? crypto : undefined)
  return typeof (c as { getRandomValues?: unknown } | undefined)?.getRandomValues === 'function'
}

/** 生成新内容密钥（base64url，32 字节） */
export async function generateKeyB64(): Promise<string> {
  return toB64Url(randomBytes(KEY_LEN))
}

/**
 * PBKDF2-HMAC-SHA256 派生 KEK（wrapped_key 信封的密钥加密钥）。
 * 导出是**互操作/测试缝**：core 侧同款派生必须与此逐字节一致（固定向量断言见测试）。
 */
export function deriveKek(password: string, salt: Uint8Array): Uint8Array {
  // 210000 次在浏览器主线程约几十毫秒——口令包装一天只做一次（发件时），
  // 取件解包一次，可接受；不得随手调低（契约与 core 同值）
  return pbkdf2(sha256, password, salt, { c: WRAP_ITERATIONS, dkLen: KEY_LEN })
}

/** 加密任意字节：返回 iv || ciphertext||tag */
export async function encryptBytes(keyB64: string, data: ArrayBuffer): Promise<ArrayBuffer> {
  const key = fromB64Url(keyB64)
  const iv = randomBytes(IV_LEN)
  const ct = gcm(key, iv).encrypt(new Uint8Array(data))
  const out = new Uint8Array(IV_LEN + ct.length)
  out.set(iv, 0)
  out.set(ct, IV_LEN)
  return bytesToArrayBuffer(out)
}

/** 解密 iv || ciphertext||tag 格式载荷（AES-GCM 认证失败抛错，绝不返回垃圾明文） */
export async function decryptBytes(keyB64: string, payload: ArrayBuffer): Promise<ArrayBuffer> {
  const raw = new Uint8Array(payload)
  if (raw.length <= IV_LEN + TAG_LEN) throw new Error('密文格式无效')
  const key = fromB64Url(keyB64)
  const iv = raw.subarray(0, IV_LEN)
  const ct = raw.subarray(IV_LEN)
  try {
    return bytesToArrayBuffer(gcm(key, iv).decrypt(ct))
  } catch {
    // GCM 认证失败 = 密钥不对或密文被改；noble 原始报错对用户不可读，统一换可辨识文案
    throw new Error('解密失败：密钥不匹配或密文已损坏')
  }
}

/** 文本加密（输出 base64url 密文，作为分享文本上传） */
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

/**
 * 用口令把内容密钥包装成 wrapped_key（标准 base64 的 77B 信封）。
 * salt/nonce 每次随机 ⇒ 同口令同密钥也不会产生相同信封（不泄漏内容相等性）。
 */
export function wrapKey(password: string, contentKeyB64: string): string {
  const contentKey = fromB64Url(contentKeyB64)
  if (contentKey.length !== KEY_LEN) throw new Error('内容密钥必须是 32 字节')
  const salt = randomBytes(WRAP_SALT_LEN)
  const nonce = randomBytes(WRAP_NONCE_LEN)
  const ct = gcm(deriveKek(password, salt), nonce).encrypt(contentKey) // 32B||tag16B
  const raw = new Uint8Array(WRAP_RAW_LEN)
  raw[0] = WRAP_VERSION
  raw.set(salt, 1)
  raw.set(nonce, 1 + WRAP_SALT_LEN)
  raw.set(ct, 1 + WRAP_SALT_LEN + WRAP_NONCE_LEN)
  return toB64(raw)
}

/**
 * 用口令解开 wrapped_key，返回内容密钥（base64url）。
 * 失败一律抛错、错误信息可辨识：口令错（GCM 认证失败）与信封损坏（格式/版本）
 * 是两类——**绝不返回垃圾密钥**（那会让后续解密产出乱码明文）。
 */
export function unwrapKey(password: string, wrappedKey: string): string {
  let raw: Uint8Array
  try {
    raw = fromB64(wrappedKey.trim())
  } catch {
    throw new Error('wrapped_key 信封格式无效（base64 解码失败）')
  }
  if (raw.length !== WRAP_RAW_LEN) throw new Error('wrapped_key 信封格式无效（长度不符）')
  if (raw[0] !== WRAP_VERSION) {
    throw new Error(`不支持的 wrapped_key 信封版本 0x${raw[0]!.toString(16).padStart(2, '0')}`)
  }
  const salt = raw.subarray(1, 1 + WRAP_SALT_LEN)
  const nonce = raw.subarray(1 + WRAP_SALT_LEN, 1 + WRAP_SALT_LEN + WRAP_NONCE_LEN)
  const ct = raw.subarray(1 + WRAP_SALT_LEN + WRAP_NONCE_LEN)
  try {
    return toB64Url(gcm(deriveKek(password, salt), nonce).decrypt(ct))
  } catch {
    throw new Error('口令错误或密文已损坏')
  }
}
