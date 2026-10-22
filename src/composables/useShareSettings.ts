import { reactive } from 'vue'

// 过期样式全集。'count' = 「按取件次数」：对方最多只能取 N 次（次数用尽即失效），
// 2026-10-22 补入 —— 此前类型联合里没有它 ⇒ 日常发件流**根本选不到**这道护栏
// （只有首启向导的站点白名单里有），后端却一直支持（pkg/utils/expire.go）。
export type ShareExpireStyle =
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'forever'
  | 'count'

export interface ShareSettings {
  expire_value: number
  expire_style: ShareExpireStyle
  require_auth: boolean
  password: string
  e2e: boolean
  custom_code: string
  /** 文件备注（可空）：随文件分享展示给取件人（文件+文本一并投递） */
  note: string
}

export function defaultShareSettings(): ShareSettings {
  return {
    expire_value: 1,
    expire_style: 'day',
    require_auth: false,
    password: '',
    e2e: false,
    custom_code: '',
    note: '',
  }
}

/**
 * 分享设置表单模型（过期/密码/自定义码/E2E）——上传与文本分享等入口共用。
 * 只管状态与校验；提示 toast 由调用方按自己的文案弹。
 */
export function useShareSettings(initial?: Partial<ShareSettings>) {
  const settings = reactive<ShareSettings>({ ...defaultShareSettings(), ...initial })

  /** require_auth 开启时密码必填 */
  function validate(): boolean {
    return !(settings.require_auth && !settings.password)
  }

  function reset() {
    Object.assign(settings, defaultShareSettings())
  }

  return { settings, validate, reset }
}
