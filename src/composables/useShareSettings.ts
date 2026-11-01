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
  /**
   * E2E 加密口令与确认（2026-11-01 core#30 口令型 E2E）：内容密钥由口令包装成
   * wrapped_key 落服务端 ⇒ 口令是取件人能否解密的**唯一**凭据，错口令=内容永久
   * 不可解 ⇒ 必填且两次一致（校验见 validateE2e）。与 require_auth 的取件密码
   * 是两回事（那道门在服务端，这道门在客户端密码学）。
   */
  e2e_password: string
  e2e_password_confirm: string
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
    e2e_password: '',
    e2e_password_confirm: '',
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

  /**
   * E2E 口令校验：返回错误文案键（''=通过）。调用方用它弹**专属**提示——
   * 不得与取件密码（require_auth）的提示混用（两回事，见 ShareSettings 注释）。
   */
  function validateE2e(): string {
    if (!settings.e2e) return ''
    if (!settings.e2e_password) return 'upload.e2e.passwordRequired'
    if (settings.e2e_password !== settings.e2e_password_confirm) return 'upload.e2e.passwordMismatch'
    return ''
  }

  function reset() {
    Object.assign(settings, defaultShareSettings())
  }

  return { settings, validate, validateE2e, reset }
}
