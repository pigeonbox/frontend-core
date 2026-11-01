import { defineConfig, devices } from '@playwright/test'

/**
 * 浏览器级 E2E（Playwright）—— frontend-core#45。
 *
 * 与 `vitest` 单测的分工：
 * - vitest（`npm test`）跑**逻辑层**：composable / store / util / 契约对齐（node 环境，无 DOM 渲染）
 * - playwright（`npm run e2e`）跑**浏览器层**：真实 DOM 交互、路由跳转、表单校验、i18n 文案、响应式布局
 *
 * ⚠️ **API 一律 mock，不连后端**：E2E 验的是**前端自身**的渲染与交互，
 * 后端契约由 Go 侧测试负责；此处连真后端会让 CI 依赖一个要部署的服务，
 * 且失败时无法区分「前端坏了」还是「后端坏了」。
 * ⇒ mock 集中在 `e2e/support/mock-api.ts`，每个用例只声明自己关心的响应。
 *
 * ⚠️ **断言只认语义，不认排版**：断言走 role / 可见文案 / 状态类名，
 * 不写死 DOM 层级与兄弟节点顺序——否则改个样式就假红。
 */
const PORT = Number(process.env.E2E_PORT ?? 4173)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // 单测名沿用仓内约定 `.spec.ts`；vitest 侧已在 vite.config.ts 把 include 收窄到 `src/**`，
  // 两边互不吞对方的用例。
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 浏览器控制台里的 error 级噪声会让「渲染成功但埋雷」的用例也绿
    // ⇒ 收集到数组，由各用例自行断言（见 support/mock-api.ts 的 consoleErrors）
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // 响应式：取件/寄件主路径必须在窄屏下依然可用（issue 明确点名「响应式布局回归」）
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    // 用 **构建产物**起服务（`vite preview`）而不是 dev server：
    // E2E 要验的是发布出去的形态（base './' + hash 路由），dev server 的
    // HMR 与 transform 行为跟产物不同，dev 绿、产物坏的情况照样漏。
    //
    // ⚠️ **必须显式 --host 127.0.0.1**：vite preview 默认绑 `localhost`，
    // 而 Node 17+ 的 `localhost` 先解析到 **IPv6 ::1** ⇒ 监听在 ::1 上；
    // Playwright 按 baseURL 去探 **IPv4 127.0.0.1** ⇒ 连不上 ⇒
    // `Timed out waiting 120000ms from config.webServer`。
    //  macOS 本机恰好也监听 127.0.0.1 ⇒ **本地全绿、CI 全红**（首跑即踩）。
    //  ⇒ 绑定与探测地址都钉死 IPv4，两端对齐。
    command: `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
