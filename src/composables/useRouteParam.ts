import { watch } from 'vue'

/**
 * 路由参数 → 副作用（取数 / 筛选）的统一粘合层。
 *
 * 为什么需要它（2026-10-23 浏览器实测，组件级改动必须看渲染结果才暴露）：
 *   hash 路由下，**同一路由记录**（如 /share/:code）参数变化时组件被**复用**，
 *   onMounted 不再触发 ⇒ 只在挂载时读一次参数的视图会一直显示**上一个**参数的
 *   内容。实测：地址栏已切到 B 码，页面仍渲染 A 码的正文与下载按钮（A 的内容挂
 *   在 B 的地址下），B 的 20001「分享未完成上传」错误态根本不出现。
 *   同一坑在本仓已出现过两次（useSendTab 的 ?tab=、admin/Config 的 ?section=），
 *   本次是**第三次复发** ⇒ 收敛成公共 composable，新视图按此写法读参数。
 *
 * 用法：
 *   useRouteParam(() => route.params.code as string | undefined, (code) => {
 *     if (!code) { error.value = t('share.codeRequired'); return }
 *     shareCode.value = code
 *     void fetchShare()
 *   })
 *
 * 默认 immediate=true：挂载即执行一次（等价于原来的 onMounted 取数），
 * 之后参数每次变化再执行一次（深链跳转 / 前进后退 / 手改 hash / 站内换码）。
 *
 * 语义约定：source 返回 undefined 时**仍会**执行 effect（由调用方决定怎么解释
 * 「参数没了」）—— 本函数不做隐式跳过，避免调用方以为「没回调 = 没变化」。
 */
export function useRouteParam<T>(
  source: () => T,
  effect: (value: T) => void,
  options: { immediate?: boolean } = {}
): void {
  // 包装一层：Vue 的 watch 回调是 (newValue, oldValue, onCleanup) 三参，
  // 直接把 effect 交给 watch 会让调用方的回调收到**三个**参数（与本函数的
  // 契约「只收一个值」不符，也容易被误当成 onCleanup 用）。
  watch(
    source,
    (value) => {
      effect(value)
    },
    { immediate: options.immediate ?? true }
  )
}
