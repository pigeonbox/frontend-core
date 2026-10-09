// 宿主适配器注册点(运行时注入,壳仓 main 在拉起应用前调用 installHost)。
// core 其余代码只准 import 本文件的 host——平台 SDK/宿主判断一律禁入(边界由
// 各仓 CI 守卫:core 依赖清单中不出现任何平台 SDK 包)。
import type { HostAdapter } from './spi'
import { defaultHostAdapter } from './default-impl'

export type { HostAdapter, HostCapabilities, HostDirItem, HostFollowHandlers } from './spi'

let impl: HostAdapter = defaultHostAdapter

/** 壳仓启动时注入平台适配器(必须在应用拉起前;重复注入以最后一次为准) */
export function installHost(adapter: HostAdapter): void {
  impl = adapter
}

/** 测试/极少数场景回退到默认实现 */
export function uninstallHost(): void {
  impl = defaultHostAdapter
}

/** 当前宿主适配器(default=noop:能力全关,方法静默) */
export const host: HostAdapter = {
  get name() {
    return impl.name
  },
  get capabilities() {
    return impl.capabilities
  },
  initFollow: (h) => impl.initFollow(h),
  setTitle: (t) => impl.setTitle(t),
  ssoLogin: () => impl.ssoLogin(),
  listAuthorizedDirs: () => impl.listAuthorizedDirs(),
  pickAuthorizedDir: () => impl.pickAuthorizedDir(),
  openFile: (p) => impl.openFile(p),
  openDir: (p) => impl.openDir(p),
  showFileDetails: (ps) => impl.showFileDetails(ps),
  openAppSettings: () => impl.openAppSettings(),
  openExternal: (u) => impl.openExternal(u),
}
