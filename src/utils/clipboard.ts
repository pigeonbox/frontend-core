/**
 * 剪贴板工具：navigator.clipboard 仅在 secure context（https/localhost）可用，
 * http 部署（如局域网 IP 直连）下为 undefined，需降级到 execCommand 方案。
 */

/** 复制文本到剪贴板，返回是否成功 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 落到 execCommand 降级
    }
  }
  return legacyCopy(text)
}

/** 临时 textarea + execCommand('copy')：兼容 http 与旧浏览器 */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  // 移出可视区但保持可选中（display:none 会导致选区失效）
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}
