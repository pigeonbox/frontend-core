// 对方柜地址（跨站投递的 target_url）的**输入格式**校验（纯函数 ⇒ 可单测）。
//
// ⚠️ 本模块**只做格式校验**，刻意**不做**「这个地址像不像本站 / 像不像已登记对端」
// 的判断：真正的闸在服务端（未登记的对端一律拒绝，且不发任何出站请求）。
// ⇒ 前端自己发明一套「地址合法性」语义，只会和服务端的口径漂移（AGENTS.md 反复
// 出现的根因：同一事实多处口径）。
//
// ⚠️ 只在**格式明显不对**时提前拦（空串 / 缺 scheme / 非 http(s) / 带用户名口令）：
// 这些是「怎么写都发不出去」的输入，提前给一句人话比让服务端回 400 更友好。
// 其余（对端没登记、对方柜收件失败…）一律交给服务端说，前端照实透传。

/** 校验结论：ok=true 给出可直接提交的地址；ok=false 给出失败原因 */
export type TargetUrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'credentials' }

/**
 * 校验对方柜基址。
 *
 * 通过时返回**去掉首尾空白**的原串（不做大小写/端口/尾斜杠的归一化——
 * 归一化是服务端的事（core 的 NormalizePeerURL），前端再归一化一遍只会多一处
 * 口径；服务端两侧都会归一化 ⇒ 「多打一个斜杠」不会导致投递失败）。
 */
export function checkTargetUrl(raw: string): TargetUrlCheck {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, reason: 'empty' }

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'invalid' }
  }
  if (!u.hostname) return { ok: false, reason: 'invalid' }
  // 带 userinfo（http://user:pass@host/）：服务端明确拒绝（凭证不该出现在地址里）
  if (u.username || u.password) return { ok: false, reason: 'credentials' }

  return { ok: true, url: trimmed }
}
