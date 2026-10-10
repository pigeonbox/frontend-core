<template>
  <div class="transfer-logs">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <h3>传输日志</h3>
          <el-button @click="reload()" :icon="Refresh" size="small">
            刷新
          </el-button>
        </div>
      </template>

      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ stats.totalOperations }}</div>
            <div class="stat-label">总操作次数</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item upload">
            <div class="stat-value">{{ stats.uploads }}</div>
            <div class="stat-label">上传次数</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item download">
            <div class="stat-value">{{ stats.downloads }}</div>
            <div class="stat-label">下载次数</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ stats.activeUsers }}</div>
            <div class="stat-label">活跃用户</div>
          </div>
        </el-col>
      </el-row>

      <!-- 日志列表 -->
      <el-table :data="logsList" stripe>
        <el-table-column prop="id" label="ID" width="80" />

        <el-table-column prop="operation" label="操作" width="100">
          <template #default="{ row }">
            <el-tag :type="getOperationType(row.operation)" size="small">
              {{ getOperationLabel(row.operation) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="file_code" label="文件码" width="120" />

        <el-table-column prop="file_name" label="文件名" show-overflow-tooltip />

        <el-table-column prop="file_size" label="文件大小" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>

        <el-table-column prop="username" label="用户" width="120">
          <template #default="{ row }">
            {{ row.username || '匿名' }}
          </template>
        </el-table-column>

        <el-table-column prop="api_key_id" label="Key ID" width="90">
          <template #default="{ row }">
            <el-tooltip v-if="row.api_key_id" content="该操作经用户 API Key 认证（泄露排查归因）">
              <el-tag size="small" type="warning">#{{ row.api_key_id }}</el-tag>
            </el-tooltip>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column prop="ip" label="IP 地址" width="140" />

        <el-table-column prop="created_at" label="操作时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

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
import { reactive, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { handleError } = useErrorHandler()

const stats = reactive({
  totalOperations: 0,
  uploads: 0,
  downloads: 0,
  activeUsers: 0
})

const getOperationLabel = (operation: string): string => {
  const labels: Record<string, string> = {
    upload: '上传',
    download: '下载',
    delete: '删除',
    view: '查看'
  }
  return labels[operation] || operation
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
      stats.totalOperations = res.data.today_uploads || 0
      stats.uploads = res.data.today_uploads || 0
      stats.downloads = res.data.today_downloads || 0
      stats.activeUsers = ((res.data as unknown as Record<string, unknown>).active_users as number) || 0
      // ^ 幻影字段记录(P1 类型切换发现):wire/契约 AdminStatsData 均无 active_users,
      // 此读恒 undefined→0 兜底(行为零变化保守保留);"活跃用户"语义待产品定义
      // (后端只有 total_users),如需真实数直接换 res.data.total_users
    }
  } catch (error) {
    console.error('获取统计失败:', error)
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
