import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

export type SendTab = 'file' | 'text'

function normalize(q: unknown): SendTab {
  return q === 'text' ? 'text' : 'file'
}

/**
 * 发送页 tab 状态：?tab=file|text 深链直达，非法值回退 file。
 * watch route.query 使 URL 变化（深链跳转/前进后退/手改 hash）时 tab 跟随；
 * 与调用方 setTab 的 router.replace 构成双向同步（replace 回写触发的是同值赋值，no-op）。
 */
export function useSendTab(route: RouteLocationNormalizedLoaded): { activeTab: Ref<SendTab> } {
  const activeTab = ref<SendTab>(normalize(route.query.tab))
  watch(
    () => route.query.tab,
    q => {
      activeTab.value = normalize(q)
    }
  )
  return { activeTab }
}
