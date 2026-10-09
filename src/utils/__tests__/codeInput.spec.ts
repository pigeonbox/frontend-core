import { describe, expect, it } from 'vitest'
import {
  MAX_BOXES,
  PICKUP_LEN,
  isPickupCode,
  planPaste,
  resolveDispatch,
  splitTyping,
} from '../codeInput'

describe('isPickupCode', () => {
  it('恰 6 位字母数字为取件码', () => {
    expect(isPickupCode('ABC123')).toBe(true)
    expect(isPickupCode('abc123')).toBe(true)
  })
  it('长度或字符集不符不是取件码', () => {
    expect(isPickupCode('ABC1234')).toBe(false)
    expect(isPickupCode('ABC12')).toBe(false)
    expect(isPickupCode('ABC-12')).toBe(false)
    expect(isPickupCode('')).toBe(false)
  })
})

describe('resolveDispatch（按码长分派）', () => {
  it('6 位 → 匿名取件且带密码预检', () => {
    expect(resolveDispatch(' ABC123 ')).toEqual({
      kind: 'retrieve',
      auto: true,
      code: 'ABC123',
    })
  })
  it('8 位分享码 → 分享详情', () => {
    expect(resolveDispatch('aB3xK9mQ')).toEqual({
      kind: 'share',
      auto: false,
      code: 'aB3xK9mQ',
    })
  })
  it('超长自定义口令按整串分派', () => {
    const long = 'fede2e-Zzk2C6ZfSmVrTXOs'
    expect(resolveDispatch(long)).toEqual({ kind: 'share', auto: false, code: long })
  })
  it('空输入返回 null（调用方提示）', () => {
    expect(resolveDispatch('')).toBeNull()
    expect(resolveDispatch('   ')).toBeNull()
  })
})

describe('splitTyping（分格顺延与溢出）', () => {
  it('普通逐格写入无溢出', () => {
    expect(splitTyping('ABC', 3, 'DEF', PICKUP_LEN)).toEqual({ value: 'ABCDEF', overflow: '' })
  })
  it('末格续输溢出：值不变、整段上抛（6→8 扩格依据；typed 含该格已有字符）', () => {
    expect(splitTyping('ABC123', 5, '3d', PICKUP_LEN)).toEqual({ value: 'ABC123', overflow: 'd' })
  })
  it('快速连续输入跨格顺延', () => {
    expect(splitTyping('', 0, 'ABCDEF', PICKUP_LEN)).toEqual({ value: 'ABCDEF', overflow: '' })
  })
  it('超出 MAX_BOXES 的长序列整段计为溢出', () => {
    expect(splitTyping('ABC12345', 7, '59XYZ', MAX_BOXES)).toEqual({
      value: 'ABC12345',
      overflow: '9XYZ',
    })
  })
  it('中格改写不溢出', () => {
    expect(splitTyping('ABC123', 2, 'x', PICKUP_LEN)).toEqual({ value: 'ABx123', overflow: '' })
  })
})

describe('planPaste（粘贴整段分派）', () => {
  it('6 位 → 立即匿名取件', () => {
    expect(planPaste('ABC123')).toEqual({
      display: 'ABC123',
      expand: false,
      target: { kind: 'retrieve', auto: true, code: 'ABC123' },
    })
  })
  it('7 位 → 扩格回显但不提交（等按钮）', () => {
    expect(planPaste('ABC1234')).toEqual({ display: 'ABC1234', expand: true, target: null })
  })
  it('8 位 → 扩格并立即走分享详情', () => {
    expect(planPaste('aB3xK9mQ')).toEqual({
      display: 'aB3xK9mQ',
      expand: true,
      target: { kind: 'share', auto: false, code: 'aB3xK9mQ' },
    })
  })
  it('>8 位口令：回显前 8 位、按整串分派', () => {
    const long = 'fede2e-Zzk2C6ZfSmVrTXOs'
    expect(planPaste(long)).toEqual({
      display: long.slice(0, MAX_BOXES),
      expand: true,
      target: { kind: 'share', auto: false, code: long },
    })
  })
  it('空白输入无动作', () => {
    expect(planPaste('   ')).toEqual({ display: '', expand: false, target: null })
  })
})
