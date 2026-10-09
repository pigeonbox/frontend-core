# PigeonBox 前端镜像（k8s 前后端分离部署用）
#
# nginx 静态服务 + API 反代；后端地址经 envsubst 注入（官方镜像自带
# /etc/nginx/templates/*.template → conf.d 渲染机制），因此同一镜像
# 既可用于 k8s（BACKEND_HOST=后端 Service DNS），也可独立/边车运行
# （默认 127.0.0.1:12345）。
#
# 单独构建: docker build -t pigeonbox-frontend .
# 发布链路: server 仓 release.yml 打 v* tag 时以同版本号构建推送
#          ghcr.io/pigeonbox/frontend（与 server 镜像同一版本列车）。

# Stage 1: Build(--platform 钉宿主平台: JS 产物平台无关,避免 arm64 交叉
# 构建被扔进 qemu 致 npm ci 级慢/挂起;运行时的 nginx 段仍用目标平台)
FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /src
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json* ./
RUN npm ci --registry=${NPM_REGISTRY}
COPY . .
RUN npm run build

# Stage 2: Runtime（uid/gid=101 非 root，监听 8080）
FROM nginxinc/nginx-unprivileged:1.31-alpine
COPY --from=build /src/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
# envsubst 默认值：独立/边车模式直连本机后端；k8s 由 chart 注入 Service DNS
ENV BACKEND_HOST=127.0.0.1 \
    BACKEND_PORT=12345 \
    CLIENT_MAX_BODY_SIZE=20m
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
