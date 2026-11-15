/**
 * policyDiff.ts 策略模板差异预览（hub#368）。
 *
 * 模板 patch 是 SystemConfig 局部 JSON（嵌套段 → 字段）；预览 = 把 patch 的
 * 每个叶子字段与当前配置对比，列出「哪些字段会变、从什么变到什么」。
 * 纯函数：不依赖 vue/i18n，便于单测；值的展示格式化在组件层做。
 */

/** 一行差异：path 为点分路径（如 upload_ex.open_upload） */
export interface PolicyDiffRow {
  path: string
  from: unknown
  to: unknown
}

/** 是否「可递归的普通对象」（数组是叶子——列表整体对比，不展开元素） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 深取点分路径的值；任一层缺失返回 undefined */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const seg of path.split('.')) {
    if (!isPlainObject(cur)) return undefined
    cur = cur[seg]
  }
  return cur
}

/** 递归收集 patch 的全部叶子路径 → 值 */
function flattenLeaves(patch: Record<string, unknown>, prefix: string, out: Map<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    const path = prefix ? prefix + '.' + k : k
    if (isPlainObject(v)) {
      flattenLeaves(v, path, out)
    } else {
      out.set(path, v)
    }
  }
}

/** 叶子值等价对比：JSON 归一（数组/标量；undefined 与缺失等价） */
function sameValue(a: unknown, b: unknown): boolean {
  const na = a === undefined ? null : a
  const nb = b === undefined ? null : b
  return JSON.stringify(na) === JSON.stringify(nb)
}

/**
 * 计算模板 patch 相对当前配置的差异。
 *
 * - 只列**会变化**的叶子字段（当前值与 patch 值不同）；
 * - 当前配置里缺失的字段（from = undefined）视为变化（应用后会写入）；
 * - patch 里的空对象不产生行（无叶子 = 无变化）。
 */
export function diffPatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): PolicyDiffRow[] {
  const leaves = new Map<string, unknown>()
  flattenLeaves(patch, '', leaves)
  const rows: PolicyDiffRow[] = []
  for (const [path, to] of leaves) {
    const from = getPath(current, path)
    if (!sameValue(from, to)) {
      rows.push({ path, from, to })
    }
  }
  return rows
}
