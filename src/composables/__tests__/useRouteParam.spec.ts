// 路由参数驱动取数的守卫（2026-10-23 浏览器实测暴露的缺陷）。
//
// 实测缺陷：hash 路由下同一路由记录（/share/:code）参数变化时组件被**复用**，
// onMounted 不再触发 ⇒ 只在挂载时读一次参数的视图一直显示**上一个**参数的
// 内容（实测：地址栏已切到 B 码，页面仍渲染 A 码的正文与下载按钮；B 的
// 20001「分享未完成上传」错误态根本不出现）。本仓同类坑此前已复发两次
// （useSendTab 的 ?tab=、admin/Config 的 ?section=），本次是第三处 ⇒ 收敛成
// useRouteParam 公共 composable，本测试钉住它的语义。
import { describe, it, expect, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useRouteParam } from '../useRouteParam'

const fakeRoute = (code?: string) =>
  reactive({
    params: code === undefined ? {} : { code },
  }) as unknown as RouteLocationNormalizedLoaded

describe('useRouteParam', () => {
  it('挂载即执行一次（等价于原来的 onMounted 取数）', () => {
    const effect = vi.fn()
    useRouteParam(() => 'A', effect)
    expect(effect).toHaveBeenCalledTimes(1)
    expect(effect).toHaveBeenCalledWith('A')
  })

  it('参数变化即再执行（深链跳转/前进后退/手改 hash/站内换码）', async () => {
    const route = fakeRoute('A')
    const effect = vi.fn()
    useRouteParam(() => route.params.code as string | undefined, effect)
    expect(effect).toHaveBeenCalledTimes(1)
    expect(effect).toHaveBeenLastCalledWith('A')

    route.params = { code: 'B' } // 同一路由记录，参数变了
    await nextTick()
    expect(effect).toHaveBeenCalledTimes(2)
    expect(effect).toHaveBeenLastCalledWith('B')
  })

  it('参数没变不重复执行（避免无谓请求）', async () => {
    const route = fakeRoute('A')
    const effect = vi.fn()
    useRouteParam(() => route.params.code as string | undefined, effect)

    route.params = { code: 'A' } // 同值
    await nextTick()
    expect(effect).toHaveBeenCalledTimes(1)
  })

  it('immediate:false 时不立即执行，但参数变化仍执行', async () => {
    const route = fakeRoute('A')
    const effect = vi.fn()
    useRouteParam(() => route.params.code as string | undefined, effect, { immediate: false })
    expect(effect).not.toHaveBeenCalled()

    route.params = { code: 'B' }
    await nextTick()
    expect(effect).toHaveBeenCalledTimes(1)
    expect(effect).toHaveBeenCalledWith('B')
  })

  it('参数消失时**仍**执行（不做隐式跳过：调用方自己决定怎么解释）', async () => {
    const route = fakeRoute('A')
    const effect = vi.fn()
    useRouteParam(() => route.params.code as string | undefined, effect)

    route.params = {}
    await nextTick()
    expect(effect).toHaveBeenCalledTimes(2)
    expect(effect).toHaveBeenLastCalledWith(undefined)
  })
})
