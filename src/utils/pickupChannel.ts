/**
 * 取件交付面（pickup channel）的判定与文案键映射。
 *
 * 取件明细里每行带一个 `channel`（契约里是**可选**字段，旧数据/未带通道时为空）：
 *   - `download`    交付面=下载（文件分享的 /share/download）
 *   - `select-text` 交付面=取件页（文本分享在 select 交付正文）
 *   - `retrieve`    交付面=取件码（6 位码通道的取件查询）
 *
 * 抽成纯函数是为了能单测（view 层在本仓无组件测试基建，约定是 utils/composables 才测）。
 */

/** 已知交付面 */
export const PICKUP_CHANNELS = ['download', 'select-text', 'retrieve'] as const

export type PickupChannel = (typeof PICKUP_CHANNELS)[number]

/** 是否为已知交付面（未知值一律原样回显，避免服务端加新通道时前端显示空白） */
export function isPickupChannel(value: unknown): value is PickupChannel {
  return typeof value === 'string' && (PICKUP_CHANNELS as readonly string[]).includes(value)
}
