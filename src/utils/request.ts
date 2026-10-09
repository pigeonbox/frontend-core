import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import { appBase } from '@/utils/base'

const instance: AxiosInstance = axios.create({
  // 默认走「页面所在前缀」的相对路径:根路径部署 appBase()='' 与原行为一致;
  // 统一网关(/app/pigeonbox/)等带前缀部署自动带前缀(后端反代剥前缀转交业务)。
  // 仅当显式设置 VITE_API_BASE_URL 时才用绝对地址（前后端分离部署）。
  baseURL: import.meta.env.VITE_API_BASE_URL || appBase(),
  timeout: 30000,
})

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    // 会话走 HttpOnly Cookie（同源自动携带）；Cookie 认证的写请求须带
    // CSRF 自定义头——全局补齐（GET 携带无副作用）
    if (!config.headers['X-Requested-With']) {
      config.headers['X-Requested-With'] = 'XMLHttpRequest'
    }
    // 让后端把 trace_id 通过 X-Trace-Id 透传
    const existingTid = (config.headers['X-Trace-Id'] as string) || ''
    if (!existingTid) {
      // 用 crypto.randomUUID 或时间戳生成一个
      try {
        config.headers['X-Trace-Id'] = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      } catch {
        config.headers['X-Trace-Id'] = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 — 不在这里弹 toast，由调用方 useErrorHandler 处理。
// 401 自动刷新：token 过期时调 /user/refresh 换新，重放原请求；刷新失败跳登录。
// 防并发：多个 401 共享同一次 refresh（refreshPromise）。
let refreshPromise: Promise<boolean> | null = null

instance.interceptors.response.use(
  (response) => {
    // 提取 X-Trace-Id header（如果后端改了）
    const traceId = response.headers?.['x-trace-id'] as string | undefined
    if (traceId && response.data && typeof response.data === 'object') {
      ;(response.data as Record<string, unknown>).trace_id = traceId
    }
    // 成功码归一化：后端两代约定并存（旧 handler=200 / resp.Success=0），
    // 视图层普遍用 res.code===200 判成功；在这里把 0 统一改写成 200，
    // 避免每个调用方自己记忆约定差异（匿名取件/config 拉取曾因此误判失败）
    const body = response.data as Record<string, unknown> | null
    if (body && typeof body === 'object' && body.code === 0) {
      body.code = 200
    }
    return response.data
  },
  async (error) => {
    const originalRequest = error.config
    // 401 且未重试且非登录/刷新接口本身 → 尝试刷新 token
    const url: string = originalRequest?.url || ''
    const isAuthEndpoint =
      url.includes('/user/login') ||
      url.includes('/admin/login') ||
      url.includes('/user/refresh') ||
      // 宿主适配器 SSO 登录端点(fnos/qnap 等):401=SSO 不可用的预期安全失败,
      // 绝不能触发会话刷新/跳登录页(否则匿名访客被弹去登录表单)
      url.includes('/api/fnos/login') ||
      url.includes('/api/qnap/login')
    // 业务语义 401（2026-10-05 浏览器 E2E 发现的历史 bug）：取件/下载端点的
    // 401 表示"需要密码/密码错误/缺下载令牌"，与会话无关——绝不能触发刷新
    // 或跳登录（否则匿名取件人会被踢去登录页、密码输入框永远不出现）
    const isBusinessAuth401 = [
      '/share/select',
      '/anonymous/retrieve',
      '/anonymous/download',
      '/share/download',
      '/preview',
    ].some((p) => url.includes(p))
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      !isBusinessAuth401
    ) {
      originalRequest._retry = true
      if (!refreshPromise) {
        // 动态 import 避免循环依赖（user store 反向 import request）
        const { useUserStore } = await import('@/stores/user')
        refreshPromise = useUserStore()
          .refreshToken()
          .finally(() => {
            refreshPromise = null
          })
      }
      const refreshed = await refreshPromise
      if (refreshed) {
        // Cookie 已由服务端轮换下发，重放原请求即可（不再回填 Authorization）
        return instance(originalRequest)
      }
      // refresh 失败 → 跳登录页。应用是 hash 路由，/login 不是有效路径
      // （此前写 '/login' 会整页重载回首页，登录态却已被清空）
      const { useUserStore } = await import('@/stores/user')
      useUserStore().logout()
      const { withBase } = await import('@/utils/base')
      window.location.href = withBase('/#/user/login')
      return Promise.reject(error)
    }

    // 归一化错误对象 — 把 axios 错误包装成 {code, message, trace_id, response}
    if (error.response) {
      const data = error.response.data || {}
      const traceId = error.response.headers?.['x-trace-id'] || data.trace_id
      const wrapped = {
        code: data.code ?? error.response.status ?? 0,
        message: data.message || error.message,
        trace_id: traceId,
        response: error.response,
      }
      return Promise.reject(wrapped)
    }
    if (error.request) {
      return Promise.reject({
        code: 0,
        message: 'Network error',
        trace_id: '',
        original: error,
      })
    }
    return Promise.reject({ code: 0, message: error.message, trace_id: '' })
  }
)

export const request = <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  // 断言而非裸泛型:axios 各版本 request<T,R> 返回类型形态不同(AxiosResponse /
  // AxiosResponseResult 等),拦截器已把响应规约为 T,此处跨版本对齐
  return instance.request(config) as unknown as Promise<T>
}

export default instance
