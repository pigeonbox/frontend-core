// 管理台**窄屏可用性**不变量守卫（2026-10-24 真机 390px 实测出的事故）。
//
// 实测事故：手机（390×844）打开管理台「系统配置」页 ⇒
//   - 侧栏 240px 固定占位 ⇒ 内容区被压到 ~150px；
//   - 分区标题「上传与分享」**一字一行竖排**；
//   - 配置表单的输入框 **宽度为 0**（label-width="180px" 是写死在 el-form 上的
//     属性，媒体查询改不了）⇒ 手机上**一个设置项都改不了**。
//
// 修法（两处配套，缺一不可）：
//   ① views/admin/index.vue  ≤768px：侧栏脱离常规流（position: fixed + 抽屉化）
//      —— 否则内容区始终被侧栏吃掉，表单再窄也拿不回宽度；
//   ② views/admin/Config.vue  ≤768px：解除 .el-form-item__label 的固定宽度
//      （width: auto）并让 label 与 content 上下排列 —— 否则输入框宽度为 0。
//
// 本守卫断言**源码里这两条规则仍在**（项目没有浏览器级 CI，渲染正确性靠真机
// 视觉自检；此处防的是「重构时把媒体查询删了/覆盖了」这类无声回归）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// here = src/views/admin/__tests__ ⇒ 上溯三级到 src/
const srcRoot = resolve(here, '..', '..', '..')
const read = (rel: string) => readFileSync(resolve(srcRoot, rel), 'utf8')

/** 取文件中第一个 ≤768px 媒体查询块的内容（按大括号配对截取，避免正则截断） */
function narrowBlock(source: string): string {
  const at = source.indexOf('@media (max-width: 768px)')
  expect(at, '应存在 ≤768px 的窄屏媒体查询').toBeGreaterThan(-1)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return source.slice(open)
}

describe('管理台窄屏可用性', () => {
  it('侧栏在 ≤768px 必须脱离常规流（抽屉化），否则内容区被侧栏吃掉', () => {
    const s = read('views/admin/index.vue')
    const block = narrowBlock(s)
    expect(block, '窄屏下 .admin-aside 必须 position: fixed（脱离常规流）').toMatch(
      /\.admin-aside[\s\S]*?position:\s*fixed/
    )
    expect(block, '窄屏侧栏需用 transform 抽屉化（默认 translateX(-100%)）').toMatch(
      /translateX\(-100%\)/
    )
    expect(block, '抽屉打开态需 .open → translateX(0)').toMatch(
      /\.admin-aside\.open[\s\S]*?translateX\(0\)/
    )
    expect(s, '应有 .nav-toggle 汉堡按钮（宽屏隐藏、窄屏点亮）').toContain('nav-toggle')
  })

  it('配置表单标签在 ≤768px 必须解除固定宽度，否则输入框宽度为 0', () => {
    const s = read('views/admin/Config.vue')
    const block = narrowBlock(s)
    expect(block, '必须解除 .el-form-item__label 的固定宽度（width: auto !important）').toMatch(
      /\.el-form-item__label[\s\S]*?width:\s*auto\s*!important/
    )
    expect(block, '表单项需上下排列（display: block），否则标签与输入框仍并排挤占').toMatch(
      /\.el-form-item[\s\S]*?display:\s*block/
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 管理台窄屏「表格 → 卡片」形态（2026-10-25 真机 390/768 实测后落地）
//
// 实测事故：管理台 9 个表格页的列宽合计 ~990~1600px（Files 19 列 / TransferLogs 14
// / Activities·Dashboard 13 / Announcements·Users 12 / Moderation 10 / LocalFiles 8
// / Storage 6）⇒ ≤390px **只露得下 ID 列 + 固定右侧的操作列**，标题/类型/状态/时间等
// 内容列全被裁（横向滚动条在手机上几乎看不见）⇒ 手机上等于不可用；≤768px 固定操作列
// 还盖住相邻的「状态」列。
//
// 修法：CSS 双形态（表格与卡片**同时渲染**，≤768px 互斥显示）——表格加
// `.admin-table-wide`，页面再挂 `<NarrowCardList>`（字段策展后的卡片列表）。
//
// 本守卫断言**每个含表格的管理台页面都接了这套形态**，防止「以后新增一个表格页
// 又忘了接 ⇒ 窄屏静默不可用」——这类回归正是本轮要根治的。
// ─────────────────────────────────────────────────────────────────────────────
const TABLE_PAGES = [
  'Files.vue',
  'Users.vue',
  'Activities.vue',
  'Announcements.vue',
  'Moderation.vue',
  'LocalFiles.vue',
  'Storage.vue',
  'TransferLogs.vue',
  'Dashboard.vue',
]

describe('管理台窄屏卡片形态', () => {
  it('每个含表格的管理台页面都必须：表格加 .admin-table-wide + 挂 NarrowCardList + 有字段策展', () => {
    for (const page of TABLE_PAGES) {
      const s = read(`views/admin/${page}`)
      expect(s, `${page} 应含 el-table（清单与实现不一致，请同步 TABLE_PAGES）`).toContain('<el-table')
      expect(
        s,
        `${page} 的表格未加 class="admin-table-wide" ⇒ 窄屏会显示被裁切的表格`
      ).toMatch(/<el-table[\s\S]{0,200}?class="[^"]*\badmin-table-wide\b/)
      expect(s, `${page} 未挂 <NarrowCardList> ⇒ 窄屏没有卡片形态`).toContain('<NarrowCardList')
      expect(
        s,
        `${page} 未 import NarrowCardList 组件`
      ).toContain("import NarrowCardList from '@/components/admin/NarrowCardList.vue'")
      expect(
        s,
        `${page} 缺少卡片字段策展（cardFields = computed(() => [...])）`
      ).toMatch(/cardfields = computed\(\(\) => \[\s*\{ key:/i)
    }
  })

  it('全局样式必须保留「表格隐藏 / 卡片显示」的互斥开关', () => {
    const s = read('styles/main.scss')
    const block = narrowBlock(s)
    expect(block, '窄屏必须把 .admin-table-wide（表格）隐藏').toMatch(
      /\.admin-table-wide\s*\{[^}]*display:\s*none\s*!important/
    )
    expect(block, '窄屏必须把 .narrow-cards（卡片）显示出来').toMatch(
      /\.narrow-cards\s*\{[^}]*display:\s*flex/
    )
    // 宽屏默认隐藏卡片（否则宽屏会同时看到表格与卡片）
    const beforeMedia = s.slice(0, s.indexOf('@media (max-width: 768px)'))
    expect(beforeMedia, '宽屏必须默认隐藏 .narrow-cards').toMatch(
      /\.narrow-cards\s*\{\s*display:\s*none;\s*\}/
    )
  })

  it('仪表盘的栅格必须带 xs 断点，否则窄屏两栏并排 ⇒ 字段竖排成一字一行', () => {
    const s = read('views/admin/Dashboard.vue')
    const cols = s.match(/<el-col[^>]*>/g) || []
    expect(cols.length, 'Dashboard 应含 el-col 栅格').toBeGreaterThan(0)
    for (const c of cols) {
      expect(c, `Dashboard 的 el-col 缺 :xs 断点（窄屏不堆叠）：${c}`).toContain(':xs=')
    }
  })
})
