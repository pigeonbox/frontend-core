<template>
  <div class="transfer-logs">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <h3>{{ t('admin.logs') }}</h3>
          <el-button @click="reload()" :icon="Refresh" size="small">
            {{ t('admin.transferLogs.refresh') }}
          </el-button>
        </div>
      </template>

      <!-- 统计卡片（口径=今日,来自 /admin/stats;累计维度见第 4 卡=传输日志总条数） -->
      <el-row :gutter="20" class="stats-row">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ todayOps }}</div>
            <div class="stat-label">{{ t('admin.transferLogs.statTotalOps') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item upload">
            <div class="stat-value">{{ stats.uploads }}</div>
            <div class="stat-label">{{ t('admin.transferLogs.statUploads') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item download">
            <div class="stat-value">{{ stats.downloads }}</div>
            <div class="stat-label">{{ t('admin.transferLogs.statDownloads') }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ total }}</div>
            <div class="stat-label">{{ t('admin.transferLogs.statTotalLogs') }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- 日志列表 -->
      <el-table :data="logsList" stripe class="admin-table-wide">
        <el-table-column prop="id" label="ID" width="80" />

        <el-table-column prop="operation" :label="t('admin.transferLogs.colOperation')" width="100">
          <template #default="{ row }">
            <el-tag :type="getOperationType(row.operation)" size="small">
              {{ getOperationLabel(row.operation) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="file_code" :label="t('admin.transferLogs.colFileCode')" width="120" />

        <el-table-column prop="file_name" :label="t('admin.fileName')" show-overflow-tooltip />

        <el-table-column prop="file_size" :label="t('admin.transferLogs.colFileSize')" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>

        <el-table-column prop="username" :label="t('admin.transferLogs.colUser')" width="120">
          <template #default="{ row }">
            {{ row.username || t('admin.transferLogs.anonymous') }}
          </template>
        </el-table-column>

        <el-table-column prop="api_key_id" label="Key ID" width="90">
          <template #default="{ row }">
            <el-tooltip v-if="row.api_key_id" :content="t('admin.transferLogs.apiKeyTooltip')">
              <el-tag size="small" type="warning">#{{ row.api_key_id }}</el-tag>
            </el-tooltip>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column prop="ip" :label="t('admin.transferLogs.colIp')" width="140" />

        <el-table-column prop="created_at" :label="t('admin.transferLogs.colOperatedAt')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 窄屏（≤768px）卡片形态：本表 8 列合计 ~1100px ⇒ 390px 视口下内容列全被裁。
           策展=操作(头部) + 分享码/文件名/大小/用户/Key/IP/时间。 -->
      <NarrowCardList :rows="logsList" :fields="cardFields" :head="cardHead">
        <template #operation="{ row }">
          <el-tag :type="getOperationType(row.operation)" size="small">{{ getOperationLabel(row.operation) }}</el-tag>
        </template>
        <template #file_code="{ row }">{{ row.file_code }}</template>
        <template #file_name="{ row }">{{ row.file_name }}</template>
        <template #file_size="{ row }">{{ formatFileSize(row.file_size) }}</template>
        <template #username="{ row }">{{ row.username || t('admin.transferLogs.anonymous') }}</template>
        <template #api_key_id="{ row }">
          <el-tooltip v-if="row.api_key_id" :content="t('admin.transferLogs.apiKeyTooltip')">
            <el-tag size="small" type="warning">#{{ row.api_key_id }}</el-tag>
          </el-tooltip>
          <span v-else>-</span>
        </template>
        <template #ip="{ row }">{{ row.ip }}</template>
        <template #created_at="{ row }">{{ formatDate(row.created_at) }}</template>
      </NarrowCardList>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize, toLocaleDateTime as formatDate } from '@/utils/format'
import { reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'
import NarrowCardList from '@/components/admin/NarrowCardList.vue'

// ── 窄屏（≤768px）卡片字段 ──────────────────────────────────────────────────
// 标签**复用表格列的同一批 i18n key** ⇒ 宽窄两屏口径一致、不新增翻译。
const cardFields = computed(() => [
  { key: 'file_code', label: t('admin.transferLogs.colFileCode') },
  { key: 'file_name', label: t('admin.fileName') },
  { key: 'file_size', label: t('admin.transferLogs.colFileSize') },
  { key: 'username', label: t('admin.transferLogs.colUser') },
  { key: 'api_key_id', label: 'Key ID' },
  { key: 'ip', label: t('admin.transferLogs.colIp') },
  { key: 'created_at', label: t('admin.transferLogs.colOperatedAt') },
])
const cardHead = (row: any) => getOperationLabel(row.operation)

const { t } = useI18n()
const { handleError } = useErrorHandler()

// /admin/stats 只下发今日口径（today_uploads/today_downloads）；「总操作」=两者之和。
// 此前 totalOperations 直接别名 today_uploads,与上传卡同值且顶表格全量口径,已修。
const stats = reactive({
  uploads: 0,
  downloads: 0
})

const todayOps = computed(() => stats.uploads + stats.downloads)

const OPERATION_KEYS: Record<string, string> = {
  upload: 'admin.transferLogs.op.upload',
  download: 'admin.transferLogs.op.download',
  delete: 'admin.transferLogs.op.delete',
  view: 'admin.transferLogs.op.view'
}

const getOperationLabel = (operation: string): string => {
  const key = OPERATION_KEYS[operation]
  return key ? t(key) : operation
}

const getOperationType = (operation: string): 'success' | 'primary' | 'danger' | 'info' => {
  const types: Record<string, 'success' | 'primary' | 'danger' | 'info'> = {
    upload: 'success',
    download: 'primary',
    delete: 'danger',
    view: 'info'
  }
  return types[operation] || 'info'
}

const { list: logsList, total, page, pageSize, loading, reload, handleSizeChange, handlePageChange } =
  useTableQuery<any>(async ({ page, page_size }) => {
    try {
      const res = await adminApi.getTransferLogs({ page, page_size })
      if (res.code === 200) {
        if (res.data && Array.isArray(res.data.items)) {
          return { items: res.data.items, total: res.data.total || res.data.items.length }
        }
        if (res.data && Array.isArray((res.data as Record<string, unknown>).logs)) {
          // 兼容历史响应结构
          const legacy = res.data as Record<string, unknown>
          const logs = legacy.logs as any[]
          const pg = legacy.pagination as { total?: number } | undefined
          return { items: logs, total: pg?.total || logs.length }
        }
        if (Array.isArray(res.data)) {
          return { items: res.data, total: res.data.length }
        }
      }
      return { items: [], total: 0 }
    } catch (error) {
      handleError(error)
      return { items: [], total: 0 }
    }
  })

const fetchStats = async () => {
  try {
    const res = await adminApi.getStats()
    if (res.code === 200 && res.data) {
      stats.uploads = res.data.today_uploads || 0
      stats.downloads = res.data.today_downloads || 0
      // 「活跃用户」卡已移除:契约无 active_users(幻影字段,恒 0),真实累计维度
      // 由第 4 卡「累计日志」= 传输日志分页 total 承担,与下方表格同源同口径
    }
  } catch (error) {
    console.error(t('admin.transferLogs.fetchStatsFailed'), error)
  }
}

onMounted(() => {
  reload()
  fetchStats()
})
</script>

<style scoped>
.transfer-logs {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-item {
  text-align: center;
  padding: 20px;
  background: var(--color-muted);
  border-radius: 8px;
}

.stat-item.upload {
  background: var(--primary-bg);
  color: var(--primary-color);
}

.stat-item.download {
  background: var(--primary-bg);
  color: var(--primary-color);
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 14px;
  opacity: 0.8;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}
</style>
