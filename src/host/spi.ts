// 宿主适配器 SPI(稳定接口,core 只依赖此文件)。
// 平台实现(fnOS/QNAP/…)位于各壳仓,经 installHost() 在启动前注入;
// 默认实现 default-impl 全部能力关闭、方法静默——非宿主部署零行为差异。
import type { user as userContract } from '@pigeonbox/contracts'

/** 宿主能力声明(视图据此渲染联动入口,如存储页授权目录卡片) */
export interface HostCapabilities {
  /** SSO 免登录(登录页/应用启动静默登录) */
  sso: boolean
  /** 授权目录联动(管理端存储页卡片:列出/选择/打开目录) */
  sharedDirs: boolean
  /** 文件动作(管理端本地文件页:打开/详情/定位) */
  fileActions: boolean
  /** 应用设置页入口(页脚跳宿主应用设置) */
  appSettings: boolean
}

/** 授权目录项(path=业务用内部路径,semantic=面向用户的展示路径) */
export interface HostDirItem {
  path: string
  semantic: string
}

export interface HostFollowHandlers {
  onTheme?: (dark: boolean) => void
  onLanguage?: (language: string) => void
}

export interface HostAdapter {
  /** 宿主展示名(如「飞牛」),供宿主能力 UI 拼接文案 */
  readonly name: string
  readonly capabilities: HostCapabilities
  /** 主题/语言跟随宿主(初始化读取 + 持续监听) */
  initFollow(handlers: HostFollowHandlers): Promise<void>
  /** 同步宿主窗口标题 */
  setTitle(title: string): Promise<void>
  /** SSO 静默登录;成功返回登录态 user(服务端已下发会话 Cookie),失败 null */
  ssoLogin(): Promise<userContract.UserData | null>
  /** 列出宿主授权给应用的目录;能力缺失/服务不可用返回 null */
  listAuthorizedDirs(): Promise<HostDirItem[] | null>
  /** 打开宿主目录授权选择器;返回本次授权的目录(空数组=用户取消,null=不可用) */
  pickAuthorizedDir(): Promise<string[] | null>
  /** 用宿主应用打开文件 */
  openFile(path: string): Promise<boolean>
  /** 宿主文件管理器中定位目录 */
  openDir(path: string): Promise<boolean>
  /** 宿主文件详情页 */
  showFileDetails(paths: string[]): Promise<boolean>
  /** 跳宿主应用设置页 */
  openAppSettings(): Promise<boolean>
  /** 宿主方式打开外部链接(WebView 走系统浏览器) */
  openExternal(url: string): Promise<boolean>
}
