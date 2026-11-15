// 运营解读视图（frontend-core#91）接线守卫。
//
// 本仓无组件测试基建（无 @vue/test-utils/jsdom）⇒ 视图层只能做源码级断言
// （与 dashboardErrorState.spec 同款；渲染正确性靠真机视觉自检）。
// 锁三件 parity/单测管不到的事：
//   ① 每个取数块都有独立错误标记且成功后复位（「没数据」≠「数据坏了」）；
//   ② 零新 wire——只调既有 adminApi，不新增请求路径；
//   ③ 五语包 insightsPage 命名空间齐 + 路由/菜单入口都接上。
import { describe, expect, it } from 'vitest'
import { readSrc } from '@/utils/__tests__/sourceScan'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import deDE from '@/i18n/locales/de-DE'
import ruRU from '@/i18n/locales/ru-RU'

const VIEW = readSrc('views/admin/Insights.vue')
const ROUTER = readSrc('router/index.ts')
const MENU = readSrc('views/admin/index.vue')

describe('运营解读视图：取数失败必须显式可见', () => {
  const CASES: Array<{ fn: string; flag: string; label: string }> = [
    { fn: 'fetchStats', flag: 'statsError', label: '概览指标' },
    { fn: 'fetchTrend', flag: 'trendError', label: '趋势' },
    { fn: 'fetchTransferWindow', flag: 'transferError', label: '传输日志窗口' },
    { fn: 'fetchActivityWindow', flag: 'activitiesError', label: '审计窗口' },
  ]

  /** 取 "const <name> = async" 起到下一个顶层声明之间的源码 */
  function fnBody(src: string, name: string): string {
    const start = src.indexOf('const ' + name + ' = async')
    expect(start, '应能定位 ' + name).toBeGreaterThan(-1)
    const next = src.indexOf('\nconst ', start + 1)
    const nextFn = src.indexOf('\nasync function ', start + 1)
    const end = [next, nextFn].filter((i) => i > 0).sort((a, b) => a - b)[0]
    return end === undefined ? src.slice(start) : src.slice(start, end)
  }

  for (const c of CASES) {
    it(c.label + '（' + c.fn + '）失败必须置位 ' + c.flag, () => {
      const body = fnBody(VIEW, c.fn)
      expect(body, c.fn + ' 的 catch 分支必须置位 ' + c.flag + '.value = true').toMatch(
        new RegExp('catch[\\s\\S]*?' + c.flag + '\\.value\\s*=\\s*true'),
      )
    })

    it(c.label + '（' + c.fn + '）成功后必须复位 ' + c.flag, () => {
      const body = fnBody(VIEW, c.fn)
      expect(body, c.fn + ' 成功路径必须复位 ' + c.flag + '.value = false').toMatch(
        new RegExp(c.flag + '\\.value\\s*=\\s*false'),
      )
    })
  }

  it('错误标记文案用 admin.loadFailed（与 Dashboard 同款，五语已备）', () => {
    expect(VIEW).toContain("t('admin.loadFailed')")
  })

  it('概览行渲染聚合错误标记（v-if 覆盖三个窗口错误）', () => {
    expect(VIEW).toContain('v-if="statsError || transferError || activitiesError"')
  })
})

describe('运营解读视图：零新 wire（只调既有 adminApi）', () => {
  it('不出现任何字面量请求路径（新端点必须先进 api/admin.ts 再走守卫）', () => {
    // 视图只允许 adminApi.xxx 调用；url: '/...' 形态一律不许出现在本文件
    expect(VIEW).not.toMatch(/url:\s*['"]\//)
    expect(VIEW).not.toContain('axios')
    expect(VIEW).not.toContain('fetch(')
  })

  it('五个数据源都是 adminApi 既有方法', () => {
    for (const m of ['getStats', 'getEnhancedStats', 'getStatsTrend', 'getTransferLogsList', 'getActivities']) {
      expect(VIEW, '应调用 adminApi.' + m).toContain('adminApi.' + m)
    }
  })

  it('图表复用仓内 TrendChart（不引图表库）', () => {
    expect(VIEW).toContain("from '@/components/TrendChart.vue'")
    expect(VIEW).not.toContain('echarts')
    expect(VIEW).not.toContain('chart.js')
    expect(VIEW).not.toContain('d3')
  })

  it('窗口聚合走 utils/opsInsights 纯函数（口径可单测）', () => {
    for (const f of ['hourHistogram', 'topShares', 'failureBreakdown', 'pickupRatePercent']) {
      expect(VIEW, '应引入 ' + f).toContain(f)
    }
  })
})

describe('运营解读视图：路由与菜单入口', () => {
  it('路由注册 AdminInsights，meta.title 指向 route.adminInsights', () => {
    expect(ROUTER).toContain("path: 'insights'")
    expect(ROUTER).toContain("name: 'AdminInsights'")
    expect(ROUTER).toContain("title: 'route.adminInsights'")
  })

  it('菜单「用户与运营」组挂 insights 入口（活动流之后）', () => {
    expect(MENU).toContain("adminBase + '/insights'")
    expect(MENU).toContain("t('admin.insights')")
    const activitiesAt = MENU.indexOf("adminBase + '/activities'")
    const insightsAt = MENU.indexOf("adminBase + '/insights'")
    expect(activitiesAt, '活动流入口应存在').toBeGreaterThan(-1)
    expect(insightsAt, '运营解读入口应存在').toBeGreaterThan(-1)
    expect(insightsAt, '运营解读应排在活动流之后').toBeGreaterThan(activitiesAt)
  })

  it('与 #93 取件时间线不重复：本页不碰 user/shares timeline 端点', () => {
    expect(VIEW).not.toContain('/timeline')
    expect(VIEW).not.toContain('userSharesApi')
  })
})

describe('运营解读五语包', () => {
  const LOCALES: Array<[string, Record<string, unknown>]> = [
    ['zh-CN', zhCN as Record<string, unknown>],
    ['en-US', enUS as Record<string, unknown>],
    ['ja-JP', jaJP as Record<string, unknown>],
    ['de-DE', deDE as Record<string, unknown>],
    ['ru-RU', ruRU as Record<string, unknown>],
  ]

  const EXPECTED = [
    'subtitle', 'refresh', 'source',
    'statPickupRate', 'statPickupRateHint',
    'statNeverPicked', 'statNeverPickedHint',
    'statTotalDownloads', 'statTotalDownloadsHint',
    'statWindowDownloads', 'transferNote',
    'trendTitle', 'range7d', 'range30d',
    'hourTitle', 'hourNote', 'topTitle',
    'failTitle', 'activityNote', 'failEmpty',
  ]

  const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? prefix + '.' + k : k
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(out, flatten(v as Record<string, unknown>, key))
      } else {
        out[key] = v
      }
    }
    return out
  }

  it('每个语种都有 admin.insightsPage 命名空间（20 键）与菜单/路由键', () => {
    for (const [code, msgs] of LOCALES) {
      const flat = flatten(msgs)
      for (const k of EXPECTED) {
        expect(flat['admin.insightsPage.' + k], code + ' 缺 admin.insightsPage.' + k).toBeDefined()
      }
      expect(flat['admin.insights'], code + ' 缺 admin.insights（菜单）').toBeDefined()
      expect(flat['route.adminInsights'], code + ' 缺 route.adminInsights').toBeDefined()
    }
  })

  it('带占位符的键占位符一致（{src}/{n}/{total}）', () => {
    const withPlaceholders: Record<string, string[]> = {
      'admin.insightsPage.source': ['src'],
      'admin.insightsPage.transferNote': ['n', 'total'],
      'admin.insightsPage.hourNote': ['n'],
      'admin.insightsPage.activityNote': ['n', 'total'],
    }
    const ph = (v: unknown): string[] =>
      [...String(v).matchAll(/\{\s*([a-zA-Z0-9_.]+)\s*\}/g)].map((m) => m[1] as string).sort()
    for (const [code, msgs] of LOCALES) {
      const flat = flatten(msgs)
      for (const [k, expected] of Object.entries(withPlaceholders)) {
        expect(ph(flat[k]).sort(), code + ' ' + k + ' 占位符').toEqual([...expected].sort())
      }
    }
  })
})
