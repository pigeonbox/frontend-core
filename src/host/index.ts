// 宿主适配器注册点(运行时注入,壳仓 main 在拉起应用前调用 installHost)。
// core 其余代码只准 import 本文件的 host——平台 SDK/宿主判断一律禁入(边界由
// 各仓 CI 守卫:core 依赖清单中不出现任何平台 SDK 包)。
import { reactive, ref } from 'vue'
import type { HostAdapter, HostCapabilities } from './spi'
import { defaultHostAdapter } from './default-impl'

export type { HostAdapter, HostCapabilities, HostDirItem, HostFollowHandlers } from './spi'

let impl: HostAdapter = defaultHostAdapter

// 响应式能力视图:适配器可在 init() 中异步探测后原地更新 capabilities,
// init 完成后此处把最终值同步进来——视图层 computed 据此显隐联动入口
const reactiveCaps = reactive<HostCapabilities>({ ...defaultHostAdapter.capabilities })
const hostName = ref('')

/** 壳仓启动时注入平台适配器(必须在应用拉起前;重复注入以最后一次为准) */
export function installHost(adapter: HostAdapter): void {
  impl = adapter
  hostName.value = adapter.name
  Object.assign(reactiveCaps, adapter.capabilities)
  void Promise.resolve(adapter.init?.())
    .then(() => {
      hostName.value = adapter.name
      Object.assign(reactiveCaps, adapter.capabilities)
    })
    .catch(() => {
      /* 探测失败保持初值(能力关闭) */
    })
}

/** 测试/极少数场景回退到默认实现 */
export function uninstallHost(): void {
  impl = defaultHostAdapter
}

/**
 * 宿主外观(default=noop:能力全关,方法静默)。注意 capabilities/name 是
 * 响应式视图(installHost/init 完成时会更新),视图 computed 可安全依赖。
 * 方法调用始终委托当前适配器。
 */
export const host: HostAdapter = {
  get name(): string {
    return hostName.value
  },
  get capabilities(): HostCapabilities {
    return reactiveCaps
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
