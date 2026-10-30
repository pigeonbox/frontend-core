/**
 * 能力位消费（2026-10-30）。
 *
 * 「这个面支持什么」此前由各部署面各写一份条件判断拼出来（多副本无直传/联邦、
 * charts 缺省关 p2p/relay、NAS 有 Beam 而 docker 没有）⇒ 2026-10-22 设计稿
 * Q1 拍板的「没有就是没有、不给坏入口」无法统一执行。
 *
 * 现在服务端按**运行时真实状态**下发能力位（core /api/config 的 capabilities 段），
 * 前端统一从这里读，不再各写各的。
 *
 * ## 缺字段 = 未知，不是 false
 *
 * 老后端（不含 capabilities 段）⇒ 一律按「未知」处理：
 *   - **不得**据此隐藏功能（宁可多给入口，也别给坏入口）；
 *   - 拿不准时仍以**运行时行为**为准（例：首启令牌缺失 → 仍靠 401 兜底）。
 *
 * 抽成纯函数是为了**能单测**（本仓无组件测试基建）。
 */

import type { ServerCapabilities } from '@/api/public'

/** 能力位读取的最小输入（只用到 capabilities 段）。 */
export interface CapabilitiesCarrier {
  capabilities?: ServerCapabilities | null
}

/** 读取能力位；缺段/缺字段一律返回 undefined（=未知）。 */
export function readCapabilities(cfg: CapabilitiesCarrier | null | undefined): ServerCapabilities {
  return cfg?.capabilities ?? {}
}

/**
 * 首启是否需要令牌。
 *
 * 缺字段 ⇒ false（老后端没有令牌门禁）——但首启页仍保留 401 兜底：
 * 服务端若确实要令牌，提交会被 401 拦下 ⇒ 令牌框随即出现。
 */
export function setupTokenRequired(cfg: CapabilitiesCarrier | null | undefined): boolean {
  return readCapabilities(cfg).setup_token_required === true
}

/** 部署模式（空串 = 未知）。 */
export function deploymentMode(cfg: CapabilitiesCarrier | null | undefined): string {
  return (readCapabilities(cfg).deployment_mode ?? '').trim()
}

/**
 * 是否是多副本部署（public 副本或 admin 副本）。
 *
 * 多副本拓扑下直传/联邦在架构上不可用（core 的 deployment.go 会自动降级关闭）
 * ⇒ 前端据此**不给出**这两个入口（而不是给一个点不动的按钮）。
 * 缺字段 ⇒ false（未知时按单站处理，避免把功能藏没了）。
 */
export function isMultiReplica(cfg: CapabilitiesCarrier | null | undefined): boolean {
  const mode = deploymentMode(cfg)
  return mode === 'public' || mode === 'admin'
}

/**
 * 服务端**明确**告知「本实例是多副本部署」。
 *
 * 与 isMultiReplica 的区别：isMultiReplica 在「未知」时返回 false（按单站处理），
 * 而本函数只认服务端**明确**说出来的多副本（deployment_mode ∈ {public, admin}）。
 *
 * 为什么需要这个更严的版本：直传（/beam）入口的显隐是**安全面**上的判断——
 * 多副本拓扑下直传在架构上不可用（core 的 deployment.go 会把联邦强制降级关闭，
 * 节点身份是进程级的 Ed25519，多副本语义未定义），此时若仍给出直传入口，
 * 用户点了只会落到一个坏路径。而老后端（不下发 capabilities 段）属于**未知**，
 * 不能据此把功能藏没 ⇒ 未知时一律当「不是多副本」，保持入口可见。
 *
 * ⇒ 只有服务端明确说多副本时才收起用不上的入口。
 */
export function multiReplicaDeclared(cfg: CapabilitiesCarrier | null | undefined): boolean {
  const mode = deploymentMode(cfg)
  return mode === 'public' || mode === 'admin'
}

/**
 * 站点公网地址是否已配置。
 *
 * 未配置 ⇒ 分享链接按**请求来源**拼 ⇒ NAS 内网部署会把内网 IP 发给外部用户
 * （对外不可达）。缺字段 ⇒ false（=提示用户去配，属于"宁可多提醒"的一侧）。
 */
export function publicUrlConfigured(cfg: CapabilitiesCarrier | null | undefined): boolean {
  return readCapabilities(cfg).public_url_set === true
}

/**
 * 服务端**明确**告知「站点公网地址未配置」。
 *
 * 与 publicUrlConfigured 的区别：老后端不下发 capabilities 段 ⇒
 * 属于**未知**（不是"未配置"）⇒ 不该弹提醒（否则老后端上满屏误报）。
 * 只有服务端明确说 public_url_set === false 时才为 true。
 */
export function publicUrlMissing(cfg: CapabilitiesCarrier | null | undefined): boolean {
  const caps = readCapabilities(cfg)
  return caps.public_url_set === false
}

/**
 * 跨站取件（联邦）是否**可用**——能不能向用户承诺这个能力。
 *
 * 两个输入：
 *  1. 服务端声明的 `federationEnabled`（顶层字段，生效值）；
 *  2. 服务端**明确**告知的部署模式（capabilities 段）。
 *
 * ## 为什么不能只看服务端声明
 *
 * 多副本拓扑下联邦**架构上不可用**：节点身份是**进程级** Ed25519 密钥，
 * 多副本各持各的身份 ⇒ 跨站注册/解析语义未定义（拍板：暂不支持）。
 * 服务端本该把它降级为 false——前端此前**完全信任**这一条
 * （stores/config.ts 的注释就写着「多副本模式下被强制降级为 false」）。
 *
 * 但服务端的降级是**启动时**做的：运行期一次管理台保存、或一次**多副本配置广播**，
 * 都会把 DB 里的「提交意图」整段盖回全局配置 ⇒ 降级被**复活** ⇒
 * federationEnabled 又变 true ⇒ 前端在多副本下**承诺了一个用不了的跨站取件**。
 *
 * ⇒ 前端**双保险**：多副本（服务端**明确**说的）一律按不可用处理，
 * 不管服务端声明成什么。
 *
 * 老后端（能力位未知 ⇒ multiReplicaDeclared=false）不受影响：
 * 保持服务端声明，不因「不知道」就把功能藏没。
 */
export function federationUsable(
  cfg: CapabilitiesCarrier | null | undefined,
  federationEnabled: boolean,
): boolean {
  if (multiReplicaDeclared(cfg)) return false
  return federationEnabled
}
