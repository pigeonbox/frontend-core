import { expect, test, type Page } from '@playwright/test'
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

/**
 * 全局拖拽遮罩守卫（2026-11-03 遮罩卡死收口的浏览器级回归锁）。
 *
 * 实证缺陷：拖一个文件到页面后，全屏遮罩（`.global-drop-overlay`，fixed 全屏）
 * 永不熄灭，整页只能刷新。两条根因：
 * 1. **drop 被子元素吞掉**——element-plus upload-dragger 的 onDrop 首行
 *    `e.stopPropagation()`：文件释放在「将文件拖到此处」拖拽框（最自然落点）上时，
 *    window 级**冒泡** drop 永远不执行 ⇒ 只靠冒泡收 drop 的遮罩必卡死。
 * 2. **拖拽静默结束**——Esc、拖出窗口后在他处释放、桌面客户端原生层接管 drop 等，
 *    drop / dragleave / blur 三条熄灭路径一条都不会来。
 *
 * 对应修法（useFileDrop.ts）：drop 撤遮罩挂**捕获阶段**（先于任何子元素的
 * stopPropagation，谁也吞不掉）+ dragover **心跳看门狗**（约 900ms 无心跳自熄）。
 * 此处用合成 DragEvent 打在真实 el-upload 拖拽框上，走浏览器真实事件路径
 * （捕获/冒泡全链），钉死两个熄灭出口与「不双计入队」。
 */

/** 在页面里派发带文件载荷的合成 DragEvent（DataTransfer 可构造，Chromium 实测全链事件路径与真实拖拽一致） */
async function fireDrag(
  page: Page,
  type: 'dragover' | 'drop',
  target: 'body' | 'dragger',
  fileName = 'e2e-drag.txt',
) {
  await page.evaluate(
    ({ type, target, fileName }) => {
      const dt = new DataTransfer()
      dt.items.add(new File(['e2e drag payload'], fileName, { type: 'text/plain' }))
      const el: Element | null =
        target === 'dragger' ? document.querySelector('.el-upload-dragger') : document.body
      if (!el) throw new Error(`拖拽目标不存在: ${target}`)
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
    },
    { type, target, fileName },
  )
}

test.describe('寄件页全局拖拽遮罩', () => {
  test('拖拽框上释放（子组件吞 drop）：遮罩仍熄灭，文件只收一次', async ({ page }) => {
    await installApiMocks(page, [...siteBootstrap()])
    await page.goto('/#/send?tab=file')

    const dragger = page.locator('.el-upload-dragger')
    await expect(dragger).toBeVisible()

    // 点亮遮罩（dragover 带 Files 载荷）
    await fireDrag(page, 'dragover', 'body')
    await expect(page.locator('.global-drop-overlay')).toBeVisible()

    // 释放在拖拽框上：element-plus 在这里 stopPropagation 吞掉冒泡 drop，
    // 遮罩必须靠捕获阶段照常熄灭（这正是修复前的卡死路径）
    await fireDrag(page, 'drop', 'dragger')
    await expect(page.locator('.global-drop-overlay')).toBeHidden()

    // 不双计入队：el-upload on-change 收走文件；若捕获阶段也顺手收文件就会变 2 条
    await expect(page.locator('.file-item')).toHaveCount(1)
  })

  test('拖拽静默结束：无心跳时看门狗自熄遮罩', async ({ page }) => {
    await installApiMocks(page, [...siteBootstrap()])
    await page.goto('/#/send?tab=file')
    // 等组件挂载完再派发合成事件：window 级监听在 onMounted 才接上，
    // 派发早了事件打空（遮罩永远不亮）——这是测试时序，不是产品行为
    await expect(page.locator('.el-upload-dragger')).toBeVisible()

    await fireDrag(page, 'dragover', 'body')
    await expect(page.locator('.global-drop-overlay')).toBeVisible()

    // 之后什么都不派发（模拟 Esc / 拖出窗口在他处释放 / 原生层接管 drop）：
    // drop、dragleave、blur 一条都不来，遮罩须在看门狗窗口（≈900ms）内自熄
    await expect(page.locator('.global-drop-overlay')).toBeHidden({ timeout: 3_000 })
  })

  test('页面空白处释放：遮罩熄灭，文件收取一次', async ({ page }) => {
    await installApiMocks(page, [...siteBootstrap()])
    await page.goto('/#/send?tab=file')
    // 等组件挂载完再派发（同上：早派发事件打空，是测试时序不是产品行为）
    await expect(page.locator('.el-upload-dragger')).toBeVisible()

    await fireDrag(page, 'dragover', 'body')
    await expect(page.locator('.global-drop-overlay')).toBeVisible()

    // 冒泡路径未被吞时由 window 冒泡 drop 收文件（捕获阶段只撤遮罩不收文件）
    await fireDrag(page, 'drop', 'body')
    await expect(page.locator('.global-drop-overlay')).toBeHidden()
    await expect(page.locator('.file-item')).toHaveCount(1)
  })
})
