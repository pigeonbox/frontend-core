// 分享页的**取数触发键**：分享码 + 解密密钥。
//
// 为什么两个都要（2026-10-24 真机实测）：端到端加密分享的解密密钥在 URL 的
// **查询参数**里（#/share/CODE?key=xxx）⇒ 只 watch 路径参数 `:code` 时，
// 「只改 key」这个场景不会重新取数 ⇒ 页面留着上一次的**明文**并同时弹出
// 「缺少解密密钥，无法解密内容」的警告 ⇒ 自相矛盾（且旧明文滞留）。
//
// ⇒ 触发键 = 分享码 + key，任一变化都重新取数（并清掉上一次的解密结果）。
export function shareRouteKey(code?: string | null, key?: string | null): string {
  return `${code ?? ''}|${key ?? ''}`
}
