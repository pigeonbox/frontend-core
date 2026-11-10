// 维护页 ClamAV 存活展示守卫（core#121 前端尾巴，A7 批建议）。
//
// 语义：ClamAV 是 **fail-open**——clamd 挂掉时文件照常放行、业务不阻断，但
// 「没在扫描」必须可见。视觉口径是 **WARN（非阻断红）**：放行是既定策略，
// 不是本站故障；红会让人误判为服务不可用。
//
// wire 契约（core bootstrap/diagnostics.go 的 DiagnosticsClamAV）：
//   /admin/diagnostics → moderation{enabled, clamav{enabled, addr?, last_ping?,
//   degraded, degraded_count, window_size, scans_in_window, hits_in_window,
//   skipped_in_window}}，last_ping{ok, at, duration_ms, error?}。
//   旧版服务端不带该段 ⇒ 「未取到 ≠ 未启用」（与 pb doctor 同口径）。
//
// 守卫口径（均剥注释后扫描）：
//   ① WARN 告警条存在且是 type="warning"（不是 error 红）；
//   ② 告警门条件 = present && enabled && degraded（缺段/未启用/探活正常都不出）；
//   ③ degraded_count > 0 时补「近 N 次扫描有 M 次放行」；last_ping.error 可直展；
//   ④ 系统信息行只在服务端上报了该段时渲染（v-if="clamav.present"）；
//   ⑤ 读数确实取自 moderation.clamav 的字段（degraded / degraded_count / last_ping）；
//   ⑥ i18n：新增键 zh-CN 与 en-US 齐全且占位符一致（parity/drift 管其余语种）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const maintVue = stripComments(readSrc('views/admin/Maintenance.vue'))

/** 取语言包里点分路径的叶子值 */
const msg = (dict: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], dict)

/** 取 ClamAV 告警条模板块（el-alert 起到配对 </el-alert>） */
function clamavAlertBlock(src: string): string {
  const at = src.indexOf('clamavDegradedTitle')
  expect(at, '模板应引用 clamavDegradedTitle').toBeGreaterThan(-1)
  const start = src.lastIndexOf('<el-alert', at)
  const end = src.indexOf('</el-alert>', at)
  expect(start, '应能定位 ClamAV 告警条').toBeGreaterThan(-1)
  return src.slice(start, end)
}

describe('维护页 ClamAV 存活展示（WARN 非阻断）', () => {
  it('告警条是 WARN 视觉（type="warning"，不是阻断红 type="error"）', () => {
    const block = clamavAlertBlock(maintVue)
    expect(block, 'ClamAV 告警条必须是 warning 级').toContain('type="warning"')
    expect(block, 'ClamAV 告警条不得是 error 级（放行是既定策略，不是本站故障）').not.toContain(
      'type="error"',
    )
  })

  it('告警门条件 = present && enabled && degraded（缺段/未启用/探活正常都不出）', () => {
    const block = clamavAlertBlock(maintVue)
    expect(block).toMatch(
      /v-if="clamav\.present && clamav\.enabled && clamav\.degraded"/,
    )
  })

  it('degraded_count > 0 时补「近 N 次扫描有 M 次放行」，last_ping.error 直展', () => {
    expect(maintVue).toMatch(/v-if="clamav\.degraded_count > 0"/)
    expect(maintVue).toContain(
      "clamavFailOpen', { total: clamav.scans_in_window, n: clamav.degraded_count }",
    )
    expect(maintVue).toContain("clamavPingError', { error: clamav.last_error }")
    expect(maintVue).toMatch(/v-if="clamav\.last_error"/)
  })

  it('系统信息行只在服务端上报了该段时渲染（未取到 ≠ 未启用）', () => {
    expect(maintVue).toMatch(/<el-descriptions-item v-if="clamav\.present"/)
  })

  it('读数取自 moderation.clamav 的 degraded / degraded_count / last_ping 字段', () => {
    expect(maintVue).toContain('res.data.moderation')
    expect(maintVue).toMatch(/clamav\.degraded = Boolean\(c\.degraded\)/)
    expect(maintVue).toMatch(/clamav\.degraded_count = c\.degraded_count/)
    expect(maintVue).toMatch(/c\.last_ping\?\.error/)
    expect(maintVue).toMatch(/c\.last_ping\?\.duration_ms/)
  })

  it('状态行文本三态：未启用 / 不可用（当前放行）/ 正常（带探活耗时）', () => {
    expect(maintVue).toContain("t('admin.maintenancePage.clamavDisabled')")
    expect(maintVue).toContain("t('admin.maintenancePage.clamavDegraded')")
    expect(maintVue).toContain("t('admin.maintenancePage.clamavHealthy', { ms: clamav.last_latency_ms })")
  })
})

describe('ClamAV 展示 i18n', () => {
  const KEYS = [
    'admin.maintenancePage.clamavTitle',
    'admin.maintenancePage.clamavDisabled',
    'admin.maintenancePage.clamavHealthy',
    'admin.maintenancePage.clamavDegraded',
    'admin.maintenancePage.clamavDegradedTitle',
    'admin.maintenancePage.clamavPingError',
    'admin.maintenancePage.clamavFailOpen',
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

  it('占位符一致：clamavHealthy 带 {ms}，clamavPingError 带 {error}，clamavFailOpen 带 {total}+{n}', () => {
    for (const dict of [zhCN, enUS]) {
      expect(String(msg(dict, 'admin.maintenancePage.clamavHealthy'))).toContain('{ms}')
      expect(String(msg(dict, 'admin.maintenancePage.clamavPingError'))).toContain('{error}')
      const failOpen = String(msg(dict, 'admin.maintenancePage.clamavFailOpen'))
      expect(failOpen).toContain('{total}')
      expect(failOpen).toContain('{n}')
    }
  })
})
