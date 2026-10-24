/**
 * owner 侧「取件次数」展示的判定（分享列表 / 取件历史）。
 *
 * ## 为什么抽成纯函数
 *
 * 视图层在本仓无组件测试基建（约定是 utils/composables 才测），而这里的判定
 * 曾经出过一个**真缺陷**（2026-10-24 审计发现）：
 *
 * ```vue
 * <!-- 旧写法（错） -->
 * <span v-if="row.expired_count === -1 || row.expired_count === 0 && !row.require_auth">
 *   {{ row.used_count }} / {{ t('user.shares.unlimited') }}   <!-- 耗尽显示成「无限」 -->
 * ```
 *
 * 而契约 `share.thrift` 的 `expired_count` 语义是 **-1=无限, 0=耗尽, >0=剩余**，
 * 写入侧（`core/pkg/utils/expire.go` 的 `CalculateExpireCount`）非 count 样式恒为
 * -1、扣次递减到 0 ⇒ **`0` 只可能是「额度已用完」**。
 *
 * ⇒ 旧写法把「已耗尽」渲染成「无限」：owner 唯一的配额视图说反了（且那个
 * `&& !row.require_auth` 条件更让判定自相矛盾：设了密码的耗尽分享显示正确、
 * 没设密码的显示成无限）。这正是本次语义重构要消灭的「次数耗尽伪装」在前端
 * 侧的残留。
 *
 * ## 判定依据（跨仓三处互证）
 *
 * - 契约：`contracts/idl/share.thrift` → `expired_count // -1=无限, 0=耗尽, >0=剩余`
 * - 写入：`core/pkg/utils/expire.go` → `CalculateExpireCount`（非 count 样式 = -1）
 * - 扣次：`core/repo/db/dao/filecode_pickup_charge.go` → `DecrementExpiredCount`（递减到 0）
 */

/** 分享行里与取件配额有关的字段（只需这三个，其余字段无关） */
export interface ShareQuotaRow {
  /** 剩余可取次数：-1=无限, 0=已耗尽, >0=剩余 */
  expired_count: number
  /** 已用次数 */
  used_count: number
}

/** 配额展示形态 */
export type QuotaDisplayKind = 'unlimited' | 'exhausted' | 'remaining'

/** 配额展示判定结果 */
export interface QuotaDisplay {
  kind: QuotaDisplayKind
  /** 已用次数 */
  used: number
  /** 总次数（无限时为 used） */
  total: number
}

/**
 * 判定 owner 侧「取件次数」列的展示形态。
 *
 * - `unlimited`  : expired_count === -1 ⇒ 「N / 无限」
 * - `exhausted`  : expired_count === 0  ⇒ 「N / N（已用完）」（**不得**显示成无限）
 * - `remaining`  : expired_count > 0   ⇒ 「used / (used+remaining)」
 */
export function shareQuotaDisplay(row: ShareQuotaRow): QuotaDisplay {
  const used = Number.isFinite(row?.used_count) ? Math.max(0, Math.trunc(row.used_count)) : 0
  const remaining = Number.isFinite(row?.expired_count) ? Math.trunc(row.expired_count) : -1

  if (remaining === -1) {
    return { kind: 'unlimited', used, total: used }
  }
  if (remaining <= 0) {
    // 额度用完：总数 = 已用（remaining=0）。**不是**无限。
    return { kind: 'exhausted', used, total: used }
  }
  return { kind: 'remaining', used, total: used + remaining }
}

/**
 * 分享状态标签的判定（区分「次数已用完」与「时间已过期」）。
 *
 * 后端把两者合并成一个 `is_expired` 下发（owner 列表语义上「不可取件」确实
 * 是一回事），但**次数耗尽 ≠ 时间过期**（新语义不变量）⇒ 前端手上还有
 * `expired_count` ⇒ 可以区分开，给 owner 更准确的提示。
 *
 * - `deleted`  : 已进回收站
 * - `exhausted`: 额度已用完（expired_count === 0）
 * - `expired`  : 时间已过期
 * - `active`   : 有效
 */
export type ShareStatusKind = 'deleted' | 'exhausted' | 'expired' | 'active'

export function shareStatusKind(row: {
  deleted_at?: string | null
  is_expired?: boolean
  expired_count?: number
}): ShareStatusKind {
  if (row?.deleted_at) return 'deleted'
  if (row?.expired_count === 0) return 'exhausted'
  if (row?.is_expired) return 'expired'
  return 'active'
}
