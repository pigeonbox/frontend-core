// 登录后跳转参数守卫（frontend-core#120）。
//
// 事故形态：登录成功后 `router.push(query.redirect as string)` —— query 是
// 外部输入，`as string` 只是类型断言，数组/`//x`/`#/admin`/超长串都会原样
// 交给 vue-router。应用是 hash 路由 ⇒ 不构成外站 open redirect，但会落到
// 404 兜底、管理入口或依赖 vue-router 的隐式契约，体验上像「登录后乱跳」。
//
// 修法：纯函数 safeRedirect() 只放行站内路径，其余一律回落 '/'。
import { describe, expect, it } from 'vitest'
import { MAX_REDIRECT_LENGTH, safeRedirect } from '@/utils/safeRedirect'
import { listSrcFiles, readSrc, stripComments } from '@/utils/__tests__/sourceScan'

describe('safeRedirect：合法站内路径原样放行', () => {
  const allowed = [
    '/',
    '/files',
    '/admin/users',
    '/user/dashboard',
    '/user/dashboard?tab=recent&page=2',
    '/share/abc-123',
    '/files/中文名.txt'
  ]
  for (const path of allowed) {
    it(`放行 ${path}`, () => {
      expect(safeRedirect(path)).toBe(path)
    })
  }
})

describe('safeRedirect：异常输入一律回落 /', () => {
  const rejected: Array<[string, unknown]> = [
    // 协议相对 / 反斜杠（浏览器把 \ 归一化为 /，等价于 //host）
    ['双斜杠协议相对', '//evil.com'],
    ['反斜杠协议相对', '/\\evil.com'],
    ['内嵌反斜杠', '/files\\..\\admin'],
    // 绝对 URL / 其它 scheme
    ['https 绝对地址', 'https://evil.com'],
    ['http 绝对地址', 'http://evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    // hash 路由形态（redirect 里再带 # 不是站内 path）
    ['hash 开头', '#/admin'],
    ['path 后混入 hash', '/#/admin'],
    // 相对路径 / 空值 / 空白
    ['不带前导斜杠', 'admin/users'],
    ['空串', ''],
    ['纯空白', '   '],
    ['前后带空白', ' /files'],
    ['内嵌空白', '/files x'],
    // 控制字符
    ['换行', '/files\n'],
    ['制表符', '/files\tx'],
    ['NUL', '/files\u0000x'],
    // 长度上限（issue#120 建议 512，这里取 2048 的 URL 常规上限）
    ['超长串', '/' + 'a'.repeat(MAX_REDIRECT_LENGTH)],
    // 编码绕过：解码后是 // 、\ 、# 或控制字符
    ['编码双斜杠', '/%2F%2Fevil.com'],
    ['编码反斜杠', '/%5Cevil.com'],
    ['编码 hash', '/%23/admin'],
    ['编码换行', '/files%0A'],
    ['非法百分号转义', '/files%zz'],
    // 登录页自身（登录成功后跳回登录页 = 无意义循环）
    ['登录页自身', '/user/login'],
    ['登录页自身带 query', '/user/login?redirect=/files'],
    ['登录页自身带尾斜杠', '/user/login/']
  ]
  for (const [name, raw] of rejected) {
    it(`拒绝 ${name}`, () => {
      expect(safeRedirect(raw)).toBe('/')
    })
  }
})

describe('safeRedirect：非字符串（数组 query 等）回落 /', () => {
  const nonStrings: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['单值数组', ['/files']],
    ['多值数组（?redirect=a&redirect=b）', ['/files', '/admin']],
    ['数字', 42],
    ['布尔', true],
    ['对象', { path: '/files' }]
  ]
  for (const [name, raw] of nonStrings) {
    it(`拒绝 ${name}`, () => {
      expect(safeRedirect(raw)).toBe('/')
    })
  }
})

describe('safeRedirect：长度上限边界', () => {
  it('恰好 MAX_REDIRECT_LENGTH 的路径放行', () => {
    const maxPath = '/' + 'a'.repeat(MAX_REDIRECT_LENGTH - 1)
    expect(maxPath).toHaveLength(MAX_REDIRECT_LENGTH)
    expect(safeRedirect(maxPath)).toBe(maxPath)
  })

  it('超过 MAX_REDIRECT_LENGTH 一个字符即回落 /', () => {
    const over = '/' + 'a'.repeat(MAX_REDIRECT_LENGTH)
    expect(over).toHaveLength(MAX_REDIRECT_LENGTH + 1)
    expect(safeRedirect(over)).toBe('/')
  })
})

describe('Login.vue 调用点（源码级守卫）', () => {
  const src = stripComments(readSrc('views/user/Login.vue'))

  it('两处登录成功跳转都经 safeRedirect 取值', () => {
    const calls = src.match(/safeRedirect\(router\.currentRoute\.value\.query\.redirect\)/g) ?? []
    expect(calls).toHaveLength(2)
  })

  it('不再把 query.redirect 断言成 string', () => {
    expect(src).not.toMatch(/query\.redirect\s+as\s+string/)
  })

  it('不再把未校验的 redirect 直接交给 router.push', () => {
    expect(src).not.toMatch(/router\.push\(\s*redirect\s*\|\|/)
  })
})

describe('全仓同类用法清零（源码级守卫）', () => {
  it('src 生产代码中不再出现 query.redirect 的 string 断言', () => {
    const offenders = listSrcFiles()
      .filter((f) => !f.split('/').includes('__tests__'))
      .filter((f) => /query\.redirect\s+as\s+string/.test(stripComments(readSrc(f))))
    expect(offenders).toEqual([])
  })
})