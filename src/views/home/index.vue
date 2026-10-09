<template>
  <div class="home-container">
    <!-- 主容器 -->
    <div class="main-wrapper">
      <!-- 顶部导航 —— TopNav home 变体（站名/语言/主题/铃铛/用户菜单内聚于组件） -->
      <TopNav variant="home" @command="handleUserCommand">
        <template #nav-extra>
          <!-- nav-extra-desktop:手机端隐藏(首页本身即取件页,顶栏只留登录,API 文档沉到页脚) -->
          <el-button v-if="!userStore.isLoggedIn" type="primary" plain @click="$router.push('/user/login')">
            {{ t('home.login') }}
          </el-button>
        </template>
      </TopNav>

      <!-- 主内容区：单列聚焦(对标上游"居中一个柜子卡片"的取件优先布局) -->
      <main class="content-area">
        <!-- 功能卡片：取件为第一 Tab（对标上游取件优先模式） -->
        <div class="function-card">
          <div class="card-head">
            <div class="card-head-icon">
              <el-icon size="22"><Postcard /></el-icon>
            </div>
            <h2 class="card-head-title">{{ t('home.cardTitle.get') }}</h2>
          </div>
          <div class="card-pane"><GetShare ref="getShareRef" :deep-code="deepCode" /></div>

          <!-- 卡内页脚：去发送 / 本机记录（两条次级入口并排一行,不与主 CTA 抢层级） -->
          <div class="card-footer">
            <a class="footer-link" @click="router.push('/send')">{{ t('home.goSend') }}</a>
            <span class="footer-dot">·</span>
            <a class="footer-link" @click="getShareRef?.openHistory()">{{ t('home.getShare.history') }}</a>
          </div>
        </div>
      </main>

      <!-- 页脚：免责声明 + 单行元信息（链接与版本并流,去分隔线） -->
      <footer class="footer-section">
        <p class="footer-notice">{{ t('home.notice') }}</p>
        <div class="footer-meta">
          <a href="https://github.com/pigeonbox/pigeonbox" target="_blank">GitHub</a>
          <span class="meta-dot">·</span>
          <!-- 宿主入口:跳宿主应用设置页(授权目录/端口/密码面板);无宿主隐藏 -->
          <template v-if="hostAppSettings">
            <a @click="host.openAppSettings()">{{ t('home.hostAppSettings') }}</a>
            <span class="meta-dot">·</span>
          </template>
          <!-- API 文档/管理入口按配置展示（/api-docs 与 /admin 路由始终可达,仅控制入口展示） -->
          <a v-if="configStore.config?.apiDocsEnabled !== false" @click="$router.push('/api-docs')">{{ t('home.apiDocs') }}</a>
          <template v-if="configStore.config?.apiDocsEnabled !== false"><span class="meta-dot">·</span></template>
          <a v-if="configStore.config?.showAdminAddr" href="#/admin/login">{{ t('admin.title') }}</a>
          <template v-if="configStore.config?.showAdminAddr"><span class="meta-dot">·</span></template>
          <span>{{ t('home.versionLabel') }} v{{ appVersion }}</span>
          <span class="meta-dot">·</span>
          <span>© 2026 PigeonBox</span>
          <span class="meta-dot">·</span>
          <span>Apache-2.0</span>
        </div>
      </footer>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Postcard } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'
import { useLocaleStore } from '@/stores/locale'
import { host } from '@/host'
import GetShare from '@/components/upload/GetShare.vue'
import TopNav from '@/components/layout/TopNav.vue'

// vite define 注入的构建版本（package.json,对齐发布列车）
const appVersion = __APP_VERSION__

const router = useRouter()
const route = useRoute()
// ?code= 深链接码（联邦口令/旧收藏经 /retrieve 兼容重定向落此处）：就地取件
const deepCode = computed(() => (route.query.code as string) || '')
const getShareRef = ref<InstanceType<typeof GetShare>>()
const userStore = useUserStore()
const configStore = useConfigStore()
const localeStore = useLocaleStore()
const { t, locale } = useI18n()
// 宿主可用性(页脚「应用设置」入口显隐;default 适配器恒 false)
const hostAppSettings = host.capabilities.appSettings

// 取件专属页（2026-10-07 拆分：文件/文本分享迁往 /send,避免 tab 切换
// 撑高卡片使取件失焦）。旧 ?tab=file|text 深链重定向到发送页
const legacyTab = new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab')
if (legacyTab === 'file' || legacyTab === 'text') {
  router.replace({ path: '/send', query: { tab: legacyTab } })
}

const handleUserCommand = (command: string) => {
  switch (command) {
    case 'dashboard':
      router.push('/user/dashboard')
      break
    case 'logout':
      userStore.logout()
      ElMessage.success(t('home.loggedOut'))
      break
  }
}

onMounted(async () => {
  // 同步 i18n 和 store
  locale.value = localeStore.locale
  document.documentElement.lang = localeStore.locale
  // 加载配置
  await configStore.fetchConfig()
  // 安全版主题：背景图（后端已白名单校验 http(s)）。
  // 主题色（accent）统一在 App.vue 全局应用，此处不再重复设置。
  const cfg = configStore.config
  if (cfg?.background) {
    const dark = document.documentElement.classList.contains('dark')
    const overlay = dark ? 'rgba(17, 17, 17, 0.78)' : 'rgba(255, 255, 255, 0.82)'
    const body = document.body
    body.style.backgroundImage = `linear-gradient(${overlay}, ${overlay}), url("${cfg.background}")`
    body.style.backgroundSize = 'cover'
    body.style.backgroundAttachment = 'fixed'
    body.style.backgroundPosition = 'center'
  }
})
</script>

<style scoped>
/* 主容器 —— 纯净背景 */
.home-container {
  min-height: 100vh;
  background: var(--color-bg);
}

.main-wrapper {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--spacing-xl) var(--spacing-xl) var(--spacing-2xl);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 主内容区 —— 单列聚焦卡片布局（PC 720px 居中,与上游柜子卡片同构） */
.content-area {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

/* Hero —— 居中 */
.step-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 6px;
}

.step-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--primary-color);
  background: var(--primary-bg);
}

.step-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  /* 两端窄屏下步骤标题不撑破列 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-desc {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  line-height: 1.5;
}

/* 功能卡卡头（软垫图标+标题,轻量一档让位给输入区） */
.card-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-sm);
  text-align: center;
}

.card-head-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  background: var(--color-muted);
  color: var(--color-text-primary);
  border-radius: var(--radius-lg);
}

.card-head-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-primary);
}


/* 功能卡片 —— 视觉焦点（在剩余空间垂直居中;auto margin 在内容超高时安全塌缩为 0,不裁剪） */
.function-card {
  margin: auto 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  padding: var(--spacing-xs) var(--spacing-xl) var(--spacing-sm);
}

/* 单面板容器:取件页唯一面板,高度贴合内容(旧 min-height 是三 tab 时代防跳高遗产,已无必要) */
.card-pane {
  padding: 0 var(--spacing-sm);
}

/* 卡内页脚（次级入口行:去发送 · 取件/发件记录） */
.card-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg) var(--spacing-md);
}

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.footer-link:hover {
  color: var(--primary-color);
}

.footer-dot {
  color: var(--color-border);
}

/* 分段切换器：圆角轨道 + 活动白块（对标上游 发送文件/发送文本） */




/* 分享结果弹窗样式内聚于 ShareResultDialog 组件 */

/* 页脚：免责声明 + 单行元信息（去分隔线,靠留白收尾） */
.footer-section {
  margin-top: var(--spacing-2xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  text-align: center;
}

.footer-notice {
  margin: 0;
  line-height: 1.6;
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  max-width: 640px;
}

.footer-meta a {
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.footer-meta a:hover {
  color: var(--color-text-primary);
}

.footer-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-sm);
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.meta-dot {
  color: var(--color-border);
}

/* ===== 响应式：手机端 (≤768px) ===== */
@media (max-width: 768px) {
  .function-card {
    padding: var(--spacing-xs) var(--spacing-md);
    /* 圆角大卡片贴边留 2px 呼吸,避免"框中框"的局促 */
    border-radius: var(--radius-lg);
  }

  /* 手机上卡片就是主战场,页脚收紧 */
  .footer-section {
    margin-top: var(--spacing-xl);
    gap: var(--spacing-sm);
  }
}
</style>
