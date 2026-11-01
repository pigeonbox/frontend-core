// 用户端「我的分享」错误反馈守卫（2026-10-26 审计 P1）。
//
// 事故形态：单条删除 / 批量删除 / 恢复 / 批量恢复 / 彻底删除 五处 catch 把 API
// 异常整个吃掉（`catch (e) { /* */ }`）⇒ 请求层不弹 toast ⇒ 页面**零反馈**：
// 用户点「恢复」后确认框关闭但什么都没发生，无法区分「没反应」与「失败」。
//
// 修法：把「用户取消确认框」与「API 调用失败」拆成两个 try——
//   · 确认框的 catch ⇒ 直接 return（取消不是错误）；
//   · API 段的 catch ⇒ 走本页统一的 handleError(e)。
//
// 本仓无组件测试基建 ⇒ 源码级断言：凡「try 里 await 了 userSharesApi.*」的
// try，其 catch 必须含 handleError(。
import { describe, it, expect } from 'vitest'
import { readSrc, tryBlocks } from '@/utils/__tests__/sourceScan'

const SRC = readSrc('views/user/Shares.vue')

describe('我的分享：API 失败必须走 handleError', () => {
  it('每个 await userSharesApi.* 的 try，其 catch 都必须调 handleError(', () => {
    const blocks = tryBlocks(SRC)
    const offenders: string[] = []
    let guarded = 0
    for (const b of blocks) {
      if (!/await\s+userSharesApi\./.test(b.tryBody)) continue
      if (b.catchBody.includes('handleError(')) guarded++
      else offenders.push((b.tryBody.trim().split('\n')[0] ?? '').slice(0, 90))
    }
    expect(
      offenders,
      `以下 API 调用所在的 try 没有 handleError( ⇒ 失败被静默吞掉：\n${offenders.join('\n')}`,
    ).toEqual([])
    // 单删 / 批删 / 恢复 / 批恢复 / 彻底删除 + 列表加载 ⇒ 至少 6 处
    expect(guarded, '受保护的 API 调用点过少（守卫可能被误删）').toBeGreaterThanOrEqual(6)
  })

  it('确认框的取消必须与 API 失败分开（确认框的 catch 只允许直接 return）', () => {
    const blocks = tryBlocks(SRC)
    const confirmBlocks = blocks.filter((b) => b.tryBody.includes('ElMessageBox.confirm'))
    expect(confirmBlocks.length, '应至少有一处确认框').toBeGreaterThan(0)
    for (const b of confirmBlocks) {
      expect(b.catchBody, '确认框的 catch 不该弹错误 toast（取消不是错误）').not.toContain(
        'handleError(',
      )
      expect(b.catchBody, '确认框的 catch 应直接 return').toMatch(/return/)
    }
  })

  it('不得残留空 catch（`catch (e) { /* */ }` 吞掉一切）', () => {
    expect(SRC, '不应再有空 catch 吞异常').not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\/\*\s*\*\/\s*\}/)
  })

  it('本页必须已接入 useErrorHandler', () => {
    expect(SRC).toContain("import { useErrorHandler } from '@/composables/useErrorHandler'")
    expect(SRC).toContain('const { handleError } = useErrorHandler()')
  })
})
