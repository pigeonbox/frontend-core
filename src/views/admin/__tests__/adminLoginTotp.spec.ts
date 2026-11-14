// 管理员登录统一 MFA 守卫（2026-11-14 评审 S01 Task 7）。
//
// 事故形态：TOTP 只在用户登录（finishLogin）里强制，`POST /admin/login` 完全
// 不查 TotpEnabled ⇒ 开了 MFA 的管理员账号绕后台登录即绕过二次验证。
// 服务端（core Step 3）补齐后，前端必须配套：
//   · 服务端对「口令已对、只缺码」回 40012（**不是**失败提示、不计锁定）
//     ⇒ 据此增量弹第二个输入框，不重置已填的用户名口令；
//   · 第二次提交带 `totp_code`（契约字段名，snake_case——camelCase 会被
//     thrift 绑定静默丢弃 ⇒ 永远 40012 死循环）；
//   · 40013 / 其余错误仍走既有 loginError 就地展示。
//
// 为什么是源码级断言：本仓**没有组件测试基建**（无 @vue/test-utils / jsdom，
// 见 utils/__tests__/sourceScan.ts 头注）⇒ 视图层守卫只能做源码级；渲染正确
// 性靠真机/浏览器视觉自检（AGENTS 前端规则）。负对照已实跑：把 40012 分支、
// totp_code 载荷、v-if 输入框、i18n key 任一删掉 ⇒ 对应用例变红。
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

describe('管理员登录 40012 → 第二阶段 TOTP 输入', () => {
  it('40012 判据与用户登录同形：error?.code === 40012 切 needTotp', () => {
    expect(src, '缺 40012 分支（开 MFA 的管理员将卡在错误提示上）').toContain(
      'error?.code === 40012',
    )
    expect(src, '40012 必须切到第二阶段').toContain('needTotp.value = true')
    // 提示走 i18n（不弹后端中文原文），并把焦点移到刚挂上的第二个输入框
    expect(src).toContain("t('admin.adminLogin.totpRequired')")
    expect(src, '第二阶段输入框由 v-if 挂载 ⇒ 必须下一帧再聚焦').toMatch(
      /setTimeout\(\(\)\s*=>\s*totpInputRef\.value\?\.focus\?\.\(\),\s*0\)/,
    )
  })

  it('40012 先于 401/400 的 loginError 兜底（否则二验框永远弹不出来）', () => {
    const at40012 = src.indexOf('=== 40012')
    const atLoginError = src.indexOf('loginError.value = error?.message')
    expect(at40012, '未找到 40012 判据').toBeGreaterThan(-1)
    expect(atLoginError, '未找到 401/400 loginError 兜底').toBeGreaterThan(-1)
    expect(at40012, '40012 必须先判，再落 loginError').toBeLessThan(atLoginError)
  })

  it('第二次提交才带 totp_code（首次不带 ⇒ 服务端回 40012；字段名必须 snake_case）', () => {
    // camelCase 的 totpCode 会被 thrift 绑定丢掉 ⇒ 永远缺码 40012 死循环
    expect(
      src,
      '载荷必须按 needTotp 条件带 totp_code: undefined/值（且仅在二阶段带值）',
    ).toMatch(/totp_code:\s*needTotp\.value\s*\?\s*loginForm\.totpCode\.trim\(\)\s*:\s*undefined/)
    // reactive 表单本体不得整体透传（否则会把 camelCase totpCode 也发出去）
    expect(src, '不得把 loginForm 整个对象当载荷').not.toMatch(
      /adminApi\.login\(\s*loginForm\s*\)/,
    )
  })

  it('模板有第二阶段输入框（v-if=needTotp + prop=totpCode + hint）', () => {
    expect(src, '缺 v-if 第二阶段表单项').toContain('v-if="needTotp"')
    expect(src, '缺 totpCode 校验绑定').toContain('prop="totpCode"')
    expect(src, '缺 TOTP 标签 i18n').toContain("t('admin.adminLogin.totpCode')")
    expect(src, '缺恢复码说明（.totp-hint）').toContain('totp-hint')
    expect(src, '缺聚焦锚点 ref').toContain('ref="totpInputRef"')
  })

  it('totpCode 规则只在第二阶段生效（v-if 卸载 ⇒ 未注册字段不参与校验）', () => {
    expect(src, 'rules 缺 totpCode').toContain('totpCode: [')
    expect(src, '规则文案必须走 admin.adminLogin.totpRule').toContain(
      "t('admin.adminLogin.totpRule')",
    )
  })
})

describe('admin.adminLogin 的 TOTP i18n key（5 门语言全量）', () => {
  const KEYS = [
    'totpCode',
    'totpCodePlaceholder',
    'totpRequired',
    'totpHint',
    'totpRule',
  ] as const

  const LOCALES: Record<string, Record<string, Record<string, unknown>>> = {
    'zh-CN': zhCN as never,
    'en-US': enUS as never,
    'ja-JP': jaJP as never,
    'ru-RU': ruRU as never,
    'de-DE': deDE as never,
  }

  it('每个语种的 admin.adminLogin 都登记了全部 5 个 key', () => {
    for (const [code, messages] of Object.entries(LOCALES)) {
      const block = (messages.admin?.adminLogin ?? {}) as Record<string, unknown>
      for (const key of KEYS) {
        expect(block[key], `语种 ${code} 缺 admin.adminLogin.${key}`).toBeTypeOf('string')
        expect(
          String(block[key]).length,
          `语种 ${code} 的 admin.adminLogin.${key} 是空串`,
        ).toBeGreaterThan(0)
      }
    }
  })
})
