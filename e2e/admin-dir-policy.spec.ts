import { expect, test, type Page } from '@playwright/test'
import { envelope, installApiMocks, siteBootstrap, type RecordedRequest } from './support/mock-api'

/**
 * 管理台「目录策略」分区的**提交前校验**（core#159 的 share 段）。
 *
 * 为什么这条必须是**浏览器级**用例：core 在**保存时**就硬校验
 *   （root 非空 + 绝对路径 ⇒ ErrSharePolicyInvalid ⇒ HTTP 400 + 10001）
 * ⇒ 前端若「只提示不硬拦」，管理员点保存必然撞 400（整个配置保存失败，
 *   报错还指向配置段而不是「哪条策略的哪个字段」）。
 *
 * 源码级守卫（src/views/admin/__tests__/dirPolicy.spec.ts）守得住「有校验代码」，
 * 守不住「校验真挡住了提交」——那只有真点一次保存才知道。
 *
 * ⚠️ 三条用例缺一不可：
 *   ① 非法输入 ⇒ 不发 PUT（挡住）；
 *   ② 合法输入 ⇒ **真的发 PUT**（否则「永远拦死」的假实现也能让 ① 变绿）；
 *   ③ 载荷形状 ⇒ share 段 + directory_policies 非空（core 整段替换语义）。
 */

/** 进入管理台配置页并落到目录策略分区 */
async function gotoDirPolicy(page: Page) {
  // 路由守卫只看 localStorage 标记（真实鉴权在服务端 HttpOnly Cookie + 中间件）
  await page.addInitScript(() => {
    localStorage.setItem('fcb_session', 'e2e-session')
    localStorage.setItem('userRole', 'admin')
  })
  await page.goto('/#/admin/config?section=dirPolicy')
  await expect(page.locator('.config-nav-item.active')).toBeVisible()
}

/** 该发而没发 / 不该发而发了的 PUT 记录 */
const configPuts = (requests: RecordedRequest[]) =>
  requests.filter((r) => r.method === 'PUT' && r.path.includes('/admin/config'))

test.describe('管理台目录策略：提交前校验（与 core 同口径）', () => {
  test('空目录路径 ⇒ 拦下保存（不发 PUT /admin/config）', async ({ page }) => {
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/admin/config', body: envelope({ share: { directory_policies: [] } }) },
      { method: 'PUT', url: '/admin/config', body: envelope({}) },
    ])
    await gotoDirPolicy(page)

    // 新增一条策略（root 留空）
    await page.locator('.dir-policy-add').click()
    await expect(page.locator('.field-error')).toBeVisible()
    await expect(page.locator('.el-alert--error')).toBeVisible()

    // 点保存 ⇒ 必须被拦下：不发 PUT，且给出提示
    await page.locator('.config-content .el-button--primary').click()
    await expect(page.locator('.el-message--error')).toBeVisible()
    expect(configPuts(mock.requests), '非法策略不得发出 PUT').toEqual([])
  })

  test('相对路径 ⇒ 同样拦下（core 判 400 + 10001）', async ({ page }) => {
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/admin/config', body: envelope({ share: { directory_policies: [] } }) },
      { method: 'PUT', url: '/admin/config', body: envelope({}) },
    ])
    await gotoDirPolicy(page)

    await page.locator('.dir-policy-add').click()
    await page.locator('.dir-policy input').first().fill('data/music')
    await page.locator('.config-content .el-button--primary').click()

    await expect(page.locator('.el-message--error')).toBeVisible()
    expect(configPuts(mock.requests), '相对路径不得发出 PUT').toEqual([])
  })

  test('合法绝对路径 ⇒ 真的提交（载荷带 share 段且 directory_policies 非空）', async ({ page }) => {
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/admin/config', body: envelope({ share: { directory_policies: [] } }) },
      { method: 'PUT', url: '/admin/config', body: envelope({}) },
    ])
    await gotoDirPolicy(page)

    await page.locator('.dir-policy-add').click()
    await page.locator('.dir-policy input').first().fill('/data/music')
    await page.locator('.config-content .el-button--primary').click()

    await expect.poll(() => configPuts(mock.requests).length).toBe(1)
    const put = configPuts(mock.requests)[0]
    const body = JSON.parse(put.body)
    // core 的 share 段是**整段替换**语义 ⇒ 载荷必须带 share 段（否则改了不生效）
    expect(body.share, '载荷缺 share 段 ⇒ 改了策略不生效').toBeTruthy()
    expect(body.share.directory_policies.length).toBe(1)
    expect(body.share.directory_policies[0].root).toBe('/data/music')
    expect(body.share.directory_policies[0].share_mode).toBe('allow')
  })
})
