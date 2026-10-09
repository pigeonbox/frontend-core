import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { resolve } from 'path'
import { readFileSync } from 'node:fs'

// 前端构建版本注入首页/仪表盘版本页脚（对齐发布列车,发版随 server 同号）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

// 后端地址，dev 下所有 API 请求代理到这里（FCB_API_TARGET 可覆盖，便于指向本地多实例）
const proxyTarget = {
  target: process.env.FCB_API_TARGET || 'http://localhost:12345',
  changeOrigin: true,
}

// https://vitejs.dev/config/
export default defineConfig({
  // 相对 base:构建产物以 index.html 所在位置解析资源——根路径部署行为不变,
  // 统一网关(/app/pigeonbox/)等带前缀部署下资源不再丢前缀 404。
  // SPA 路由为 hash 模式,相对 base 无路由副作用。
  base: './',
  plugins: [
    vue(),
    // Element Plus 按需引入：模板组件自动注册 + 样式按组件引入（程序化 API
    // 与 v-loading 的样式/指令在 main.ts 手动接入，见 element-plus-services.ts）
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // 所有后端 API 路由统一代理到后端，避免 dev 下 Vite fallback 返回 index.html
      '/share': proxyTarget,
      '/user': proxyTarget,
      '/admin': proxyTarget,
      '/chunk': proxyTarget,
      '/api': proxyTarget,
      '/anonymous': proxyTarget,
      '/download': proxyTarget,
      '/notifies': proxyTarget,
      '/presign': proxyTarget,
      '/setup': proxyTarget,
      '/request': proxyTarget,
      '/preview': proxyTarget,
      '/qrcode': proxyTarget,
      '/openapi.json': proxyTarget,
      '/robots.txt': proxyTarget,
      '/ping': proxyTarget,
      '/version': proxyTarget,
    },
  },
})
