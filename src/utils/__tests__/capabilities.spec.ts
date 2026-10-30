import { describe, it, expect } from 'vitest'
import {
  readCapabilities,
  setupTokenRequired,
  deploymentMode,
  isMultiReplica,
  multiReplicaDeclared,
  publicUrlConfigured,
  publicUrlMissing,
} from '@/utils/capabilities'
import { visibleDeliveryPaths } from '@/components/share/deliveryPath'

describe('capabilities 消费（2026-10-30）', () => {
  it('缺字段 = 未知，不得据此隐藏功能', () => {
    // 老后端完全不下发 capabilities
    expect(readCapabilities(null)).toEqual({})
    expect(readCapabilities({})).toEqual({})
    expect(readCapabilities({ capabilities: null })).toEqual({})
  })

  it('setup_token_required 只认显式 true', () => {
    expect(setupTokenRequired({ capabilities: { setup_token_required: true } })).toBe(true)
    expect(setupTokenRequired({ capabilities: { setup_token_required: false } })).toBe(false)
    // 缺字段 ⇒ false（老后端没有令牌门禁）；但首启页仍保留 401 兜底
    expect(setupTokenRequired({})).toBe(false)
    expect(setupTokenRequired(null)).toBe(false)
  })

  it('deployment_mode 原样读出，空串=未知', () => {
    expect(deploymentMode({ capabilities: { deployment_mode: 'standalone' } })).toBe('standalone')
    expect(deploymentMode({ capabilities: { deployment_mode: '  admin  ' } })).toBe('admin')
    expect(deploymentMode({})).toBe('')
  })

  it('多副本判定：public/admin 副本算多副本，未知不算', () => {
    expect(isMultiReplica({ capabilities: { deployment_mode: 'public' } })).toBe(true)
    expect(isMultiReplica({ capabilities: { deployment_mode: 'admin' } })).toBe(true)
    expect(isMultiReplica({ capabilities: { deployment_mode: 'standalone' } })).toBe(false)
    // 未知 ⇒ 按单站处理（别把功能藏没了）
    expect(isMultiReplica({})).toBe(false)
  })

  it('public_url_set 只认显式 true（未配置要提醒）', () => {
    expect(publicUrlConfigured({ capabilities: { public_url_set: true } })).toBe(true)
    expect(publicUrlConfigured({ capabilities: { public_url_set: false } })).toBe(false)
    expect(publicUrlConfigured({})).toBe(false)
  })

  it('publicUrlMissing 只在服务端**明确**说未配置时为真（老后端不误报）', () => {
    expect(publicUrlMissing({ capabilities: { public_url_set: false } })).toBe(true)
    expect(publicUrlMissing({ capabilities: { public_url_set: true } })).toBe(false)
    // 老后端：没有 capabilities 段 = 未知 ⇒ 不弹提醒
    expect(publicUrlMissing({})).toBe(false)
    expect(publicUrlMissing(null)).toBe(false)
  })

  // 决定「直传入口显隐」口径的那一行：multiReplicaDeclared 与 isMultiReplica
  // 在「未知」上必须同侧（都是 false）——两者若分叉，直传入口会在老后端上凭空消失。
  it('multiReplicaDeclared 只认服务端明确说出的多副本，未知=false', () => {
    expect(multiReplicaDeclared({ capabilities: { deployment_mode: 'public' } })).toBe(true)
    expect(multiReplicaDeclared({ capabilities: { deployment_mode: 'admin' } })).toBe(true)
    expect(multiReplicaDeclared({ capabilities: { deployment_mode: 'standalone' } })).toBe(false)
    // 未知（老后端不下发 capabilities）⇒ 不据此收起用不上的入口
    expect(multiReplicaDeclared({})).toBe(false)
    expect(multiReplicaDeclared(null)).toBe(false)
  })

  it('multiReplicaDeclared 与 isMultiReplica 不得分叉（否则直传入口凭空消失）', () => {
    const cases = [
      { capabilities: { deployment_mode: 'public' } },
      { capabilities: { deployment_mode: 'admin' } },
      { capabilities: { deployment_mode: 'standalone' } },
      {},
      null,
    ]
    for (const c of cases) {
      expect(multiReplicaDeclared(c)).toBe(isMultiReplica(c))
    }
  })
})

describe('投递路径显隐（frontend-core#21 验收）', () => {
  // 验收：多副本拓扑下前端**不出现**直传入口
  it('多副本 + 探测到 /beam ⇒ 直传入口收起（不给点不动的按钮）', () => {
    expect(visibleDeliveryPaths('ready', true)).toEqual(['box'])
    expect(visibleDeliveryPaths('auth', true)).toEqual(['box'])
    expect(visibleDeliveryPaths('unready', true)).toEqual(['box'])
  })

  // 负对照：关掉能力位 ⇒ 入口必须收起（而不是给一个点不动的按钮）
  it('单站 + 探测到 /beam ⇒ 直传入口出现', () => {
    expect(visibleDeliveryPaths('ready', false)).toEqual(['box', 'p2p'])
    expect(visibleDeliveryPaths('auth', false)).toEqual(['box', 'p2p'])
  })

  it('没挂 /beam ⇒ 直传入口永不出现（与部署模式无关）', () => {
    expect(visibleDeliveryPaths('absent', false)).toEqual(['box'])
    expect(visibleDeliveryPaths('absent', true)).toEqual(['box'])
  })

  it('老后端（能力位未知 ⇒ multiReplica=false）不得把直传入口藏没', () => {
    // 未知 ⇒ 按单站处理 ⇒ 探测到就显示
    expect(visibleDeliveryPaths('ready', multiReplicaDeclared({}))).toEqual(['box', 'p2p'])
  })
})
