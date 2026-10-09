import { afterEach, describe, expect, it } from 'vitest'
import { appBase, resetBaseCache, withBase } from '@/utils/base'

// jsdom 不在测试栈里,node 环境:直接操纵 window.location 较麻烦,
// 用 history.pushState 改 pathname(node 环境无 location——mock 全局)。
const setLocation = (pathname: string) => {
  ;(globalThis as { window?: unknown }).window = {
    location: { pathname },
  }
  resetBaseCache()
}

afterEach(() => {
  setLocation('/')
})

describe('appBase', () => {
  it('根路径部署推导为空串', () => {
    setLocation('/')
    expect(appBase()).toBe('')
  })

  it('统一网关前缀推导为无尾斜杠前缀', () => {
    setLocation('/app/pigeonbox/')
    expect(appBase()).toBe('/app/pigeonbox')
  })

  it('index.html 直开剥掉文件名', () => {
    setLocation('/app/pigeonbox/index.html')
    expect(appBase()).toBe('/app/pigeonbox')
  })

  it('无尾斜杠前缀原样返回', () => {
    setLocation('/app/pigeonbox')
    expect(appBase()).toBe('/app/pigeonbox')
  })
})

describe('withBase', () => {
  it('根路径部署原样返回', () => {
    setLocation('/')
    expect(withBase('/api/v1/user/info')).toBe('/api/v1/user/info')
  })

  it('网关前缀下补全 API 路径', () => {
    setLocation('/app/pigeonbox/')
    expect(withBase('/api/v1/user/info')).toBe('/app/pigeonbox/api/v1/user/info')
  })

  it('hash 路由路径补前缀', () => {
    setLocation('/app/pigeonbox/')
    expect(withBase('/#/user/login')).toBe('/app/pigeonbox/#/user/login')
  })

  it('非根绝对路径与外链原样返回', () => {
    setLocation('/app/pigeonbox/')
    expect(withBase('api/relative')).toBe('api/relative')
    expect(withBase('https://example.com')).toBe('https://example.com')
    expect(withBase('//cdn.example.com/x')).toBe('//cdn.example.com/x')
  })
})
