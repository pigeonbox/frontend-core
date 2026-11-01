import { expect, test } from '@playwright/test'
import { formFields, installApiMocks, shareCreated, siteBootstrap } from './support/mock-api'

/**
 * 寄件主路径（frontend-core#45）。
 *
 * 覆盖**文本寄件**：填内容 → 提交 → 服务端铸 6 位取件码 → 成功弹窗展示取件码。
 *
 * ⚠️ 为什么先做文本而不是文件：文本通道无文件选择、无分片、无预签直传，
 * 是一条**端到端纯前端**的链路（浏览器选文件那条要牵出 presign/分片/加密三套决策，
 * 属于另一条用例）。文本通了不代表文件通了——但它先把「渲染 + 提交 + 弹窗」这段骨架立起来。
 */

test.describe('寄件主路径', () => {
  test('文本寄件：提交后展示 6 位取件码', async ({ page }) => {
    const mock = await installApiMocks(page, [
      ...siteBootstrap(),
      { method: 'POST', url: '/share/text/', body: shareCreated },
    ])

    // ?tab=text 深链直达文本 tab（页面支持深链，不需要点 tab 找）
    await page.goto('/#/send?tab=text')

    const area = page.locator('.text-area textarea')
    await expect(area).toBeVisible()
    await area.fill('e2e 文本寄件内容')

    await page.locator('.share-btn').click()

    // 成功弹窗：取件码以 `.code-big` 大字展示（分享码在 URL 里，取件码才是「6 位数字」）
    const codeBig = page.locator('.code-big')
    await expect(codeBig).toBeVisible()
    await expect(codeBig).toHaveText('654321')

    // 提交确实打到分享端点，且**正文原样送达**（不认编码形态，只认字段值）
    const req = mock.lastRequest('/share/text/')
    expect(req, '应发出 /share/text/ 请求').toBeTruthy()
    expect(formFields(req?.body ?? '').text).toBe('e2e 文本寄件内容')
  })

  test('文本寄件：空内容不提交（按钮禁用）', async ({ page }) => {
    const mock = await installApiMocks(page, [...siteBootstrap()])

    await page.goto('/#/send?tab=text')

    const btn = page.locator('.share-btn')
    await expect(btn).toBeDisabled()

    // 空内容不许发请求（前端闸，不是后端 400）
    await expect(mock.requests.filter((r) => r.path.includes('/share/text/'))).toHaveLength(0)
  })
})
