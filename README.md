# frontend-core

PigeonBox 公共前端(core):平台无关的 Web 应用全量(视图/stores/API/i18n/组件)+ 宿主适配器 SPI。

- 平台实现(宿主适配器)归**各平台仓 `web/`**自包含构建([fnos](https://github.com/pigeonbox/fnos)、[qnap](https://github.com/pigeonbox/qnap)),经 `installHost()` 在应用拉起前注入;壳仓 [frontend](https://github.com/pigeonbox/frontend) 只做 neutral 产物(server/docker 镜像)
- core 依赖清单**零宿主 SDK**(CI 守卫强制);neutral 构建即纯公共应用
- 消费方式:Release 源码 tgz(与 `@pigeonbox/contracts` 同模式,匿名 https)

```bash
npm ci && npm run typecheck && npm test && npm run build   # neutral 构建
```

License: Apache-2.0 · Copyright 2026 PigeonBox
