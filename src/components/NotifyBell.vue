<template>
  <div class="notify-bell" role="button" aria-label="notifications" @click="goNotifications">
    <el-badge :value="unread" :hidden="unread === 0" :max="99" class="bell-badge">
      <el-icon :size="20" class="bell-icon"><Bell /></el-icon>
    </el-badge>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { userNotifyApi } from '@/api/userNotify'
import { usePolling } from '@/composables/usePolling'

const router = useRouter()
const userStore = useUserStore()
const unread = ref(0)

const refresh = async () => {
  if (!userStore.isLoggedIn) {
    unread.value = 0
    return
  }
  try {
    const res = await userNotifyApi.unreadCount()
    unread.value = res.data.unread
  } catch {
    /* silent */
  }
}

const goNotifications = () => {
  if (!userStore.isLoggedIn) {
    router.push('/user/login')
    return
  }
  router.push('/user/notifications')
}

// 首帧立即取一次 + 60s 轮询（页面隐藏自动暂停）
refresh()
usePolling(refresh, 60000)
</script>

<style scoped>
/* 与 LocaleSwitcher/ThemeSwitcher 同款圆形按钮:token 化配色,明暗两态自适应。
   旧版图标写死 color:white——顶栏改浅色底后铃铛隐身,只剩红色角标悬空(2026-10-07) */
/* 圆形按钮样式挂在 el-badge 内层:sup 角标以 32px 圆为锚,落在按钮右上角
   (挂在 .notify-bell 上时角标只能锚到 18px 图标,会压住铃铛柄) */
.notify-bell {
  display: inline-flex;
  cursor: pointer;
  border-radius: 50%;
}
:deep(.bell-badge) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-muted);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.notify-bell:hover :deep(.bell-badge) {
  background: var(--primary-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}
.bell-icon {
  color: inherit;
}
:deep(.bell-badge sup) {
  /* el-badge sup 默认锚定针对小尺寸内容,32px 圆上会落在中部压住铃铛;
     显式钉到按钮右上角 */
  top: -3px;
  right: -3px;
  transform: none;
}
</style>
