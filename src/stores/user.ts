import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { userApi } from '@/api/user'
import type { UserInfo } from '@/types/user'
import { appBase } from '@/utils/base'

// 会话承载（2026-10-05 遗留修复）：JWT 迁 HttpOnly Cookie——服务端在
// 登录/刷新/OIDC 回调时下发，前端不再持久化令牌。localStorage 仅存非敏感
// 的会话标记（路由守卫 UX 用，真实鉴权在服务端，HttpOnly 令牌 JS 不可读）。
const SESSION_FLAG = 'fcb_session'

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(null)
  // 会话标记的响应式镜像：isLoggedIn 必须依赖 ref 而非直接读 localStorage——
  // localStorage 非响应式，computed 首次求值即缓存（App.vue 挂载时读一次=false），
  // 此后写标记不会触发重算。admin 登录只写标记不设 userInfo，曾因此被缓存击穿：
  // fetchUserInfo 永远早退 → 角色判断恒败 → 管理后台 UI 无法登录（v0.13.3 修复）。
  const sessionActive = ref(localStorage.getItem(SESSION_FLAG) === '1')
  // 登出进行中标志：阻断在途请求 401 → refreshToken 造成"已退出登录但刷新
  // 页面会话复活"的竞态（2026-10-03 自测复现一次）
  let loggingOut = false

  const isLoggedIn = computed(
    () => !!userInfo.value || sessionActive.value
  )
  const isAdmin = computed(() => userInfo.value?.role === 'admin')

  // 会话标记统一入口：ref（响应式，守卫立即生效）+ localStorage（刷新存活）双写。
  // admin 登录页不经 login()，必须走这里。
  const markSessionActive = () => {
    sessionActive.value = true
    localStorage.setItem(SESSION_FLAG, '1')
    loggingOut = false
  }

  const login = async (username: string, password: string) => {
    const res = await userApi.login({ username, password })
    if (res.code === 200) {
      userInfo.value = res.data.user
      markSessionActive()
      return true
    }
    throw new Error(res.message)
  }

  const logout = () => {
    // 服务端注销：吊销 Cookie 中的 token 并清 Cookie（fire-and-forget，
    // 失败不阻断本地登出）。CSRF 头必须携带（Cookie 认证的写请求）。
    loggingOut = true
    axios
      .post('/api/v1/user/logout', null, {
        baseURL: import.meta.env.VITE_API_BASE_URL || appBase(),
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      .catch(() => {
        // 后端不可达时本地登出仍生效
      })
    userInfo.value = null
    sessionActive.value = false
    localStorage.removeItem(SESSION_FLAG)
    localStorage.removeItem('userRole')
  }

  const fetchUserInfo = async () => {
    if (!isLoggedIn.value) return
    try {
      const res = await userApi.getUserInfo()
      if (res.code === 200) {
        userInfo.value = res.data
      }
    } catch (error) {
      logout()
    }
  }

  // refreshToken：Cookie 通道续期（服务端轮换并下发新 Cookie）。
  // 用裸 axios 避免触发 request.ts 的拦截器递归。
  const refreshToken = async (): Promise<boolean> => {
    // 登出流程中的 401 不做续期
    if (loggingOut || localStorage.getItem(SESSION_FLAG) !== '1') return false
    try {
      const res = await axios.post('/api/v1/user/refresh', null, {
        baseURL: import.meta.env.VITE_API_BASE_URL || appBase(),
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      return res.data?.code === 200
    } catch {
      // refresh 失败，返回 false，调用方处理登出
      return false
    }
  }

  // applyExternalSession 外部身份源(宿主 SSO/OIDC 回调等)直接灌入登录态:
  // 服务端已下发会话 Cookie,这里只补齐客户端状态(与 login() 成功分支同语义)
  const applyExternalSession = (user: UserInfo) => {
    userInfo.value = user
    if (user?.role) localStorage.setItem('userRole', user.role)
    markSessionActive()
  }

  return {
    userInfo,
    isLoggedIn,
    isAdmin,
    markSessionActive,
    applyExternalSession,
    login,
    logout,
    fetchUserInfo,
    refreshToken,
  }
})
