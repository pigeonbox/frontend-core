// 运营解读（frontend-core#91）的纯聚合函数。
//
// 为什么单独成文件：视图层做的是「前端聚合」（分页拉窗口内列表 → 归组统计），
// 这类口径必须能被单测逐条钉住——散在 .vue 的 <script setup> 里就只能做源码级
// 断言，算错分母/归错桶都测不出来。本文件零依赖、零 IO，只吃行数组。
//
// 数据口径（每个函数注释里标了消费的字段，与服务端真相源对账）：
//   - transfer 日志行：/admin/logs/transfer 的 items（operation/file_code/
//     file_name/created_at；created_at 为服务端本地时间 "YYYY-MM-DD HH:mm:ss"）；
//   - 审计行：/admin/activities 的 list（action/success）。
// 服务端只记**成功落账**的传输（transfer 日志无失败面），所以取件失败原因
// 分布不在本文件射程内——那是 pickup_failures 表的聚合（需 core 新读面）。

/** transfer 日志行（/admin/logs/transfer items 的结构子集） */
export interface TransferLogLike {
  operation?: string
  file_code?: string
  file_name?: string
  created_at?: string
}

/** 审计行（/admin/activities list 的结构子集） */
export interface ActivityLike {
  action?: string
  success?: boolean
}

/**
 * 从 created_at 取小时（0-23）。
 *
 * 刻意**不做 Date 解析**：服务端下发的是本地时间字符串（无时区），走 Date
 * 会再过一遍浏览器时区换算——站主跨时区看管理台时，时段桶会整体漂移。
 * 字符串切片取的是「服务器本地小时」，与服务端记录口径一致。
 * 解析不出返回 null（调用方跳过该行，不计入任何桶）。
 */
export function hourOf(created?: string): number | null {
  if (!created || created.length < 13) return null
  const h = Number(created.slice(11, 13))
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null
}

/**
 * 时段分布：24 桶计数（索引=小时）。
 * operation 传入时只统计该操作（如 'download' = 取件访问时段）。
 */
export function hourHistogram(rows: TransferLogLike[], operation?: string): number[] {
  const out = new Array<number>(24).fill(0)
  for (const r of rows) {
    if (operation && r.operation !== operation) continue
    const h = hourOf(r.created_at)
    if (h !== null) out[h] = (out[h] as number) + 1
  }
  return out
}

/** TOP 分享条目 */
export interface TopShare {
  code: string
  name: string
  count: number
  /** 占窗口内该操作总数的百分比（0-100，一位小数精度由展示层定） */
  percent: number
}

/**
 * 窗口内被取最多的分享（默认统计 download 操作）。
 *
 * - 无 file_code 的行（不该出现，防御）跳过，不进分子也不进分母；
 * - 同 code 多行累计；name 取首见的 file_name（同 code 名字一致）；
 * - 并列时按 code 字典序，保证多次渲染顺序稳定（测试可断言）。
 */
export function topShares(rows: TransferLogLike[], limit = 5, operation = 'download'): TopShare[] {
  const map = new Map<string, { name: string; count: number }>()
  let total = 0
  for (const r of rows) {
    if (r.operation !== operation || !r.file_code) continue
    total++
    const cur = map.get(r.file_code)
    if (cur) cur.count++
    else map.set(r.file_code, { name: r.file_name || r.file_code, count: 1 })
  }
  return [...map.entries()]
    .map(([code, v]) => ({
      code,
      name: v.name,
      count: v.count,
      percent: total > 0 ? (v.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, limit)
}

/** 失败原因分组条目 */
export interface FailureGroup {
  action: string
  count: number
  percent: number
}

/**
 * 失败原因分布：审计行里 success===false 的按 action 归组。
 *
 * - success !== false 的行（成功 / success 缺省）不计入——缺省当成功与服务端
 *   「success 默认 true」一致；
 * - action 缺省归 'unknown' 桶（不丢样本，宁可桶名难看也不能静默少算）；
 * - 百分比分母 = **失败样本数**（不是全量审计数）——「失败原因分布」要回答
 *   「失败里哪种最多」，拿全量当分母会把占比压到看不出形状。
 */
export function failureBreakdown(items: ActivityLike[], limit = 6): FailureGroup[] {
  const failed = items.filter((i) => i.success === false)
  const map = new Map<string, number>()
  for (const i of failed) {
    const k = i.action || 'unknown'
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const total = failed.length
  return [...map.entries()]
    .map(([action, count]) => ({
      action,
      count,
      percent: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
    .slice(0, limit)
}

/** 失败样本数（failureBreakdown 的分母，展示「共 N 条失败」用） */
export function failureCount(items: ActivityLike[]): number {
  return items.filter((i) => i.success === false).length
}

/**
 * 百分比（part/whole×100）；whole ≤ 0 返回 null（**不是 0**——
 * 「没有样本」和 「0%」是两回事，前者应显示空态而不是 0% 的结论）。
 */
export function ratePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return (part / whole) * 100
}

/**
 * 分享取件率（未过期口径）= (active − never_picked) / active × 100。
 *
 * 消费 /admin/stats 的 active_files 与 never_picked_files：
 *   - active = 未过期（含永久）的分享；never_picked = 未过期且 used_count=0
 *     （core applyHealthFilter 同口径）⇒ never_picked ⊆ active，
 *     (active − never_picked) = 未过期且至少被取过 1 次的分享；
 *   - 分母取 active 而非 total_files：已过期的分享既不在 never_picked 里、
 *     也已无法被取，拿 total 当分母会把「取件率」虚低（过期越多越低），误导运营。
 * active ≤ 0 返回 null ⇒ 展示空态。
 */
export function pickupRatePercent(active: number, neverPicked: number): number | null {
  if (!Number.isFinite(active) || !Number.isFinite(neverPicked) || active <= 0) return null
  const picked = Math.max(active - neverPicked, 0)
  return (picked / active) * 100
}
