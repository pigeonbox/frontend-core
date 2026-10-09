<template>
  <el-dropdown trigger="click" @command="(key: string) => emit('command', key)">
    <div class="user-menu-trigger">
      <el-avatar :size="32" class="user-avatar">
        {{ userStore.userInfo?.username?.charAt(0).toUpperCase() }}
      </el-avatar>
      <span class="user-name">{{ userStore.userInfo?.username }}</span>
      <el-icon><ArrowDown /></el-icon>
    </div>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="dashboard">
          <el-icon><User /></el-icon>
          {{ t('home.userCenter') }}
        </el-dropdown-item>
        <el-dropdown-item v-if="props.showHome" command="home">
          <el-icon><House /></el-icon>
          {{ t('home.title') }}
        </el-dropdown-item>
        <el-dropdown-item command="logout" divided>
          <el-icon><SwitchButton /></el-icon>
          {{ t('home.logout') }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowDown, User, SwitchButton, House } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

/** 顶栏用户菜单：导航行为由父级按 command 自行处理（home 登出不跳转、AppLayout 登出回首页，语义不同） */
const props = withDefaults(defineProps<{ showHome?: boolean }>(), { showHome: false })
const emit = defineEmits<{ command: [key: string] }>()

const userStore = useUserStore()
const { t } = useI18n()
</script>

<style scoped>
.user-menu-trigger {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm) var(--spacing-xs) var(--spacing-xs);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.user-menu-trigger:hover {
  background: var(--color-muted);
}

.user-avatar {
  background: var(--primary-color);
  color: #fff;
  font-weight: 600;
  font-size: var(--text-xs);
}

.user-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

@media (max-width: 768px) {
  .user-name {
    display: none;
  }
}
</style>
