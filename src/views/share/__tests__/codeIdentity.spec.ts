// 分享页「码的身份」判定表守卫（2026-10-23）。
//
// 实测缺陷：用 6 位取件码（别名）打开分享页时，界面把码标成「分享码」——
// 取件码是口令语义（凭码即可取件），与 8 位分享码强度不同；用户照着界面抄走
// 一个自己以为是分享码的取件口令。判定**不靠长度**（自定义码允许 3-32 位，
// 可能就是 6 位），靠与后端下发的规范分享码比对。
import { describe, it, expect } from 'vitest'
import { identifyShareCode } from '../codeIdentity'

describe('identifyShareCode', () => {
  it('URL 码 == 规范分享码 ⇒ 分享码', () => {
    const id = identifyShareCode('trjCWdeK', 'trjCWdeK')
    expect(id.isPickup).toBe(false)
    expect(id.labelKey).toBe('share.codeLabel')
    expect(id.labelWithCodeKey).toBe('share.codeWithLabel')
    expect(id.display).toBe('trjCWdeK')
  })

  it('URL 码是 6 位取件码（≠ 规范码）⇒ 取件码', () => {
    const id = identifyShareCode('TEUJTG', 'trjCWdeK')
    expect(id.isPickup).toBe(true)
    expect(id.labelKey).toBe('share.pickupCodeLabel')
    expect(id.labelWithCodeKey).toBe('share.pickupCodeWithLabel')
    // 展示值 = 用户进来的那个码（手里握着的凭据本身），不是后端规范码
    expect(id.display).toBe('TEUJTG')
  })

  it('大小写折叠命中时仍是分享码（后端返回库里的原样大小写）', () => {
    const id = identifyShareCode('trjcwdek', 'trjCWdeK')
    expect(id.isPickup).toBe(false)
    expect(id.labelKey).toBe('share.codeLabel')
  })

  it('规范码缺失（旧后端）⇒ 按分享码处理，不误标', () => {
    expect(identifyShareCode('TEUJTG', undefined).isPickup).toBe(false)
    expect(identifyShareCode('TEUJTG', '').isPickup).toBe(false)
    expect(identifyShareCode('TEUJTG', null).isPickup).toBe(false)
  })

  it('6 位自定义分享码（与规范码相同）⇒ 分享码（不靠长度猜）', () => {
    const id = identifyShareCode('abc123', 'abc123')
    expect(id.isPickup).toBe(false)
    expect(id.labelKey).toBe('share.codeLabel')
  })

  it('两侧空白被裁掉再比较（避免空格造成误判为别名）', () => {
    expect(identifyShareCode('  trjCWdeK  ', 'trjCWdeK').isPickup).toBe(false)
    expect(identifyShareCode('  TEUJTG ', 'trjCWdeK').display).toBe('TEUJTG')
  })
})
