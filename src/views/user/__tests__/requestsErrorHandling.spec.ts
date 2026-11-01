// 用户端「寄件请求」页错误反馈守卫（2026-10-26 审计 P1）。
//
// 事故形态：
//   · load() 只有 finally ⇒ 列表加载失败时页面渲染**空表格且不报错**
//     ⇒ 用户以为「自己从没建过请求」；
//   · remove() 整个函数没有 try/catch ⇒ el-popconfirm 回调 reject ⇒ 无提示、
//     列表不刷新 ⇒ **用户以为撤销成功，实际链接仍可对外投递**（最危险的一类
//     静默失败：承诺没兑现，但界面看起来一切正常）。
//
// 修法：两处都走 handleError(e)；撤销成功才弹 t('request.revoked') 并刷新列表。
import { describe, it, expect } from 'vitest'
import { readSrc, tryBlocks, stripComments } from '@/utils/__tests__/sourceScan'

const SRC = readSrc('views/user/Requests.vue')

describe('寄件请求：加载/撤销失败必须可见', () => {
  it('每个 await requestApi.* 的 try，其 catch 都必须调 handleError(', () => {
    const blocks = tryBlocks(SRC)
    const offenders: string[] = []
    let guarded = 0
    for (const b of blocks) {
      if (!/await\s+requestApi\./.test(b.tryBody)) continue
      if (b.catchBody.includes('handleError(')) guarded++
      else offenders.push((b.tryBody.trim().split('\n')[0] ?? '').slice(0, 90))
    }
    expect(
      offenders,
      `以下 API 调用所在的 try 没有 handleError( ⇒ 失败被静默吞掉：\n${offenders.join('\n')}`,
    ).toEqual([])
    // listMine / create / remove ⇒ 至少 3 处
    expect(guarded, '受保护的 API 调用点过少（守卫可能被误删）').toBeGreaterThanOrEqual(3)
  })

  it('load() 必须有 catch（列表加载失败不能只剩 finally）', () => {
    const start = SRC.indexOf('const load = async')
    expect(start, '应能定位 load()').toBeGreaterThan(-1)
    const body = SRC.slice(start, SRC.indexOf('\nconst ', start + 1))
    expect(body, 'load() 必须 catch 失败').toMatch(/catch\s*(\([^)]*\))?\s*\{[\s\S]*?handleError\(/)
  })

  it('remove() 必须整体包在 try/catch 里，且只有成功才弹「已撤销」', () => {
    const start = SRC.indexOf('const remove = async')
    expect(start, '应能定位 remove()').toBeGreaterThan(-1)
    const body = SRC.slice(start, SRC.indexOf('\nconst ', start + 1))
    // 只看代码：注释里写着「没有 try/catch」等字样，不能当成真代码
    const code = stripComments(body)
    expect(code, 'remove() 必须有 try/catch').toMatch(/try\s*\{[\s\S]*?catch/)
    expect(code, 'remove() 失败必须走 handleError').toContain('handleError(')
    // 「已撤销」提示必须落在 try 内的成功分支（失败分支不该弹它）
    const revokedAt = code.indexOf("t('request.revoked')")
    const catchAt = code.indexOf('catch')
    expect(revokedAt, 'remove() 应在成功时提示「已撤销」').toBeGreaterThan(-1)
    expect(catchAt, 'remove() 应有 catch').toBeGreaterThan(-1)
    expect(revokedAt, '「已撤销」提示必须在 catch 之前（成功分支）').toBeLessThan(catchAt)
  })
})
