// 源码级守卫的共用工具。
//
// 为什么是「源码级」：本仓**没有组件测试基建**（无 @vue/test-utils、无 jsdom
// 环境）⇒ 视图层只能做源码级断言（防的是「重构时把守卫点删了」这类无声回归，
// 渲染正确性靠真机视觉自检）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// here = src/utils/__tests__ ⇒ 上溯两级到 src/
export const srcRoot = resolve(here, '..', '..')

/** 读 src/ 下的相对路径文件 */
export const readSrc = (rel: string): string => readFileSync(resolve(srcRoot, rel), 'utf8')

/** 递归列出 src/ 下所有 .ts/.vue 文件（相对 srcRoot 的路径） */
export function listSrcFiles(dir = srcRoot, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) listSrcFiles(p, out)
    else if (/\.(ts|vue)$/.test(p)) out.push(relative(srcRoot, p))
  }
  return out
}

/**
 * 去掉 JS 行注释 / 块注释与 HTML 注释。
 *
 * 源码扫描**必须**先剥注释：否则注释里写的示例代码（`t(...) || row.type` 之类）
 * 会被当成真代码 ⇒ 误报。
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
}

/** 返回与 src[open]（必须是 '{'）配对的 '}' 下标；找不到返回 -1 */
export function matchBrace(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export interface TryBlock {
  /** try {...} 的内容 */
  tryBody: string
  /** catch {...} 的内容（没有 catch 则为空串） */
  catchBody: string
}

/**
 * 提取源码里所有 `try { … } catch (e) { … }` 的 try 体与 catch 体。
 *
 * 用途：断言「每个发请求的 try 都必须有错误反馈（handleError）」——
 * 这类契约只能靠「把 try/catch 拆开逐块看」表达。
 */
export function tryBlocks(src: string): TryBlock[] {
  const out: TryBlock[] = []
  const re = /\btry\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('{', m.index)
    const end = matchBrace(src, open)
    if (end < 0) break
    const after = src.slice(end + 1)
    const cm = /^\s*catch\s*(?:\([^)]*\))?\s*\{/.exec(after)
    if (!cm) {
      re.lastIndex = end
      continue
    }
    const cOpen = after.indexOf('{', cm.index)
    const cEnd = matchBrace(after, cOpen)
    out.push({
      tryBody: src.slice(open + 1, end),
      catchBody: cOpen < 0 || cEnd < 0 ? '' : after.slice(cOpen + 1, cEnd),
    })
    re.lastIndex = end
  }
  return out
}

/** 取文件中第一个「≤某断点」媒体查询块的内容（按大括号配对截取，避免正则截断） */
export function narrowBlock(source: string, breakpoint = '768px'): string {
  const at = source.indexOf(`@media (max-width: ${breakpoint})`)
  if (at < 0) return ''
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
