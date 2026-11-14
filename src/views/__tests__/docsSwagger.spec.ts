// Swagger try-it-out 的写请求必须带 X-Requested-With（frontend-core#100）。
//
// 后端 CSRF 中间件（core pkg/middleware/auth.go）：Cookie 认证 + 非安全方法 +
// 缺 X-Requested-With ⇒ 403「缺少 CSRF 头」。应用内两条请求通道都全局补头
// （utils/request.ts、api/_xhr.ts），唯独文档页的 Swagger 原生请求不补 ⇒
// Cookie 会话用户 Try it out 恒 403（GET 正常、API Key 通道免疫 ⇒ 现象隐蔽）。
import { describe, it, expect } from 'vitest'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const SRC = stripComments(readSrc('views/Docs.vue'))

describe('Docs.vue Swagger requestInterceptor（frontend-core#100）', () => {
  it('SwaggerUI 配置了 requestInterceptor', () => {
    expect(SRC).toContain('requestInterceptor')
  })

  it('拦截器注入 X-Requested-With: XMLHttpRequest（与 utils/request.ts 同值）', () => {
    expect(SRC).toMatch(/['"]X-Requested-With['"]\s*:\s*['"]XMLHttpRequest['"]/)
  })

  it('try-it-out 保持开启（拦截器存在的前提）', () => {
    expect(SRC).toContain('tryItOutEnabled: true')
  })
})
