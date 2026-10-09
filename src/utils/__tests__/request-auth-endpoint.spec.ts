import { afterEach, describe, expect, it } from 'vitest'
import { installHost, uninstallHost } from '@/host'
import type { HostAdapter } from '@/host'
import { isAuthEndpointUrl } from '../request'

// 最小适配器桩:只关心 ssoLoginPaths,其余方法静默
function stubAdapter(extra: Partial<HostAdapter>): HostAdapter {
  return {
    name: 'stub',
    capabilities: { sso: false, sharedDirs: false, fileActions: false, appSettings: false },
    initFollow: async () => {},
    setTitle: async () => {},
    ssoLogin: async () => null,
    listAuthorizedDirs: async () => null,
    pickAuthorizedDir: async () => null,
    openFile: async () => false,
    openDir: async () => false,
    showFileDetails: async () => false,
    openAppSettings: async () => false,
    openExternal: async () => false,
    ...extra,
  } as HostAdapter
}

describe('isAuthEndpointUrl（鉴权端点豁免·SSO 白名单 SPI 化）', () => {
  afterEach(() => uninstallHost())

  it('登录/刷新端点本身恒豁免（与宿主无关）', () => {
    expect(isAuthEndpointUrl('/user/login')).toBe(true)
    expect(isAuthEndpointUrl('/admin/login')).toBe(true)
    expect(isAuthEndpointUrl('/user/refresh')).toBe(true)
  })

  it('无适配器（neutral 部署）不豁免任何宿主端点——core 零平台字面量', () => {
    expect(isAuthEndpointUrl('/api/fnos/login')).toBe(false)
    expect(isAuthEndpointUrl('/api/qnap/login')).toBe(false)
  })

  it('适配器声明 ssoLoginPaths 后仅豁免声明的端点（其 401 不再触发刷新/跳登录）', () => {
    installHost(stubAdapter({ ssoLoginPaths: ['/api/fnos/login'] }))
    expect(isAuthEndpointUrl('/api/fnos/login')).toBe(true)
    expect(isAuthEndpointUrl('/api/qnap/login')).toBe(false)
    expect(isAuthEndpointUrl('/user/shares')).toBe(false)
  })

  it('卸载适配器后回退默认（豁免随适配器生命周期）', () => {
    installHost(stubAdapter({ ssoLoginPaths: ['/api/qnap/login'] }))
    expect(isAuthEndpointUrl('/api/qnap/login')).toBe(true)
    uninstallHost()
    expect(isAuthEndpointUrl('/api/qnap/login')).toBe(false)
  })
})
