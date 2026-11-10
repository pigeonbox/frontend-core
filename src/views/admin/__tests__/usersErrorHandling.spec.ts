// Users.vue 状态切换失败的错误收口守卫（A6 批「疑虑 3」建议，core#114 尾巴）。
//
// 事故形态：A6 把 /admin/users/:id/status 的错误出口统一到全站信封（带后端
// 可操作 message + trace_id）之后，Users.vue 的 toggleUserStatus catch 分支仍然
// 弹**固定 actionFailed 文案** ⇒ 后端错误被顶掉，管理员看不到「为什么失败」
// （A6 报告 §三.3 点名的 UX 回退）。
//
// 为什么是「源码级」：本仓**没有组件测试基建**（无 @vue/test-utils、无 jsdom）
// ⇒ 视图层只能做源码级断言，防的是「重构时把 handleError 改回固定文案」这类
// 无声回归；渲染正确性靠真机视觉自检。
//
// 守卫口径：
//   ① toggleUserStatus 的 catch 必须走 handleError(error)（透传 message/trace_id）；
//   ② catch 里不得再出现 actionFailed 固定文案顶掉后端错误；
//   ③ ElMessageBox 的取消守卫（error !== 'cancel'）必须保留——用户点「取消」
//      不是失败，弹错误 toast 是假警报。
import { describe, it, expect } from 'vitest'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const usersVue = stripComments(readSrc('views/admin/Users.vue'))

/** 取 `const <name> = async` 起到下一个顶层 `const ` 之间的源码 */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = async`)
  expect(start, `应能定位 ${name}`).toBeGreaterThan(-1)
  const next = src.indexOf('\nconst ', start + 1)
  return next < 0 ? src.slice(start) : src.slice(start, next)
}

describe('Users.vue 状态切换失败错误收口（A6 建议）', () => {
  const body = fnBody(usersVue, 'toggleUserStatus')

  it('toggleUserStatus 的 catch 必须走 handleError(error) 透传后端错误', () => {
    expect(body).toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]*?handleError\(error\)/)
  })

  it('catch 不得用固定 actionFailed 文案顶掉后端错误', () => {
    const at = body.indexOf('catch')
    expect(at, 'toggleUserStatus 应有 catch 分支').toBeGreaterThan(-1)
    expect(body.slice(at), 'catch 分支里不得再出现 actionFailed 固定文案').not.toContain('actionFailed')
  })

  it('ElMessageBox 取消守卫保留（error !== \'cancel\'，取消不是失败）', () => {
    expect(body).toMatch(/error\s*!==\s*'cancel'/)
  })
})
