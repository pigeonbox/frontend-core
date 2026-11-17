import { describe, expect, it } from 'vitest'
import { ERRCODE_KEY_MAP, translateError } from '../api-interceptor'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import deDE from '@/i18n/locales/de-DE'
import ruRU from '@/i18n/locales/ru-RU'

// ⚠️ 2026-10-26 审计清理：原来的 `BizError` 类**从未被抛出**（request.ts 真正
// reject 的是普通对象 {code, message, trace_id}）⇒ useErrorHandler 的
// `e instanceof BizError` 分支恒为假 ⇒ 注释里声称的 common.errorTitle 标题
// 从未生效。⇒ BizError 已删除，下面的用例改用**真实形态**（后端信封对象）。
//
// 2026-11-17（#620）：本文件**不再内嵌任何错误码清单**。
// 旧版有一份手抄的 ALL_CODES（还漏了 30014）⇒ 守卫是「单向 + 手抄」：
//   · 契约新增错误码 ⇒ 抓不到（源头就是手抄）；
//   · 手抄自己少一条 ⇒ 也没人发现（它只断言「手抄 ⊆ 映射表」）。
// ⇒ 改为**机器推导**：真相源 = 本仓的 ERRCODE_KEY_MAP + 五门语言包，
//   四个方向都有牙齿：
//     A 映射表登记了、语言包没有 ⇒ 红（点名哪个语言缺哪个码）
//     B 语言包多出 ⇒ 红（键集必须与映射表完全一致）
//     C 键形/值形 ⇒ 红（键必须是 5 位数字，值必须是 errcode.<同一个码>）
//     D 未知码兜底 ⇒ 有覆盖（段位兜底 / 越界降级都不许崩）

type Messages = Record<string, unknown>

/** 五门语言包（键 = 语言标签） */
const LOCALES: Record<string, Messages> = {
  'zh-CN': zhCN as Messages,
  'en-US': enUS as Messages,
  'ja-JP': jaJP as Messages,
  'de-DE': deDE as Messages,
  'ru-RU': ruRU as Messages,
}
const LOCALE_IDS = Object.keys(LOCALES)

/** 某语种的 errcode 命名空间（扁平一层：键 = 5 位错误码 或 兜底名） */
const errcodeBlock = (locale: string): Record<string, unknown> =>
  (LOCALES[locale].errcode ?? {}) as Record<string, unknown>

/** ERRCODE_KEY_MAP 的键集（5 位码字符串） */
const MAP_CODES = Object.keys(ERRCODE_KEY_MAP)

/** 按点分路径取值（'errcode.30001' → locale.errcode['30001']） */
const lookup = (locale: string, key: string): unknown => {
  let cur: unknown = LOCALES[locale]
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/**
 * 拦截器在**任意**错误码下能产出的 i18n key。
 *
 * 机械枚举 0..99999 ⇒ 这里**不含任何手抄错误码**；实现改了码表/兜底表，
 * 这条推导自动跟着变（不需要人肉同步）。
 */
const producibleKeys = (): Set<string> => {
  const out = new Set<string>()
  for (let code = 0; code <= 99999; code++) {
    const key = translateError({ code, message: 'backend text', trace_id: 't' }).i18nKey
    if (key) out.add(key)
  }
  return out
}

/** 拦截器能产出的 key 集合（模块加载时求值一次） */
const PRODUCIBLE = producibleKeys()

/** 其中落在 errcode 命名空间、且后缀是 5 位数字的 key（逐码登记 / 段位兜底目标） */
const PRODUCIBLE_CODE_KEYS = [...PRODUCIBLE].filter((k) => /^errcode\.\d{5}$/.test(k))

/** 其中落在 errcode 命名空间、后缀不是数字的 key（网络 / 未知兜底） */
const PRODUCIBLE_NAMED_KEYS = [...PRODUCIBLE].filter(
  (k) => k.startsWith('errcode.') && !/^errcode\.\d{5}$/.test(k),
)

/** 区间内**未登记**的错误码（前 n 个；用于兜底用例，避开已登记的码） */
const unregisteredIn = (from: number, to: number, n = 3): number[] => {
  const out: number[] = []
  for (let c = from; c <= to && out.length < n; c++) {
    if (ERRCODE_KEY_MAP[c] === undefined) out.push(c)
  }
  return out
}

describe('ERRCODE_KEY_MAP 键形守卫', () => {
  it('每个键都是 5 位数字（防把 HTTP 码/短码混进业务码表）', () => {
    const bad = MAP_CODES.filter((c) => !/^[0-9]{5}$/.test(c))
    expect(bad, `键不是 5 位数字：${bad.join(', ')}`).toEqual([])
  })

  it('每个值都是 errcode.<同一个码>（防手滑写错码）', () => {
    const bad = MAP_CODES
      .filter((c) => ERRCODE_KEY_MAP[Number(c)] !== `errcode.${c}`)
      .map((c) => `${c} → ${ERRCODE_KEY_MAP[Number(c)]}`)
    expect(bad, `值与键不一致：${bad.join(', ')}`).toEqual([])
  })

  it('每个登记的码要么命中自己的 key，要么明确保留后端原文（不得指向别的码）', () => {
    // 带动态信息的后端码会被有意保留原文（i18nKey = null），其余必须命中自己的 key。
    const offenders: string[] = []
    for (const code of MAP_CODES) {
      const r = translateError({ code: Number(code), message: 'backend text', trace_id: 't' })
      if (r.i18nKey !== null && r.i18nKey !== `errcode.${code}`) {
        offenders.push(`${code} → ${r.i18nKey}（应为 errcode.${code} 或 null）`)
      }
      if (r.i18nKey === null && r.fallback !== 'backend text') {
        offenders.push(`${code} → i18nKey=null 但 fallback 被改写成 ${r.fallback}`)
      }
    }
    expect(offenders, `登记的码被解析到了别的 key：
${offenders.join('\n')}`).toEqual([])
  })
})

describe('错误码映射表 ⇄ 五门语言包 对账', () => {
  it('方向 A：映射表登记的码在五门语言里都有非空文案', () => {
    const missing: string[] = []
    for (const locale of LOCALE_IDS) {
      const block = errcodeBlock(locale)
      for (const code of MAP_CODES) {
        const v = block[code]
        if (typeof v !== 'string' || v.trim() === '') missing.push(`${locale} 缺 ${code}`)
      }
    }
    expect(missing, `映射表登记了但语言包没有文案：\n${missing.join('\n')}`).toEqual([])
  })

  it('方向 B：每门语言的 errcode 数字键集与映射表**完全一致**（多出/缺少都判红）', () => {
    const mapCodes = new Set(MAP_CODES)
    const offenders: string[] = []
    for (const locale of LOCALE_IDS) {
      const numeric = Object.keys(errcodeBlock(locale)).filter((k) => /^\d+$/.test(k))
      const extra = numeric.filter((k) => !mapCodes.has(k))
      const absent = MAP_CODES.filter((c) => !numeric.includes(c))
      if (extra.length || absent.length) {
        offenders.push(`${locale}：多出 [${extra.join(', ')}] 缺少 [${absent.join(', ')}]`)
      }
    }
    expect(
      offenders,
      `语言包的 errcode 数字键集必须与 ERRCODE_KEY_MAP 完全一致：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('语言包 errcode 块里的命名键 = 拦截器兜底真正会用的命名键（不多不少）', () => {
    const expected = PRODUCIBLE_NAMED_KEYS.map((k) => k.slice('errcode.'.length)).sort()
    const offenders: string[] = []
    for (const locale of LOCALE_IDS) {
      const actual = Object.keys(errcodeBlock(locale))
        .filter((k) => !/^\d+$/.test(k))
        .sort()
      if (actual.join(',') !== expected.join(',')) {
        offenders.push(`${locale}：实际 [${actual.join(', ')}] ≠ 期望 [${expected.join(', ')}]`)
      }
    }
    expect(offenders, `命名兜底键必须与拦截器实际用到的完全一致：\n${offenders.join('\n')}`).toEqual([])
  })

  it('拦截器能产出的每个 i18n key 在五门语言里都有文案（兜底文案不是空壳）', () => {
    const missing: string[] = []
    for (const key of PRODUCIBLE) {
      for (const locale of LOCALE_IDS) {
        const v = lookup(locale, key)
        if (typeof v !== 'string' || v.trim() === '') missing.push(`${locale} 缺 ${key}`)
      }
    }
    expect(missing, `拦截器会用到但语言包没有文案：\n${missing.join('\n')}`).toEqual([])
  })

  it('段位兜底的目标键必须是已登记的码（否则兜底文案在语言包里根本不存在）', () => {
    const bad = PRODUCIBLE_CODE_KEYS.filter(
      (k) => ERRCODE_KEY_MAP[Number(k.slice('errcode.'.length))] !== k,
    )
    expect(bad, `兜底目标未在映射表登记：${bad.join(', ')}`).toEqual([])
  })
})

describe('未知码兜底', () => {
  it('未登记的 5 位码落到段位兜底文案（本地化，不裸露后端原文）', () => {
    const codes = unregisteredIn(30000, 39999, 1)
    expect(codes.length, '3xxxx 段应存在未登记的码').toBe(1)
    const code = codes[0] as number
    const r = translateError({ code, message: 'backend text', trace_id: 't' })
    const key = r.i18nKey ?? ''
    expect(key, `未登记的 ${code} 应当落到段位兜底 key（实际 ${r.i18nKey}）`).toMatch(
      /^errcode\.\d{5}$/,
    )
    expect(r.fallback).toBe('backend text')
    expect(r.code).toBe(code)
    for (const locale of LOCALE_IDS) {
      expect(lookup(locale, key), `${locale} 缺兜底文案 ${key}`).toBeTruthy()
    }
  })

  it('超出所有段位的码不崩，降级为后端原文（i18nKey = null）', () => {
    const r = translateError({ code: 60000, message: 'backend text', trace_id: 't' })
    expect(r.i18nKey).toBeNull()
    expect(r.fallback).toBe('backend text')
    expect(r.code).toBe(60000)
    expect(r.traceId).toBe('t')
  })

  it('同一段位内未登记的码落到同一个兜底 key（段位表没被改散）', () => {
    const codes = unregisteredIn(30000, 39999, 3)
    expect(codes.length).toBe(3)
    const keys = [...new Set(codes.map((c) => translateError({ code: c, message: 'x' }).i18nKey))]
    expect(keys.length, `3xxxx 段位兜底 key 不唯一：${keys.join(', ')}`).toBe(1)
  })

  it('不同段位的兜底文案互不相同（4xxxx 段不能说成「用户不存在」这类错因）', () => {
    const [a] = unregisteredIn(30000, 39999, 1)
    const [b] = unregisteredIn(40000, 49999, 1)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    const keyA = translateError({ code: a as number, message: 'x' }).i18nKey
    const keyB = translateError({ code: b as number, message: 'x' }).i18nKey
    expect(keyA).not.toBe(keyB)
  })

  it('网络层失败码（code=0）落到本地化的网络错误文案', () => {
    const r = translateError({ code: 0, message: 'Network Error', trace_id: 't' })
    expect(r.i18nKey).toBe('errcode.network_error')
    for (const locale of LOCALE_IDS) {
      expect(lookup(locale, 'errcode.network_error'), `${locale} 缺网络错误文案`).toBeTruthy()
    }
  })
})

describe('translateError', () => {
  it('后端信封对象 {code,message,trace_id} 返回 i18n key 与 fallback', () => {
    const r = translateError({ code: 10002, message: 'unauthorized', trace_id: 't' })
    expect(r.i18nKey).toBe('errcode.10002')
    expect(r.fallback).toBe('unauthorized')
    expect(r.code).toBe(10002)
  })

  it('带动态信息的后端文案不被 i18n 覆盖（保留超限数字/秒数等关键信息）', () => {
    // 10011 的后端文案带「等 N 秒」，i18n 通用文案只有「已临时锁定」——
    // 覆盖会抹掉用户最需要的「还要等多久」（2026-10-22 审计）。
    const r = translateError({
      code: 10011,
      message: '尝试过于频繁，已临时锁定，请 42 秒后重试',
      trace_id: 't',
    })
    expect(r.i18nKey).toBeNull()
    expect(r.fallback).toContain('42 秒')
  })

  it('未逐码登记的错误码按段位兜底到本地化文案（不裸露英文原文）', () => {
    // 2xxxx = 分享/取件段。哪怕该码没登记进 ERRCODE_KEY_MAP，
    // 也要落到本地化的段位通用文案，而不是后端英文原文。
    const r = translateError({ code: 29999, message: 'something went sideways', trace_id: 't' })
    expect(r.i18nKey).toBe('errcode.20001')
  })

  it('普通错误返回 fallback，无 i18n key', () => {
    const r = translateError(new Error('boom'))
    expect(r.i18nKey).toBeNull()
    expect(r.fallback).toBe('boom')
  })

  it('request.ts 包装的普通对象 {code,message,trace_id} 同样吃错误码映射（英文 toast 回归钉）', () => {
    const r = translateError({
      code: 20005,
      message: 'pickup code not found',
      trace_id: 't-9',
    })
    expect(r.i18nKey).toBe('errcode.20005')
    expect(r.fallback).toBe('pickup code not found')
    expect(r.code).toBe(20005)
    expect(r.traceId).toBe('t-9')
  })

  it('普通对象无 code 时保持无映射', () => {
    const r = translateError({ message: 'plain' })
    expect(r.i18nKey).toBeNull()
    expect(r.code).toBeNull()
  })
})
