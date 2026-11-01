// SFC **纯 CSS** 样式块的语法守卫（2026-10-25 实录事故）。
//
// 实测事故：本仓 `src/views/user/History.vue` 的 `<style scoped>`（**纯 CSS**，非
// scss）里被我写了**双斜杠行注释** ⇒ `//` 在纯 CSS 里不合法 ⇒ **SFC 编译直接失败**
// （"[vite:vue] Unexpected '/'")：
//   · 本仓 CI 的 `npm run build` 红了 ✔（门禁**有效**）；
//   · 壳仓（frontend）的构建也红了（壳仓直接编译 core 的源码）✔；
//   · 但**坏的 tgz 已经被发布**（v0.11.24）—— 因为 `npm pack` 只打包源码、
//     **不编译 SFC** ⇒ 编译期错误被原样打进产物。
//
// ⇒ 两道防线（本文件 + release.yml 的「发布前构建闸门」）分别解决
// 「早发现」与「不发坏产物」。
//
// ⚠️ 为什么单测/typecheck 盖不住：`vue-tsc` **不编译 <style> 块**，vitest 也不
//   解析它 ⇒ 「211 例绿 + typecheck 绿」与「产物能不能构建」**是两件事**。
//   ⇒ 这类问题只能由**源码级扫描**或**真跑 build** 拦住。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// here = src/utils/__tests__ ⇒ 上溯两级到 src/
const srcRoot = resolve(here, '..', '..')

/** 递归收集 src 下的 .vue 文件 */
function collectVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collectVue(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 取出所有 <style> 块；lang 缺省即**纯 CSS**（双斜杠注释不合法） */
function styleBlocks(src: string): { attrs: string; body: string }[] {
  const out: { attrs: string; body: string }[] = []
  const re = /<style([^>]*)>([\s\S]*?)<\/style>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    out.push({ attrs: m[1] ?? '', body: m[2] ?? '' })
  }
  return out
}

const PREPROCESSED = /lang="(scss|sass|less|stylus)"/

describe('SFC 纯 CSS 样式块语法', () => {
  it('纯 CSS（无 lang=scss 等）的 <style> 块里不得出现双斜杠行注释', () => {
    const offenders: string[] = []
    for (const file of collectVue(srcRoot)) {
      const src = readFileSync(file, 'utf8')
      for (const { attrs, body } of styleBlocks(src)) {
        if (PREPROCESSED.test(attrs)) continue // 预处理语言允许双斜杠注释
        // 先剔除 C 风格块注释（/* … */），避免把注释正文里的示例误判
        const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '')
        for (const line of stripped.split('\n')) {
          const st = line.trim()
          if (!st) continue
          // `://`（URL 里的双斜杠）在 CSS 里合法 ⇒ 只判非冒号开头的双斜杠
          if (/(^|[^:])\/\//.test(st)) {
            offenders.push(`${file.replace(srcRoot + '/', '')}: ${st.slice(0, 90)}`)
          }
        }
      }
    }
    expect(
      offenders,
      `纯 CSS 的 <style> 块里出现双斜杠行注释（SFC 编译会直接失败 ⇒ 壳仓构建炸）：\n${offenders.join('\n')}`
    ).toEqual([])
  })

  it('自证扫描口径有效：纯 CSS 里的双斜杠注释必须被扫出来，块注释内的不算', () => {
    const sample = [
      '<style scoped>',
      '/* 合法：块注释里的 // 只是文字 */',
      '.a { color: red; }',
      '</style>',
      '<style scoped lang="scss">',
      '// 合法：scss 允许双斜杠注释',
      '.b { color: blue; }',
      '</style>',
    ].join('\n')
    const hits: string[] = []
    for (const { attrs, body } of styleBlocks(sample)) {
      if (PREPROCESSED.test(attrs)) continue
      const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const line of stripped.split('\n')) {
        const st = line.trim()
        if (st && /(^|[^:])\/\//.test(st)) hits.push(st)
      }
    }
    expect(hits, '口径坏了：扫不出双斜杠注释 ⇒ 守卫形同虚设').toEqual([])

    // 反向：真的写一行双斜杠注释 ⇒ 必须被抓到（负对照）
    const bad = '<style scoped>\n// 违规\n.a{}\n</style>'
    const badHits: string[] = []
    for (const { attrs, body } of styleBlocks(bad)) {
      if (PREPROCESSED.test(attrs)) continue
      const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const line of stripped.split('\n')) {
        const st = line.trim()
        if (st && /(^|[^:])\/\//.test(st)) badHits.push(st)
      }
    }
    expect(badHits.length, '负对照失效：真违规没被抓到').toBeGreaterThan(0)
  })
})
