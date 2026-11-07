// 语言包随版本漂移的自动对账（5.6.0）
//
// parity.spec.ts 管的是「键集合是否对齐」；本文件管的是**对齐之后仍然会漂的东西**：
//
//   ① 插值占位符：`共 {count} 个` 译文里把 {count} 丢了 / 写成 {counts} ⇒
//      vue-i18n 渲染出「共 个」或字面量「{counts}」——键在、值在、类型也对，
//      parity 全绿，只有用户看得见。
//   ② 复数分段：vue-i18n 用 `|` 分隔复数形式（`no items | one item | {count} items`）。
//      译文多写或少写一段 ⇒ 复数选择落到错误的分支（或整段被当成一段）。
//   ③ 死键：语言包里有、代码里从来没人引用的键。这类键不是「错」，是**漂移**——
//      功能改名/删页之后，5 份语言包里各留一条，翻译量持续维护着幽灵条目；
//      而它每涨一条，下一次翻译就越容易漏掉真正新增的那条。
//
// ③ 的判据为什么按「全源码子串」而不是「t() 调用点」：
// 键的**生成点与消费点常常不在同一处**。真实例子：src/utils/api-interceptor.ts 里
// 有一张 10000→'errcode.10000' 的映射表（生成点），消费发生在 handleError 里
// t(map[code])（消费点）。只认 t('…') 字面量 ⇒ 69 条 errcode 键全被判成死键 ⇒
// 一次「清理」就把后端全部错误码的本地化删掉（错误照常弹，但变成裸 key）。
// 所以判据放宽成「这个 key 的路径在（剥掉注释的）源码里出现过任何一次」——
// 假红方向是可接受的（少报几条死键），假绿方向会删掉活代码。
//
// 剩下的动态构造（模板串 `x.${v}` / 拼接 'x.' + v）无法逐条出现在源码里，
// 由 DYNAMIC_KEY_PREFIXES **显式登记**，且每条登记都要钉住调用点：
// 前缀还在但调用点没了 / 调用点还在但前缀改了 ⇒ 都判红（条目失效必须回收，
// 否则「已登记」会变成永远不用复核的免死金牌）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import deDE from '@/i18n/locales/de-DE'
import ruRU from '@/i18n/locales/ru-RU'
import { supportedLocales, type AppLocale } from '@/i18n'
import { listSrcFiles, readSrc, stripComments } from '@/utils/__tests__/sourceScan'

type Messages = Record<string, unknown>

const flatten = (obj: Messages, prefix = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k
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
const FLAT: Record<AppLocale, Record<string, unknown>> = {
  'zh-CN': flatten(MESSAGES['zh-CN']),
  'en-US': flatten(MESSAGES['en-US']),
  'ja-JP': flatten(MESSAGES['ja-JP']),
  'de-DE': flatten(MESSAGES['de-DE']),
  'ru-RU': flatten(MESSAGES['ru-RU']),
}
const zh = FLAT['zh-CN']
const OTHERS = supportedLocales.filter((c) => c !== 'zh-CN')

// ── ① 插值占位符 ───────────────────────────────────────────────────────────────
// 只认**命名插值** `{name}`：vue-i18n 还有 `{'字面量'}`（不插值）与 `@:key`
// （消息引用），它们的花括号里不是标识符，正则天然跳过。
const PLACEHOLDER_RE = /\{\s*([a-zA-Z0-9_.]+)\s*\}/g
const placeholders = (v: unknown): string[] => {
  const out: string[] = []
  PLACEHOLDER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLACEHOLDER_RE.exec(String(v))) !== null) out.push(m[1] as string)
  return out.sort()
}

describe('插值占位符对账（漏写/写错 ⇒ 渲染出裸 {xxx} 或丢数字）', () => {
  it('每个语种每个键的占位符集合必须与 zh-CN 完全一致', () => {
    const bad: string[] = []
    for (const code of OTHERS) {
      const flat = FLAT[code]
      for (const k of Object.keys(zh)) {
        const a = placeholders(zh[k]).join(',')
        const b = placeholders(flat[k]).join(',')
        // 排序后比较 ⇒ 占位符顺序不同不算漂移（译文语序本来就会变）
        if (a !== b) bad.push(code + ' ' + k + ': zh={' + a + '} ' + code + '={' + b + '}')
      }
    }
    expect(bad, '占位符漂移（译文丢了或写错了插值变量）：\n' + bad.join('\n')).toEqual([])
  })
})

// ── ② 复数分段 ─────────────────────────────────────────────────────────────────
// vue-i18n 的复数语法：`无内容 | 一条 | {count} 条`。分段数必须一致——少一段
// 会让 `t(key, n)` 落到错误的档位（英文 2 档、俄文最多 4 档，俄文尤其容易漏）。
const segments = (v: unknown): number => String(v).split('|').length

describe('复数分段对账（段数不一致 ⇒ t(key, n) 落错档位）', () => {
  it('每个键的复数分段数与 zh-CN 一致', () => {
    const bad: string[] = []
    for (const code of OTHERS) {
      const flat = FLAT[code]
      for (const k of Object.keys(zh)) {
        const a = segments(zh[k])
        const b = segments(flat[k])
        if (a !== b) bad.push(code + ' ' + k + ': zh=' + a + ' 段, ' + code + '=' + b + ' 段')
      }
    }
    expect(bad, '复数分段数漂移：\n' + bad.join('\n')).toEqual([])
  })
})

// ── ③ 死键 ─────────────────────────────────────────────────────────────────────
/**
 * 代码里用模板串 / 拼接构造的键前缀。每一项都必须钉住**调用点**，
 * 条目失效（调用点没了或不再带这个前缀）即判红 —— 登记不是免死金牌。
 */
const DYNAMIC_KEY_PREFIXES: Array<{ prefix: string; site: string; why: string }> = [
  {
    prefix: 'upload.fileType.',
    site: 'components/upload/FileItemRow.vue',
    why: '按扩展名映射到 fileType.<kind>，kind 由运行时 ext 映射表算出',
  },
  {
    prefix: 'upload_view.failure.',
    site: 'components/upload/PresignUploadDialog.vue',
    why: '失败原因码由上传结果算出（kind 是运行时的失败分类）',
  },
  {
    prefix: 'user.history.detailChannel.',
    site: 'views/user/History.vue',
    why: '取件渠道由后端返回的 channel 字段决定',
  },
  {
    prefix: 'user.notifications.type_',
    site: 'views/user/Notifications.vue',
    why: '通知类型由后端返回的 type 字段决定（type_ 后直接跟类型名）',
  },
]

describe('死键对账（语言包里有、代码里没人用 ⇒ 翻译在维护幽灵条目）', () => {
  it('动态键前缀的登记不得失效（调用点必须还在用这个前缀）', () => {
    const stale: string[] = []
    for (const { prefix, site } of DYNAMIC_KEY_PREFIXES) {
      const src = stripComments(readSrc(site))
      // 前缀本身 + 一次动态构造（模板串 ${ 或字符串拼接 ' +）同时出现，才算真在用
      const dynamic = src.includes('${') || /['"]\s*\+/.test(src)
      if (!src.includes(prefix) || !dynamic) stale.push(prefix + '  ← ' + site)
    }
    expect(
      stale,
      '以下动态键前缀登记已失效（调用点不再构造这类键）⇒ 请从 DYNAMIC_KEY_PREFIXES 删除：\n' +
        stale.join('\n'),
    ).toEqual([])
  })

  it('语言包里不存在代码未引用的键', () => {
    const files = listSrcFiles().filter((f) => !f.startsWith('i18n/locales/'))
    expect(files.length, '应能枚举到源码文件').toBeGreaterThan(50)

    // 全源码拼成一块再判：键的生成点可能在任意文件（映射表、路由 meta、常量数组），
    // 只在 t() 调用点找会漏掉那些「先生成、后消费」的键。
    const blob = files.map((f) => stripComments(readSrc(f))).join('\n')
    const prefixes = DYNAMIC_KEY_PREFIXES.map((p) => p.prefix)
    const dead = Object.keys(zh).filter(
      (k) => !blob.includes(k) && !prefixes.some((p) => k.startsWith(p)),
    )
    expect(
      dead,
      '以下键在语言包里存在但代码里没有任何引用（功能改名/删页后的残留）⇒ ' +
        '要么删掉这 5 份语言包里的同名条目，要么在代码里补上引用：\n' + dead.join('\n'),
    ).toEqual([])
  })
})
