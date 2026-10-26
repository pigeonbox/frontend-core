import { describe, it, expect } from 'vitest'
import { resolveAccent, accentGradient, ACCENT_CACHE_KEY } from '../accent'

// 公式基准：与 main.scss 预填色阶、index.html 首帧引导三处一致。
// 改公式必须三处同步（历史教训：手算色阶漂移）。
describe('resolveAccent', () => {
  const V = (raw: string, dark: boolean) => resolveAccent(raw, dark)!.vars

  it('浅色：主色原值（基准色靛蓝），light-N 向白混，dark-2 向黑混', () => {
    const v = V('#5e6ad2', false)
    expect(v['--el-color-primary']).toBe('rgb(94, 106, 210)')
    expect(v['--el-color-primary-light-3']).toBe('rgb(142, 151, 224)')
    expect(v['--el-color-primary-light-5']).toBe('rgb(175, 181, 233)')
    expect(v['--el-color-primary-light-7']).toBe('rgb(207, 210, 242)')
    expect(v['--el-color-primary-light-8']).toBe('rgb(223, 225, 246)')
    expect(v['--el-color-primary-light-9']).toBe('rgb(236, 237, 250)')
    expect(v['--el-color-primary-dark-2']).toBe('rgb(75, 85, 168)')
    expect(v['--primary-color']).toBe('rgb(94, 106, 210)')
    expect(v['--primary-hover']).toBe('rgb(123, 133, 218)')
    expect(v['--primary-active']).toBe('rgb(66, 74, 147)')
    expect(v['--primary-bg']).toBe('rgb(239, 240, 251)')
    expect(v['--primary-color-rgb']).toBe('94, 106, 210')
    expect(v['--primary-gradient']).toBe(
      'linear-gradient(135deg, rgb(94, 106, 210) 0%, rgb(94, 106, 210) 100%)'
    )
  })

  it('深色：主色提亮 30%，light-N 向 #0a0a0a 混，dark-2 向白混', () => {
    const v = V('#5e6ad2', true)
    expect(v['--el-color-primary']).toBe('rgb(142, 151, 224)')
    expect(v['--el-color-primary-light-3']).toBe('rgb(102, 109, 160)')
    expect(v['--el-color-primary-light-5']).toBe('rgb(76, 81, 117)')
    expect(v['--el-color-primary-light-7']).toBe('rgb(50, 52, 74)')
    expect(v['--el-color-primary-light-8']).toBe('rgb(36, 38, 53)')
    expect(v['--el-color-primary-light-9']).toBe('rgb(26, 27, 36)')
    expect(v['--el-color-primary-dark-2']).toBe('rgb(165, 172, 230)')
    expect(v['--primary-color']).toBe('rgb(142, 151, 224)')
    expect(v['--primary-hover']).toBe('rgb(118, 126, 185)')
    expect(v['--primary-active']).toBe('rgb(176, 182, 233)')
    expect(v['--primary-bg']).toBe('rgba(142, 151, 224, 0.14)')
    expect(v['--primary-color-rgb']).toBe('142, 151, 224')
  })

  it('3 位 hex 规范化为 6 位', () => {
    const r = resolveAccent('#abc', false)!
    expect(r.hex).toBe('#aabbcc')
    expect(r.vars['--el-color-primary']).toBe('rgb(170, 187, 204)')
  })

  it('无效输入返回 null（含注入向量）', () => {
    for (const bad of ['', null, undefined, 'javascript:alert(1)', '#12345', 'red', '#gggggg', 'url(http://x)']) {
      expect(resolveAccent(bad as string, false)).toBeNull()
    }
  })

  it('统计卡图标色调 2-4 = 固定语义色板(紫/青绿/琥珀),不随主色派生', () => {
    // 2026-10-26 起为固定色板:语义四色构图恒定可辨。历史实现是「主色色相
    // 偏移」派生,主色一旦变成灰阶(墨黑)或青竹,三个徽标就退化成同色系 ⇒
    // 界面发闷。固定色板与主色无关。
    const light = V('#5e6ad2', false)
    expect(light['--stat-tone-2-color']).toBe('rgb(124, 58, 237)')
    expect(light['--stat-tone-2-bg']).toBe('rgba(124, 58, 237, 0.1)')
    expect(light['--stat-tone-3-color']).toBe('rgb(13, 148, 136)')
    expect(light['--stat-tone-3-bg']).toBe('rgba(13, 148, 136, 0.1)')
    expect(light['--stat-tone-4-color']).toBe('rgb(217, 119, 6)')
    expect(light['--stat-tone-4-bg']).toBe('rgba(217, 119, 6, 0.1)')

    // 换任何主色(含灰阶墨黑)色调都不变
    for (const accent of ['#0e9f6e', '#18181b', '#e11d48']) {
      const v = V(accent, false)
      expect(v['--stat-tone-2-color']).toBe('rgb(124, 58, 237)')
      expect(v['--stat-tone-3-color']).toBe('rgb(13, 148, 136)')
      expect(v['--stat-tone-4-color']).toBe('rgb(217, 119, 6)')
    }
  })

  it('深色：固定语义色板的提亮档，底色透明度 0.16', () => {
    const v = V('#0e9f6e', true)
    expect(v['--stat-tone-2-color']).toBe('rgb(167, 139, 250)')
    expect(v['--stat-tone-2-bg']).toBe('rgba(167, 139, 250, 0.16)')
    expect(v['--stat-tone-3-color']).toBe('rgb(45, 212, 191)')
    expect(v['--stat-tone-4-color']).toBe('rgb(245, 158, 11)')
    expect(v['--stat-tone-4-bg']).toBe('rgba(245, 158, 11, 0.16)')
  })

  it('暗色：灰阶主色提亮到对比度地板（30% 不够则继续提亮）', () => {
    // 墨黑 #18181b 提亮 30% 只有 2.2:1 ⇒ 暗色下链接不可读；继续提亮到 42%
    const v = V('#18181b', true)
    expect(v['--primary-color']).toBe('rgb(121, 121, 123)')
    expect(v['--el-color-primary']).toBe('rgb(121, 121, 123)')
    // 彩色主色原就达标 ⇒ 取值不变（回归）
    expect(V('#5e6ad2', true)['--primary-color']).toBe('rgb(142, 151, 224)')
  })

  it('输出恰好覆盖 19 个主题变量', () => {
    const v = V('#7c3aed', false)
    expect(Object.keys(v).length).toBe(19)
    expect(v[ACCENT_CACHE_KEY as never]).toBeUndefined()
  })

  // 图标底座渐变端点：静态图标（hub scripts/gen-brand-icons.py）、界面 logo 底座
  // （main.scss .logo-icon）、运行时动态图标（utils/favicon.ts）三处同源。
  describe('accentGradient（图标底座渐变端点）', () => {
    it('墨黑：mix(白 6%) → mix(黑 30%)', () => {
      expect(accentGradient('#18181b')).toEqual({ top: 'rgb(38, 38, 41)', bottom: 'rgb(17, 17, 19)' })
    })

    it('彩色主色：端点随主色走', () => {
      expect(accentGradient('#5e6ad2')).toEqual({ top: 'rgb(104, 115, 213)', bottom: 'rgb(66, 74, 147)' })
      expect(accentGradient('#e11d48')).toEqual({ top: 'rgb(227, 43, 83)', bottom: 'rgb(158, 20, 50)' })
    })

    it('空值/非法值返回 null（调用方回落到默认主色）', () => {
      expect(accentGradient('')).toBeNull()
      expect(accentGradient(null)).toBeNull()
      expect(accentGradient('red')).toBeNull()
    })
  })
})
