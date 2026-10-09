import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 深色变量必须全局（html.dark 作用域），不受按需引入影响
import 'element-plus/theme-chalk/dark/css-vars.css'
// 按需引入不覆盖程序化 API 与指令的样式：这里手动补齐
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/loading/style/css'
import { vLoading } from 'element-plus/es/components/loading/index'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useThemeStore } from './stores/theme'
import './styles/main.scss'

const app = createApp(App)

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// v-loading 指令（此前由全量 app.use(ElementPlus) 提供）
app.directive('loading', vLoading)

app.use(createPinia())
app.use(router)
app.use(i18n)
// EP 组件改为按需引入（vite Components 插件 + ElementPlusResolver），
// 文案 locale 由 App.vue 的 ElConfigProvider 提供

// 主题状态：pinia 已就绪后从 localStorage 还原并应用到 <html>
const themeStore = useThemeStore()
themeStore.applyToDocument()

app.mount('#app')
