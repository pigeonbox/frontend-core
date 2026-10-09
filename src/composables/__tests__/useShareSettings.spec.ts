import { describe, it, expect } from 'vitest'
import { useShareSettings, defaultShareSettings } from '../useShareSettings'

describe('useShareSettings', () => {
  it('默认值与既有上传/文本分享表单一致', () => {
    expect(defaultShareSettings()).toEqual({
      expire_value: 1,
      expire_style: 'day',
      require_auth: false,
      password: '',
      e2e: false,
      custom_code: '',
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

  it('reset 回默认值', () => {
    const { settings, reset } = useShareSettings()
    settings.expire_value = 99
    settings.password = 'x'
    settings.e2e = true
    reset()
    expect(settings).toEqual(defaultShareSettings())
  })
})
