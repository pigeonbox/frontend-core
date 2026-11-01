// 管理台仪表盘「取数失败」显式标记守卫（2026-10-26 审计 P0）。
//
// 事故形态：核心指标 / 最近用户 / 最近文件取数失败时，catch 只 console.error，
// 随后 stats.* 保持 0、recent* 置空 ⇒ 页面渲染「用户数 0 / 文件数 0 / 今日
// 上传 0」+ 空表格，与「站点真的没人用」**视觉上完全一致** ⇒ 管理员可能据此
// 误触发清理运维（把正常数据当垃圾清掉）。
//
// ⇒ 必须有**独立的错误标记**（与趋势图已有的 trendError 同构）。
//
// 本仓无浏览器级 CI ⇒ 渲染正确性靠真机视觉自检；此处做源码级断言，防的是
// 「重构时把错误标记删了」这类无声回归。
import { describe, it, expect } from 'vitest'
import { readSrc } from '@/utils/__tests__/sourceScan'

const DASH = readSrc('views/admin/Dashboard.vue')

/** 取 `const <name> = async` 起到下一个顶层 `const ` 之间的源码 */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = async`)
  expect(start, `应能定位 ${name}`).toBeGreaterThan(-1)
  const next = src.indexOf('\nconst ', start + 1)
  return next < 0 ? src.slice(start) : src.slice(start, next)
}

const CASES = [
  { fn: 'fetchDashboardStats', err: 'statsError', label: '核心指标' },
  { fn: 'fetchRecentUsers', err: 'recentUsersError', label: '最近用户' },
  { fn: 'fetchRecentFiles', err: 'recentFilesError', label: '最近文件' },
]

describe('管理台仪表盘取数失败标记', () => {
  for (const c of CASES) {
    it(`${c.label}（${c.fn}）取数失败必须置位 ${c.err}`, () => {
      const body = fnBody(DASH, c.fn)
      expect(body, `${c.fn} 的 catch 分支必须置位 ${c.err}.value = true`).toMatch(
        new RegExp(`catch[\\s\\S]*?${c.err}\\.value\\s*=\\s*true`),
      )
    })

    it(`${c.label} 成功后必须复位 ${c.err}（否则一次失败后永久显示错误）`, () => {
      const body = fnBody(DASH, c.fn)
      expect(body, `${c.fn} 成功路径必须复位 ${c.err}.value = false`).toMatch(
        new RegExp(`${c.err}\\.value\\s*=\\s*false`),
      )
    })

    it(`${c.label} 的模板必须渲染 ${c.err} 标记`, () => {
      expect(DASH, `模板必须渲染 v-if="${c.err}"`).toContain(`v-if="${c.err}"`)
      const at = DASH.indexOf(`v-if="${c.err}"`)
      expect(DASH.slice(at, at + 220), '错误标记文案应与趋势图同款：admin.loadFailed').toContain(
        "t('admin.loadFailed')",
      )
    })
  }

  it('错误标记文案 admin.loadFailed 必须在语言包里存在（否则渲染裸键名）', async () => {
    const zh = (await import('@/i18n/locales/zh-CN')).default as Record<string, unknown>
    const en = (await import('@/i18n/locales/en-US')).default as Record<string, unknown>
    const adminZh = zh.admin as Record<string, unknown>
    const adminEn = en.admin as Record<string, unknown>
    expect(adminZh.loadFailed, 'zh-CN 缺 admin.loadFailed').toBeTruthy()
    expect(adminEn.loadFailed, 'en-US 缺 admin.loadFailed').toBeTruthy()
  })
})
