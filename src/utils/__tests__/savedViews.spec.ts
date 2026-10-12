import { describe, it, expect, beforeEach } from 'vitest'
import { loadViews, saveView, deleteView } from '../savedViews'

// node 环境内存 polyfill（jsdom 未随 vitest 装配）
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

describe('savedViews', () => {
  it('保存/读取命名视图', () => {
    saveView('k', '我的视图', { keyword: 'a' })
    const views = loadViews('k')
    expect(views).toHaveLength(1)
    expect(views[0]!.name).toBe('我的视图')
    expect(views[0]!.filters).toEqual({ keyword: 'a' })
  })

  it('同名覆盖不重复', () => {
    saveView('k', 'v', { keyword: 'a' })
    saveView('k', 'v', { keyword: 'b' })
    const views = loadViews('k')
    expect(views).toHaveLength(1)
    expect(views[0]!.filters).toEqual({ keyword: 'b' })
  })

  it('名称去空白', () => {
    saveView('k', '  x  ', {})
    expect(loadViews('k')[0]!.name).toBe('x')
  })

  it('删除视图', () => {
    saveView('k', 'a', {})
    saveView('k', 'b', {})
    const views = deleteView('k', 'a')
    expect(views.map((v) => v.name)).toEqual(['b'])
  })

  it('坏数据不炸', () => {
    store.set('k', '{not-json')
    expect(loadViews('k')).toEqual([])
  })
})
