/**
 * 过期样式全集（**前端唯一真相源**）。
 *
 * 合法集合以服务端 `pkg/utils.AllExpireStyles` 为准（core v0.29.0 起 8 个：
 * minute / hour / day / week / month / year / forever / **count**——
 * count =「按取件次数」，对方最多只能取 N 次）。
 *
 * 为什么抽成共享常量：此前这份列表在**首启向导**里硬编码，而**管理台压根没有**
 * 对应的编辑器（后端 API 接受、界面不暴露）⇒ 同一能力两处口径，管理员也改不动。
 * 抽出来后向导与管理台共用一份，core 侧再用 `AllExpireStyles` 校验非法值 ⇒
 * 三处同源。
 */
export const EXPIRE_STYLE_KEYS = [
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'year',
  'forever',
  'count',
] as const

export type ExpireStyleKey = (typeof EXPIRE_STYLE_KEYS)[number]

/** 样式 → i18n 键（各语言包同键名） */
export const EXPIRE_STYLE_I18N_KEYS: Record<ExpireStyleKey, string> = {
  minute: 'common.minutes',
  hour: 'common.hours',
  day: 'common.days',
  week: 'common.weeks',
  month: 'common.months',
  year: 'common.years',
  forever: 'common.forever',
  count: 'common.times',
}
