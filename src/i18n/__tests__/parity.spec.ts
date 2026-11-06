// 多语言包一致性守卫（5.3.0 由「zh-CN ↔ en-US 双语」扩到 5 门语言）
//
// 语言包是**手写数据**，缺 key 时 vue-i18n 会退回渲染**键名本身**（用户看到
// 「admin.loadFailed」）。5 门语言乘以 1600+ key 之后，靠人眼对账已无可能
// ⇒ 全部收敛到本文件：缺 key / 多 key / 值类型串型 / 字面量 t() 缺登记 /
// 非中文语种漏翻 / 服务端匹配串被误翻，逐条机械判红。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import deDE from '@/i18n/locales/de-DE'
import ruRU from '@/i18n/locales/ru-RU'
import { supportedLocales, localeMessages, type AppLocale } from '@/i18n'
import { listSrcFiles, readSrc, stripComments } from '@/utils/__tests__/sourceScan'

type Messages = Record<string, unknown>

// 递归展开为「点分 key → 叶子值」的扁平映射
const flatten = (obj: Messages, prefix = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Messages, key))
    } else {
      out[key] = v
    }
  }
  return out
}

const MESSAGES: Record<AppLocale, Messages> = {
  'zh-CN': zhCN as Messages,
  'en-US': enUS as Messages,
  'ja-JP': jaJP as Messages,
  'de-DE': deDE as Messages,
  'ru-RU': ruRU as Messages,
}

const zh = flatten(MESSAGES['zh-CN'])

// 除 zh-CN 外的全部语种（每一项都要与 zh-CN 对齐）
const OTHERS = supportedLocales.filter((c) => c !== 'zh-CN')

describe('locale parity', () => {
  it('语言包注册表与 supportedLocales 一致（少登记 ⇒ 选了却渲染裸 key）', () => {
    expect(Object.keys(localeMessages).sort()).toEqual([...supportedLocales].sort())
  })

  it('每个语种的顶层命名空间与 zh-CN 一致', () => {
    for (const code of OTHERS) {
      expect(Object.keys(MESSAGES[code]).sort(), `语种 ${code}`).toEqual(
        Object.keys(MESSAGES['zh-CN']).sort(),
      )
    }
  })

  it('每个语种都不缺 zh-CN 的 key', () => {
    for (const code of OTHERS) {
      const flat = flatten(MESSAGES[code])
      const missing = Object.keys(zh).filter((k) => !(k in flat))
      expect(missing, `语种 ${code} 缺少 key`).toEqual([])
    }
  })

  it('每个语种都没有 zh-CN 之外的独有 key', () => {
    for (const code of OTHERS) {
      const flat = flatten(MESSAGES[code])
      const extra = Object.keys(flat).filter((k) => !(k in zh))
      expect(extra, `语种 ${code} 多出 key（zh-CN 未定义）`).toEqual([])
    }
  })

  it('叶子值类型一致（对象/标量不串型）', () => {
    for (const code of OTHERS) {
      const flat = flatten(MESSAGES[code])
      for (const k of Object.keys(zh)) {
        expect(typeof flat[k], `语种 ${code} 的 key ${k}`).toBe(typeof zh[k])
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 源码里出现的**字面量** t('…') 键必须真实存在于**每一个**语言包（2026-10-26 审计 P1）
//
// 事故实录：v0.11.31 在 views/admin/Dashboard.vue 引入了 `t('admin.loadFailed')`，
// 但同一提交只给语言包加了 `type_request_received` ⇒ vue-i18n 缺键时**返回键名
// 本身** ⇒ 管理台渲染字面量「admin.loadFailed」。上一轮「不再回退 mock」的显式
// 失败标记**自身是坏的**。
//
// 扫描口径：只认**字面量**键（`t('a.b')` / `t("a.b")`）——运行时拼接的键
// （`t('x.' + v)`）无法静态判定，一律跳过。
// ─────────────────────────────────────────────────────────────────────────────
const LITERAL_T_RE = /(?<![.\w$])t\(\s*(['"])([^'"]+)\1\s*\)/g

function literalKeysIn(rel: string): string[] {
  const src = stripComments(readSrc(rel))
  const out: string[] = []
  let m: RegExpExecArray | null
  LITERAL_T_RE.lastIndex = 0
  while ((m = LITERAL_T_RE.exec(src)) !== null) out.push(m[2] ?? '')
  return out
}

describe('字面量 i18n 键必须存在于语言包', () => {
  it('src/ 里所有字面量 t() 键都必须在**每一个**语种里登记', () => {
    // 排除测试目录与语言包自身（语言包里写的是 key 定义，不是 t() 调用）
    const files = listSrcFiles().filter(
      (f) => !f.includes('__tests__') && !f.startsWith('i18n/locales/'),
    )
    expect(files.length, '应能枚举到源码文件').toBeGreaterThan(10)

    const reported: string[] = []
    for (const code of supportedLocales) {
      const flat = flatten(MESSAGES[code])
      for (const f of files) {
        for (const key of literalKeysIn(f)) {
          if (!(key in flat)) reported.push(`${code}: ${key}  ← ${f}`)
        }
      }
    }
    expect(
      reported,
      `以下字面量 t() 键在某语种语言包里不存在（vue-i18n 会渲染键名本身）：\n${reported.join('\n')}`,
    ).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 非中文语言包**值**里的中文残留（2026-11-01 审计，5.3.0 扩到全部非中文语种）
//
// 背景：en-US.ts 曾有两条「值」是中文（serverDisabledPattern /
// serverNoRootsPattern），第一眼看着像漏翻的文案，实际**必须保持中文**——它们
// 是**服务端报文匹配串**：views/admin/LocalFiles.vue 用 `msg.includes(...)` 去
// 匹配后端原样返回的中文报错（core/app/share/localfiles.go 的
// errors.New("本地文件功能未启用") 与 "…未配置白名单目录（roots）"）。后端报文
// 不随调用方 locale 变化 ⇒ 翻成英文/日文/德文/俄文会让对应界面的「功能未启用 /
// 补白名单目录」分级引导**静默失效**（错误照常弹，但引导态不再出现）。
//
// 本守卫锁三件事：
//   ① 除这两条匹配串外，非中文语种的值**不得再出现中文**（新加的漏翻会红）；
//   ② 这两条匹配串的值必须与 zh-CN **逐字相同**（被"顺手翻掉"会红）；
//   ③ 切换器暴露的语种必须与 supportedLocales 一致（少一个 ⇒ 该语种用户没有入口）。
//
// ⚠️ 后端改报错文案时，这两条匹配串与本守卫的期望值必须**一起**改。
// ─────────────────────────────────────────────────────────────────────────────

/** CJK 表意文字 + CJK/全角标点（不含 em-dash / 弯引号 / ≥ 等排版符号） */
const CJK_RE = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

/** 服务端报文匹配串：值必须保持中文原样（与 zh-CN 逐字一致） */
const SERVER_MATCH_KEYS = new Set<string>([
  'admin.localFilesPage.serverDisabledPattern',
  'admin.localFilesPage.serverNoRootsPattern',
])

// 拉丁/西里尔字母语种：可以机械判「有没有中文残留」。
// 日语**不能**这样判——日文正文本来就由汉字（kanji）+ 假名构成，
// 「連携」「保存」这类词与中文同形是正常现象，逐字判残留只会把合法译文判红
// （所以这里单独排除 ja-JP，改用下面的假名覆盖率判据）。
const NON_CJK_LOCALES = OTHERS.filter((c) => c !== 'ja-JP')

describe('非中文语言包值的中文残留', () => {
  it('除服务端报文匹配串外，非中文语种的值不含中文', () => {
    for (const code of NON_CJK_LOCALES) {
      const flat = flatten(MESSAGES[code])
      const offenders: string[] = []
      for (const [k, v] of Object.entries(flat)) {
        if (typeof v !== 'string') continue
        if (SERVER_MATCH_KEYS.has(k)) continue
        if (CJK_RE.test(v)) offenders.push(`${code} ${k} = ${JSON.stringify(v)}`)
      }
      expect(offenders, `非中文语种的值里出现中文：\n${offenders.join('\n')}`).toEqual([])
    }
  })

  it('服务端报文匹配串的值与 zh-CN 逐字一致（翻掉会破坏后端报文匹配）', () => {
    for (const code of OTHERS) {
      const flat = flatten(MESSAGES[code])
      for (const k of SERVER_MATCH_KEYS) {
        expect(flat[k], `${code} 的 ${k} 必须与 zh-CN 逐字相同`).toBe(zh[k])
      }
    }
  })

  it('服务端报文匹配串钉住后端报错原文（core/app/share/localfiles.go）', () => {
    expect(zh['admin.localFilesPage.serverDisabledPattern']).toBe('本地文件功能未启用')
    expect(zh['admin.localFilesPage.serverNoRootsPattern']).toBe('白名单目录')
  })

  // 日语无法用「有没有汉字」判残留（见上），改用**假名覆盖率**：真翻译过的
  // 日文里绝大多数长句都带假名；整包从 zh-CN 复制过来则覆盖率趋近 0。
  // 阈值取 0.6（实测 0.957，留出后续增补短词/专名条目的余量）。
  it('日文语言包的假名覆盖率（防整包复制中文未翻译）', () => {
    const KANA_RE = /[\u3040-\u30ff]/
    const flat = flatten(MESSAGES['ja-JP'])
    const longVals = Object.entries(flat).filter(
      ([, v]) => typeof v === 'string' && (v as string).length >= 8,
    )
    expect(longVals.length, '日文语言包应有足量长文本').toBeGreaterThan(500)
    const withKana = longVals.filter(([, v]) => KANA_RE.test(v as string))
    const ratio = withKana.length / longVals.length
    expect(ratio, `日文假名覆盖率 ${ratio.toFixed(3)} 过低（疑似整包复制未翻译）`).toBeGreaterThan(
      0.6,
    )
  })

  it('语言切换器暴露的语种与 supportedLocales 一致', () => {
    // 少一个 ⇒ 该语种用户没有任何入口（语言包再全也等于没加）；
    // 多一个 ⇒ 切换后 supportedLocales 的校验直接把选择丢掉（点了没反应）。
    const src = stripComments(readSrc('components/LocaleSwitcher.vue'))
    const offered = [...src.matchAll(/value:\s*'([a-zA-Z-]+)'/g)].map((m) => m[1])
    expect(offered.sort(), '切换器选项必须与 supportedLocales 完全一致').toEqual(
      [...supportedLocales].sort(),
    )
  })
})
