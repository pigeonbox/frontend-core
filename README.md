# frontend · Web 前端

[![CI](https://github.com/pigeonbox/frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/pigeonbox/frontend/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/pigeonbox/frontend)](LICENSE)

PigeonBox(文件快递柜)Web 前端:Vue 3 + Vite + Element Plus。自 v0.9.0 起与后端**分离部署**——静态资源与 API 反代由 nginx 镜像承担,作为前后端分离形态的统一对外入口。

> 🗂️ [PigeonBox 生态](https://github.com/orgs/pigeonbox)成员仓 · 总览与部署见 [装配仓 pigeonbox](https://github.com/pigeonbox/pigeonbox) · [架构图集](https://github.com/pigeonbox/pigeonbox/blob/main/docs/architecture.md)

## 技术栈

- **框架**: Vue 3(Composition API + script setup)
- **构建工具**: Vite 7
- **UI 组件库**: Element Plus(按需自动引入)
- **状态管理**: Pinia
- **路由**: Vue Router 5
- **国际化**: vue-i18n
- **数据请求**: Axios
- **类型检查**: TypeScript 5.9

## 项目结构

```
src/
├── api/            # API 接口封装(share / user / admin ...；_xhr.ts=XHR 通道统一出口)
├── components/     # 通用组件(upload/ 上传、share/ 分享表单与结果弹窗、layout/ 导航、data/ 展示)
├── composables/    # 组合式函数(上传队列/表格查询/分享设置/轮询/拖拽等)
├── config/         # 前端配置数据(menu.ts 导航单一数据源)
├── router/         # 路由配置
├── stores/         # Pinia 状态(config / locale / theme / user)
├── styles/         # 全局样式(SCSS)
├── types/          # 手写 TS 类型
├── utils/          # 纯函数工具(format.ts 全站唯一格式化实现、request.ts axios 封装等)
└── views/          # 页面(home / share / user / admin)——只做装配
```

## 架构分层（2026-10-06 起强制）

六层单向依赖，只允许向下 import，禁止反向（2026-10-06 起强制）：

```
views(装配,软上限~400行) → components(共享组件) → composables(领域编排)
                        → stores(跨页状态) → api(端点封装,零 Vue 依赖) → utils/types(纯函数)
```

新代码落位约定：

| 要做的事 | 落位 |
|---|---|
| 格式化大小/日期 | `utils/format.ts`（勿在页面重写，全站唯一实现） |
| 上传（任意入口） | `composables/useUploadQueue` + `useFileDrop`，大文件弹窗 `PresignUploadDialog.open()`（Promise） |
| 分享设置表单 / 分享成功弹窗 | `components/share/ShareSettingsForm` + `ShareResultDialog`（含 `types/share.ts` 契约） |
| 表格+分页列表 | `composables/useTableQuery`（fetcher 由页面提供，负责筛选/错误提示/形状归一） |
| 导航菜单 | `config/menu.ts`（router 注册 + menu.ts 加一项，双端 UI 自动生效） |
| 定时轮询 | `composables/usePolling`（页面隐藏自动暂停） |
| 错误提示 | catch 分支用 `useErrorHandler().handleError(e)`（ErrorToast 全局唯一通道，带 trace_id）；成功/校验类提示用 ElMessage |
| XHR 上传类请求 | `api/_xhr.ts`（xhrSend JSON 通道 / xhrRaw 裸请求），勿再手写 XMLHttpRequest |
| i18n | 新文案一律 key 化，zh-CN 与 en-US 同 commit 补齐 |

## 开发指南

```bash
npm install
npm run dev         # http://localhost:3000
npm run typecheck   # vue-tsc --noEmit
npm run test        # vitest
npm run build       # vue-tsc -b && vite build
```

开发环境下,后端 API 路由统一代理到本地后端(`vite.config.ts`):

- `/share /user /admin /chunk /api /anonymous /download /notifies /presign /setup /request /preview /qrcode /openapi.json /ping` → `http://localhost:12345`

API 规范真相源是后端运行时生成的 `/openapi.json`(Swagger UI 见前端 `/#/api-docs` 页);本仓不维护 openapi 快照,wire 契约类型经 `@pigeonbox/contracts` Release tgz 依赖引入(contracts IDL 生成),手写补充类型见 `src/types/`。

## 分离镜像

发布版镜像 **`ghcr.io/pigeonbox/frontend`**(多架构,由 [server](https://github.com/pigeonbox/server) 仓 release 工作流随同一 `v*` tag 同步发布):

- 基于 `nginx-unprivileged`:静态资源 + 反代 `BACKEND_HOST:BACKEND_PORT`(envsubst 注入,默认后端服务名 `pigeonbox:12345`)
- 承接全部对外流量:静态 + `/share /user /admin ...` 反代到后端 API

本地试跑:

```bash
docker build -t fcb-frontend .
docker run -p 8080:8080 -e BACKEND_HOST=host.docker.internal -e BACKEND_PORT=12345 fcb-frontend
```

自托管编排(compose / Helm / Ingress 示例)见 hub 仓 [docs/DEPLOY-COMPOSE.md](https://github.com/pigeonbox/pigeonbox/blob/main/docs/DEPLOY-COMPOSE.md) 与 [charts](https://github.com/pigeonbox/charts)。

## 主要功能

- 📤 **文件分享**:拖拽上传、分片/断点续传、进度显示、过期时间、密码保护、多文件分享(zip 打包下载)
- 📝 **文本分享**:大文本、格式保留
- 📥 **首页取件**:首页即取件页,取件码/分享码统一输入(6/8 位自适应)、就地密码验证、在线预览、下载/复制
- 🔑 **预签名直传**:大文件浏览器直连对象存储(分片+进度条)
- 📬 **寄件码**:创建投递链接,访客凭链接向柜子上传
- 👤 **用户系统**:注册/登录、OIDC 单点登录、我的分享、API 令牌管理
- 🛠 **管理后台**:仪表盘、分享/文件管理、用户管理、站点配置(存库持久化)

## 代码规范

- Composition API + `<script setup>` + TypeScript
- 组件命名 PascalCase,文件命名 kebab-case
- 样式 SCSS + scoped

## License

[Apache-2.0](LICENSE)
