<template>
  <div class="notfound-container">
    <div class="notfound-card">
      <div class="notfound-code">404</div>
      <h2>{{ t('notfound.title') }}</h2>
      <p class="notfound-desc">{{ t('notfound.desc') }}</p>
      <el-button type="primary" @click="goHome">{{ t('notfound.backHome') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
// 未知路由兜底页：此前无 catch-all，/history 等未知路径渲染整页空白（无任何
// 反馈/出口）；admin 路径混淆下打错管理基址同样落这里，不再裸白屏
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()

const goHome = () => router.push('/')
</script>

<style scoped>
.notfound-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.notfound-card {
  text-align: center;
  padding: 48px 56px;
  border-radius: var(--radius-lg, 16px);
  background: var(--color-bg, #fff);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

.notfound-code {
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  color: var(--primary-color, #5b5fc7);
  margin-bottom: 12px;
}

.notfound-card h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.notfound-desc {
  margin: 0 0 24px;
  opacity: 0.65;
}
</style>
