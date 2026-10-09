<template>
  <div class="home-container">
    <div class="main-wrapper">
      <!-- 顶部导航 -->
      <TopNav variant="home">
        <template #nav-extra>
          <!-- 回取件（首页=取件专属页）;API 文档沉到页脚 -->
          <el-button text class="nav-extra-desktop" @click="router.push('/')">
            <el-icon><Postcard /></el-icon>
            {{ t('home.retrieve') }}
          </el-button>
          <el-button v-if="!userStore.isLoggedIn" type="primary" plain @click="router.push('/user/login')">
            {{ t('home.login') }}
          </el-button>
        </template>
      </TopNav>

      <!-- 发送页：文件/文本 双 tab（取件已拆分至首页专属卡片,互不挤占） -->
      <main class="content-area">
        <div class="function-card">
          <div class="card-head">
            <div class="card-head-icon">
              <el-icon size="22"><Upload v-if="activeTab === 'file'" /><Document v-else /></el-icon>
            </div>
            <h2 class="card-head-title">{{ t('home.cardTitle.' + activeTab) }}</h2>
          </div>
          <div class="seg" role="tablist">
            <button
              v-for="x in ([['file', t('home.tabs.file')], ['text', t('home.tabs.text')]] as const)"
              :key="x[0]"
              class="seg-item"
              :class="{ active: activeTab === x[0] }"
              role="tab"
              :aria-selected="activeTab === x[0]"
              @click="setTab(x[0])"
            >
              {{ x[1] }}
            </button>
          </div>
          <!-- 双 tab 等高:grid 叠放,两 pane 恒占同一格,容器高度=两者最大值,切换零跳变 -->
          <div class="card-panes">
            <div class="card-pane" :class="{ inactive: activeTab !== 'file' }">
              <FileUpload @success="handleShareSuccess" />
            </div>
            <div class="card-pane" :class="{ inactive: activeTab !== 'text' }">
              <TextShare @success="handleShareSuccess" />
            </div>
          </div>

          <!-- 卡内页脚：回取件 -->
          <div class="card-footer">
            <a class="footer-link" @click="router.push('/')">
              <el-icon><Download /></el-icon>
              {{ t('home.needRetrieve') }}
            </a>
          </div>
        </div>
      </main>

      <!-- 页脚：免责声明 + 单行元信息（链接与版本并流,去分隔线） -->
      <footer class="footer-section">
        <p class="footer-notice">{{ t('home.notice') }}</p>
        <div class="footer-meta">
          <a href="https://github.com/pigeonbox/pigeonbox" target="_blank">GitHub</a>
          <span class="meta-dot">·</span>
          <!-- API 文档/管理入口按配置展示（/api-docs 与 /admin 路由始终可达,仅控制入口展示） -->
          <a v-if="configStore.config?.apiDocsEnabled !== false" @click="router.push('/api-docs')">{{ t('home.apiDocs') }}</a>
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

    <!-- 分享成功弹窗 -->
    <ShareResultDialog ref="shareResultDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Upload, Document,
  Download, Postcard
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'
import { useLocaleStore } from '@/stores/locale'
import type { ShareResult } from '@/types/share'
import FileUpload from '@/components/upload/FileUpload.vue'
import TextShare from '@/components/upload/TextShare.vue'
import TopNav from '@/components/layout/TopNav.vue'
import ShareResultDialog from '@/components/share/ShareResultDialog.vue'

// vite define 注入的构建版本（package.json,对齐发布列车）
const appVersion = __APP_VERSION__

const router = useRouter()
const userStore = useUserStore()
const configStore = useConfigStore()
const localeStore = useLocaleStore()
const { t, locale } = useI18n()

// ?tab=file|text 深链直达,非法值回退 file;watch route 保证 URL 变化(前进/后退/页内深链)时页面同步响应
const route = useRoute()
const activeTab = ref<'file' | 'text'>(route.query.tab === 'text' ? 'text' : 'file')
watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = tab === 'text' ? 'text' : 'file'
  },
)

const setTab = (tab: 'file' | 'text') => {
  activeTab.value = tab
  router.replace({ query: { tab: tab === 'text' ? 'text' : undefined } })
}

const shareResultDialog = ref<InstanceType<typeof ShareResultDialog> | null>(null)

const handleShareSuccess = (result: ShareResult) => {
  shareResultDialog.value?.open(result)
}

onMounted(async () => {
  locale.value = localeStore.locale
  document.documentElement.lang = localeStore.locale
  await configStore.fetchConfig()
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
/* 与首页同构的卡片体系（拆页复制,scoped 隔离;改动需两处同步） */
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

.content-area {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.function-card {
  margin: auto 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  padding: var(--spacing-xs) var(--spacing-xl) var(--spacing-sm);
}

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

.seg {
  display: flex;
  gap: 4px;
  margin: 0 var(--spacing-xl) var(--spacing-lg);
  padding: 4px;
  background: var(--color-muted);
  border-radius: var(--radius-lg);
}

.seg-item {
  flex: 1;
  height: 38px;
  border: none;
  border-radius: calc(var(--radius-lg) - 4px);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.seg-item:hover {
  color: var(--color-text-primary);
}

.seg-item.active {
  background: var(--color-card-bg);
  color: var(--color-text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

/* 双 tab 等高容器:grid 叠放,容器高度恒取两 pane 最大值(切换零跳变);
   主区域(拖拽区/文本框)由各组件 flex:1 拉伸吸收差额,不再硬编码对齐高度 */
.card-panes {
  display: grid;
  padding: 0 var(--spacing-sm);
}

.card-pane {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 非活动 tab:占位但不可见不可交互(visibility 同时脱离焦点树与读屏) */
.card-pane.inactive {
  visibility: hidden;
  pointer-events: none;
}

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

@media (max-width: 768px) {
  .nav-extra-desktop {
    display: none;
  }

  .main-wrapper {
    padding: var(--spacing-md) var(--spacing-md) var(--spacing-xl);
  }

  .function-card {
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-lg);
  }

  .footer-section {
    margin-top: var(--spacing-xl);
    gap: var(--spacing-sm);
  }
}
</style>
