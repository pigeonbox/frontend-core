// 对方柜回传的取件码：**取用口径**守卫（跨站投递，2026-11-01）。
//
// 事故面（core 的 ShareResult.PickupCode 注释「未铸造为空」）：对方柜**可能不回码**，
// 而且「不回码」有两种形态——字段**缺省**（undefined）与字段**空串**（''）。
// ⇒ 两者都**不得**渲染成空码框（访客会以为界面坏了）⇒ 必须走「去对方柜查看」的说明。
import { describe, it, expect } from 'vitest'
import { pickupCodeOf } from '@/components/share/federationResult'

describe('对方柜取件码的取用口径', () => {
  it('有码：原样取用（去首尾空白）', () => {
    expect(pickupCodeOf({ pickup_code: '654321' })).toBe('654321')
    expect(pickupCodeOf({ pickup_code: ' 654321 ' })).toBe('654321')
  })

  it('字段缺省（undefined）⇒ 没有码', () => {
    expect(pickupCodeOf({})).toBe('')
    expect(pickupCodeOf({ pickup_code: undefined })).toBe('')
    expect(pickupCodeOf(null)).toBe('')
    expect(pickupCodeOf(undefined)).toBe('')
  })

  it('字段空串（服务端「未铸造为空」）⇒ 同样是没有码（不留空码框）', () => {
    expect(pickupCodeOf({ pickup_code: '' })).toBe('')
    expect(pickupCodeOf({ pickup_code: '   ' })).toBe('')
  })
})
