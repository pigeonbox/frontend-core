import { reactive } from 'vue'

export type ShareExpireStyle = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'forever'

export interface ShareSettings {
  expire_value: number
  expire_style: ShareExpireStyle
  require_auth: boolean
  password: string
  e2e: boolean
  custom_code: string
}

export function defaultShareSettings(): ShareSettings {
  return {
    expire_value: 1,
    expire_style: 'day',
    require_auth: false,
    password: '',
    e2e: false,
    custom_code: '',
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
