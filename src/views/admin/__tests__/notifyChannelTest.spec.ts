// 推送渠道「发送测试」按钮守卫（core#122 管理台尾巴）。
//
// 后端契约（A8 §2）：POST /admin/notify/channels/test，body {"channel":"webhook|
// telegram|bark"}；发送成功/失败都是 HTTP 200 + 全站信封——**渠道发送失败是测试的
// 结论**（data.ok=false + 脱敏摘要 error_summary），不是 API 错误；仅请求非法
// （缺 channel / 未知 channel）才 400 + 10001。
//
// 为什么是「源码级」：本仓**没有组件测试基建**（无 @vue/test-utils、无 jsdom，
// 见 src/utils/__tests__/sourceScan.ts 说明）⇒ 视图层只能做源码级断言，防的是
// 「重构时把三渠道测试入口/结论展示/手写 wire 类型删了」这类无声回归；
// 渲染正确性靠真机视觉自检。
//
// 守卫口径（均剥注释后扫描）：
//   ① 三渠道各有一个测试入口，且按渠道参数调用 doChannelTest（漏一个渠道 = 该
//      渠道永远没法验证）；
//   ② 每个按钮带**独立** loading（共用一个会让 A 渠道的测试转起 B 渠道的按钮）；
//   ③ 成功显示耗时 latency_ms、失败显示脱敏摘要 error_summary（ok=false 的
//      结论必须上屏，不能吞成通用「发送失败」）；
//   ④ api 层走 POST /admin/notify/channels/test 且 body 带 channel；
//   ⑤ wire 类型是手写副本且标注「core#122 待 IDL 化后替换为 contracts 生成类型」
//      （该路由暂未进 IDL ⇒ 手写是登记在案的债务，不是随手抄）；
//   ⑥ i18n：新增键 zh-CN 与 en-US 齐全且占位符一致（parity/drift 管其余语种）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const configVue = stripComments(readSrc('views/admin/Config.vue'))
const adminTs = stripComments(readSrc('api/admin.ts'))
// 注释标记须对**原始**源码断言（stripComments 会把标记所在的注释一起剥掉）
const adminTsRaw = readSrc('api/admin.ts')

/** 取语言包里点分路径的叶子值 */
const msg = (dict: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], dict)

const CHANNELS = ['webhook', 'telegram', 'bark'] as const

describe('发送测试按钮（三渠道各一发）', () => {
  it('webhook / telegram / bark 三个卡片各有测试入口，且按渠道参数调用', () => {
    for (const ch of CHANNELS) {
      expect(configVue, `${ch} 卡片应有 doChannelTest('${ch}') 测试入口`).toContain(
        `doChannelTest('${ch}')`,
      )
    }
  })

  it('每个按钮带独立 loading（channelTests.<渠道>.testing）', () => {
    for (const ch of CHANNELS) {
      // 按钮标签内同时出现 loading 绑定与点击调用（属性顺序无关）
      const re = new RegExp(
        `<el-button[^>]*(loading="channelTests\\.${ch}\\.testing"[^>]*doChannelTest\\('${ch}'\\)|doChannelTest\\('${ch}'\\)[^>]*loading="channelTests\\.${ch}\\.testing")`,
      )
      expect(configVue, `${ch} 的测试按钮必须带独立 loading`).toMatch(re)
    }
  })

  it('成功显示耗时 latency_ms、失败显示脱敏摘要 error_summary（结论内联上屏）', () => {
    for (const ch of CHANNELS) {
      expect(configVue, `${ch} 成功结论应显示 latency_ms`).toContain(
        `channelTestOk', { ms: channelTests.${ch}.latency_ms }`,
      )
      expect(configVue, `${ch} 失败结论应显示 error_summary`).toContain(
        `channelTestFailed', { error: channelTests.${ch}.error_summary }`,
      )
    }
  })

  it('渠道发送失败按「测试结论」处理：写入 done/ok/error_summary，而不是走错误 toast', () => {
    const at = configVue.indexOf('const doChannelTest')
    expect(at, '应存在 doChannelTest 实现').toBeGreaterThan(-1)
    const body = configVue.slice(at, configVue.indexOf('\nconst ', at + 1))
    expect(body).toMatch(/st\.done\s*=\s*true/)
    expect(body).toMatch(/st\.ok\s*=\s*Boolean\(res\.data\.ok\)/)
    expect(body).toMatch(/st\.error_summary\s*=\s*res\.data\.error_summary/)
    // ok=false 的分支不得抛给 handleError（那是 API 错误通道）
    expect(body).not.toMatch(/if\s*\(\s*!res\.data\.ok\s*\)[\s\S]{0,80}handleError/)
  })
})

describe('api 层契约（手写 wire 类型）', () => {
  it('testNotifyChannel 走 POST /admin/notify/channels/test 且 body 带 channel', () => {
    const at = adminTs.indexOf('testNotifyChannel')
    expect(at, 'adminApi 应有 testNotifyChannel').toBeGreaterThan(-1)
    const body = adminTs.slice(at, adminTs.indexOf('\n  },', at))
    expect(body).toContain("url: '/admin/notify/channels/test'")
    expect(body).toMatch(/method:\s*'POST'/)
    expect(body).toMatch(/data:\s*\{\s*channel\s*\}/)
  })

  it('结果类型含 ok / latency_ms / error_summary 三键（与 A8 §2 契约一致）', () => {
    const at = adminTs.indexOf('interface NotifyChannelTestResult')
    expect(at, '应有 NotifyChannelTestResult 手写类型').toBeGreaterThan(-1)
    const body = adminTs.slice(at, adminTs.indexOf('\n}', at))
    for (const f of ['ok: boolean', 'latency_ms: number', 'error_summary: string']) {
      expect(body, `NotifyChannelTestResult 缺 ${f}`).toContain(f)
    }
    expect(adminTs).toMatch(/type\s+NotifyTestChannel\s*=\s*'webhook'\s*\|\s*'telegram'\s*\|\s*'bark'/)
  })

  it('手写副本必须标注「core#122 待 IDL 化后替换为 contracts 生成类型」', () => {
    expect(adminTsRaw).toContain('core#122 待 IDL 化后替换为 contracts 生成类型')
  })
})

describe('发送测试 i18n', () => {
  const KEYS = [
    'admin.configPage.notify.channelTest',
    'admin.configPage.notify.channelTestSend',
    'admin.configPage.notify.channelTestOk',
    'admin.configPage.notify.channelTestFailed',
  ]

  it('zh-CN 与 en-US 的键齐全且非空', () => {
    for (const k of KEYS) {
      for (const [name, dict] of [
        ['zh-CN', zhCN],
        ['en-US', enUS],
      ] as const) {
        const v = msg(dict, k)
        expect(typeof v, `${name} 缺键或类型不对：${k}`).toBe('string')
        expect((v as string).length, `${name} 键值为空：${k}`).toBeGreaterThan(0)
      }
    }
  })

  it('占位符一致：channelTestOk 带 {ms}，channelTestFailed 带 {error}', () => {
    for (const dict of [zhCN, enUS]) {
      expect(String(msg(dict, 'admin.configPage.notify.channelTestOk'))).toContain('{ms}')
      expect(String(msg(dict, 'admin.configPage.notify.channelTestFailed'))).toContain('{error}')
    }
  })
})
