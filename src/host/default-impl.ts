// 默认(无宿主)实现:一切能力关闭,方法静默。
// 任何部署(server/docker/charts/裸端口)不经 installHost 注入即为此实现,
// 视图按 capabilities 关闭联动入口,行为与无适配器时代完全一致。
import type { HostAdapter } from './spi'

export const defaultHostAdapter: HostAdapter = {
  name: '',
  capabilities: { sso: false, sharedDirs: false, fileActions: false, appSettings: false },
  async initFollow() {},
  async setTitle() {},
  async ssoLogin() {
    return null
  },
  async listAuthorizedDirs() {
    return null
  },
  async pickAuthorizedDir() {
    return null
  },
  async openFile() {
    return false
  },
  async openDir() {
    return false
  },
  async showFileDetails() {
    return false
  },
  async openAppSettings() {
    return false
  },
  async openExternal() {
    return false
  },
}
