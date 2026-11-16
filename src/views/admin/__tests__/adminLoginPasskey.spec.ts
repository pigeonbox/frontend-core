// 管理员 Passkey 登录守卫（frontend-core#118，配合 core#160 四端点）。
//
// 为什么是源码级断言：本仓**没有组件测试基建**（无 @vue/test-utils / jsdom，
// 见 utils/__tests/sourceScan.ts 头注）⇒ 视图层守卫只能做源码级；流程真逻辑
// （登记成功/失败、登录成功/失败、降级）在 utils/webauthn.spec.ts 用 credentials
// API 桩跑真单测，本文件只钉「视图接线没被删/没走样」。负对照已实跑：把
// v-if 降级、loginWithPasskey 调用、cancelled 静默、i18n key 任一删掉 ⇒ 对应用例变红。
import { describe, it, expect } from 'vitest'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import ruRU from '@/i18n/locales/ru-RU'
import deDE from '@/i18n/locales/de-DE'

const PAGE = 'views/admin/Login.vue'
// 剥注释后再判：注释里贴的示例代码不能当真代码（sourceScan 头注同口径）
const src = stripComments(readSrc(PAGE))

describe('管理员登录页 Passkey 接线', () => {
  it('入口由降级判据 v-if 控制（不支持 ⇒ 整块不渲染、不报错）', () => {
    expect(src, '缺 v-if 降级开关').toContain('v-if="passkeyAvailable"')
    expect(src, 'passkeyAvailable 必须来自 isWebAuthnAvailable（安全上下文+API 双判据）').toContain(
      'isWebAuthnAvailable()',
    )
    // 隐藏必须是渲染期判据而非恒 true（否则老浏览器照样看到按钮）
    expect(src).toMatch(/const passkeyAvailable\s*=\s*isWebAuthnAvailable\(\)/)
  })

  it('登录走 loginWithPasskey 两段流（username + 注入的 login API）', () => {
    expect(src, '缺流程调用').toContain('loginWithPasskey(')
    expect(src, 'login/options 需要用户名').toMatch(/loginWithPasskey\(\{\s*username,\s*api:\s*passkeyApi\s*\}\)/)
    expect(src, 'passkeyApi 必须接 core#160 的 login 两端点').toContain(
      'loginOptions: adminApi.webauthnLoginOptions',
    )
    expect(src).toContain('loginVerify: adminApi.webauthnLoginVerify')
    // 登记两段不得出现在登录页（register 挂 AdminMiddleware，未登录必然 401）
    expect(src, '登录页不得调登记端点').not.toContain('webauthnRegister')
  })

  it('用户名为空先拦（不发 options 请求），文案走 i18n', () => {
    expect(src, '缺 username 空值守卫').toContain('loginForm.username.trim()')
    expect(src, '缺空名提示 i18n').toContain("t('admin.adminLogin.passkeyUsernameFirst')")
  })

  it('用户取消（cancelled）静默，不落错误提示', () => {
    expect(src, '缺 cancelled 分支（取消会误报登录失败）').toContain('if (res.cancelled) return')
    expect(src, '失败才落 i18n 错误文案').toContain("t('admin.adminLogin.passkeyFailed')")
  })

  it('成功收尾与口令登录共用 completeAdminLogin（会话/角色确认一字不差）', () => {
    expect(src, '缺共用收尾函数').toContain('const completeAdminLogin = async')
    const calls = src.match(/await completeAdminLogin\(\)/g) ?? []
    expect(calls.length, '口令登录与 Passkey 登录必须都走它').toBeGreaterThanOrEqual(2)
    expect(src, '收尾里必须做角色确认（防普通用户入台）').toContain("role !== 'admin'")
  })
})

describe('admin.adminLogin 的 Passkey i18n key（5 门语言全量）', () => {
  const KEYS = ['passkeyDivider', 'passkeyLogin', 'passkeyUsernameFirst', 'passkeyFailed'] as const

  const LOCALES: Record<string, Record<string, Record<string, unknown>>> = {
    'zh-CN': zhCN as never,
    'en-US': enUS as never,
    'ja-JP': jaJP as never,
    'ru-RU': ruRU as never,
    'de-DE': deDE as never,
  }

  it('每个语种的 admin.adminLogin 都登记了全部 4 个 key', () => {
    for (const [code, messages] of Object.entries(LOCALES)) {
      const login = messages.admin?.adminLogin as Record<string, unknown> | undefined
      expect(login, '语种 ' + code + ' 缺 admin.adminLogin 段').toBeTruthy()
      for (const k of KEYS) {
        expect(login?.[k], '语种 ' + code + ' 缺 admin.adminLogin.' + k).toBeTruthy()
      }
    }
  })

  it('每个 key 在源码里有真实引用（防死键）', () => {
    for (const k of KEYS) {
      expect(src, 'admin.adminLogin.' + k + ' 未被引用').toContain('admin.adminLogin.' + k)
    }
  })
})
