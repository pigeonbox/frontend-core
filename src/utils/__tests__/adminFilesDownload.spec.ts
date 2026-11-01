// 管理台文件下载**必须走统一 axios 实例**（2026-10-26 审计 P1）。
//
// 事故形态：views/admin/Files.vue 的 downloadFile 此前用**裸 axios**
// （`const { default: axios } = await import('axios')`）——全仓仅此一处绕过
// 统一实例（src/utils/request.ts，baseURL = VITE_API_BASE_URL || appBase()）。
// 裸 axios 走浏览器**根路径**，不带部署前缀 ⇒ 在「统一网关下页面挂在
// /app/pigeonbox/ 前缀」的部署形态（src/utils/base.ts 的 appBase() 明确支持）
// 下**必然 404 ⇒ 管理台一个文件都下载不了**。
//
// 守卫：① 源码级断言（不得再出现裸 axios）；② 运行时断言（统一实例的 baseURL
// 必须带部署前缀）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

// 只看**代码**：注释里为了说明历史缺陷会引用这些字面量（`await import('axios')`），
// 那不是真代码 ⇒ 扫描前先剥注释。
const FILES_VUE = stripComments(readSrc('views/admin/Files.vue'))

describe('管理台文件下载通道', () => {
  it('不得绕过统一实例（裸 axios ⇒ 前缀部署下必然 404）', () => {
    expect(FILES_VUE, '不得再用 await import(\'axios\') 拿裸 axios').not.toMatch(
      /await\s+import\(\s*['"]axios['"]\s*\)/
    )
    expect(FILES_VUE, '不得出现裸 axios.get').not.toMatch(/(?<![.\w$])axios\s*\.\s*get/)
  })

  it('必须用统一实例取 blob', () => {
    expect(FILES_VUE).toContain("import { request } from '@/utils/request'")
    expect(FILES_VUE, '下载必须以 blob 响应类型取响应体').toMatch(/responseType:\s*'blob'/)
    expect(FILES_VUE, '下载 URL 必须仍走 adminApi（单一真相源）').toContain(
      'adminApi.fileDownloadUrl(row.id)'
    )
  })

  it('统一实例的 baseURL 必须带部署前缀（/app/pigeonbox/ 形态）', async () => {
    vi.resetModules()
    const g = globalThis as { window?: unknown }
    const prev = g.window
    // 模拟「统一网关下页面挂在 /app/pigeonbox/ 前缀」的部署形态
    g.window = { location: { pathname: '/app/pigeonbox/index.html' } }
    try {
      const mod = await import('@/utils/request')
      expect(
        mod.default.defaults.baseURL,
        '统一实例 baseURL 必须含部署前缀（否则管理台下载 404）',
      ).toBe('/app/pigeonbox')
    } finally {
      if (prev === undefined) delete g.window
      else g.window = prev
      vi.resetModules()
    }
  })
})

afterEach(() => {
  vi.resetModules()
})
