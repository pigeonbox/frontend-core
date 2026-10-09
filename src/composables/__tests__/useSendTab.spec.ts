import { describe, it, expect } from 'vitest'
import { reactive, nextTick } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useSendTab } from '../useSendTab'

const fakeRoute = (tab?: string) =>
  reactive({ query: tab === undefined ? {} : { tab } }) as unknown as RouteLocationNormalizedLoaded

describe('useSendTab', () => {
  it('初始值跟随 ?tab（text 深链）', () => {
    const { activeTab } = useSendTab(fakeRoute('text'))
    expect(activeTab.value).toBe('text')
  })

  it('无参数/非法值回退 file', () => {
    expect(useSendTab(fakeRoute()).activeTab.value).toBe('file')
    expect(useSendTab(fakeRoute('bogus')).activeTab.value).toBe('file')
  })

  it('URL query 变化 tab 跟随（深链/前进后退/手改 hash 场景）', async () => {
    const route = fakeRoute('text')
    const { activeTab } = useSendTab(route)
    expect(activeTab.value).toBe('text')

    route.query = {} // /send?tab=text → /send
    await nextTick()
    expect(activeTab.value).toBe('file')

    route.query = { tab: 'text' } // /send → /send?tab=text
    await nextTick()
    expect(activeTab.value).toBe('text')

    route.query = { tab: 'bogus' } // 非法值回退
    await nextTick()
    expect(activeTab.value).toBe('file')
  })
})
