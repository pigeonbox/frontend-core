import type { Page, Route } from '@playwright/test'

/**
 * 浏览器级 E2E 的**后端替身**（frontend-core#45）。
 *
 * 设计要点：
 * 1. **只拦 API 路径**，其余（html/js/css/图片）一律 `route.continue()` 放行
 *    —— 拦了静态资源会出现「页面加载了但没样式」的假象，排查成本极高。
 * 2. **统一信封**：后端两代成功码并存（200 / 0），前端拦截器把 0 改写成 200
 *    ⇒ mock 一律用 `{ code: 200, message, data }`，与前端判成功的口径一致。
 * 3. **记录请求**：用例可断言「确实调了哪个端点、带了什么参数」，
 *    否则「页面跳转成功」可能只是碰巧走了别的分支。
 * 4. **兜底不报错**：未声明的 API 路径回一个空信封（`data: {}`），
 *    让前端按「字段缺失」降级而不是整个页面白屏；真要断链由用例显式声明。
 */

/** 后端信封（前端 `ApiResponse<T>`） */
export const envelope = (data: unknown, message = 'ok') => ({ code: 200, message, data })

export interface RecordedRequest {
  method: string
  /** 去掉 base 的路径（便于按端点断言） */
  path: string
  url: string
  body: string
}

export interface MockHandler {
  method?: string
  /** 字符串按「路径包含」匹配（更稳，不受 query 顺序影响）；正则按 path 匹配 */
  url: string | RegExp
  status?: number
  body: unknown | ((req: RecordedRequest) => unknown)
}

/** 会被当作「后端调用」的路径前缀 */
const API_PREFIXES = [
  '/api/',
  '/anonymous/',
  '/share/',
  '/admin/',
  '/user/',
  '/federation/',
  '/chunk/',
  '/download/',
  '/notifies/',
  '/presign/',
  '/setup',
  '/request/',
  '/preview/',
  '/qrcode/',
  '/ping',
  '/version',
  '/openapi.json',
  '/robots.txt',
]

const isApiPath = (path: string) => API_PREFIXES.some((p) => path.startsWith(p))

export interface MockHandle {
  /** 按发生顺序记录的所有 API 请求 */
  requests: RecordedRequest[]
  /** 取某个端点（path 包含）的最后一次请求 */
  lastRequest: (needle: string) => RecordedRequest | undefined
}

export async function installApiMocks(page: Page, handlers: MockHandler[] = []): Promise<MockHandle> {
  const requests: RecordedRequest[] = []

  await page.route('**/*', async (route: Route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname

    if (!isApiPath(path)) {
      await route.continue()
      return
    }

    const body = req.postData() ?? ''
    const record: RecordedRequest = { method: req.method(), path, url: req.url(), body }
    requests.push(record)

    const hit = handlers.find((h) => {
      if (h.method && h.method.toUpperCase() !== req.method().toUpperCase()) return false
      if (typeof h.url === 'string') return path.includes(h.url)
      return h.url.test(path)
    })

    if (!hit) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({})),
      })
      return
    }

    const payload = typeof hit.body === 'function' ? hit.body(record) : hit.body
    await route.fulfill({
      status: hit.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })

  return {
    requests,
    lastRequest: (needle) => [...requests].reverse().find((r) => r.path.includes(needle)),
  }
}

/** 站点配置（PublicConfig 的最小可用子集） */
export const siteConfig = envelope({
  name: 'PigeonBox E2E',
  description: 'e2e fixture',
  uploadSize: 8 * 1024 * 1024,
  maxFileSize: 1024 * 1024 * 1024,
  maxBatchSize: 64 * 1024 * 1024,
  enableChunk: 1,
  openUpload: true,
  requireLogin: false,
  apiDocsEnabled: false,
  showAdminAddr: true,
  codeCaseInsensitive: true,
  publicUrl: 'http://127.0.0.1:4173',
})

/** 一次成功的匿名取件响应（RetrieveData 契约子集） */
export const retrieveOk = envelope({
  file_name: 'e2e-pickup.txt',
  file_size: 12,
  content_type: 'text/plain',
  download_url: '/download/e2e-pickup.txt',
  remaining_count: 1,
  expire_at: Math.floor(Date.now() / 1000) + 3600,
  require_password: false,
})

/**
 * 一次成功的分享创建响应。
 *
 * ⚠️ **按 contracts 的 ShareData 造**（`{code,url,pickup_code?}`）：
 * `share_url` / `full_share_url` / `qr_code_data` 是**后端不下发的幻影字段**
 * （服务端 v0.13.6 起清理），前端从 `res.data.url` 归一化。
 * ⇒ mock 若按幻影字段造，前端会拿到 `share_url=undefined` ⇒ 弹窗空白，
 *   而接口「看起来 200」——这类错只有真跑一遍才发现。
 */
export const shareCreated = envelope({
  code: 'AB12CD',
  url: 'http://127.0.0.1:4173/#/share/AB12CD',
  pickup_code: '654321',
})

/**
 * 解析请求体里的表单字段。
 *
 * ⚠️ **两种编码都要认**：axios 发 FormData 时带 `Content-Type: multipart/form-data`
 * ⇒ 请求体是 multipart（带 boundary），而**不是** urlencoded。
 * 断言若写死 `code=XXX`（urlencoded 形态），multipart 请求体里根本没有这个串
 * ⇒ 断言恒红，且红得莫名其妙（"期望 code=AB12CD，实际是一堆 boundary"）。
 * ⇒ 断言只认**字段名 → 字段值**，不认编码形态。
 */
export function formFields(body: string): Record<string, string> {
  const out: Record<string, string> = {}

  if (!body.includes('WebKitFormBoundary')) {
    for (const [k, v] of new URLSearchParams(body)) out[k] = v
    return out
  }

  for (const part of body.split(/--[^\r\n]*\r?\n/)) {
    if (!part.includes('name="')) continue
    const m = /name="([^"]+)"[\s\S]*?\r?\n\r?\n([\s\S]*?)\r?\n?$/.exec(part)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/**
 * 每个用例都要的**站点启动基线**：
 * - `/setup/check`：守卫首个导航必查，`initialized=false` 会把整站导去 `/setup`
 * - `/api/config`：站点公开配置（站点名/上传上限/管理入口路径等）
 *
 * ⚠️ **后端有两套响应形态**，mock 必须逐端点对齐，否则页面静默走降级分支：
 * - **信封形态**（绝大多数端点）：`{code, message, data}`
 * - **裸载荷形态**（`/setup/check`、`/version`）：字段直接铺在顶层
 *   —— 前端 `res.initialized` / `res.version` 直接读顶层，不读 `res.data`。
 *   mock 若给裸载荷端点套信封 ⇒ 字段取不到 ⇒ 守卫判「未初始化」⇒ 整站被导去
 *   `/setup`，表现为「E2E 页面空白」，与「mock 写错」毫无关联（已踩过）。
 */
export const siteBootstrap = (): MockHandler[] => [
  { method: 'GET', url: '/setup/check', body: { initialized: true, message: 'ok' } },
  { method: 'GET', url: '/api/config', body: siteConfig },
  { method: 'GET', url: '/version', body: { code: 200, version: 'e2e', commit: 'e2e', build_time: 'e2e', start_time: 'e2e' } },
]
