// OIDC 回调页的二验分支（frontend-core#108 / core#180）。
//
// 本仓无组件测试基建（见 utils/__tests__/sourceScan.ts 头注）⇒ 视图层做源码级
// 断言，防的是「重构时把二验分支删了/顺序摆错」这类无声回归；渲染与交互靠真机
// 验证（评审 P0 验收：有码通过 / 错码重试 / 刷新恢复）。
import { describe, it, expect } from 'vitest'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const SRC = stripComments(readSrc('views/user/OidcCallback.vue'))

describe('OIDC 回调页：半会话必须先换发，不得当成已登录', () => {
  it('识别 mfa_pending 并进入二验分支', () => {
    expect(SRC).toContain('isMfaPending(route.query)')
    expect(SRC).toMatch(/mfaPending\.value = true/)
  })

  it('二验分支命中后**早退**，不得走到 enterApp（半会话恒 401）', () => {
    // 只看 onMounted 内部：enterApp 定义在文件前部，用全文下标会被定义位置误导
    const body = SRC.slice(SRC.indexOf('onMounted(async () =>'))
    const mfaIdx = body.indexOf('isMfaPending(route.query)')
    expect(mfaIdx, '缺半会话分支').toBeGreaterThan(-1)
    const earlyReturn = body.indexOf('return', mfaIdx)
    expect(earlyReturn, '半会话分支缺 return（会继续走 enterApp）').toBeGreaterThan(mfaIdx)
    const enterIdx = body.indexOf('await enterApp()')
    expect(enterIdx, '缺正常回调分支').toBeGreaterThan(earlyReturn)
  })

  it('换发端点走 /api/v1/user/oidc/mfa（半会话唯一可达的业务面）', () => {
    expect(readSrc('api/user.ts')).toContain("url: '/api/v1/user/oidc/mfa'")
    expect(SRC).toContain('userApi.oidcMfaComplete(')
  })

  it('三个服务端码分别处理：40012 缺码留框 / 40013 错码清空 / 401 半会话失效回登录', () => {
    expect(SRC).toContain('code === 40012')
    expect(SRC).toContain('code === 40013')
    expect(SRC).toContain('code === 401')
    expect(SRC).toContain("t('login.oidcCallback.mfaRequired')")
    expect(SRC).toContain("t('login.oidcCallback.mfaInvalid')")
    expect(SRC).toContain("t('login.oidcCallback.mfaExpired')")
  })

  it('换发成功后沿用 applyExternalSession 灌会话（不能直写 localStorage）', () => {
    expect(SRC).toMatch(/applyExternalSession\(\s*res\.data\s*\)/)
  })

  it('成功后从地址栏摘掉 mfa_pending（刷新不再回到二验页）', () => {
    expect(SRC).toContain("stripQueryParams(location.hash, ['mfa_pending', 'token'])")
  })
})
