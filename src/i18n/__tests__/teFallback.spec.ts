// `t(k) || fallback` 死代码守卫（2026-10-26 审计 P2）。
//
// 现象：vue-i18n v9 缺键时**返回键名本身**（不是空串）⇒ `t(k) || fallback`
// 的右半边**永不可达** ⇒ 后端新增错误码而前端漏登时，用户看到的是裸键名。
// 正确写法是 `te(k) ? t(k) : fallback`（views/user/Notifications.vue 早已这么写，
// 其余各处没同步）。
//
// 本守卫扫描全仓源码（**剥掉注释**——注释里的示例代码不算真代码），凡出现
// `t(...) ||` 的位置，必须同处有 `te(` 判存在性。
import { describe, it, expect } from 'vitest'
import { listSrcFiles, readSrc, stripComments } from '@/utils/__tests__/sourceScan'

// t( ... ) 后面跟 || —— `(?<![.\w$])` 排除 `test(` / `.test(` / `Math.t(` 这类
// 恰好也以 "t(" 开头但不是 i18n 调用的写法。
const T_FALLBACK_RE = /(?<![.\w$])t\([^()]*\)\s*\|\|/g

describe('i18n 缺键兜底必须用 te() 判存在性', () => {
  it('源码里不得残留 `t(...) || fallback` 形态（vue-i18n 缺键返回键名本身 ⇒ 右半边死代码）', () => {
    const files = listSrcFiles().filter(
      (f) => !f.includes('__tests__') && !f.startsWith('i18n/locales/'),
    )
    expect(files.length, '应能枚举到源码文件').toBeGreaterThan(10)

    const offenders: string[] = []
    for (const f of files) {
      const src = stripComments(readSrc(f))
      T_FALLBACK_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = T_FALLBACK_RE.exec(src)) !== null) {
        // 前后 300 字符里必须出现 te( —— 即该处用了「判存在性」的写法
        const around = src.slice(Math.max(0, m.index - 300), m.index)
        if (!around.includes('te(')) {
          offenders.push(`${f}: ${(src.slice(m.index, m.index + 60).split('\n')[0] ?? '').trim()}`)
        }
      }
    }
    expect(
      offenders,
      `以下位置用了 \`t(...) || fallback\`（缺键时右半边永不生效，应改成 te(k) ? t(k) : fallback）：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('改过的那几处必须真的用上了 te()', () => {
    const EXPECTED: Array<[string, string]> = [
      ['composables/useErrorHandler.ts', 'te(translated.i18nKey)'],
      ['composables/useErrorHandler.ts', 'te(tr.i18nKey)'],
      ['views/user/Login.vue', 'te(translated.i18nKey)'],
      ['views/user/Register.vue', 'te(translated.i18nKey)'],
      ['views/share/View.vue', 'te(translated.i18nKey)'],
      ['components/share/ShareResultDialog.vue', "te('home.codeCopied')"],
    ]
    for (const [file, needle] of EXPECTED) {
      expect(stripComments(readSrc(file)), `${file} 应含 ${needle}`).toContain(needle)
    }
  })
})
