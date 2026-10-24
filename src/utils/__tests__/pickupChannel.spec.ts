import { describe, it, expect } from 'vitest'
import { isPickupChannel, PICKUP_CHANNELS } from '../pickupChannel'

describe('isPickupChannel', () => {
  it('已知交付面判定为真', () => {
    for (const ch of PICKUP_CHANNELS) {
      expect(isPickupChannel(ch)).toBe(true)
    }
  })

  it('未知/空/非字符串判定为假（前端原样回显，不显示空白）', () => {
    expect(isPickupChannel('unknown-face')).toBe(false)
    expect(isPickupChannel('')).toBe(false)
    expect(isPickupChannel(null)).toBe(false)
    expect(isPickupChannel(undefined)).toBe(false)
    expect(isPickupChannel(42)).toBe(false)
  })
})
