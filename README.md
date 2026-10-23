# frontend-core

PigeonBox 公共前端(core):平台无关的 Web 应用全量(视图/stores/API/i18n/组件)+ 宿主适配器 SPI。

- 平台实现(宿主适配器)归**各平台仓 `web/`**自包含构建([fnos](https://github.com/pigeonbox/fnos)、[qnap](https://github.com/pigeonbox/qnap)),经 `installHost()` 在应用拉起前注入;壳仓 [frontend](https://github.com/pigeonbox/frontend) 只做 neutral 产物(server/docker 镜像)
- core 依赖清单**零宿主 SDK**(CI 守卫强制);neutral 构建即纯公共应用
- 消费方式:Release 源码 tgz(与 `@pigeonbox/contracts` 同模式,匿名 https)
- admin 系统配置页为 7 分区(site/share/download/account/security/notify/p2p,
  `?section=` 深链);P2P 分区**只含 federation 子段**(联邦热启停,registry 留空=
  官方公共注册中心 home.enjoye.top:56788;含联邦推送邀请面板:待收列表/认领/推送)。
  设备直传面(direct 子段与独立控制台页)已于 2026-10-22 随 PigeonBeam 拆分移除,
  直传请用 PigeonBeam(信鸽直传)

```bash
npm ci && npm run typecheck && npm test && npm run build   # neutral 构建
```

License: Apache-2.0 · Copyright 2026 PigeonBox
