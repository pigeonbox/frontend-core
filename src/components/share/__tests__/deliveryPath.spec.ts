// /beam 直传入口探测的判定表守卫（2026-10-22 寄件台投递路径选择器）。
// 语义来源：平台适配器（fnos/qnap/openwrt）注册的 GET /beam ——
//   404=本机没挂 / 401=要 Box 会话 / 503=p2pcweb 未就绪 / 302=已挂载且就绪。
// 判定表写错 = 寄件台要么给用户一个点了没反应的按钮，要么把没挂载的平台也摆出直连路径。
import { describe, it, expect } from 'vitest'
import { beamStatusOf, probeBeamEntry } from '../deliveryPath'

const res = (status: number, type = 'basic') => ({ status, type })

describe('beamStatusOf', () => {
  it('302（manual 重定向下的 opaqueredirect）→ 就绪', () => {
    expect(beamStatusOf(res(0, 'opaqueredirect'))).toBe('ready')
  })

  it('302（Node/undici 的可见 302，type=basic）→ 同样判就绪', () => {
    // 浏览器按 Fetch 规范给 opaqueredirect；Node/undici 给可见 302。
    // 两种实现都指向同一台机器上同一个 /beam —— 只认一种会让直连路径
    // 在测试/SSR 语境下凭空消失（"看起来没挂载"）。
    expect(beamStatusOf(res(302, 'basic'))).toBe('ready')
  })

  it('401 → 已挂载但需登录', () => {
    expect(beamStatusOf(res(401))).toBe('auth')
  })

  it('503 → 已挂载但组件未就绪', () => {
    expect(beamStatusOf(res(503))).toBe('unready')
  })

  it('404 → 未挂载（不显示直连路径）', () => {
    expect(beamStatusOf(res(404))).toBe('absent')
  })

  it('其它状态码一律保守隐藏', () => {
    expect(beamStatusOf(res(200))).toBe('absent')
    expect(beamStatusOf(res(500))).toBe('absent')
    // 302 不在本例：它已被单独立为「就绪」（浏览器 opaqueredirect / Node 可见 302）
  })
})

describe('probeBeamEntry', () => {
  it('按 manual 重定向发起 GET 并映射状态', async () => {
    let called = 0
    let init: RequestInit | undefined
    const status = await probeBeamEntry('/beam', (async (_url: string, i?: RequestInit) => {
      called++
      init = i
      return res(302, 'opaqueredirect') as unknown as Response
    }) as unknown as typeof fetch)

    expect(status).toBe('ready')
    expect(called).toBe(1)
    expect(init?.method).toBe('GET')
    expect(init?.redirect).toBe('manual')
  })

  it('探测失败（网络错误 / AbortError）静默降级为未挂载', async () => {
    const boom = (async () => {
      throw new DOMException('aborted', 'AbortError')
    }) as unknown as typeof fetch
    expect(await probeBeamEntry('/beam', boom)).toBe('absent')
  })
})
