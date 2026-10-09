import { describe, it, expect } from 'vitest'
import { resolveAccent, ACCENT_CACHE_KEY } from '../accent'

// 公式基准：与 main.scss 预填色阶、index.html 首帧引导三处一致。
// 改公式必须三处同步（历史教训：手算色阶漂移）。
describe('resolveAccent', () => {
  const V = (raw: string, dark: boolean) => resolveAccent(raw, dark)!.vars

  it('浅色：主色原值（品牌靛蓝=图标渐变深端），light-N 向白混，dark-2 向黑混', () => {
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

  it('输出恰好覆盖 13 个主题变量', () => {
    const v = V('#7c3aed', false)
    expect(Object.keys(v).length).toBe(13)
    expect(v[ACCENT_CACHE_KEY as never]).toBeUndefined()
  })
})
