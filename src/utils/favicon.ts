/**
 * 运行时动态图标：把「管理台主题色」同步到**浏览器标签图标**与**iOS 主屏图标**。
 *
 * 为什么需要：静态 favicon（favicon.svg / favicon-*.png / apple-touch-icon.png）是
 * 烘焙死的（真相源 = frontend-core/public/favicon.svg），管理员在后台改主题色时，
 * 界面 logo 底座会跟着变（CSS 按 --primary-color 现算），但标签页图标不变 ⇒
 * 「界面是绛红、标签还是墨黑」的不一致。
 *
 * 做法：白鸽贴片（public/pigeon-glyph.png，透明底纯白）叠一张按 accent 现算的
 * 渐变底，canvas 出 PNG data URI 换掉 <link rel=icon> / <link rel=apple-touch-icon>。
 * 渐变端点走 accent.ts 的 accentGradient —— 与静态图标底色、界面 logo 底座同公式。
 *
 * 取舍：
 * - 用 PNG 而非 SVG data URI：Safari 不支持 SVG favicon，PNG 全浏览器可用。
 * - 渲染失败（贴片取不到 / canvas 不可用）⇒ 保持静态图标不动（宁旧勿无）。
 * - 尺寸：标签 64px（16px 图标 @2x 余量足）、主屏 180px（iOS 规范）。
 */
import { accentGradient } from '@/utils/accent'
import { DEFAULT_ACCENT } from '@/config/themes'
import { withBase } from '@/utils/base'

const GLYPH_URL = withBase('/pigeon-glyph.png')
/** 真相源图标的圆角半径（512 画布上 rx=116）⇒ 动态图标同款圆角比例 */
const CORNER_RATIO = 116 / 512

let glyphPromise: Promise<HTMLImageElement | null> | null = null

/** 取白鸽贴片（一次） */
function loadGlyph(): Promise<HTMLImageElement | null> {
  if (!glyphPromise) {
    glyphPromise = new Promise((resolve) => {
      if (typeof window === 'undefined' || typeof Image === 'undefined') {
        resolve(null)
        return
      }
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = GLYPH_URL
    })
  }
  return glyphPromise
}

/** 手写圆角矩形路径（不用 ctx.roundRect —— Safari 16 以下没有） */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * 出一张图标 PNG data URI。
 * rounded=true → 圆角方块（浏览器标签）；false → 全出血（iOS 主屏，自裁圆角）。
 */
function renderIcon(accent: string, size: number, rounded: boolean, glyph: HTMLImageElement): string | null {
  const g = accentGradient(accent)
  if (!g) return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const grad = ctx.createLinearGradient(0, 0, 0, size)
  grad.addColorStop(0, g.top)
  grad.addColorStop(1, g.bottom)
  ctx.fillStyle = grad
  if (rounded) {
    roundRectPath(ctx, 0, 0, size, size, size * CORNER_RATIO)
    ctx.fill()
  } else {
    ctx.fillRect(0, 0, size, size)
  }

  ctx.drawImage(glyph, 0, 0, size, size)
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** 换掉全部 icon 声明（只留一张动态 PNG，避免浏览器在多个候选里挑到旧的静态图） */
function replaceIconLink(href: string) {
  document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove())
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/png'
  link.sizes = '64x64'
  link.href = href
  document.head.appendChild(link)
}

/**
 * 按当前 accent 刷新浏览器标签图标与 iOS 主屏图标。
 * accent 为空/非法 ⇒ 回落默认主色（与界面回落 main.scss 的行为一致）。
 */
export async function applyDynamicIcons(accent?: string | null): Promise<void> {
  if (typeof document === 'undefined') return
  const eff = accentGradient(accent) ? (accent as string) : DEFAULT_ACCENT
  const glyph = await loadGlyph()
  if (!glyph) return

  const tab = renderIcon(eff, 64, true, glyph)
  if (tab) replaceIconLink(tab)

  const apple = renderIcon(eff, 180, false, glyph)
  const appleLink = document.querySelector('link[rel="apple-touch-icon"]')
  if (apple && appleLink) appleLink.setAttribute('href', apple)
}
