import { createRouter, createWebHashHistory } from 'vue-router'
import { host } from '@/host'
import { adminBasePath } from '@/utils/adminPath'
import { i18n } from '@/i18n'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/home/index.vue'),
    meta: { title: 'route.home' },
  },
  {
    path: '/send',
    name: 'Send',
    component: () => import('@/views/home/Send.vue'),
    meta: { title: 'route.send' },
  },
  {
    path: '/share/:code',
    name: 'ShareView',
    component: () => import('@/views/share/View.vue'),
    meta: { title: 'route.share' },
  },
  {
    // 2026-10-09 取件执行融合进首页：/retrieve 退役为兼容重定向——
    // 联邦跨站跳转协议仍是 外部节点#/retrieve?code=（旧版节点为独立页），
    // 旧深链/旧收藏/他站公告落此处统一转首页就地取件
    path: '/retrieve',
    redirect: (to) => ({
      path: '/',
      query: to.query.code ? { code: to.query.code as string } : {},
    }),
  },
  {
    path: '/retrieve/result',
    name: 'AnonymousResult',
    component: () => import('@/views/anonymous/Result.vue'),
    meta: { title: 'route.retrieveResult' },
  },
  {
    path: '/user/login',
    name: 'Login',
    component: () => import('@/views/user/Login.vue'),
    meta: { title: 'route.login' },
  },
  {
    path: '/user/register',
    name: 'Register',
    component: () => import('@/views/user/Register.vue'),
    meta: { title: 'route.register' },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/setup/Index.vue'),
    meta: { title: 'route.setup' },
  },
  {
    path: '/user',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'UserDashboard',
        component: () => import('@/views/user/Dashboard.vue'),
        meta: { title: 'route.userDashboard', requiresAuth: true },
      },
      {
        path: 'shares',
        name: 'UserShares',
        component: () => import('@/views/user/Shares.vue'),
        meta: { title: 'route.userShares', requiresAuth: true },
      },
      {
        path: 'history',
        name: 'UserHistory',
        component: () => import('@/views/user/History.vue'),
        meta: { title: 'route.userHistory', requiresAuth: true },
      },
      {
        path: 'notifications',
        name: 'UserNotifications',
        component: () => import('@/views/user/Notifications.vue'),
        meta: { title: 'route.userNotifications', requiresAuth: true },
      },
      {
        path: 'tokens',
        name: 'UserTokens',
        component: () => import('@/views/user/Tokens.vue'),
        meta: { title: 'route.userTokens', requiresAuth: true },
      },
      {
        path: 'requests',
        name: 'UserRequests',
        component: () => import('@/views/user/Requests.vue'),
        meta: { title: 'route.userRequests', requiresAuth: true },
      },
    ],
  },
  {
    path: '/request/:token',
    name: 'RequestPickup',
    component: () => import('@/views/request/Pickup.vue'),
    meta: { title: 'route.requestPickup' },
  },
  {
    path: '/oidc/callback',
    name: 'OidcCallback',
    component: () => import('@/views/user/OidcCallback.vue'),
    meta: { title: 'route.oidcCallback' },
  },
  {
    path: '/api-docs',
    name: 'ApiDocs',
    component: () => import('@/views/Docs.vue'),
    meta: { title: 'route.apiDocs' },
  },
  // 未知路由兜底：admin 路由族由守卫在首个导航 lazy addRoute（静态路由排序恒
  // 高于通配,注册后的 admin 路由不受影响;守卫对 admin 前缀有重新解析逻辑）
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: 'route.notFound' },
  },
]

// adminRoutes 管理后台路由族（登录页+后台）：base 可替换实现管理入口路径混淆
// （#502，ui.admin_path / PB_UI_ADMIN_PATH，缺省 /admin；自定义后 /admin 不再
// 注册，落 404 兜底）。由守卫在首个导航时按公开配置 lazy 注册。
function adminRoutes(base: string): RouteRecordRaw[] {
  return [
  {
    path: `${base}/login`,
    name: 'AdminLogin',
    component: () => import('@/views/admin/Login.vue'),
    meta: { title: 'route.adminLogin' },
  },
  {
    path: base,
    name: 'Admin',
    component: () => import('@/views/admin/index.vue'),
    meta: { title: 'route.admin', requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'AdminDashboard',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { title: 'route.adminDashboard' },
      },
      {
        path: 'dashboard',
        name: 'AdminDashboardAlias',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { title: 'route.adminDashboard' },
      },
      {
        path: 'files',
        name: 'AdminFiles',
        component: () => import('@/views/admin/Files.vue'),
        meta: { title: 'route.adminFiles' },
      },
      {
        path: 'local-files',
        name: 'AdminLocalFiles',
        component: () => import('@/views/admin/LocalFiles.vue'),
        meta: { title: 'route.adminLocalFiles' },
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('@/views/admin/Users.vue'),
        meta: { title: 'route.adminUsers' },
      },
      {
        path: 'config',
        name: 'AdminConfig',
        component: () => import('@/views/admin/Config.vue'),
        meta: { title: 'route.adminConfig' },
      },
      {
        path: 'storage',
        name: 'AdminStorage',
        component: () => import('@/views/admin/Storage.vue'),
        meta: { title: 'route.adminStorage' },
      },
      {
        path: 'logs',
        name: 'AdminLogs',
        component: () => import('@/views/admin/TransferLogs.vue'),
        meta: { title: 'route.adminLogs' },
      },
      {
        path: 'moderation',
        name: 'AdminModeration',
        component: () => import('@/views/admin/Moderation.vue'),
        meta: { title: 'route.adminModeration' },
      },
      {
        path: 'p2p',
        name: 'AdminP2pTransfer',
        component: () => import('@/views/admin/P2pTransfer.vue'),
        meta: { title: 'route.adminP2p' },
      },
      {
        path: 'activities',
        name: 'AdminActivities',
        component: () => import('@/views/admin/Activities.vue'),
        meta: { title: 'route.adminActivities' },
      },
      {
        path: 'maintenance',
        name: 'AdminMaintenance',
        component: () => import('@/views/admin/Maintenance.vue'),
        meta: { title: 'route.adminMaintenance' },
      },
      {
        path: 'announcements',
        name: 'AdminAnnouncements',
        component: () => import('@/views/admin/Announcements.vue'),
        meta: { title: 'route.adminAnnouncements' },
      },
    ],
  },
  ]
}

const router = createRouter({
  history: createWebHashHistory(),  // 使用 hash 模式，避免与后端 API 路由冲突
  routes,
})

// 未初始化状态缓存（对标上游未初始化全站拦截：唯一入口= /setup 向导）
let initChecked = false
let systemInitialized = true

// 管理入口路由族的 lazy 注册状态（#502 路径混淆）
let adminRoutesInstalled = false
let adminBase = '/admin'

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  // 首个导航做一次初始化探测（会话内缓存；探测失败放行，避免后端不可达时锁死）
  if (!initChecked && to.path !== '/setup') {
    initChecked = true
    try {
      const { publicApi } = await import('@/api/public')
      const res = await publicApi.checkInitialization()
      systemInitialized = !!res.initialized
    } catch {
      systemInitialized = true
    }
    if (!systemInitialized) {
      next('/setup')
      return
    }
  }
  if (to.path === '/setup' && initChecked && systemInitialized) {
    next('/')
    return
  }

  // 管理入口路径混淆（#502）：首个导航按公开配置注册 admin 路由族。
  // 自定义后 /admin 不注册（落 404 兜底），仅 `/<adminPath>` 可达。
  if (!adminRoutesInstalled) {
    adminRoutesInstalled = true
    try {
      const { useConfigStore } = await import('@/stores/config')
      const cfg = useConfigStore()
      if (!cfg.loaded) await cfg.fetchConfig().catch(() => null)
      adminBase = adminBasePath(cfg.config?.adminPath)
    } catch {
      adminBase = '/admin'
    }
    for (const r of adminRoutes(adminBase)) router.addRoute(r)
    if (to.path === adminBase || to.path.startsWith(adminBase + '/')) {
      // 动态路由注册前本导航已按 404 兜底解析，重新解析以匹配新路由
      next({ ...to, replace: true })
      return
    }
  }

  // 设置页面标题（meta.title 存 i18n key，此处按当前 locale 解析；无 title 落品牌名）
  const title = to.meta.title ? i18n.global.t(to.meta.title as string) : 'PigeonBox'
  document.title = title
  // 宿主窗口标题同步(经统一网关内嵌宿主时窗口标题由应用管理;无宿主 no-op)
  host.setTitle(title).catch(() => {})

  // 检查是否需要登录
  if (to.meta.requiresAuth) {
    // 会话标记（非敏感）：真实鉴权在服务端（HttpOnly Cookie + 中间件）
    const session = localStorage.getItem('fcb_session')
    if (!session) {
      // 如果是管理后台，跳转到管理员登录页面
      if (to.path === adminBase || to.path.startsWith(adminBase + '/')) {
        next(adminBase + '/login')
      } else {
        next('/user/login')
      }
      return
    }

    // 检查是否需要管理员权限
    // NOTE: userRole 仅作客户端 UX 路由控制，非安全鉴权。
    // 真正的 admin 权限由后端中间件（admin_auth）在每个 /admin API 强制校验。
    if (to.meta.requiresAdmin) {
      const userRole = localStorage.getItem('userRole')
      if (userRole !== 'admin') {
        next(adminBase + '/login')
        return
      }
    }
  }

  next()
})

export default router

/** 管理后台路由基址（守卫按公开配置决定；供管理端内导航/入口链接复用） */
export function getAdminBase(): string {
  return adminBase
}
