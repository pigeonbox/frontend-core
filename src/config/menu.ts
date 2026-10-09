import type { Component } from 'vue'
import { Bell, Document, Key, Monitor, Postcard, Share } from '@element-plus/icons-vue'

export interface MenuItem {
  path: string
  icon: Component
  /** i18n key */
  labelKey: string
}

/**
 * 用户中心侧边导航（桌面侧栏与移动抽屉共用同一份数据）。
 * 新增用户侧页面：先在 router 注册，再把菜单项加在这里——两处 UI 自动生效。
 */
export const userNavItems: MenuItem[] = [
  { path: '/user/dashboard', icon: Monitor, labelKey: 'user.nav_dashboard' },
  { path: '/user/shares', icon: Share, labelKey: 'user.nav_shares' },
  { path: '/user/history', icon: Document, labelKey: 'user.nav_history' },
  { path: '/user/notifications', icon: Bell, labelKey: 'user.nav_notifications' },
  { path: '/user/tokens', icon: Key, labelKey: 'user.nav_tokens' },
  { path: '/user/requests', icon: Postcard, labelKey: 'user.nav_requests' },
]
