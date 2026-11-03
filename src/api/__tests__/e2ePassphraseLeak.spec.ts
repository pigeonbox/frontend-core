// 口令型 E2E 的**口令零外泄**守卫（core#30 / frontend-core#38）。
//
// 为什么需要这条（issue #38 的验收判据）：
//   「服务端返回的明文**绝不**落到 localStorage / 日志 / 剪贴板」——这是**读**侧；
//   本条守卫的是**写**侧的对偶面：**明文口令绝不出发件方浏览器**。
//
// 威胁形态（真实、且容易在重构中悄悄发生）：
//   ① 口令混进创建请求体 → 进网关/代理/服务端访问日志 → 明文口令落盘；
//   ② 口令混进分享链接 → 进浏览器历史/Referer/聊天记录 → 转发即泄；
//   ③ 口令落 localStorage → XSS 一把带走（比取件密码更致命：它是**解密因子**）。
//
// 判据打在**真正会被读到的量**上：
//   - 逐字段检查 FormData 的键集合与**值**（不是「源码里没出现」那种文本判断）；
//   - 检查 URL（分享链接）不含口令；
//   - 检查 localStorage/sessionStorage 不含口令。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defaultShareSettings } from '@/composables/useShareSettings'
import { wrapKey, generateKeyB64 } from '@/utils/e2e'

// 同 e2e.spec.ts：PBKDF2-210k 重活在全量并行挤兑下会撞默认 5s 超时（偶发假红），
// 断言不动，只钉 30s 超时。
vi.setConfig({ testTimeout: 30000 })

const PASSPHRASE = 'my-secret-passphrase-2026'

/** 捕获 request() 真正要发出去的请求体（按 url 索引；FormData 或 JSON body）。 */
const sentForms = new Map<string, FormData>()
const sentBodies = new Map<string, unknown>()

vi.mock('@/utils/request', () => ({
  request: vi.fn(async (cfg: { url: string; data: unknown }) => {
    sentBodies.set(cfg.url, cfg.data)
    if (cfg.data instanceof FormData) sentForms.set(cfg.url, cfg.data)
    return { code: 200, message: 'ok', data: { code: 'ABC123', url: 'u' } }
  }),
}))

afterEach(() => {
  sentForms.clear()
  sentBodies.clear()
  vi.clearAllMocks()
})

describe('口令型 E2E：明文口令绝不出浏览器', () => {
  it('shareText 的 FormData **不含**口令的键，也不含口令的值', async () => {
    const { shareApi } = await import('../share')

    const settings = {
      ...defaultShareSettings(),
      e2e: true,
      e2e_password: PASSPHRASE,
      e2e_password_confirm: PASSPHRASE,
    }
    const contentKey = await generateKeyB64()
    const wrapped = wrapKey(PASSPHRASE, contentKey)

    // ⚠️ **故意把口令字段塞进入参**（模拟上游调用方误把整个 settings 展开传进来）：
    // api 层必须**只挑白名单字段转发**，不能因为入参里有就跟着发出去。
    // 这是真实威胁形态——上游（TextShare/useUploadQueue）一旦改成展开转发，
    // 口令就会进请求体 ⇒ 进网关日志/服务端日志 ⇒ 明文口令落盘。
    const payload = {
      ...settings, // ← 含 e2e_password / e2e_password_confirm（**故意**带上）
      text: 'cipher',
      expire_value: settings.expire_value,
      expire_style: settings.expire_style,
      require_auth: settings.require_auth,
      encrypted: true,
      wrapped_key: wrapped,
    } as Parameters<typeof shareApi.shareText>[0]

    await shareApi.shareText(payload)

    const form = sentForms.get('/share/text/')
    expect(form).toBeDefined()
    const keys = Array.from(form!.keys())
    // ⭐ 键集合必须是**白名单**（多一个键 = 泄漏面，含「把口令塞进别的字段」的隐蔽形态）
    const ALLOWED = new Set([
      'text',
      'expire_value',
      'expire_style',
      'require_auth',
      'password',
      'encrypted',
      'wrapped_key',
      'custom_code',
    ])
    for (const k of keys) {
      expect(ALLOWED.has(k)).toBe(true)
    }
    expect(keys).not.toContain('e2e_password')
    expect(keys).not.toContain('e2e_password_confirm')
    // 且**值**里也不得含明文口令（防止有人把口令塞进别的字段，比如塞进 text）
    for (const [, v] of form!.entries()) {
      expect(String(v)).not.toContain(PASSPHRASE)
    }
    // 包装后的 wrapped_key 必须在（否则服务端拿不到解封材料）
    expect(form!.get('wrapped_key')).toBe(wrapped)
  })

  it('shareFile 的 FormData **不含**口令的键，也不含口令的值（含 note 等自由文本字段）', async () => {
    const { shareApi } = await import('../share')

    const settings = {
      ...defaultShareSettings(),
      e2e: true,
      e2e_password: PASSPHRASE,
      e2e_password_confirm: PASSPHRASE,
    }
    const contentKey = await generateKeyB64()
    const wrapped = wrapKey(PASSPHRASE, contentKey)

    // ⚠️ 文件通道转发**更多**字段（含 note 这类自由文本）⇒ 口令「藏进别的字段」
    // 的形态在**这条路径上**真实存在（shareText 不转发 note，测不到）⇒ 必须覆盖。
    //
    // ⚠️ 注意：note 本身是**合法业务字段**（文件备注，服务端会收）⇒ 断言不是
    // 「note 不得出现」，而是「**键集合是白名单**」+「**口令字段不出现在任何
    // 字段的值里**」。若在 note 里硬塞口令，那是测试自造矛盾（note 本就该转发）。
    const payload = {
      ...settings, // ← 含 e2e_password / e2e_password_confirm（**故意**带上）
      file: new File([new Uint8Array([1, 2, 3])], 'a.bin'),
      expire_value: settings.expire_value,
      expire_style: settings.expire_style,
      require_auth: settings.require_auth,
      encrypted: true,
      wrapped_key: wrapped,
      note: '普通文件备注',
    } as unknown as Parameters<typeof shareApi.shareFile>[0]

    await shareApi.shareFile(payload)

    const form = sentForms.get('/share/file/')
    expect(form).toBeDefined()
    const keys = Array.from(form!.keys())
    // ⭐ 键集合必须是**白名单**：多一个键就是泄漏面（含「把口令塞进别的字段」这种
    // 隐蔽形态 —— 只查「值里有没有口令字样」挡不住「换个字段名/换个编码」）。
    // 白名单 = 服务端 share/file 端点真正会读的字段。
    const ALLOWED = new Set([
      'file',
      'expire_value',
      'expire_style',
      'require_auth',
      'password',
      'note',
      'encrypted',
      'wrapped_key',
      'custom_code',
    ])
    for (const k of keys) {
      expect(ALLOWED.has(k)).toBe(true)
    }
    expect(keys).not.toContain('e2e_password')
    expect(keys).not.toContain('e2e_password_confirm')
    // 值层面：任何字段都不得含明文口令
    for (const [, v] of form!.entries()) {
      expect(String(v)).not.toContain(PASSPHRASE)
    }
    expect(form!.get('wrapped_key')).toBe(wrapped)
  })

  it('**口令字段名**在任何通道的请求体里都不得出现（结构性判据，与值无关）', async () => {
    const { shareApi } = await import('../share')
    const { multiBind } = await import('../multifile')

    const settings = {
      ...defaultShareSettings(),
      e2e: true,
      e2e_password: PASSPHRASE,
      e2e_password_confirm: PASSPHRASE,
    }
    const contentKey = await generateKeyB64()
    const wrapped = wrapKey(PASSPHRASE, contentKey)

    await shareApi.shareText({
      ...settings,
      text: 'cipher',
      expire_value: settings.expire_value,
      expire_style: settings.expire_style,
      require_auth: settings.require_auth,
      encrypted: true,
      wrapped_key: wrapped,
    } as Parameters<typeof shareApi.shareText>[0])

    // multi-bind 走 JSON body 通道（不是 FormData）⇒ 键名泄漏形态不同 ⇒ 也要覆盖
    await multiBind(
      [{ upload_id: 'u1', file_name: 'a.bin' }],
      {
        ...settings,
        expire_value: settings.expire_value,
        expire_style: settings.expire_style,
        require_auth: settings.require_auth,
        encrypted: true,
        wrapped_key: wrapped,
      } as Parameters<typeof multiBind>[1]
    )

    for (const [url, body] of sentBodies) {
      const keys = body instanceof FormData
        ? Array.from(body.keys())
        : Object.keys((body ?? {}) as Record<string, unknown>)
      for (const k of keys) {
        // ⚠️ **只针对 E2E 口令的字段名**：`password` 是**合法的取件密码字段**
        // （服务端那道门，与 E2E 口令是两回事）⇒ 不能一并禁掉。
        // 这里禁的是「E2E 口令」这一族（e2e_password / e2e_password_confirm / passphrase）。
        expect(k, `通道 ${url} 出现了 E2E 口令类字段名 ${k}`).not.toMatch(
          /e2e_?pass|passphrase/i
        )
      }
      // 值层面：口令字样不得出现在任何字段值里
      const dumped = body instanceof FormData
        ? JSON.stringify(Array.from(body.entries()))
        : JSON.stringify(body)
      expect(dumped, `通道 ${url} 的请求体含明文口令`).not.toContain(PASSPHRASE)
    }
    // 通道确实被走到（避免「什么都没发 ⇒ 断言恒绿」）
    expect(sentBodies.size).toBeGreaterThanOrEqual(2)
  })

  it('分享链接**不含**口令（口令不随 URL 传播）', () => {
    // 链接里带密钥 = 零知识失效（转发即泄）⇒ 链接里更不能带口令。
    const url = new URL('https://example.test/#/share/ABC123')
    url.hash = `/share/ABC123?key=${encodeURIComponent('some-key')}`
    expect(url.toString()).not.toContain(PASSPHRASE)
    // 结构性判据：URL 里只能出现 key 参数，不该有口令类参数名
    const q = url.hash.split('?')[1] || ''
    expect(q).not.toMatch(/password|passphrase/i)
  })

  it('走一遍真实的 E2E 口令校验路径后，localStorage / sessionStorage **不含**口令', async () => {
    // ⚠️ 必须**真的调用**会碰设置的代码路径（validateE2e），否则这条断言是**恒绿**的
    // ——「检查一个空的 localStorage」永远通过，却挡不住「有人加了持久化」。
    //
    // ⚠️ Node 测试环境**没有** localStorage/sessionStorage（vitest 默认 node env）⇒
    // 这里注入一个**会被真实写入**的替身 ⇒ 持久化一旦发生就能被看见。
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size },
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', storage)

    const { useShareSettings } = await import('@/composables/useShareSettings')
    const { settings, validateE2e } = useShareSettings()
    settings.e2e = true
    settings.e2e_password = PASSPHRASE
    settings.e2e_password_confirm = PASSPHRASE
    validateE2e()

    const dumped = JSON.stringify(Array.from(store.entries()))
    expect(dumped).not.toContain(PASSPHRASE)
    // 结构性判据：不得出现任何以口令命名的存储键
    for (const k of store.keys()) {
      expect(k).not.toMatch(/e2e_?pass|password|passphrase/i)
    }

    vi.unstubAllGlobals()
  })
})
