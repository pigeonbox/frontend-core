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

/** 正则字面量起始的判据：前一个非空字符是这些时，`/` 开始的是正则而不是除法 */
const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])

/**
 * 去掉 JS 行注释 / 块注释与 HTML 注释。
 *
 * 源码扫描**必须**先剥注释：否则注释里写的示例代码（`t(...) || row.type` 之类）
 * 会被当成真代码 ⇒ 误报。
 *
 * ⚠️ 必须**单遍扫描**，不能「先正则剥块注释、再正则剥行注释」（2026-11-07 修复）：
 * 那个写法会先看到行注释**正文里**的「斜杠加星号」，把它当成块注释开头，然后
 * 一路吞到几百行之后的下一个「星号加斜杠」—— src/views/user/History.vue 实测因此从 430 行被吃到
 * 197 行，而所有源码级守卫（含 parity 的字面量 t() 扫描）都会**静默跳过**被吃掉
 * 的那 233 行（守卫全绿，代码没人看）。
 *
 * 单遍扫描同时解决另外两个同类问题：字符串字面量里的双斜杠（URL、正则串）与
 * 模板串里的「斜杠加星号」都不是注释。正则字面量按「前一个非空字符」启发式识别，
 * 免得转义过的双斜杠正则被当成行注释开头。
 */
export function stripComments(src: string): string {
  const out: string[] = []
  const n = src.length
  let i = 0
  // prevSig：上一个非空白字符，用于正则字面量的启发式判定
  let prevSig = ''
  const push = (s: string) => {
    out.push(s)
    for (let k = s.length - 1; k >= 0; k--) {
      const ch = s[k] as string
      if (!/\s/.test(ch)) {
        prevSig = ch
        break
      }
    }
  }

  while (i < n) {
    const c = src[i] as string

    // HTML 注释（.vue 模板里的 <!-- -->）
    if (c === '<' && src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4)
      i = end < 0 ? n : end + 3
      out.push(' ')
      prevSig = ' '
      continue
    }

    // 字符串 / 模板串：整体保留（里面的 // 与 /* 都不是注释）
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === c) {
          j++
          break
        }
        j++
      }
      push(src.slice(i, j))
      i = j
      continue
    }

    // 正则字面量：只在「前一个字符是运算符/开括号/行首」时才可能开始
    if (c === '/' && (prevSig === '' || REGEX_PREV.has(prevSig)) && src[i + 1] !== '/' && src[i + 1] !== '*') {
      let j = i + 1
      let inClass = false
      let closed = false
      while (j < n) {
        const ch = src[j] as string
        if (ch === '\\') {
          j += 2
          continue
        }
        if (ch === '[') inClass = true
        else if (ch === ']') inClass = false
        else if (ch === '/' && !inClass) {
          j++
          closed = true
          break
        } else if (ch === '\n') {
          break
        }
        j++
      }
      if (closed) {
        push(src.slice(i, j))
        i = j
        continue
      }
      // 不是正则（没闭合）⇒ 按普通字符处理，落回下面的分支
    }

    // 行注释
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }

    // 块注释
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      out.push(' ')
      prevSig = ' '
      continue
    }

    push(c)
    i++
  }
  return out.join('')
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
  const at = source.indexOf('@media (max-width: ' + breakpoint + ')')
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
