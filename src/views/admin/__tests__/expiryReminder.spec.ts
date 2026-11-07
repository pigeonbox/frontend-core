// 分享到期提醒配置面板守卫（5.5.0）。
//
// core 侧配置形状：SystemConfig.notify.expiry_reminder =
// {enabled, advance_hours, interval_minutes}，缺省关（主动打扰类功能不该默认开）；
// 走通用端点 GET/PUT /admin/config（notify 段指针语义：body 未带该段 = 保留现状）。
//
// 为什么是「源码级」：本仓没有组件测试基建（无 @vue/test-utils、无 jsdom，
// 见 src/utils/__tests__/sourceScan.ts 说明）⇒ 视图层只能做源码级断言，防的是
// 「重构时把开关/两个数字/保存载荷删了」这类无声回归；渲染正确性靠真机自检。
//
// 守卫口径（均剥注释后扫描，避免注释里的示例代码误报）：
//   ① 渲染：开关绑 exForm.notify.expiry_reminder.enabled，两个数字绑
//      advance_hours / interval_minutes 且带 :min/:max（与 core 的 clamp 区间一致）；
//   ② 缺省：表单缺省值是「关 + 24h + 60min」，且与 core 侧 viper 默认值同口径；
//   ③ 回读：GET 快照合并 sec.notify.expiry_reminder 并做 null 归一（旧库无该键）；
//   ④ 保存：notify 分区保存载荷必须带 expiry_reminder 段（漏段 = 管理员翻了开关
//      却永远不生效，因为整段被丢弃）；
//   ⑤ 类型：api/admin.ts 的 NotifyConfigUpdate 能携带该段；
//   ⑥ i18n：五个语言包都齐 5 个键且非空（漏一个语言 ⇒ 该语种面板出现原始键名）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import deDE from '@/i18n/locales/de-DE'
import ruRU from '@/i18n/locales/ru-RU'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const configVue = stripComments(readSrc('views/admin/Config.vue'))
const adminTs = stripComments(readSrc('api/admin.ts'))

/** 取语言包里点分路径的叶子值 */
const msg = (dict: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], dict)

const I18N_KEYS = [
  'admin.configPage.sections.expiryReminder',
  'admin.configPage.notify.expiryReminderEnabled',
  'admin.configPage.notify.expiryReminderAdvance',
  'admin.configPage.notify.expiryReminderInterval',
  'admin.configPage.notify.expiryReminderHint',
]

describe('分享到期提醒面板渲染', () => {
  it('开关与两个数字都绑定到 exForm.notify.expiry_reminder', () => {
    for (const bind of [
      'exForm.notify.expiry_reminder.enabled',
      'exForm.notify.expiry_reminder.advance_hours',
      'exForm.notify.expiry_reminder.interval_minutes',
    ]) {
      expect(configVue, `应有 v-model 绑定 ${bind}`).toMatch(
        new RegExp(`v-model="${bind.replace(/\./g, '\\.')}"`)
      )
    }
  })

  it('两个数字输入带 min/max 边界（与 core clamp 的 1..720h / 1..1440min 一致）', () => {
    expect(configVue, 'advance_hours 需限制 1..720').toMatch(
      /<el-input-number[^>]*v-model="exForm\.notify\.expiry_reminder\.advance_hours"[^>]*:min="1"[^>]*:max="720"/
    )
    expect(configVue, 'interval_minutes 需限制 1..1440').toMatch(
      /<el-input-number[^>]*v-model="exForm\.notify\.expiry_reminder\.interval_minutes"[^>]*:min="1"[^>]*:max="1440"/
    )
  })

  it('表单缺省为「关 + 24 小时 + 60 分钟」（与 core viper 默认值同口径）', () => {
    expect(configVue).toMatch(
      /expiry_reminder:\s*\{\s*enabled:\s*false,\s*advance_hours:\s*24,\s*interval_minutes:\s*60\s*\}/
    )
  })
})

describe('分享到期提醒保存链路', () => {
  it("notify 分区保存载荷携带 expiry_reminder 段（漏段 = 翻了开关不生效）", () => {
    const at = configVue.indexOf("case 'notify':")
    expect(at, "应存在 case 'notify': 分支").toBeGreaterThan(-1)
    const block = configVue.slice(at, configVue.indexOf('break', at))
    expect(block, '保存载荷缺 expiry_reminder 段 ⇒ 管理员翻了开关永远不生效').toMatch(/expiry_reminder:/)
  })

  it('GET 快照合并 sec.notify.expiry_reminder 并做 null 归一（旧库无该键）', () => {
    // 允许 `if (cond) {` 换行块的写法（与 smtp 的单行写法同义）
    expect(configVue).toMatch(
      /sec\.notify\.expiry_reminder\)\s*\{?\s*Object\.assign\(exForm\.value\.notify\.expiry_reminder/
    )
    expect(configVue).toMatch(
      /!exForm\.value\.notify\.expiry_reminder\)\s*\{?\s*exForm\.value\.notify\.expiry_reminder\s*=/
    )
  })

  it('api/admin.ts 的类型能携带该段', () => {
    expect(adminTs, 'ExpiryReminderNotifyUpdate 应含三个字段').toMatch(
      /interface ExpiryReminderNotifyUpdate \{[\s\S]*?enabled\?: boolean[\s\S]*?advance_hours\?: number[\s\S]*?interval_minutes\?: number/
    )
    expect(adminTs, 'NotifyConfigUpdate 应能携带 expiry_reminder').toMatch(
      /expiry_reminder\?: ExpiryReminderNotifyUpdate/
    )
  })
})

describe('分享到期提醒 i18n', () => {
  it('五个语言包都齐 5 个键且非空', () => {
    const dicts: Array<[string, unknown]> = [
      ['zh-CN', zhCN],
      ['en-US', enUS],
      ['ja-JP', jaJP],
      ['de-DE', deDE],
      ['ru-RU', ruRU],
    ]
    for (const [name, dict] of dicts) {
      for (const key of I18N_KEYS) {
        const v = msg(dict, key)
        expect(typeof v, `${name} 缺键 ${key}`).toBe('string')
        expect((v as string).trim().length, `${name} 的 ${key} 为空`).toBeGreaterThan(0)
      }
    }
  })
})
