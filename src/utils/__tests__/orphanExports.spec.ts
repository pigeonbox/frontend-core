// 孤儿导出扫描守卫（2026-10-26 审计 P2 · 缺陷 11）。
//
// 背景：本仓积累了一批**导出了却没人用**的死代码——`src/utils/sanitize.ts`
// （整文件无人引用，还让 `dompurify` 变成悬空依赖）、`keyFromHashQuery`、
// `PickupRecordView`、`BizError` / `onRejected` / `silentRequest` / `_silent`
// （后两个让后来者以为「静默请求」生效了）。⇒ 本守卫让**新增**死导出生不出来。
//
// 两条口径：
//   ① 符号级：src/utils 与 src/composables 的每个导出符号，在全仓**至少被
//      引用 1 次**（只在自己的定义处出现 ⇒ 从未被引用 ⇒ 死导出）。
//   ② 模块级：每个模块至少要有一个导出被**模块外**引用 ⇒ 抓「整文件死掉」
//      （如已删除的 composables/useTheme.ts：唯一导出 useTheme 全仓零引用）。
//
// 口径说明：计数前先**剥掉注释**（注释里提到的名字不算引用）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listSrcFiles, readSrc, stripComments, srcRoot } from '@/utils/__tests__/sourceScan'

const EXPORT_DECL_RE = /export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g
const EXPORT_LIST_RE = /export\s*\{([^}]*)\}/g

/** 定义文件集合：src/utils/*.ts 与 src/composables/*.ts（不含测试目录） */
const DEF_FILES = listSrcFiles().filter(
  (f) =>
    (f.startsWith('utils/') || f.startsWith('composables/')) &&
    f.endsWith('.ts') &&
    !f.includes('__tests__'),
)

/** 全仓源码（已剥注释），按相对路径索引 */
const ALL_FILES = listSrcFiles().map((f) => [f, stripComments(readSrc(f))] as const)

function exportedNames(src: string): string[] {
  const names = new Set<string>()
  let m: RegExpExecArray | null
  EXPORT_DECL_RE.lastIndex = 0
  while ((m = EXPORT_DECL_RE.exec(src)) !== null) names.add(m[1] ?? '')
  EXPORT_LIST_RE.lastIndex = 0
  while ((m = EXPORT_LIST_RE.exec(src)) !== null) {
    for (const part of (m[1] ?? '').split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (n) names.add(n)
    }
  }
  return [...names]
}

function occurrences(name: string, exceptFile?: string): number {
  const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')
  let total = 0
  for (const [f, src] of ALL_FILES) {
    if (f === exceptFile) continue
    total += (src.match(re) || []).length
  }
  return total
}

describe('孤儿导出扫描（utils/ 与 composables/）', () => {
  it('每个导出符号在全仓至少被引用 1 次（只定义没人用 ⇒ 死导出）', () => {
    expect(DEF_FILES.length, '应能枚举到 utils/ 与 composables/ 的模块').toBeGreaterThan(10)
    const dead: string[] = []
    for (const f of DEF_FILES) {
      for (const name of exportedNames(stripComments(readSrc(f)))) {
        // 全仓出现次数 > 1 ⇒ 除定义处外还有引用 ⇒ 不是死导出
        if (occurrences(name) <= 1) dead.push(`${f} :: ${name}`)
      }
    }
    expect(dead, `以下导出符号全仓从未被引用（死导出）：\n${dead.join('\n')}`).toEqual([])
  })

  it('每个模块至少有一个导出被模块外引用（抓「整文件死掉」）', () => {
    const deadModules: string[] = []
    for (const f of DEF_FILES) {
      const names = exportedNames(stripComments(readSrc(f)))
      const usedOutside = names.some((n) => occurrences(n, f) > 0)
      if (!usedOutside) deadModules.push(`${f}（导出：${names.join(', ') || '无'}）`)
    }
    expect(
      deadModules,
      `以下模块没有任何导出被外部引用（整文件死代码）：\n${deadModules.join('\n')}`,
    ).toEqual([])
  })

  it('已清理的死代码不得复活（sanitize.ts / dompurify / keyFromHashQuery / PickupRecordView）', () => {
    // 只扫**源码**（不含测试目录——本守卫自身在断言里提到这些名字）
    const all = ALL_FILES.filter(([f]) => !f.includes('__tests__'))
      .map(([, s]) => s)
      .join('\n')
    expect(all, 'sanitizeHtml 不得复活（仓内已无任何 v-html）').not.toContain('sanitizeHtml')
    expect(all, 'keyFromHashQuery 不得复活').not.toContain('keyFromHashQuery')
    expect(all, 'PickupRecordView 不得复活').not.toContain('PickupRecordView')
    expect(all, 'BizError 不得复活（从未被抛出 ⇒ instanceof 分支恒假）').not.toContain('BizError')
    expect(all, 'silentRequest 不得复活（_silent 全仓无读取点）').not.toContain('silentRequest')
  })

  it('package.json 不得再有 dompurify 依赖（唯一引用方 sanitize.ts 已删 ⇒ 悬空依赖）', () => {
    const pkg = JSON.parse(readFileSync(resolve(srcRoot, '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(
      Object.keys(pkg.dependencies ?? {}),
      'dompurify 是悬空依赖（仓内已无任何 v-html / sanitizeHtml）',
    ).not.toContain('dompurify')
  })
})
