// 双语言包 key 集合一致性守卫：zh-CN 与 en-US 任一侧新增/删除 key 而另一侧未同步
// 时即刻红——防止两语言包再次漂移（文案缺失会以裸 key 兜底渲染给用户）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
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

const zh = flatten(zhCN as Messages)
const en = flatten(enUS as Messages)

describe('locale parity', () => {
  it('zh-CN 与 en-US 顶层命名空间一致', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort())
  })

  it('zh-CN 独有 key 为空（en-US 缺失的 key）', () => {
    const missingInEn = Object.keys(zh).filter((k) => !(k in en))
    expect(missingInEn).toEqual([])
  })

  it('en-US 独有 key 为空（zh-CN 缺失的 key）', () => {
    const missingInZh = Object.keys(en).filter((k) => !(k in zh))
    expect(missingInZh).toEqual([])
  })

  it('叶子值类型一致（对象/标量不串型）', () => {
    for (const k of Object.keys(zh)) {
      expect(typeof zh[k], `key ${k}`).toBe(typeof en[k])
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 源码里出现的**字面量** t('…') 键必须真实存在于语言包（2026-10-26 审计 P1）
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
  it('src/ 里所有字面量 t() 键都必须在 zh-CN（及 en-US）里登记', () => {
    // 排除测试目录与语言包自身（语言包里写的是 key 定义，不是 t() 调用）
    const files = listSrcFiles().filter(
      (f) => !f.includes('__tests__') && !f.startsWith('i18n/locales/'),
    )
    expect(files.length, '应能枚举到源码文件').toBeGreaterThan(10)

    const missingZh: string[] = []
    const missingEn: string[] = []
    for (const f of files) {
      for (const key of literalKeysIn(f)) {
        if (!(key in zh)) missingZh.push(`${key}  ← ${f}`)
        if (!(key in en)) missingEn.push(`${key}  ← ${f}`)
      }
    }
    expect(
      missingZh,
      `以下字面量 t() 键在 zh-CN 语言包里不存在（vue-i18n 会渲染键名本身）：\n${missingZh.join('\n')}`,
    ).toEqual([])
    expect(
      missingEn,
      `以下字面量 t() 键在 en-US 语言包里不存在（vue-i18n 会渲染键名本身）：\n${missingEn.join('\n')}`,
    ).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// en-US 语言包**值**里的中文残留（2026-11-01 审计）
//
// 背景：en-US.ts 曾有两条「值」是中文（serverDisabledPattern /
// serverNoRootsPattern），第一眼看着像漏翻的文案，实际**必须保持中文**——它们
// 是**服务端报文匹配串**：views/admin/LocalFiles.vue 用 `msg.includes(...)` 去
// 匹配后端原样返回的中文报错（core/app/share/localfiles.go 的
// errors.New("本地文件功能未启用") 与 "…未配置白名单目录（roots）"）。后端报文
// 不随调用方 locale 变化 ⇒ 翻成英文会让 en-US 界面的「功能未启用 / 补白名单
// 目录」分级引导**静默失效**（错误照常弹，但引导态不再出现）。
//
// 本守卫锁两件事：
//   ① 除这两条匹配串外，en-US 的值**不得再出现中文**（新加的漏翻会红）；
//   ② 这两条匹配串的值必须与 zh-CN **逐字相同**（被"顺手翻成英文"会红）。
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

describe('en-US 语言包值的中文残留', () => {
  it('除服务端报文匹配串外，en-US 的值不含中文', () => {
    const offenders: string[] = []
    for (const [k, v] of Object.entries(en)) {
      if (typeof v !== 'string') continue
      if (SERVER_MATCH_KEYS.has(k)) continue
      if (CJK_RE.test(v)) offenders.push(`${k} = ${JSON.stringify(v)}`)
    }
    expect(offenders, `en-US 的值里出现中文：\n${offenders.join('\n')}`).toEqual([])
  })

  it('服务端报文匹配串的值与 zh-CN 逐字一致（翻成英文会破坏后端报文匹配）', () => {
    for (const k of SERVER_MATCH_KEYS) {
      expect(en[k], `en-US 的 ${k} 必须与 zh-CN 逐字相同`).toBe(zh[k])
    }
  })

  it('服务端报文匹配串钉住后端报错原文（core/app/share/localfiles.go）', () => {
    expect(en['admin.localFilesPage.serverDisabledPattern']).toBe('本地文件功能未启用')
    expect(en['admin.localFilesPage.serverNoRootsPattern']).toBe('白名单目录')
  })
})

