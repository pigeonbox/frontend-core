// stripComments 自身的守卫（2026-11-07）
//
// 背景：所有源码级守卫（parity 的字面量 t() 扫描、try/catch 反馈、禁裸 fetch……）
// 都先调 stripComments 再断言 ⇒ **剥离器错一次，所有守卫一起失明**，而且是静默的：
// 断言仍全绿，因为要检查的那段代码已经不在输入里了。
//
// 事故实录：旧实现是「先正则剥块注释，再正则剥行注释」，于是行注释**正文里**的
// 「斜杠加星号」（注释里写示例、写正则、写 Markdown 加粗）被当成块注释开头，一路
// 吞到几百行之后的下一个「星号加斜杠」——src/views/user/History.vue 实测从 430 行
// 被吃到 197 行（吞掉 223 行、占全文 52%），而当时所有守卫全绿。
//
// 本文件的夹具就是那四种真实形态；下面的「跨度」判据是它们的仓级兜底
// （夹具只覆盖我想到的写法，跨度能抓住我没想到的）。
import { describe, it, expect } from 'vitest'
import { stripComments, listSrcFiles, readSrc } from './sourceScan'

const NL = String.fromCharCode(10)
const BT = String.fromCharCode(96)

describe('stripComments：字符串/正则/模板串里的注释符号不是注释', () => {
  it('行注释正文里的块注释开头不得开启块注释（History.vue 形态）', () => {
    const input = [
      // 忠实复刻 History.vue:98 —— 「斜杠 + 两个星号」是 Markdown 粗体，**没有**闭合，
      // 所以旧实现会一路吞到下一个真注释块的 «星号加斜杠»。写成闭合对就测不出缺陷了。
      '// 右侧列（文件名/累计次数/' + '/' + '**取件明细**）被裁掉',
      'const after = 1',
      '/' + '* 真块注释要剥掉 *' + '/',
      'const tail = 2',
    ].join(NL)
    const out = stripComments(input)
    expect(out).toContain('const after = 1')
    expect(out).toContain('const tail = 2')
    expect(out).not.toContain('真块注释')
  })

  it('字符串字面量里的双斜杠不得开启行注释（URL / 正则串）', () => {
    const input = ['const u = "https:' + '/' + '/example.com/a"', 'const after = 1'].join(NL)
    const out = stripComments(input)
    expect(out).toContain('const after = 1')
    expect(out).toContain('example.com/a')
  })

  it('模板串里的注释符号不是注释，且模板串内容整体保留', () => {
    const input = [
      'const s = ' + BT + 'a ' + '/' + '* b *' + '/' + ' c ' + '/' + '/ d' + BT,
      'const after = 1',
    ].join(NL)
    const out = stripComments(input)
    expect(out).toContain('const after = 1')
    expect(out).toContain('a ' + '/' + '* b *' + '/' + ' c ' + '/' + '/ d')
  })

  it('正则字面量里的双斜杠不得开启行注释', () => {
    const input = ['const re = /a' + '\\' + '/' + '\\' + '/b/g', 'const after = 1'].join(NL)
    const out = stripComments(input)
    expect(out).toContain('const after = 1')
  })

  it('真正的块注释与 HTML 注释要被去掉（剥不干净会导致误报）', () => {
    const input = [
      '/' + '*',
      '  t("a.b") 示例',
      '*' + '/',
      '<!-- t("c.d") 模板块注释 -->',
      'const keep = 1',
    ].join(NL)
    const out = stripComments(input)
    expect(out).not.toContain('a.b')
    expect(out).not.toContain('c.d')
    expect(out).toContain('const keep = 1')
  })
})

describe('stripComments：仓级兜底（不许把代码当注释吃掉）', () => {
  // 这条判据的形态是被三次失败逼出来的，记下来免得后人重走：
  //  ① 先试「逐行看还在不在剥离结果里，统计最长连续缺失段」——没牙齿。缺陷形态下
  //     History.vue 被吃掉 233 行，但其中大量是「右花括号加逗号」这类文件别处也有的行，
  //     includes 一命中就把连续段切碎，最长只有 10 行。
  //  ② 再试「只统计全文件唯一行」——仍没牙齿（实测 15 行），因为旧实现吃掉的是
  //     **许多碎片段**（每遇到一个星号加斜杠就结束一段），跨过碎片外真代码行就断掉，
  //     不存在长连续段可测。
  //  ③ 再试「行数删除比例阈值」——会假红：本仓 utils/capabilities.ts 两个实现都删
  //     59%（真注释密集），与 History.vue 的 54% 无法用一个阈值分开。
  // 结论：**聚合量与连续性都不行，要比的是「覆盖」**——先造一个「一定是代码」的
  // 保守 oracle，再要求 stripComments 一行都不许少。
  //
  // oracle 只按行首判注释（行首双斜杠整行、从行首星号加斜杠起到星号加斜杠止的整块、
  // HTML 注释同款），完全不处理行内注释 ⇒ oracle 保留的行一定是代码。
  // 旧实现对 History.vue 少 105 行、对 views/admin/Config.vue 少 38 行（回退负对照实测
  // 共 146 行缺口），新实现 0 缺口。
  const definitelyCode = (raw: string): string[] => {
    const kept: string[] = []
    let inBlock = false
    let inHtml = false
    for (const line of raw.split(NL)) {
      const t = line.trim()
      if (inBlock) {
        if (t.indexOf('*/') >= 0) inBlock = false
        continue
      }
      if (inHtml) {
        if (t.indexOf('-->') >= 0) inHtml = false
        continue
      }
      if (t.startsWith('<!--')) {
        if (t.indexOf('-->') < 0) inHtml = true
        continue
      }
      if (t.startsWith('/*')) {
        if (t.indexOf('*/') < 0) inBlock = true
        continue
      }
      if (t.startsWith('//')) continue
      // 注释续行的常见形态（块注释里缩进不一致时 oracle 认不出块）
      if (t.startsWith('*')) continue
      if (!t) continue
      kept.push(t)
    }
    return kept
  }

  it('oracle 认为一定是代码的行，stripComments 一行都不许少', () => {
    const violations: string[] = []
    for (const f of listSrcFiles()) {
      const raw = readSrc(f)
      const blob = stripComments(raw)
      const kept = definitelyCode(raw)
      const count = new Map<string, number>()
      for (const k of kept) count.set(k, (count.get(k) ?? 0) + 1)
      for (const k of kept) {
        // 重复行不能用：文件别处还有同一行时，用 includes 判会被「救」回来
        if ((count.get(k) ?? 0) > 1) continue
        // 行内含注释符号的行不能用：剥离后该行会被截断，整行匹配必然失败（假红）
        if (k.indexOf('//') >= 0 || k.indexOf('/*') >= 0) continue
        if (!blob.includes(k)) violations.push(f + ' :: ' + k.slice(0, 80))
      }
    }
    expect(violations.slice(0, 20), '这些行是代码却被剥离器当成注释吃掉了：' + NL + violations.join(NL))
      .toEqual([])
  })
})
