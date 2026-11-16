// 管理员 Passkey 登记入口守卫（frontend-core#118，配合 core#160 register 两端点）。
//
// 源码级断言（本仓无组件测试基建，见 utils/__tests/sourceScan.ts 头注）：
// 流程真逻辑（登记成功/失败、降级）在 utils/webauthn.spec.ts 用 credentials
// API 桩跑真单测；本文件钉视图接线——双条件降级（管理员+浏览器支持）、
// 登记两端点注入、取消静默、i18n 五语键齐。负对照实跑：删掉 v-if 条件、
// registerPasskey 调用、任一 i18n key ⇒ 对应用例变红。
import { describe, it, expect } from 'vitest'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import ruRU from '@/i18n/locales/ru-RU'
import deDE from '@/i18n/locales/de-DE'

const PAGE = 'views/user/Security.vue'
const src = stripComments(readSrc(PAGE))

describe('安全页 Passkey 登记入口', () => {
  it('双条件降级：仅管理员 + 浏览器支持 WebAuthn 才渲染', () => {
    expect(src, '缺 v-if 降级开关').toContain('v-if="passkeyVisible"')
    expect(src, 'passkeyVisible 必须由双条件合成').toContain(
      'const passkeyVisible = computed(() => passkeyAvailable && isAdmin.value)',
    )
    expect(src, '浏览器侧判据必须是 isWebAuthnAvailable（安全上下文）').toContain(
      'isWebAuthnAvailable()',
    )
    expect(src, '管理员判据（register 挂 AdminMiddleware，普通用户必 401）').toContain(
      "userInfo?.role === 'admin'",
    )
  })

  it('登记走 registerPasskey 两段流，注入 core#160 的 register 两端点', () => {
    expect(src, '缺流程调用').toContain('registerPasskey(')
    expect(src, 'registerOptions 必须接 adminApi').toContain(
      'registerOptions: adminApi.webauthnRegisterOptions',
    )
    expect(src, 'registerVerify 必须接 adminApi').toContain(
      'registerVerify: adminApi.webauthnRegisterVerify',
    )
    // 登录两端点不得出现在本页（登录页专属，混入即职责错位）
    expect(src, '安全页不得调登录端点').not.toContain('webauthnLogin')
  })

  it('名称可留空（trim 后空串传 undefined，服务端回默认名）', () => {
    expect(src, '缺名称归一化').toContain('passkeyName.value.trim() || undefined')
  })

  it('成功/取消/失败三分支：成功提示、取消静默、失败 i18n 文案', () => {
    expect(src, '缺成功分支').toContain("t('security.passkey.registered')")
    expect(src, '缺取消静默（取消误报失败）').toContain('if (res.cancelled) return')
    expect(src, '缺失败分支 i18n').toContain("t('security.passkey.failed')")
  })

  it('页面里不得硬编码中文提示（必须走 i18n）', () => {
    // 模板可见文案全部经 t()；这里只防新代码绕过 i18n 直接写中文串
    const visible = src
      .split('\n')
      .filter((l) => l.includes('>') && /[\u4e00-\u9fff]/.test(l))
      .filter((l) => !l.includes('t('))
    expect(visible, '模板里有未走 i18n 的中文字面量: ' + visible.join(' | ')).toEqual([])
  })
})

describe('security.passkey 的 i18n key（5 门语言全量）', () => {
  const KEYS = [
    'title',
    'adminOnly',
    'desc',
    'namePlaceholder',
    'register',
    'registered',
    'failed',
  ] as const

  const LOCALES: Record<string, Record<string, Record<string, unknown>>> = {
    'zh-CN': zhCN as never,
    'en-US': enUS as never,
    'ja-JP': jaJP as never,
    'ru-RU': ruRU as never,
    'de-DE': deDE as never,
  }

  it('每个语种的 security.passkey 都登记了全部 7 个 key', () => {
    for (const [code, messages] of Object.entries(LOCALES)) {
      const passkey = (messages.security?.passkey ?? {}) as Record<string, unknown>
      for (const k of KEYS) {
        expect(passkey[k], '语种 ' + code + ' 缺 security.passkey.' + k).toBeTruthy()
      }
    }
  })

  it('消费点在源码里引用了全部 key（防死键）', () => {
    for (const k of KEYS) {
      expect(src, 'security.passkey.' + k + ' 未被引用').toContain('security.passkey.' + k)
    }
  })
})
