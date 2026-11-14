// OIDC 回调成功路径必须把会话灌进 store（frontend-core#95）。
//
// 事故形态：回调成功只直写 localStorage 的 fcb_session —— 而 isLoggedIn 依赖
// sessionActive ref（store 创建时读一次 localStorage，事后直写不翻转）⇒
// toast「登录成功」→ push 仪表盘 → Dashboard onMounted 判 !isLoggedIn →
// 弹回 /user/login（路由守卫读 localStorage 放行、页面组件拒绝——两套判据打架）。
//
// 本仓无组件测试基建（见 utils/__tests__/sourceScan.ts 头注）⇒ 视图层只能做源码级
// 断言；store 侧行为（isLoggedIn 翻转）由 stores/__tests__/user.spec.ts 锁。
import { describe, it, expect } from 'vitest'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const SRC = stripComments(readSrc('views/user/OidcCallback.vue'))

describe('OIDC 回调成功 → 会话进 store（frontend-core#95）', () => {
  it('成功分支调用 applyExternalSession(res.data)（userInfo+userRole+markSessionActive 一体灌入）', () => {
    expect(SRC).toMatch(/applyExternalSession\(\s*res\.data\s*\)/)
  })

  it('不再直写 localStorage 会话标记（直写不翻转 sessionActive ref ⇒ isLoggedIn 恒 false）', () => {
    expect(SRC).not.toMatch(/localStorage\.setItem\(\s*['"]fcb_session['"]/)
  })

  it('成功后跳仪表盘（Dashboard onMounted 的 isLoggedIn 判据此时为真，不被弹回）', () => {
    expect(SRC).toContain("router.push('/user/dashboard')")
  })
})
