import { expect, test } from '@playwright/test'
import { envelope, installApiMocks, siteBootstrap } from './support/mock-api'

/**
 * 后台主路径（frontend-core#45）。
 *
 * 覆盖**管理员登录 → 进后台**：
 * 未登录访问 `/admin` ⇒ 守卫改道登录页 ⇒ 登录成功 ⇒ 进仪表盘并拉到统计数据。
 *
 * ⚠️ 这条路径最容易被「API 层冒烟」漏掉：登录涉及
 * 路由守卫（localStorage 会话标记）+ 角色判定（userRole=admin）+ 动态路由注册
 * ——三处都是**浏览器侧**逻辑，curl 一个接口永远覆盖不到。
 */

const adminStats = envelope({
  total_users: 3,
  total_files: 12,
  total_size: 2048,
  today_uploads: 2,
  active_files: 8,
  expired_files: 1,
  expiring_soon_files: 1,
  never_picked_files: 1,
  forever_files: 1,
})

test.describe('后台主路径', () => {
  test('未登录访问 /admin 改道登录页；登录后进仪表盘并拉到统计', async ({ page }) => {
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'POST', url: '/admin/login', body: envelope({ token: 'e2e-token' }) },
      { method: 'GET', url: '/user/info', body: envelope({ username: 'admin', role: 'admin' }) },
      { method: 'GET', url: '/admin/stats', body: adminStats },
    ])

    // 未登录 ⇒ 守卫改道登录页
    await page.goto('/#/admin')
    await expect(page).toHaveURL(/#\/admin\/login/)
    await expect(page.locator('.login-form')).toBeVisible()

    const inputs = page.locator('.login-form input')
    await inputs.nth(0).fill('admin')
    await inputs.nth(1).fill('e2e-secret')
    await page.locator('.login-button').click()

    // 登录成功 ⇒ 进后台首页
    await expect(page).toHaveURL(/#\/admin(\?|$)/)
    await expect(page.locator('.dashboard-container')).toBeVisible()

    // 统计数据真的拉回来了（仪表盘不是空壳）
    await expect(page.locator('.stat-value').first()).toBeVisible()
    const statsReq = mock.lastRequest('/admin/stats')
    expect(statsReq, '应请求 /admin/stats').toBeTruthy()
  })

  test('非管理员账号登录：留在登录页并给出提示（不放行后台）', async ({ page }) => {
    await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'POST', url: '/admin/login', body: envelope({ token: 'e2e-token' }) },
      // 角色不是 admin ⇒ 登录页应报错并登出，不进后台
      { method: 'GET', url: '/user/info', body: envelope({ username: 'bob', role: 'user' }) },
      { method: 'GET', url: '/admin/stats', body: adminStats },
    ])

    await page.goto('/#/admin/login')

    const inputs = page.locator('.login-form input')
    await inputs.nth(0).fill('bob')
    await inputs.nth(1).fill('e2e-secret')
    await page.locator('.login-button').click()

    // 留在登录页 + 可见错误提示
    await expect(page).toHaveURL(/#\/admin\/login/)
    await expect(page.locator('.login-error')).toBeVisible()
  })
})
