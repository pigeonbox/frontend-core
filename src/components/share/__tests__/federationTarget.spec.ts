// 对方柜地址（跨站投递 target_url）的**格式**校验守卫。
//
// 判据：前端只拦「怎么写都发不出去」的输入（空串 / 缺 scheme / 非 http(s) /
// 带用户名口令）；**不拦**「对端没登记」——那是服务端的闸（未登记一律拒绝，
// 且不发任何出站请求）⇒ 前端自己发明地址语义只会与服务端口径漂移。
import { describe, it, expect } from 'vitest'
import { checkTargetUrl } from '@/components/share/federationTarget'

describe('对方柜地址格式校验（跨站投递）', () => {
  it('空串 ⇒ empty', () => {
    expect(checkTargetUrl('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkTargetUrl('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('缺少 scheme / 不是网址 ⇒ invalid', () => {
    expect(checkTargetUrl('box.example.com')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkTargetUrl('http://')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkTargetUrl('://x')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('非 http(s) 协议 ⇒ invalid（服务端只收 http/https）', () => {
    expect(checkTargetUrl('ftp://box.example.com')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkTargetUrl('file:///etc/passwd')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkTargetUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('带用户名/口令 ⇒ credentials（服务端明确拒绝凭证形态的地址）', () => {
    expect(checkTargetUrl('http://user:pass@box.example.com')).toEqual({
      ok: false,
      reason: 'credentials',
    })
  })

  it('合法地址通过，且只去掉首尾空白（不做大小写/端口/尾斜杠归一化）', () => {
    expect(checkTargetUrl('  http://10.10.30.253:12345  ')).toEqual({
      ok: true,
      url: 'http://10.10.30.253:12345',
    })
    // 尾斜杠与大小写交给服务端归一化（core 的 NormalizePeerURL）⇒ 前端不改写
    expect(checkTargetUrl('http://Box.Example.com/')).toEqual({
      ok: true,
      url: 'http://Box.Example.com/',
    })
    expect(checkTargetUrl('https://box.example.com/sub/path')).toEqual({
      ok: true,
      url: 'https://box.example.com/sub/path',
    })
  })
})
