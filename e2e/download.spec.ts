import { expect, test } from '@playwright/test'
import { envelope, installApiMocks, siteBootstrap } from './support/mock-api'

/**
 * 下载进度（2026-11-03）。
 *
 * 断言只认**语义**（可见文案、进度条容器出现、状态文案收敛），不认 DOM 层级。
 *
 * ⚠️ **无头 Chrome 其实有 showSaveFilePicker**：127.0.0.1 属安全上下文 ⇒
 *   该 API 可用 ⇒ 点了下载会真弹「保存文件」对话框 ⇒ 自动化环境里必然被取消
 *   ⇒ 进度条只会走到「已取消」。
 *   ⇒ 本组用例分两种形态分别验：
 *     ① 摘掉该 API ⇒ 走内存 blob 档 ⇒ 断言真实进度与完成态；
 *     ② 保留该 API（自动化下等价于用户取消）⇒ 断言**零请求**（用户取消保存
 *        ⇒ 一个字节都不下载）。
 */

const SHARE_DETAIL = envelope({
  code: 'AB12CD',
  file_name: 'e2e-download.txt',
  file_size: 11,
  has_password: false,
  encrypted: false,
  download_url: '/share/download?code=AB12CD&token=TK',
  files: [],
})

/** 摘掉文件系统 API ⇒ 下载走内存 blob 档（可断言真实进度） */
const disableFsApi = (page: import('@playwright/test').Page) =>
  page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })

test.describe('下载进度', () => {
  test('点击下载后出现行内进度条并走完', async ({ page }) => {
    await disableFsApi(page)
    await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/share/select', body: SHARE_DETAIL },
      {
        method: 'GET',
        url: '/share/download',
        binary: { contentType: 'application/octet-stream', body: Buffer.from('hello world') },
      },
    ])

    await page.goto('/#/share/AB12CD')

    const btn = page.getByRole('button', { name: /下载/i }).first()
    await expect(btn).toBeVisible()
    await btn.click()

    // 进度条就地出现（不弹窗）
    await expect(page.locator('.dl-progress').first()).toBeVisible()
    // 走完后状态收敛为完成
    await expect(page.locator('.dl-meta').first()).toContainText(/完成/i)
  })

  test('下载失败时行内显示失败文案', async ({ page }) => {
    await disableFsApi(page)
    await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/share/select', body: SHARE_DETAIL },
      { method: 'GET', url: '/share/download', status: 500, body: { code: 500, message: 'boom' } },
    ])

    await page.goto('/#/share/AB12CD')
    await page.getByRole('button', { name: /下载/i }).first().click()

    // 必须是「失败」而不是「已取消」——两者都渲染成 .dl-error ⇒ 断言文案本身
    await expect(page.locator('.dl-error').first()).toHaveText(/下载失败|failed/i)
  })

  test('用户取消保存 ⇒ 零请求（一个字节都不下载）', async ({ page }) => {
    // 不摘 fs API ⇒ 自动化环境里的保存对话框必然被取消
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/share/select', body: SHARE_DETAIL },
      {
        method: 'GET',
        url: '/share/download',
        binary: { contentType: 'application/octet-stream', body: Buffer.from('hello world') },
      },
    ])

    await page.goto('/#/share/AB12CD')
    await page.getByRole('button', { name: /下载/i }).first().click()

    await expect(page.locator('.dl-error').first()).toContainText(/已取消|cancelled/i)
    // 关键断言：保存被取消 ⇒ 下载请求根本没发出去
    expect(mock.lastRequest('/share/download'), '取消保存后不应发出下载请求').toBeUndefined()
  })
})
