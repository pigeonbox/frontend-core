/**
 * 全站唯一格式化实现（2026-10-06 收敛：此前 formatFileSize 在 13 个文件重复定义、
 * formatDate 两族语义在 10 个文件各写一份——改公式只改这里）。
 */

/** 文件大小人性化显示；入参兼容后端字符串数字（如 "0"）。 */
export function formatFileSize(raw: number | string): string {
  const bytes = Number(raw) || 0
  if (!(bytes > 0)) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  // ≥1PB 钳制到 TB 档（原 9 处 GB-only 实现同输入会得到 undefined 档位）
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/** 族 A·时间串显示归一：不解析 Date、locale 无关。"…T…" → 空格分隔并截到秒，否则原样。 */
export function formatDateTime(s: string | null | undefined, fallback = '—'): string {
  if (!s) return fallback
  return s.includes('T') ? s.replace('T', ' ').slice(0, 19) : s
}

/**
 * 族 B·解析为本地时间串：后端 "2006-01-02 15:04:05" 空格分隔 Safari 不认，归一为 T 再解析；
 * 非法日期串回退 fallback（而非显示 "Invalid Date"）。
 */
export function toLocaleDateTime(
  s: string | null | undefined,
  opts: { locale?: string; fallback?: string } = {}
): string {
  if (!s) return opts.fallback ?? '-'
  const d = new Date(s.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return opts.fallback ?? '-'
  return d.toLocaleString(opts.locale ?? 'zh-CN')
}
