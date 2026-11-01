import { describe, expect, it } from 'vitest'
import {
  PICKUP_LEN,
  isPickupCode,
  normalizePickup,
  planPaste,
  resolveDispatch,
  splitTyping,
  stripSeparators,
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

describe('归一化（取件码字符表全大写 → 输入大小写不敏感）', () => {
  it('去空格/横杠 + 转大写', () => {
    expect(normalizePickup('vnxt 8s')).toBe('VNXT8S')
    expect(normalizePickup('VNXT-8S')).toBe('VNXT8S')
    expect(normalizePickup(' vnxt-8s ')).toBe('VNXT8S')
  })
  it('stripSeparators 只去分隔符、保留大小写（分享码区分大小写）', () => {
    expect(stripSeparators('aB3 xK-9mQ')).toBe('aB3xK9mQ')
  })
  it('resolveDispatch：空格/横杠/小写都命中同一取件码', () => {
    expect(resolveDispatch('vnxt 8s')).toEqual({ kind: 'retrieve', auto: true, code: 'VNXT8S' })
    expect(resolveDispatch('VNXT-8S')).toEqual({ kind: 'retrieve', auto: true, code: 'VNXT8S' })
    expect(resolveDispatch('vnxt8s')).toEqual({ kind: 'retrieve', auto: true, code: 'VNXT8S' })
  })
  it('resolveDispatch：8 位分享码保持原样（区分大小写，不做归一）', () => {
    expect(resolveDispatch('aB3xK9mQ')).toEqual({ kind: 'share', auto: false, code: 'aB3xK9mQ' })
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
  it('超出格数的长序列整段计为溢出', () => {
    expect(splitTyping('ABC12345', 7, '59XYZ', 8)).toEqual({
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
      target: { kind: 'retrieve', auto: true, code: 'ABC123' },
    })
  })
  it('≤6 位散串 → 回显等按钮', () => {
    expect(planPaste('ABC12')).toEqual({ display: 'ABC12', target: null })
  })
  it('7 位 → 整串走分享详情（不是取件码；自定义口令合法）', () => {
    expect(planPaste('ABC1234')).toEqual({
      display: 'ABC123',
      target: { kind: 'share', auto: false, code: 'ABC1234' },
    })
  })
  it('8 位分享码 → 回显前 6 位、整串走分享详情', () => {
    expect(planPaste('aB3xK9mQ')).toEqual({
      display: 'aB3xK9',
      target: { kind: 'share', auto: false, code: 'aB3xK9mQ' },
    })
  })
  it('9+ 位自定义口令（3-64 位合法）：整串走分享详情，不报错', () => {
    // 22 位自定义口令：upload.customCodePlaceholder 允许 3-32 位，
    // 与 /share/select 查库口径一致 —— 按长度白名单过滤会判死合法口令。
    const long = 'fede2e-Zzk2C6ZfSmVrTXOs'
    expect(planPaste(long)).toEqual({
      display: long.slice(0, 6),
      target: { kind: 'share', auto: false, code: long },
    })
  })
  it('超出 64 位上限 → 明确报错（不是合法口令形态，不拿去查库）', () => {
    expect(planPaste('a'.repeat(65))).toEqual({ display: '', target: null, invalid: true })
  })
  it('归一化：空格/横杠/小写都命中同一取件码', () => {
    expect(planPaste('vnxt 8s')).toEqual({
      display: 'VNXT8S',
      target: { kind: 'retrieve', auto: true, code: 'VNXT8S' },
    })
    expect(planPaste('VNXT-8S')).toEqual({
      display: 'VNXT8S',
      target: { kind: 'retrieve', auto: true, code: 'VNXT8S' },
    })
  })
  it('空白输入无动作', () => {
    expect(planPaste('   ')).toEqual({ display: '', target: null })
  })
})
