// 管理台"保存视图"（2026-10-12 对标上游 view-presets）：筛选条件存为命名视图，
// 保存（同名覆盖）/应用/删除，一键切换高频查询。存储为 localStorage（浏览器本地，
// 不跨设备同步——管理台高频运维是单人单机场景，服务端持久化留待真实需求）。
export interface SavedView<T = Record<string, string>> {
  name: string
  filters: T
  createdAt: number
}

export function loadViews<T = Record<string, string>>(key: string): SavedView<T>[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// saveView 保存命名视图（同名覆盖；name 去空白防幽灵条目）。
export function saveView<T = Record<string, string>>(key: string, name: string, filters: T): SavedView<T>[] {
  const trimmed = name.trim()
  const views = loadViews<T>(key).filter((v) => v.name !== trimmed)
  views.push({ name: trimmed, filters, createdAt: Date.now() })
  localStorage.setItem(key, JSON.stringify(views))
  return views
}

export function deleteView<T = Record<string, string>>(key: string, name: string): SavedView<T>[] {
  const views = loadViews<T>(key).filter((v) => v.name !== name)
  localStorage.setItem(key, JSON.stringify(views))
  return views
}
