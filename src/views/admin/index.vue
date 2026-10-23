<template>
  <div class="admin-layout">
    <el-container>
      <!-- 侧边栏 -->
      <el-aside width="240px" class="admin-aside" :class="{ open: navOpen }">
        <div class="admin-logo">
          <div class="logo-icon">
            <BrandLogo class="logo-img" />
          </div>
          <div class="logo-text">
            <h2>PigeonBox</h2>
            <p>{{ t('admin.title') }}</p>
          </div>
        </div>

        <el-menu
          :default-active="$route.path"
          class="admin-menu"
          router
        >
          <!-- 管理台 IA 三组化（2026-10-22）：此前 12 个平铺项，自托管用户
               每天只碰其中 2-3 个（文件管理/系统配置/用户），其余靠滚动找。
               分组后「投递与文件」是日常面，「系统」是低频面。
               仪表盘留顶层 —— 它是管理台落地页，藏进分组会让首屏是三个折叠组。 -->
          <el-menu-item :index="adminBase + '/dashboard'">
            <el-icon><Monitor /></el-icon>
            <span>{{ t('admin.dashboard') }}</span>
          </el-menu-item>

          <el-sub-menu :index="adminBase + '/g-delivery'">
            <template #title>
              <el-icon><Box /></el-icon>
              <span>{{ t('admin.group.delivery') }}</span>
            </template>
            <el-menu-item :index="adminBase + '/files'">
              <el-icon><Folder /></el-icon>
              <span>{{ t('admin.files') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/local-files'">
              <el-icon><FolderOpened /></el-icon>
              <span>{{ t('admin.localFiles') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/moderation'">
              <el-icon><View /></el-icon>
              <span>{{ t('admin.moderationTitle') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/logs'">
              <el-icon><Document /></el-icon>
              <span>{{ t('admin.logs') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/p2p'">
              <el-icon><Connection /></el-icon>
              <span>{{ t('admin.federationTitle') }}</span>
            </el-menu-item>
          </el-sub-menu>

          <el-sub-menu :index="adminBase + '/g-operations'">
            <template #title>
              <el-icon><User /></el-icon>
              <span>{{ t('admin.group.operations') }}</span>
            </template>
            <el-menu-item :index="adminBase + '/users'">
              <el-icon><User /></el-icon>
              <span>{{ t('admin.users') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/announcements'">
              <el-icon><Bell /></el-icon>
              <span>{{ t('admin.announcements') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/activities'">
              <el-icon><List /></el-icon>
              <span>{{ t('admin.activities') }}</span>
            </el-menu-item>
          </el-sub-menu>

          <el-sub-menu :index="adminBase + '/g-system'">
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>{{ t('admin.group.system') }}</span>
            </template>
            <el-menu-item :index="adminBase + '/storage'">
              <el-icon><Box /></el-icon>
              <span>{{ t('admin.storage') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/config'">
              <el-icon><Setting /></el-icon>
              <span>{{ t('admin.config') }}</span>
            </el-menu-item>

            <el-menu-item :index="adminBase + '/maintenance'">
              <el-icon><Tools /></el-icon>
              <span>{{ t('admin.maintenance') }}</span>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>

        <div class="sidebar-footer">
          <div class="sidebar-footer-row">
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
          <el-button @click="goToUser" class="user-page-btn">
            <el-icon><Promotion /></el-icon>
            {{ t('admin.accessSite') }}
          </el-button>
        </div>
      </el-aside>

      <!-- 主内容区 -->
      <el-container>
        <!-- 顶部导航 -->
        <el-header class="admin-header">
          <div class="header-left">
            <!-- 汉堡：仅窄屏出现（宽屏侧栏常驻，见窄屏媒体查询）。
                 用内联三线 SVG 而非 EP 的 Menu 图标——后者是 2×2 方格，读起来像
                 「应用宫格」，不如下划线汉堡像「导航」。 -->
            <button class="nav-toggle" type="button" :aria-label="t('admin.title')" @click="navOpen = !navOpen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h3>{{ pageTitle }}</h3>
          </div>

          <div class="header-right">
            <el-dropdown @command="handleCommand" trigger="click">
              <div class="user-info">
                <el-avatar :size="36" class="user-avatar">
                  {{ userStore.userInfo?.nickname?.charAt(0) || 'A' }}
                </el-avatar>
                <div class="user-details">
                  <span class="user-name">{{ userStore.userInfo?.nickname }}</span>
                  <span class="user-role">{{ t('admin.title') }}</span>
                </div>
                <el-icon><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="user-center">
                    <el-icon><User /></el-icon>
                    {{ t('admin.userCenter') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="logout" divided>
                    <el-icon><SwitchButton /></el-icon>
                    {{ t('admin.logout') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>

        <!-- 内容区 -->
        <el-main class="admin-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>

    <!-- 窄屏遮罩：点它收起抽屉式侧栏 -->
    <div v-if="navOpen" class="nav-backdrop" @click="navOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { getAdminBase } from '@/router'
const adminBase = getAdminBase()
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  Monitor, Folder, FolderOpened, User, Setting, ArrowDown, Bell,
  Box, Document, Tools, Promotion, SwitchButton, List, View, Connection } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { withBase } from '@/utils/base'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const { t } = useI18n()

const pageTitle = computed(() => {
  // 单一真相源=路由 meta.title（i18n key,router/index.ts 已全量覆盖 12 个子路由,
  // 与 document.title 同源）。此前此处维护第二份硬编码路径表,漏配 p2p/activities/
  // moderation/local-files/announcements 五页,顶栏面包屑恒回退「管理后台」
  const key = route.meta.title as string | undefined
  return key ? t(key) : t('admin.title')
})

// 窄屏抽屉式侧栏（2026-10-24）：宽屏侧栏常驻；窄屏（≤768px）侧栏改为
// 汉堡唤出的浮层——此前侧栏 240px 固定占位，窄屏下内容区被压到 ~150px，
// 配置表单的输入框**宽度为 0**（真机 390px 实测）⇒ 手机上进管理台基本没法用。
const navOpen = ref(false)

// 路由切换即收起抽屉（否则点了菜单项抽屉仍盖着内容）
watch(() => route.fullPath, () => { navOpen.value = false })

const goToUser = () => {
  window.open(withBase('/'), '_blank')
}

const handleCommand = async (command: string) => {
  switch (command) {
    case 'user-center':
      router.push('/user/dashboard')
      break
    case 'logout':
      try {
        await ElMessageBox.confirm(t('admin.confirmLogout'), t('common.confirm'), {
          type: 'warning',
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel')
        })
        userStore.logout()
        ElMessage.success(t('admin.loggedOut'))
        router.push(adminBase + '/login')
      } catch (error: unknown) {
        if (error !== 'cancel') {
          console.error(t('admin.logoutFailed'), error)
        }
      }
      break
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  background: var(--color-bg);
}

/* 侧边栏 —— 扁平,主题同色,靠右边框分隔 */
.admin-aside {
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

/* 汉堡：宽屏隐藏（侧栏常驻），窄屏由媒体查询点亮 */
.nav-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-right: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
}

/* 窄屏抽屉遮罩 */
.nav-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1999;
  background: rgba(0, 0, 0, 0.45);
}

.admin-logo {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
  gap: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
}

.logo-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.logo-img {
  width: 100%;
  height: 100%;
  display: block;
}

.logo-text h2 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.logo-text p {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.admin-menu {
  border: none;
  background: transparent;
  flex: 1;
  padding: var(--spacing-md) var(--spacing-sm);
}

.admin-menu :deep(.el-menu-item) {
  color: var(--color-text-secondary);
  height: 40px;
  line-height: 40px;
  margin: 2px 0;
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.admin-menu :deep(.el-menu-item:hover) {
  background: var(--color-muted);
  color: var(--color-text-primary);
}

/* 激活态:强调色文字 + 浅底(Linear 风) */
.admin-menu :deep(.el-menu-item.is-active) {
  background: var(--primary-bg);
  color: var(--primary-color);
}

.admin-menu :deep(.el-icon) {
  font-size: var(--text-lg);
  margin-right: var(--spacing-sm);
}

.sidebar-footer {
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  align-items: stretch;
}

.sidebar-footer-row {
  display: flex;
  justify-content: center;
  gap: var(--spacing-sm);
}

.user-page-btn {
  width: 100%;
}

/* 顶栏 —— 扁平 */
.admin-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--spacing-xl);
  height: 56px;
}

.header-left h3 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm) var(--spacing-xs) var(--spacing-xs);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.user-info:hover {
  background: var(--color-muted);
}

.user-avatar {
  background: var(--primary-color);
  color: #fff;
  font-weight: 600;
  font-size: var(--text-xs);
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.user-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

.user-role {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.admin-main {
  background: var(--color-bg);
  padding: var(--spacing-2xl);
  min-height: calc(100vh - 56px);
}

@media (max-width: 768px) {
  .user-details {
    display: none;
  }

  .admin-main {
    padding: var(--spacing-lg);
  }

  /* 窄屏：侧栏改为汉堡唤出的浮层抽屉，不再占位。
     此前侧栏 240px 固定占位 ⇒ 内容区被压到 ~150px（390px 视口实测），
     配置表单输入框宽度为 0 ⇒ 手机上进管理台基本没法用。 */
  .nav-toggle {
    display: inline-flex;
  }

  .admin-aside {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 2000;
    width: 240px;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.28));
  }

  .admin-aside.open {
    transform: translateX(0);
  }
}
</style>
