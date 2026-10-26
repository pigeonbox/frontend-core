// 用户端**窄屏可用性**不变量守卫（2026-10-24 真机 390px 实测出的事故）。
//
// 实测事故：手机（390×844）打开「取件历史」页 ⇒
//   - 表格 7 列共 1160px，而视口只有 ~374px ⇒ 右侧列（文件名 / 累计次数 /
//     **取件明细**）被**裁掉**，且 Element Plus 的横向滚动条在手机上几乎看不见
//     ⇒ 页面基本不可用（看不到是谁取走了、看���了几次、看不到逐条明细）；
//   - 修法：≤768px 改**卡片形态**（每条分享一张卡，信息完整、无横滑）。
//
// 本守卫断言**源码里这两条规则仍在**（项目没有浏览器级 CI，渲染正确性靠真机
// 视觉自检；此处防的是「重构时把媒体查询删了/覆盖了」这类无声回归）。
//
// 附一条踩过的坑：卡片里 `.pickup-card-label` 的 `flex: 0 0 76px` 在**行方向**
// 容器里是固定**宽**，但明细那一行是**列方向**容器 ⇒ flex-basis 变成**高度**
// ⇒ 标签下方空出一条 76px 的空白带（真机截图看出来的）⇒ 需要在列方向里复位。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { narrowBlock, listSrcFiles, readSrc } from '@/utils/__tests__/sourceScan'

const here = dirname(fileURLToPath(import.meta.url))
// here = src/views/user/__tests__ ⇒ 上溯三级到 src/
const srcRoot = resolve(here, '..', '..', '..')
const read = (rel: string) => readFileSync(resolve(srcRoot, rel), 'utf8')

/**
 * 取文件中第一个「≤某断点」媒体查询块的内容（按大括号配对截取，避免正则截断）。
 * 断点参数化（2026-10-26 折叠屏适配）：取件历史页的表格→卡片断点已提到
 * **1024px**（本表 7 列 ≈1160px ⇒ 折叠屏展开态 690~900 CSS px 一样放不下）。
 */
function narrowBlockLocal(source: string, breakpoint = '768px'): string {
  return narrowBlock(source, breakpoint)
}

describe('取件历史页窄屏可用性', () => {
  it('≤1024px 必须隐藏表格（7 列 1160px 在手机/折叠屏展开态都被裁，右侧列看不到）', () => {
    const s = read('views/user/History.vue')
    // 断点 1024px：折叠屏展开态内屏 690~900 CSS px、平板竖屏、桌面小窗分屏
    // 都落在 769~1024px ⇒ 本表（7 列 ≈1160px）一样放不下。
    const block = narrowBlockLocal(s, '1024px')
    expect(block, '窄屏下 .history-table 必须 display: none').toMatch(
      /\.history-table[\s\S]*?display:\s*none/
    )
  })

  it('≤1024px 必须显示卡片形态（信息完整、无横滑）', () => {
    const s = read('views/user/History.vue')
    const block = narrowBlockLocal(s, '1024px')
    expect(block, '窄屏下 .pickup-cards 必须显示').toMatch(
      /\.pickup-cards[\s\S]*?display:\s*flex/
    )
    expect(s, '宽屏默认不显示卡片（避免两套形态同时出现）').toMatch(
      /\.pickup-cards\s*\{[\s\S]*?display:\s*none;/
    )
  })

  it('卡片必须承载逐条取件明细（IP / 时间 / 交付面）', () => {
    const s = read('views/user/History.vue')
    expect(s, '卡片里应渲染 pickups 明细列表').toContain('pickup-card-list')
    expect(s, '明细行应展示取件人 IP').toMatch(/pickup-card-list[\s\S]*?\{\{\s*p\.ip/)
    expect(s, '明细行应展示交付面').toMatch(/pickup-card-list[\s\S]*?channelLabel\(p\.channel\)/)
  })

  it('列方向容器里必须复位标签的 flex-basis（否则标签下方空 76px）', () => {
    const s = read('views/user/History.vue')
    expect(s, '明细行是列方向 ⇒ 标签的 flex-basis 需复位为 auto').toMatch(
      /\.pickup-card-detail \.pickup-card-label[\s\S]*?flex:\s*0\s+0\s+auto/
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 用户端**表格页必须有窄屏卡片形态**（2026-10-26 审计 P1 / 缺陷 5 + 13）
//
// 事故形态：API 密钥页 8 列 ≈1210px、寄件请求页 5 列 ≈790px ⇒ ≤1024px
// （手机 / 折叠屏内屏 / 平板竖屏）放不下 ⇒ 右侧固定列盖住相邻列、其余列横向
// 裁掉（Element Plus 横向滚动条在手机上几乎看不见）⇒ 用户看不到密钥名 /
// 前缀 / 状态。
//
// 本守卫是**枚举式**的：遍历 src/views/user/*.vue，**凡含 <el-table 的页面**
// 都必须命中卡片形态（挂 <NarrowCardList>，或自带 ≤1024px 的隐藏+卡片规则），
// 且必须有卡片字段策展。⇒ 新增一个表格页忘接卡片形态 ⇒ 直接红。
//
// 附：v0.11.31 已给 user/Shares.vue 落地了同款卡片形态，但**没有任何断言**
// ⇒ 可无声回退；本次一并纳入枚举（缺陷 13）。
// ─────────────────────────────────────────────────────────────────────────────

/** 页面命中卡片形态的两种口径：① 挂 NarrowCardList 组件；② 自带 ≤1024px 互斥 CSS */
function hasCardForm(src: string): boolean {
  if (src.includes('<NarrowCardList')) return true
  const block = narrowBlock(src, '1024px')
  if (!block) return false
  const hidesTable = /display:\s*none/.test(block)
  const showsCards = /display:\s*flex/.test(block)
  return hidesTable && showsCards
}

describe('用户端表格页窄屏卡片形态（枚举式）', () => {
  const userPages = listSrcFiles().filter(
    (f) => f.startsWith('views/user/') && f.endsWith('.vue') && !f.includes('__tests__'),
  )
  const tablePages = userPages.filter((f) => readSrc(f).includes('<el-table'))

  it('至少枚举到 4 个用户端表格页（枚举本身不能空转）', () => {
    expect(tablePages.length, '用户端表格页枚举为空 ⇒ 扫描口径坏了').toBeGreaterThanOrEqual(4)
  })

  it('凡含 <el-table> 的用户端页面都必须命中窄屏卡片形态', () => {
    const offenders = tablePages.filter((f) => !hasCardForm(readSrc(f)))
    expect(
      offenders,
      `以下用户端页面有表格但没有窄屏卡片形态（≤1024px 会被裁）：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('挂 NarrowCardList 的页面必须做字段策展（fields）且表格带 admin-table-wide', () => {
    for (const f of tablePages) {
      const src = readSrc(f)
      if (!src.includes('<NarrowCardList')) continue
      expect(src, `${f} 未 import NarrowCardList 组件`).toContain(
        "import NarrowCardList from '@/components/admin/NarrowCardList.vue'",
      )
      expect(src, `${f} 的表格未加 class="admin-table-wide" ⇒ 窄屏会显示被裁切的表格`).toMatch(
        /<el-table[\s\S]{0,300}?class="[^"]*\badmin-table-wide\b/,
      )
      expect(src, `${f} 缺少卡片字段策展（cardFields = computed(() => [...])）`).toMatch(
        /cardfields = computed\(\(\) => \[\s*\{ key:/i,
      )
    }
  })

  it('全局样式必须保留「表格隐藏 / 卡片显示」的互斥开关（≤1024px）', () => {
    // NarrowCardList 形态的用户端页面靠**全局** .admin-table-wide / .narrow-cards
    // 互斥（表格在页面组件、卡片在 NarrowCardList 组件 ⇒ 只能放全局）。
    const s = read('styles/main.scss')
    const block = narrowBlock(s, '1024px')
    expect(block, '窄屏必须把 .admin-table-wide（表格）隐藏').toMatch(
      /\.admin-table-wide\s*\{[^}]*display:\s*none\s*!important/
    )
    expect(block, '窄屏必须把 .narrow-cards（卡片）显示出来').toMatch(
      /\.narrow-cards\s*\{[^}]*display:\s*flex/
    )
  })

  it('v0.11.31 落地的 Shares.vue 卡片形态必须在枚举内且有 ≤1024px 隐藏规则（缺陷 13）', () => {
    expect(tablePages, 'Shares.vue 应在用户端表格页枚举内').toContain('views/user/Shares.vue')
    const s = readSrc('views/user/Shares.vue')
    const block = narrowBlock(s, '1024px')
    expect(block, 'Shares.vue ≤1024px 必须隐藏表格').toMatch(
      /\.shares-table[\s\S]*?display:\s*none/
    )
    expect(block, 'Shares.vue ≤1024px 必须显示卡片').toMatch(
      /\.shares-cards[\s\S]*?display:\s*flex/
    )
  })
})

