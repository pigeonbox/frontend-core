import { describe, expect, it } from 'vitest'
import { isPasswordFamilyError, isPasswordMissingOnly } from '../password-error'

// 取件页密码族判据（2026-10-22）。
//
// 后端用同一个错误码 20003 表达「需要密码」与「密码错误」，靠 data.has_password
// 区分。前端此前靠硬编码中文串比较 message === '需要密码'——后端措辞一变就会
// 在"只缺密码"时误弹错误提示。这里钉死结构化判据。

describe('isPasswordFamilyError（密码族错误识别）', () => {
  it('HTTP 401 即密码族（后端对需要密码/密码错误/缺下载令牌一律回 401）', () => {
    expect(isPasswordFamilyError({ code: 20003, response: { status: 401 } })).toBe(true)
  })

  it('裸 403（反向代理拒绝、无 JSON body）**不**算密码族', () => {
    // 旧实现把 code===403 也算密码族（历史兼容）——但后端**从不**产生业务码 403：
    // 密码错=20003→HTTP 401；取件次数耗尽=20004→HTTP 403（**不是**密码问题）。
    // request.ts 的包装 `code: data.code ?? error.response.status ?? 0` 会在
    // **裸 403**（无 body）时回退成 HTTP 状态码 ⇒ 旧实现把「代理拒绝」显示成
    // 「需要密码」= 误判 ⇒ 2026-10-25 删除该旧兼容。
    expect(isPasswordFamilyError({ code: 403 })).toBe(false)
    expect(isPasswordFamilyError({ code: 403, response: { status: 403 } })).toBe(false)
  })

  it('非密码族错误不误判', () => {
    expect(isPasswordFamilyError({ code: 20003, response: { status: 200 } })).toBe(false)
    expect(isPasswordFamilyError({ code: 10004, response: { status: 404 } })).toBe(false)
    expect(isPasswordFamilyError(undefined)).toBe(false)
  })
})

describe('isPasswordMissingOnly（只是缺密码 vs 密码填错）', () => {
  it('带 data.has_password ⇒ 只是缺密码（静默出密码框，不弹提示）', () => {
    expect(isPasswordMissingOnly({ code: 20003, message: '需要密码', data: { has_password: true } })).toBe(true)
  })

  it('无 data ⇒ 密码填错了（要弹提示）', () => {
    expect(isPasswordMissingOnly({ code: 20003, message: '密码错误' })).toBe(false)
  })

  it('不依赖 message 文案——后端措辞变化不影响判定', () => {
    // 旧实现比较 message === '需要密码'：文案一改就误判成"密码错误"并弹提示
    expect(isPasswordMissingOnly({ code: 20003, message: '请输入取件密码', data: { has_password: true } })).toBe(true)
  })
})
