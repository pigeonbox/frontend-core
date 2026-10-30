import { describe, it, expect } from 'vitest'
import {
  readCapabilities,
  setupTokenRequired,
  deploymentMode,
  isMultiReplica,
  publicUrlConfigured,
  publicUrlMissing,
} from '@/utils/capabilities'

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
})
