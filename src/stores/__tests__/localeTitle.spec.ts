// 切语言后 document.title 必须按当前路由 meta.title 重算（frontend-core#99）。
//
// 此前 document.title 全仓唯一写点在导航守卫（router/index.ts beforeEach）——
// 切语言不导航 ⇒ 标签停在旧语言，直到下次跳转。修法：守卫与语言切换共用同一
// 函数（utils/documentTitle.ts）：导航时记下当前 title key，locale 切换按 key 重算。
//
// node 环境无 document / localStorage ⇒ 桩一个（locale store 创建时两者都要读写）。
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const doc = { title: 'STALE', documentElement: { lang: 'zh-CN' } }

beforeAll(() => {
  ;(globalThis as { document?: unknown }).document = doc
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  }
})

import { applyDocumentTitle } from '@/utils/documentTitle'
import { useLocaleStore } from '@/stores/locale'
import { i18n } from '@/i18n'
import { readSrc } from '@/utils/__tests__/sourceScan'

describe('切语言刷新 document.title（frontend-core#99）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'zh-CN'
    doc.title = 'STALE'
    doc.documentElement.lang = 'zh-CN'
  })

  it('applyDocumentTitle 按当前 locale 解析 meta.title（守卫共用入口）', () => {
    applyDocumentTitle('route.home')
    expect(doc.title).toBe('首页')
  })

  it('setLocale 切语言后标题随语言重算（此前停在旧语言直到下次导航）', () => {
    applyDocumentTitle('route.home') // 模拟导航守卫已设过标题
    expect(doc.title).toBe('首页')

    const store = useLocaleStore()
    store.setLocale('en-US')

    expect(doc.title).toBe('Home')
    expect(doc.documentElement.lang).toBe('en-US')
  })

  it('守卫与语言切换共用同一函数（守卫不再自己写 document.title）', () => {
    const routerSrc = readSrc('router/index.ts')
    expect(routerSrc).toContain('applyDocumentTitle(')
    expect(routerSrc).not.toMatch(/document\.title\s*=/)
    expect(readSrc('stores/locale.ts')).toContain('refreshDocumentTitle')
  })
})
