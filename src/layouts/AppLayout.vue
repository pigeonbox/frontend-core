<template>
  <div class="app-layout">
    <!-- 顶部导航 -->
    <TopNav variant="app" @command="handleCommand">
      <template #leading>
        <el-icon class="menu-toggle" @click="drawerVisible = true"><Fold /></el-icon>
      </template>
    </TopNav>

    <div class="app-body">
      <!-- 侧边栏 -->
      <aside class="app-sidebar">
        <el-menu
          :default-active="$route.path"
          class="sidebar-menu"
          router
        >
          <el-menu-item
            v-for="item in userNavItems"
            :key="item.path"
            :index="item.path"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ t(item.labelKey) }}</span>
          </el-menu-item>
        </el-menu>
      </aside>

      <!-- 主内容 -->
      <main class="app-main">
        <router-view />
      </main>
    </div>

    <!-- 移动端抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      direction="ltr"
      size="220px"
      :show-close="false"
      class="mobile-drawer"
    >
        <el-menu
          :default-active="$route.path"
          router
          @select="drawerVisible = false"
        >
          <el-menu-item
            v-for="item in userNavItems"
            :key="item.path"
            :index="item.path"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ t(item.labelKey) }}</span>
          </el-menu-item>
        </el-menu>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  Fold
} from '@element-plus/icons-vue'
import { userNavItems } from '@/config/menu'
import TopNav from '@/components/layout/TopNav.vue'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'

const router = useRouter()
const userStore = useUserStore()
const configStore = useConfigStore()
// 站点名称来自 /api/config（管理后台可改），进布局即拉取（store 内已去重）
configStore.fetchConfig()
const { t } = useI18n()

const drawerVisible = ref(false)

const handleCommand = (command: string) => {
  switch (command) {
    case 'dashboard':
      router.push('/user/dashboard')
      break
    case 'home':
      router.push('/')
      break
    case 'logout':
      userStore.logout()
      ElMessage.success(t('home.loggedOut'))
      router.push('/')
      break
  }
}
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: var(--color-bg);
}

/* 主体:侧边栏 + 内容 */
.app-body {
  display: flex;
  max-width: 1200px;
  margin: 0 auto;
  min-height: calc(100vh - 56px);
}

.app-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  padding: var(--spacing-lg) var(--spacing-md);
}

.sidebar-menu {
  border-right: none !important;

  :deep(.el-menu-item) {
    height: 40px;
    line-height: 40px;
    border-radius: var(--radius-md);
    margin-bottom: 2px;
    color: var(--color-text-secondary);
    font-weight: 500;

    &:hover {
      background: var(--color-muted);
      color: var(--color-text-primary);
    }

    &.is-active {
      background: var(--primary-bg);
      color: var(--primary-color);
    }
  }
}

.app-main {
  flex: 1;
  padding: var(--spacing-2xl) var(--spacing-2xl);
  min-width: 0;
}

/* 汉堡菜单:仅移动端显示 */
.menu-toggle {
  display: none;
  font-size: 20px;
  color: var(--color-text-primary);
  cursor: pointer;
  margin-right: var(--spacing-sm);
}

/* 响应式:移动端隐藏侧边栏,显示汉堡菜单 */
@media (max-width: 768px) {
  .menu-toggle {
    display: inline-flex;
  }

  .app-sidebar {
    display: none;
  }

  .app-main {
    padding: var(--spacing-lg) var(--spacing-md);
  }
}
</style>
