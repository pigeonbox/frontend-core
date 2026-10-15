<template>
  <div class="maintenance-tools">
    <!-- 系统状态卡片 -->
    <el-row :gutter="20" class="status-row">
      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-success"><CircleCheckFilled /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.maintenancePage.statusTitle') }}</h4>
              <p class="text-success">{{ t('admin.maintenancePage.statusOk') }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-info"><Timer /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.maintenancePage.versionTitle') }}</h4>
              <p>{{ systemInfo.version }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-warning"><Files /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.totalFiles') }}</h4>
              <p>{{ systemInfo.totalFiles }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-danger"><Folder /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.maintenancePage.totalSizeTitle') }}</h4>
              <p>{{ formatFileSize(systemInfo.totalSize) }}</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 维护工具 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="tool-card">
          <template #header>
            <div class="card-header">
              <el-icon><Delete /></el-icon>
              <span>{{ t('admin.maintenancePage.toolsTitle') }}</span>
            </div>
          </template>

          <div class="tool-list">
            <div class="tool-item">
              <div class="tool-info">
                <h4>{{ t('admin.maintenancePage.cleanExpiredTitle') }}</h4>
                <p>{{ t('admin.maintenancePage.cleanExpiredDesc') }}</p>
              </div>
              <el-button
                type="danger"
                @click="cleanExpiredFiles"
                :loading="cleaningExpired"
              >
                {{ t('admin.maintenancePage.run') }}
              </el-button>
            </div>

            <el-divider />

            <div class="tool-item">
              <div class="tool-info">
                <h4>{{ t('admin.maintenancePage.optimizeTitle') }}</h4>
                <p>{{ t('admin.maintenancePage.optimizeDesc') }}</p>
              </div>
              <el-button
                type="primary"
                @click="optimizeDatabase"
                :loading="optimizing"
              >
                {{ t('admin.maintenancePage.run') }}
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="tool-card">
          <template #header>
            <div class="card-header">
              <el-icon><DocumentChecked /></el-icon>
              <span>{{ t('admin.maintenancePage.infoTitle') }}</span>
            </div>
          </template>

          <el-descriptions :column="1" border>
            <el-descriptions-item :label="t('admin.maintenancePage.goVersion')">
              {{ systemInfo.goVersion }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.buildTime')">
              {{ systemInfo.buildTime }}
            </el-descriptions-item>
            <el-descriptions-item label="Git Commit">
              {{ systemInfo.gitCommit }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.osInfo')">
              {{ systemInfo.osInfo }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.cpuCores')">
              {{ systemInfo.cpuCores }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize } from '@/utils/format'
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  CircleCheckFilled,
  Timer,
  Files,
  Folder,
  Delete,
  DocumentChecked
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()

const cleaningExpired = ref(false)
const optimizing = ref(false)

const systemInfo = reactive({
  version: '-',
  goVersion: '-',
  buildTime: '-',
  gitCommit: '-',
  osInfo: '-',
  cpuCores: 0,
  totalFiles: 0,
  totalSize: 0
})


const cleanExpiredFiles = async () => {
  try {
    await ElMessageBox.confirm(
      t('admin.maintenancePage.cleanConfirmBody'),
      t('admin.maintenancePage.cleanConfirmTitle'),
      { type: 'warning' }
    )

    cleaningExpired.value = true
    const res = await adminApi.cleanExpiredFiles()
    if (res.code === 200) {
      ElMessage.success(t('admin.maintenancePage.cleaned', { n: res.data.deleted_count || 0 }))
      await fetchSystemInfo()
    } else {
      handleError(new Error(res.message || t('admin.maintenancePage.cleanFailed')))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('admin.maintenancePage.cleanFailed'))
    }
  } finally {
    cleaningExpired.value = false
  }
}

const optimizeDatabase = async () => {
  try {
    await ElMessageBox.confirm(
      t('admin.maintenancePage.optimizeConfirmBody'),
      t('admin.maintenancePage.optimizeConfirmTitle')
    )

    optimizing.value = true
    const res = await adminApi.optimizeDatabase()
    if (res.code === 200) {
      ElMessage.success(t('admin.maintenancePage.optimizeDone'))
    } else {
      handleError(new Error(res.message || t('admin.maintenancePage.optimizeFailed')))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('admin.maintenancePage.optimizeFailed'))
    }
  } finally {
    optimizing.value = false
  }
}

const fetchSystemInfo = async () => {
  try {
    // 获取系统信息
    const infoRes = await adminApi.getSystemInfo()
    if (infoRes.code === 200 && infoRes.data) {
      systemInfo.version = infoRes.data.pigeonbox_version || '-'
      systemInfo.goVersion = infoRes.data.go_version || '-'
      systemInfo.buildTime = infoRes.data.build_time || '-'
      systemInfo.gitCommit = infoRes.data.git_commit || '-'
      systemInfo.osInfo = infoRes.data.os_info || '-'
      systemInfo.cpuCores = infoRes.data.cpu_cores || 0
    }

    // 获取统计数据
    const statsRes = await adminApi.getStats()
    if (statsRes.code === 200 && statsRes.data) {
      systemInfo.totalFiles = statsRes.data.total_files || 0
      systemInfo.totalSize = statsRes.data.total_size || 0
    }
  } catch (error) {
    console.error(t('admin.maintenancePage.fetchInfoFailed'), error)
  }
}

onMounted(() => {
  fetchSystemInfo()
})
</script>

<style scoped>
.maintenance-tools {
  padding: 0;
}

.status-row {
  margin-bottom: 20px;
}

.status-card {
  height: 100%;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 15px;
}

.status-info h4 {
  margin: 0 0 5px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.status-info p {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.text-success {
  color: var(--color-success) !important;
}

.icon-success {
  color: var(--color-success);
}

.icon-info {
  color: var(--primary-color);
}

.icon-warning {
  color: var(--color-warning);
}

.icon-danger {
  color: var(--color-danger);
}

.tool-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.tool-list {
  padding: 10px 0;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 0;
}

.tool-info h4 {
  margin: 0 0 5px;
  font-size: 16px;
  font-weight: 600;
}

.tool-info p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
</style>
