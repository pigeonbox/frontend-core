import { createRouter, createWebHashHistory } from 'vue-router'
import { host } from '@/host'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/home/index.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/send',
    name: 'Send',
    component: () => import('@/views/home/Send.vue'),
    meta: { title: '发送' },
  },
  {
    path: '/share/:code',
    name: 'ShareView',
    component: () => import('@/views/share/View.vue'),
    meta: { title: '分享详情' },
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
    meta: { title: '取件结果' },
  },
  {
    path: '/user/login',
    name: 'Login',
    component: () => import('@/views/user/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/user/register',
    name: 'Register',
    component: () => import('@/views/user/Register.vue'),
    meta: { title: '注册' },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/setup/Index.vue'),
    meta: { title: '系统初始化' },
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
        meta: { title: '用户中心', requiresAuth: true },
      },
      {
        path: 'shares',
        name: 'UserShares',
        component: () => import('@/views/user/Shares.vue'),
        meta: { title: '我的分享', requiresAuth: true },
      },
      {
        path: 'history',
        name: 'UserHistory',
        component: () => import('@/views/user/History.vue'),
        meta: { title: '取件历史', requiresAuth: true },
      },
      {
        path: 'notifications',
        name: 'UserNotifications',
        component: () => import('@/views/user/Notifications.vue'),
        meta: { title: '通知', requiresAuth: true },
      },
      {
        path: 'tokens',
        name: 'UserTokens',
        component: () => import('@/views/user/Tokens.vue'),
        meta: { title: 'API 令牌', requiresAuth: true },
      },
      {
        path: 'requests',
        name: 'UserRequests',
        component: () => import('@/views/user/Requests.vue'),
        meta: { title: '寄件码', requiresAuth: true },
      },
    ],
  },
  {
    path: '/request/:token',
    name: 'RequestPickup',
    component: () => import('@/views/request/Pickup.vue'),
    meta: { title: '文件投递' },
  },
  {
    path: '/oidc/callback',
    name: 'OidcCallback',
    component: () => import('@/views/user/OidcCallback.vue'),
    meta: { title: 'OIDC 登录' },
  },
  {
    path: '/api-docs',
    name: 'ApiDocs',
    component: () => import('@/views/Docs.vue'),
    meta: { title: 'API 文档' },
  },
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: () => import('@/views/admin/Login.vue'),
    meta: { title: '管理员登录' },
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/admin/index.vue'),
    meta: { title: '管理后台', requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'AdminDashboard',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { title: '仪表盘' },
      },
      {
        path: 'dashboard',
        name: 'AdminDashboardAlias',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { title: '仪表盘' },
      },
      {
        path: 'files',
        name: 'AdminFiles',
        component: () => import('@/views/admin/Files.vue'),
        meta: { title: '文件管理' },
      },
      {
        path: 'local-files',
        name: 'AdminLocalFiles',
        component: () => import('@/views/admin/LocalFiles.vue'),
        meta: { title: '本地文件' },
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('@/views/admin/Users.vue'),
        meta: { title: '用户管理' },
      },
      {
        path: 'config',
        name: 'AdminConfig',
        component: () => import('@/views/admin/Config.vue'),
        meta: { title: '系统配置' },
      },
      {
        path: 'storage',
        name: 'AdminStorage',
        component: () => import('@/views/admin/Storage.vue'),
        meta: { title: '存储管理' },
      },
      {
        path: 'logs',
        name: 'AdminLogs',
        component: () => import('@/views/admin/TransferLogs.vue'),
        meta: { title: '传输日志' },
      },
      {
        path: 'moderation',
        name: 'AdminModeration',
        component: () => import('@/views/admin/Moderation.vue'),
        meta: { title: '内容审核' },
      },
      {
        path: 'activities',
        name: 'AdminActivities',
        component: () => import('@/views/admin/Activities.vue'),
        meta: { title: '审计日志' },
      },
      {
        path: 'maintenance',
        name: 'AdminMaintenance',
        component: () => import('@/views/admin/Maintenance.vue'),
        meta: { title: '维护工具' },
      },
      {
        path: 'announcements',
        name: 'AdminAnnouncements',
        component: () => import('@/views/admin/Announcements.vue'),
        meta: { title: '公告管理' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),  // 使用 hash 模式，避免与后端 API 路由冲突
  routes,
})

// 未初始化状态缓存（对标上游未初始化全站拦截：唯一入口= /setup 向导）
let initChecked = false
let systemInitialized = true

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

  // 设置页面标题
  const title = (to.meta.title as string) || 'PigeonBox'
  document.title = title
  // 宿主窗口标题同步(经统一网关内嵌宿主时窗口标题由应用管理;无宿主 no-op)
  host.setTitle(title).catch(() => {})

  // 检查是否需要登录
  if (to.meta.requiresAuth) {
    // 会话标记（非敏感）：真实鉴权在服务端（HttpOnly Cookie + 中间件）
    const session = localStorage.getItem('fcb_session')
    if (!session) {
      // 如果是管理后台，跳转到管理员登录页面
      if (to.path.startsWith('/admin')) {
        next('/admin/login')
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
        next('/admin/login')
        return
      }
    }
  }

  next()
})

export default router
