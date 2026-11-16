// 管理员 Passkey 客户端流程单测（frontend-core#118）。
//
// 本仓无组件测试基建（无 @vue/test-utils/jsdom）⇒ 流程逻辑收敛在 utils/webauthn.ts，
// 这里用注入的 credentials API 桩打桩浏览器侧，api 桩打桩服务端四端点，覆盖：
// 登记成功/失败、登录成功/失败、降级隐藏（isWebAuthnAvailable）、用户取消静默、
// credential 序列化（toJSON 优先 + 老浏览器回退）、b64url 往返。
import { describe, it, expect, vi } from 'vitest'
import {
  isWebAuthnAvailable,
  b64urlToBytes,
  bytesToB64url,
  toCreationPublicKey,
  toAssertionPublicKey,
  serializeCredential,
  registerPasskey,
  loginWithPasskey,
  type PasskeyApi,
  type CredentialsLike,
  type WebAuthnEnvLike,
} from '@/utils/webauthn'

// challenge 明文 "challenge" 的 base64url（无填充），与 core URLEncodedBase64 同形态
const CHALLENGE = 'Y2hhbGxlbmdl'
const CRED_ID = 'cXVpZA'

const creationRaw = {
  publicKey: {
    challenge: CHALLENGE,
    rp: { id: 'example.test', name: 'PigeonBox' },
    user: { id: 'dXNlcg', name: 'admin', displayName: 'admin' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    excludeCredentials: [{ type: 'public-key', id: 'ZXhjbHVkZQ' }],
  },
}

const assertionRaw = {
  publicKey: {
    challenge: CHALLENGE,
    rpId: 'example.test',
    allowCredentials: [{ type: 'public-key', id: 'YWxsb3c' }],
    userVerification: 'preferred',
  },
}

// 服务端期望的凭证 JSON（toJSON 原生形态 = WebAuthn L3）
const wireCredential = {
  id: CRED_ID,
  rawId: CRED_ID,
  type: 'public-key',
  response: {
    clientDataJSON: 'eyJjaGFsbGVuZ2UiOiJ4In0',
    attestationObject: 'o2NmbXRkbm9uZWdhdHRTdHJ0dUZpdmVyQ29tbWl0dGVkQ29tbW9u',
  },
}

const fakeCredential = () => ({
  id: CRED_ID,
  rawId: new Uint8Array([113, 117, 105, 100]).buffer,
  type: 'public-key',
  response: {},
  toJSON: () => wireCredential,
})

const makeApi = (overrides: Partial<PasskeyApi> = {}): PasskeyApi => ({
  registerOptions: vi.fn(async () => ({ code: 200, data: creationRaw })),
  registerVerify: vi.fn(async () => ({ code: 200, data: { id: 1, name: '办公本' } })),
  loginOptions: vi.fn(async () => ({ code: 200, data: assertionRaw })),
  loginVerify: vi.fn(async () => ({
    code: 200,
    data: { token: 'jwt', token_type: 'Bearer', expires_in: 86400 },
  })),
  ...overrides,
})

const makeCreds = (overrides: Partial<CredentialsLike> = {}): CredentialsLike => ({
  create: vi.fn(async () => fakeCredential()),
  get: vi.fn(async () => fakeCredential()),
  ...overrides,
})

describe('降级判据 isWebAuthnAvailable（不满足即隐藏入口、不报错）', () => {
  it('安全上下文 + PublicKeyCredential + credentials 齐全 ⇒ 可用', () => {
    const env: WebAuthnEnvLike = {
      isSecureContext: true,
      PublicKeyCredential: class {},
      credentials: makeCreds(),
    }
    expect(isWebAuthnAvailable(env)).toBe(true)
  })

  it('非安全上下文（http 内网）⇒ false（浏览器压根不给 WebAuthn API）', () => {
    expect(
      isWebAuthnAvailable({
        isSecureContext: false,
        PublicKeyCredential: class {},
        credentials: makeCreds(),
      })
    ).toBe(false)
  })

  it('缺 PublicKeyCredential 类型（老浏览器）⇒ false', () => {
    expect(
      isWebAuthnAvailable({ isSecureContext: true, PublicKeyCredential: undefined, credentials: makeCreds() })
    ).toBe(false)
  })

  it('缺 credentials.create/get（实现不全）⇒ false', () => {
    expect(
      isWebAuthnAvailable({ isSecureContext: true, PublicKeyCredential: class {}, credentials: {} })
    ).toBe(false)
    expect(
      isWebAuthnAvailable({ isSecureContext: true, PublicKeyCredential: class {}, credentials: undefined })
    ).toBe(false)
  })
})

describe('b64url 编解码', () => {
  it('往返一致（含 -/_ 字节）', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0x3c, 0x00, 0x10])
    expect(b64urlToBytes(bytesToB64url(bytes))).toEqual(bytes)
  })

  it('解码 core 形态（无填充 base64url）', () => {
    expect(String.fromCharCode(...b64urlToBytes(CHALLENGE))).toBe('challenge')
  })
})

describe('options 形态转换（服务端字符串 → 浏览器 ArrayBuffer）', () => {
  it('登记：challenge/user.id/excludeCredentials.id 都转字节', () => {
    const pk = toCreationPublicKey(creationRaw) as {
      challenge: Uint8Array
      user: { id: Uint8Array }
      excludeCredentials: Array<{ id: Uint8Array }>
    }
    expect(String.fromCharCode(...pk.challenge)).toBe('challenge')
    expect(String.fromCharCode(...pk.user.id)).toBe('user')
    expect(String.fromCharCode(...pk.excludeCredentials[0].id)).toBe('exclude')
    // 未点名的字段原样透传（rp/pubKeyCredParams 等）
    expect((pk as unknown as { rp: { name: string } }).rp.name).toBe('PigeonBox')
  })

  it('登录：challenge/allowCredentials.id 转字节', () => {
    const pk = toAssertionPublicKey(assertionRaw) as {
      challenge: Uint8Array
      allowCredentials: Array<{ id: Uint8Array }>
    }
    expect(String.fromCharCode(...pk.challenge)).toBe('challenge')
    expect(String.fromCharCode(...pk.allowCredentials[0].id)).toBe('allow')
  })
})

describe('credential 序列化', () => {
  it('原生 toJSON 可用时直接用（服务端按 base64url 字符串解析）', () => {
    expect(serializeCredential(fakeCredential())).toEqual(wireCredential)
  })

  it('无 toJSON（老浏览器）：ArrayBuffer 字段手动转 base64url，不落 {"0":..} 形态', () => {
    const cred = {
      id: CRED_ID,
      rawId: new Uint8Array([113, 117, 105, 100]).buffer,
      type: 'public-key',
      response: {
        clientDataJSON: new Uint8Array([123, 125]).buffer, // "{}"
        authenticatorData: new Uint8Array([1, 2, 3]).buffer,
        signature: new Uint8Array([9, 9]).buffer,
        userHandle: null,
        getTransports: () => ['internal'],
      },
      getClientExtensionResults: () => ({}),
    }
    const out = serializeCredential(cred)
    expect(out.rawId).toBe('cXVpZA')
    const resp = out.response as Record<string, unknown>
    expect(resp.clientDataJSON).toBe('e30')
    expect(resp.authenticatorData).toBe('AQID')
    expect(resp.signature).toBe('CQk')
    expect(resp.transports).toEqual(['internal'])
    // 关键回归：绝不能出现 ArrayBuffer 被 JSON 序列化成 {"0":113,...}
    expect(JSON.stringify(out)).not.toContain('"0":113')
  })
})

describe('登记流 registerPasskey', () => {
  it('成功：options → create → verify（challenge 原样回传、凭证序列化、name 带上）', async () => {
    const api = makeApi()
    const creds = makeCreds()
    const res = await registerPasskey({ name: '办公本', api, credentials: creds })
    expect(res.ok).toBe(true)
    expect(res.data).toEqual({ id: 1, name: '办公本' })

    // create 收到的是浏览器形态（challenge 已转字节）
    const created = (creds.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      publicKey: { challenge: Uint8Array }
    }
    expect(String.fromCharCode(...created.publicKey.challenge)).toBe('challenge')

    // verify 收到原样 challenge 字符串 + toJSON 凭证 + 名称
    const verify = (api.registerVerify as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      challenge: string
      credential: Record<string, unknown>
      name?: string
    }
    expect(verify.challenge).toBe(CHALLENGE)
    expect(verify.credential).toEqual(wireCredential)
    expect(verify.name).toBe('办公本')
  })

  it('失败：options 非 200 ⇒ 不调 create/verify，带服务端文案', async () => {
    const api = makeApi({ registerOptions: vi.fn(async () => ({ code: 401, message: '未登录' })) })
    const creds = makeCreds()
    const res = await registerPasskey({ api, credentials: creds })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('未登录')
    expect(creds.create).not.toHaveBeenCalled()
    expect(api.registerVerify).not.toHaveBeenCalled()
  })

  it('失败：浏览器 create 抛错（非取消）⇒ 报错不静默', async () => {
    const api = makeApi()
    const creds = makeCreds({ create: vi.fn(async () => { throw new Error('operation not allowed') }) })
    const res = await registerPasskey({ api, credentials: creds })
    expect(res.ok).toBe(false)
    expect(res.cancelled).toBeFalsy()
    expect(res.error).toBe('operation not allowed')
    expect(api.registerVerify).not.toHaveBeenCalled()
  })

  it('失败：verify 非 200（挑战过期/断言不合法）⇒ 带服务端文案', async () => {
    const api = makeApi({
      registerVerify: vi.fn(async () => ({ code: 400, message: 'Passkey 验证失败' })),
    })
    const res = await registerPasskey({ api, credentials: makeCreds() })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Passkey 验证失败')
  })

  it('用户取消系统弹窗（NotAllowedError）⇒ cancelled=true（调用方静默不报错）', async () => {
    const api = makeApi()
    const creds = makeCreds({
      create: vi.fn(async () => {
        const e = new Error('The operation either timed out or was not allowed.')
        e.name = 'NotAllowedError'
        throw e
      }),
    })
    const res = await registerPasskey({ api, credentials: creds })
    expect(res.ok).toBe(false)
    expect(res.cancelled).toBe(true)
    expect(res.error).toBeUndefined()
    expect(api.registerVerify).not.toHaveBeenCalled()
  })

  it('降级：无 credentials ⇒ 直接失败不发请求', async () => {
    const api = makeApi()
    const res = await registerPasskey({ api, credentials: {} })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('WebAuthn unavailable')
    expect(api.registerOptions).not.toHaveBeenCalled()
  })
})

describe('登录流 loginWithPasskey', () => {
  it('成功：options(username) → get → verify（同形挑战回传、签发令牌透传）', async () => {
    const api = makeApi()
    const creds = makeCreds()
    const res = await loginWithPasskey({ username: 'admin', api, credentials: creds })
    expect(res.ok).toBe(true)
    expect(res.data).toEqual({ token: 'jwt', token_type: 'Bearer', expires_in: 86400 })
    expect(api.loginOptions).toHaveBeenCalledWith({ username: 'admin' })
    const verify = (api.loginVerify as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      challenge: string
      credential: Record<string, unknown>
    }
    expect(verify.challenge).toBe(CHALLENGE)
    expect(verify.credential).toEqual(wireCredential)
  })

  it('失败：verify 非 200（诱饵挑战/断言不合法）⇒ ok=false 带文案', async () => {
    const api = makeApi({
      loginVerify: vi.fn(async () => ({ code: 400, message: 'Passkey 验证失败' })),
    })
    const res = await loginWithPasskey({ username: 'admin', api, credentials: makeCreds() })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Passkey 验证失败')
  })

  it('失败：浏览器 get 抛错（非取消）⇒ 报错', async () => {
    const api = makeApi()
    const creds = makeCreds({ get: vi.fn(async () => { throw new Error('no credentials') }) })
    const res = await loginWithPasskey({ username: 'admin', api, credentials: creds })
    expect(res.ok).toBe(false)
    expect(res.cancelled).toBeFalsy()
    expect(res.error).toBe('no credentials')
    expect(api.loginVerify).not.toHaveBeenCalled()
  })

  it('用户取消 ⇒ cancelled=true 静默', async () => {
    const api = makeApi()
    const creds = makeCreds({
      get: vi.fn(async () => {
        const e = new Error('cancelled')
        e.name = 'NotAllowedError'
        throw e
      }),
    })
    const res = await loginWithPasskey({ username: 'admin', api, credentials: creds })
    expect(res.ok).toBe(false)
    expect(res.cancelled).toBe(true)
  })

  it('降级：无 credentials.get ⇒ 不发请求', async () => {
    const api = makeApi()
    const res = await loginWithPasskey({ username: 'admin', api, credentials: { create: vi.fn() } })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('WebAuthn unavailable')
    expect(api.loginOptions).not.toHaveBeenCalled()
  })
})
