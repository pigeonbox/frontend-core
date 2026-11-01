import { expect, test } from '@playwright/test'
import { envelope, formFields, installApiMocks, retrieveOk, siteBootstrap } from './support/mock-api'

/**
 * 取件主路径（frontend-core#45）。
 *
 * 覆盖两条形态：
 * 1. **无密码直取**：6 位码 → 预检 → 取件 → 落结果页并展示文件名
 * 2. **有密码取件**：预检回 `require_password` → 内联密码框 → 带密码取件 → 结果页
 *
 * ⚠️ 断言只认**语义**（URL 形态、可见文案、实际请求体），
 * 不认 DOM 层级与元素顺序——改样式不该让用例变红。
 */

const CODE = 'AB12CD'

const searchHit = (requirePassword: boolean) =>
  envelope({
    file_name: 'e2e-pickup.txt',
    file_size: 12,
    created_at: '2026-11-01T00:00:00Z',
    expire_at: '2026-11-02T00:00:00Z',
    pickup_count: 0,
    max_pickup_count: 1,
    require_password: requirePassword,
  })

test.describe('取件主路径', () => {
  test('6 位取件码：无密码直取，落结果页并展示文件名', async ({ page }) => {
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/anonymous/search/', body: searchHit(false) },
      { method: 'POST', url: '/anonymous/retrieve', body: retrieveOk },
    ])

    await page.goto('/')

    // 6 格取件码输入（分格 OTP 形态，逐格推进）
    const boxes = page.locator('.code-box')
    await expect(boxes).toHaveCount(6)
    await boxes.first().click()
    await page.keyboard.type(CODE)

    await page.locator('.get-btn').click()

    // 结果页：结果元信息走 sessionStorage + URL 只带不透明 key（不落明文）
    await expect(page).toHaveURL(/#\/retrieve\/result/)
    await expect(page.getByText('取件成功')).toBeVisible()
    await expect(page.getByText('e2e-pickup.txt')).toBeVisible()

    // 真发起了取件请求，且带的是输入的码
    const req = mock.lastRequest('/anonymous/retrieve')
    expect(req, '应发出 /anonymous/retrieve 请求').toBeTruthy()
    expect(formFields(req?.body ?? '').code).toBe(CODE)
  })

  test('有密码分享：内联出密码框，带密码取件成功', async ({ page }) => {
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'GET', url: '/anonymous/search/', body: searchHit(true) },
      { method: 'POST', url: '/anonymous/retrieve', body: retrieveOk },
    ])

    await page.goto('/')

    const boxes = page.locator('.code-box')
    await expect(boxes).toHaveCount(6)
    await boxes.first().click()
    await page.keyboard.type(CODE)

    // 预检回 require_password ⇒ 就地展开密码框（密码永不做自动尝试）
    const pw = page.locator('.pw-input input')
    await expect(pw).toBeVisible()
    await expect(page.getByText('该分享设置了取件密码，输入密码后即可取件')).toBeVisible()

    await pw.fill('e2e-secret')
    await page.locator('.get-btn').click()

    await expect(page).toHaveURL(/#\/retrieve\/result/)
    await expect(page.getByText('取件成功')).toBeVisible()

    // 带密码的取件请求：密码必在请求体里（FormData）
    const req = mock.lastRequest('/anonymous/retrieve')
    const fields = formFields(req?.body ?? '')
    expect(fields.code).toBe(CODE)
    expect(fields.password).toBe('e2e-secret')
  })
})
