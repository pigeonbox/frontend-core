// 寄件台「投递路径」与 PigeonBeam 直传入口（GET /beam）探测。
//
// 投递有三条走法：到柜（CS，文件上本服务器）/ 直连设备（P2P，设备↔设备端到端）/
// 邀到别人的柜（联邦，**接收侧动作**，不在寄件台）。本模块只管前两条的路径判据。
//
// 平台适配器（fnos/qnap/openwrt 三仓同构）在 Box 服务根挂 GET /beam，服务端语义固定：
//   302 → 入口在且就绪（重定向到本机 p2pcweb :12348/?t=<token>）
//   401 → 入口在，但要求 Box 会话（未登录 / 登录过期）
//   503 → 入口在，但 p2pcweb 未安装或未启动
//   404 → 本机没挂 /beam（docker / charts / 桌面端）→ 不显示「直连设备」路径
//
// 探测必须 redirect:'manual'：跟随重定向会跨端口打到 :12348，撞 CORS 且拿不到状态码；
// manual 下 302 由浏览器给出 opaqueredirect（status=0, type='opaqueredirect'），据此判「就绪」。
//
// 前端不做直传编排（Box 侧不内嵌 p2pc），这里只回答「本机有没有这个入口、什么状态」。

/** 投递路径：到柜（本服务器）/ 直连设备 */
export type DeliveryPath = 'box' | 'p2p'

/** 入口状态：未挂载 / 已挂载且就绪 / 已挂载需登录 / 已挂载但组件未就绪 */
export type BeamEntryStatus = 'absent' | 'ready' | 'auth' | 'unready'

/**
 * 状态判定表（前端唯一真源）：
 *   opaqueredirect(302) → ready（已挂载且就绪）
 *   401                 → auth （已挂载，需 Box 会话）
 *   503                 → unready（已挂载，p2pcweb 未启动）
 *   404 / 其它          → absent（本机没挂或不可识别，保守隐藏）
 */
export function beamStatusOf(res: { status: number; type: string }): BeamEntryStatus {
  // 302：浏览器按 Fetch 规范在 redirect:'manual' 下给 type='opaqueredirect'（status 0）；
  // 但 Node/undici 等非浏览器实现给**可见**的 302（type='basic'）——两种都要认，
  // 否则同一台机器在测试/SSR 语境下会被误判成"未挂载"（直连路径凭空消失）。
  // 302 只可能来自适配器跳 p2pcweb，语义即"已挂载且就绪"。
  if (res.type === 'opaqueredirect' || res.status === 302) return 'ready'
  if (res.status === 401) return 'auth'
  if (res.status === 503) return 'unready'
  return 'absent'
}

/**
 * 探测 /beam 入口。任何失败（网络错误 / AbortError / 组件已卸载）一律降级为
 * 'absent'——寄件台不能因一次探测失败而报错或抛出未捕获异常。
 */
export async function probeBeamEntry(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BeamEntryStatus> {
  try {
    const res = await fetchImpl(url, { method: 'GET', redirect: 'manual' })
    return beamStatusOf(res)
  } catch {
    return 'absent'
  }
}
