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

const here = dirname(fileURLToPath(import.meta.url))
// here = src/views/user/__tests__ ⇒ 上溯三级到 src/
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

describe('取件历史页窄屏可用性', () => {
  it('≤768px 必须隐藏表格（7 列 1160px 在手机上被裁，右侧列看不到）', () => {
    const s = read('views/user/History.vue')
    const block = narrowBlock(s)
    expect(block, '窄屏下 .history-table 必须 display: none').toMatch(
      /\.history-table[\s\S]*?display:\s*none/
    )
  })

  it('≤768px 必须显示卡片形态（信息完整、无横滑）', () => {
    const s = read('views/user/History.vue')
    const block = narrowBlock(s)
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
