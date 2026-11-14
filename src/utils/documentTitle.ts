// document.title 的唯一写入口（frontend-core#99：导航守卫与语言切换共用）。
//
// 此前唯一写点在 router/index.ts 的 beforeEach——切语言不导航 ⇒ 标签停在旧
// 语言直到下次跳转。这里额外记住最近一次应用的 title key：locale 切换时按
// **当前路由**的 meta.title 重算（守卫每次导航都会更新该 key，语义等价于
// 读 currentRoute，且不引入 locale store → router 的循环依赖）。
import { i18n } from '@/i18n'
import { host } from '@/host'

let currentTitleKey: string | undefined

/** 按 meta.title（i18n key）重算 document.title；无 title 落品牌名。导航守卫调用。 */
export function applyDocumentTitle(titleKey?: string): void {
  currentTitleKey = titleKey
  const title = titleKey ? i18n.global.t(titleKey) : 'PigeonBox'
  document.title = title
  // 宿主窗口标题同步（经统一网关内嵌宿主时窗口标题由应用管理；无宿主 no-op）
  host.setTitle(title).catch(() => {})
}

/** 语言切换后按当前路由 meta.title 重算标题（与守卫同一入口，frontend-core#99） */
export function refreshDocumentTitle(): void {
  applyDocumentTitle(currentTitleKey)
}
