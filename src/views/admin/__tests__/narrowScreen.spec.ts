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
