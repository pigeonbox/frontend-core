import { describe, it, expect } from 'vitest'
import { useShareSettings, defaultShareSettings, resolveSiteDefaultExpireValue } from '../useShareSettings'

describe('useShareSettings', () => {
  it('默认值与既有上传/文本分享表单一致', () => {
    expect(defaultShareSettings()).toEqual({
      expire_value: 1,
      expire_style: 'day',
      require_auth: false,
      password: '',
      e2e: false,
      e2e_password: '',
      e2e_password_confirm: '',
      custom_code: '',
      note: '',
    })
  })

  it('initial 覆盖默认值', () => {
    const { settings } = useShareSettings({ expire_value: 7, expire_style: 'week' })
    expect(settings.expire_value).toBe(7)
    expect(settings.expire_style).toBe('week')
    expect(settings.require_auth).toBe(false)
  })

  it('validate：require_auth 开启且密码为空 → false；其余 → true', () => {
    const { settings, validate } = useShareSettings()
    expect(validate()).toBe(true)
    settings.require_auth = true
    expect(validate()).toBe(false)
    settings.password = 'secret'
    expect(validate()).toBe(true)
    settings.require_auth = false
    expect(validate()).toBe(true)
  })

  it('validateE2e：口令必填且两次一致（与取件密码分立，专属提示键）', () => {
    const { settings, validateE2e } = useShareSettings()
    // 未开 E2E ⇒ 不校验
    expect(validateE2e()).toBe('')
    settings.e2e = true
    // 空口令 ⇒ passwordRequired（错口令=内容永久不可解，必须拦在发送前）
    expect(validateE2e()).toBe('upload.e2e.passwordRequired')
    settings.e2e_password = 'pwd'
    settings.e2e_password_confirm = 'other'
    expect(validateE2e()).toBe('upload.e2e.passwordMismatch')
    settings.e2e_password_confirm = 'pwd'
    expect(validateE2e()).toBe('')
  })

  it('validatePickupCount：count 样式超上限 → 文案键；其余情况放行', () => {
    const { settings, validatePickupCount } = useShareSettings()
    // 非 count 样式（时间过期）不受取件次数上限约束
    settings.expire_value = 500
    expect(validatePickupCount(3)).toBe('')
    // count 样式：超限 → 键（显式拒绝，不静默钳制）；恰等上限 → 放行
    settings.expire_style = 'count'
    settings.expire_value = 4
    expect(validatePickupCount(3)).toBe('upload.pickupCountOverCap')
    settings.expire_value = 3
    expect(validatePickupCount(3)).toBe('')
    // 上限 0 / 缺字段 = 不限（老后端无此闸，不得误拦）
    settings.expire_value = 1000
    expect(validatePickupCount(0)).toBe('')
    expect(validatePickupCount(undefined)).toBe('')
    expect(validatePickupCount(-1)).toBe('')
  })

  it('reset 回默认值', () => {
    const { settings, reset } = useShareSettings()
    settings.expire_value = 99
    settings.password = 'x'
    settings.e2e = true
    reset()
    expect(settings).toEqual(defaultShareSettings())
  })
})

describe('resolveSiteDefaultExpireValue', () => {
  it('出厂默认(1 天) ⇒ 站点默认天数', () => {
    expect(resolveSiteDefaultExpireValue(1, 'day', 30)).toBe(30)
    expect(resolveSiteDefaultExpireValue(1, 'day', 7)).toBe(7)
  })

  it('缺字段/非法站点默认 ⇒ 兜底 7（与既有产品决策一致）', () => {
    expect(resolveSiteDefaultExpireValue(1, 'day', undefined)).toBe(7)
    expect(resolveSiteDefaultExpireValue(1, 'day', 0)).toBe(7)
    expect(resolveSiteDefaultExpireValue(1, 'day', -3)).toBe(7)
  })

  it('调用方自定义初值不动（非出厂默认/非 day 样式）', () => {
    expect(resolveSiteDefaultExpireValue(3, 'day', 30)).toBe(3)
    expect(resolveSiteDefaultExpireValue(1, 'week', 30)).toBe(1)
  })

  it('day 样式被管理台白名单裁掉时不动', () => {
    expect(resolveSiteDefaultExpireValue(1, 'day', 30, false)).toBe(1)
  })
})
