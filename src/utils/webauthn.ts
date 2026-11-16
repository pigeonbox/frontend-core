/**
 * 管理员 Passkey/WebAuthn 客户端流程（frontend-core#118，配合 core#160 四端点）。
 *
 * 分层：
 *   · isWebAuthnAvailable  降级判据（安全上下文 + PublicKeyCredential + credentials API）
 *   · toCreation/toAssertion 服务端 options（base64url 字符串）→ 浏览器 API 形态（ArrayBuffer）
 *   · serializeCredential  浏览器凭证 → 服务端可解析的 JSON（base64url 字符串）
 *   · registerPasskey/loginWithPasskey  两段式流程编排（api/credentials 均可注入 ⇒ 单测打桩）
 *
 * 为什么流程编排进 utils 而不是组件：本仓没有组件测试基建（无 @vue/test-utils/jsdom，
 * 见 utils/__tests/sourceScan.ts 头注）⇒ 视图层只能做源码级守卫；把「登记成功/失败、
 * 登录成功/失败、降级」的真逻辑放这里才能用 credentials API 打桩跑真单测。
 *
 * wire 形态与 core 对齐（core bootstrap/admin_webauthn.go）：
 *   · options 响应 = protocol.CredentialCreation/CredentialAssertion
 *     ⇒ { publicKey: { challenge: base64url, user.id: base64url, ... } }
 *   · verify 请求 = { challenge: <options 里的原样字符串>, credential: <凭证 JSON> }
 *     challenge 由客户端回传，服务端据此取回一次性 session ⇒ 必须原样回传。
 *   · credential：优先浏览器原生 credential.toJSON()（WebAuthn L3，Chrome119+/FF122+/Safari17+），
 *     老浏览器回退手动把 ArrayBuffer 字段转 base64url——库按 base64url 字符串解析
 *     （protocol.URLEncodedBase64），ArrayBuffer 直接 JSON.stringify 会变成 {"0":..} 对象而被拒。
 */

/** credentials API 的最小结构（注入点；生产传 navigator.credentials）。 */
export interface CredentialsLike {
  create?: (options: { publicKey: unknown }) => Promise<unknown>
  get?: (options: { publicKey: unknown }) => Promise<unknown>
}

/** 降级判据的可注入环境（生产读 globalThis；单测传桩）。 */
export interface WebAuthnEnvLike {
  isSecureContext?: boolean
  PublicKeyCredential?: unknown
  credentials?: CredentialsLike | undefined
}

const readEnv = (): WebAuthnEnvLike => {
  const g = globalThis as Record<string, unknown>
  return {
    isSecureContext: g.isSecureContext as boolean | undefined,
    PublicKeyCredential: g.PublicKeyCredential,
    credentials: (g.navigator as { credentials?: CredentialsLike } | undefined)?.credentials,
  }
}

const readCredentials = (): CredentialsLike | undefined => {
  const g = globalThis as Record<string, unknown>
  return (g.navigator as { credentials?: CredentialsLike } | undefined)?.credentials
}

/**
 * 是否可以展示 Passkey 入口（降级判据）。
 *
 * 三条缺一不可：安全上下文（http 内网/非 localhost 恒 false ⇒ 浏览器压根不给
 * WebAuthn API）、PublicKeyCredential 类型存在、credentials.create/get 齐全。
 * 调用方据此 v-if 隐藏入口——不支持就当功能不存在，不报错（issue #118 验收④）。
 */
export const isWebAuthnAvailable = (env: WebAuthnEnvLike = readEnv()): boolean =>
  env.isSecureContext === true &&
  env.PublicKeyCredential != null &&
  typeof env.credentials?.create === 'function' &&
  typeof env.credentials?.get === 'function'

/** base64url（无填充）→ 字节。core 侧 URLEncodedBase64 同形态。 */
export function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4))
  const bin = atob(norm + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 字节 → base64url（无填充）。 */
export function bytesToB64url(b: ArrayBuffer | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

type RawOptions = { publicKey?: Record<string, unknown> } & Record<string, unknown>

const unwrapPublicKey = (raw: RawOptions): Record<string, unknown> =>
  (raw?.publicKey as Record<string, unknown> | undefined) ?? (raw as Record<string, unknown>)

const asBytes = (v: unknown): Uint8Array =>
  v instanceof Uint8Array ? v : b64urlToBytes(String(v))

/** 服务端登记 options → navigator.credentials.create 的 publicKey。 */
export function toCreationPublicKey(raw: RawOptions): Record<string, unknown> {
  const pk = unwrapPublicKey(raw)
  const user = (pk.user ?? {}) as Record<string, unknown>
  const exclude = (pk.excludeCredentials as Array<Record<string, unknown>> | undefined) ?? []
  return {
    ...pk,
    challenge: asBytes(pk.challenge),
    user: { ...user, id: asBytes(user.id) },
    excludeCredentials: exclude.map((c) => ({ ...c, id: asBytes(c.id) })),
  }
}

/** 服务端登录 options → navigator.credentials.get 的 publicKey。 */
export function toAssertionPublicKey(raw: RawOptions): Record<string, unknown> {
  const pk = unwrapPublicKey(raw)
  const allow = (pk.allowCredentials as Array<Record<string, unknown>> | undefined) ?? []
  return {
    ...pk,
    challenge: asBytes(pk.challenge),
    allowCredentials: allow.map((c) => ({ ...c, id: asBytes(c.id) })),
  }
}

const b64urlOf = (v: unknown): string | undefined => {
  if (v == null) return undefined
  return bytesToB64url(v as ArrayBuffer)
}

/**
 * 浏览器凭证 → verify 请求体的 credential 字段。
 * toJSON() 原生形态即服务端期望（WebAuthn L3）；缺失/抛错回退手动组装。
 */
export function serializeCredential(cred: unknown): Record<string, unknown> {
  const c = cred as {
    id?: string
    rawId?: ArrayBuffer
    type?: string
    authenticatorAttachment?: string | null
    response?: Record<string, unknown>
    toJSON?: () => Record<string, unknown>
    getClientExtensionResults?: () => Record<string, unknown>
  }
  if (typeof c?.toJSON === 'function') {
    try {
      return c.toJSON()
    } catch {
      /* 回退手动组装 */
    }
  }
  const resp = c?.response ?? {}
  const out: Record<string, unknown> = {
    id: c?.id,
    rawId: b64urlOf(c?.rawId),
    type: c?.type,
    clientExtensionResults: c?.getClientExtensionResults?.() ?? {},
  }
  if (c?.authenticatorAttachment != null) out.authenticatorAttachment = c.authenticatorAttachment
  const wire: Record<string, unknown> = {}
  const clientDataJSON = b64urlOf(resp.clientDataJSON)
  if (clientDataJSON) wire.clientDataJSON = clientDataJSON
  const attestationObject = b64urlOf(resp.attestationObject)
  if (attestationObject) wire.attestationObject = attestationObject
  const authenticatorData = b64urlOf(resp.authenticatorData)
  if (authenticatorData) wire.authenticatorData = authenticatorData
  const signature = b64urlOf(resp.signature)
  if (signature) wire.signature = signature
  const userHandle = b64urlOf(resp.userHandle)
  if (userHandle) wire.userHandle = userHandle
  const transports = (resp as { getTransports?: () => string[] }).getTransports?.()
  if (transports) wire.transports = transports
  out.response = wire
  return out
}

/** 四端点的最小 API 面（生产传 adminApi 的四个方法；单测传桩）。 */
export interface PasskeyApi {
  registerOptions: () => Promise<{ code: number; message?: string; data?: RawOptions }>
  registerVerify: (p: {
    challenge: string
    credential: Record<string, unknown>
    name?: string
  }) => Promise<{ code: number; message?: string; data?: unknown }>
  loginOptions: (p: { username: string }) => Promise<{ code: number; message?: string; data?: RawOptions }>
  loginVerify: (p: {
    challenge: string
    credential: Record<string, unknown>
  }) => Promise<{ code: number; message?: string; data?: unknown }>
}

export interface PasskeyResult {
  ok: boolean
  /** 成功时的业务载荷（登记 = 凭证行；登录 = {token, token_type, expires_in}）。 */
  data?: unknown
  /** 失败原因（未本地化的服务端文案或浏览器错误）；cancelled 时不展示。 */
  error?: string
  /** 用户取消系统弹窗（NotAllowedError）⇒ 调用方静默，不报错。 */
  cancelled?: boolean
}

const cancelledError = (e: unknown): boolean =>
  (e as { name?: string } | null)?.name === 'NotAllowedError'

const errText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e ?? '')

/**
 * 登记流：register/options → navigator.credentials.create → register/verify。
 * 挑战必须原样回传（服务端一次性 session 按 challenge 字符串取回）。
 */
export async function registerPasskey(opts: {
  name?: string
  api: PasskeyApi
  credentials?: CredentialsLike
}): Promise<PasskeyResult> {
  const creds = opts.credentials ?? readCredentials()
  if (typeof creds?.create !== 'function') return { ok: false, error: 'WebAuthn unavailable' }
  const res = await opts.api.registerOptions()
  if (res.code !== 200 || !res.data) return { ok: false, error: res.message || 'options failed' }
  const raw = res.data
  let cred: unknown
  try {
    cred = await creds.create({ publicKey: toCreationPublicKey(raw) })
  } catch (e) {
    if (cancelledError(e)) return { ok: false, cancelled: true }
    return { ok: false, error: errText(e) }
  }
  if (!cred) return { ok: false, cancelled: true }
  const challenge = String((raw.publicKey as Record<string, unknown> | undefined)?.challenge ?? '')
  const v = await opts.api.registerVerify({
    challenge,
    credential: serializeCredential(cred),
    name: opts.name,
  })
  if (v.code !== 200) return { ok: false, error: v.message || 'verify failed' }
  return { ok: true, data: v.data }
}

/**
 * 登录流：login/options → navigator.credentials.get → login/verify。
 * 服务端对不存在/未登记的用户名发同形诱饵挑战（防枚举）⇒ 判真假只在 verify。
 */
export async function loginWithPasskey(opts: {
  username: string
  api: PasskeyApi
  credentials?: CredentialsLike
}): Promise<PasskeyResult> {
  const creds = opts.credentials ?? readCredentials()
  if (typeof creds?.get !== 'function') return { ok: false, error: 'WebAuthn unavailable' }
  const res = await opts.api.loginOptions({ username: opts.username })
  if (res.code !== 200 || !res.data) return { ok: false, error: res.message || 'options failed' }
  const raw = res.data
  let cred: unknown
  try {
    cred = await creds.get({ publicKey: toAssertionPublicKey(raw) })
  } catch (e) {
    if (cancelledError(e)) return { ok: false, cancelled: true }
    return { ok: false, error: errText(e) }
  }
  if (!cred) return { ok: false, cancelled: true }
  const challenge = String((raw.publicKey as Record<string, unknown> | undefined)?.challenge ?? '')
  const v = await opts.api.loginVerify({
    challenge,
    credential: serializeCredential(cred),
  })
  if (v.code !== 200) return { ok: false, error: v.message || 'verify failed' }
  return { ok: true, data: v.data }
}
