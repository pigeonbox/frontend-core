<template>
  <div class="moderation-container">
    <el-card shadow="never" class="moderation-card">
      <div class="card-header">
        <div class="header-title">
          <h2>内容审核</h2>
          <p>处理待审核的分享（moderation 命中且策略为 pending 时进入此队列）</p>
        </div>
        <el-button @click="reload()" :loading="loading" class="refresh-btn">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>

      <el-divider />

      <el-alert
        v-if="!queue.length && !loading"
        title="队列为空"
        description="没有待审核的分享。启用敏感词审核需在服务端配置 moderation.enabled 与 blocked_words。"
        type="info"
        :closable="false"
        show-icon
      />

      <el-table v-else :data="queue" v-loading="loading" class="moderation-table">
        <el-table-column label="内容" min-width="280">
          <template #default="{ row }">
            <div class="content-cell">
              <div class="content-title">
                {{ row.file_name || row.code }}
                <el-tag v-if="row.is_text" size="small" type="success">文本</el-tag>
              </div>
              <div v-if="row.text_preview" class="content-preview">{{ row.text_preview }}</div>
              <div class="content-meta">
                <el-tag size="small" type="info">{{ row.code }}</el-tag>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="上传者" width="160" align="center">
          <template #default="{ row }">
            <div>{{ row.user_id ? `ID: ${row.user_id}` : '匿名' }}</div>
            <div class="ip-line">{{ row.owner_ip || '-' }}</div>
          </template>
        </el-table-column>

        <el-table-column prop="size" label="大小" width="100" align="center">
          <template #default="{ row }">
            {{ row.is_text ? '-' : formatFileSize(row.size) }}
          </template>
        </el-table-column>

        <el-table-column prop="created_at" label="提交时间" width="170">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="success" size="small" round :loading="acting === row.id" @click="act(row, 'normal')">
              通过
            </el-button>
            <el-button type="danger" size="small" round :loading="acting === row.id" @click="act(row, 'blocked')">
              拒绝
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize, toLocaleDateTime as formatDate } from '@/utils/format'
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { handleError } = useErrorHandler()

const acting = ref<number | null>(null)

const { list: queue, total, page, pageSize, loading, reload, handleSizeChange, handlePageChange } =
  useTableQuery<any>(async ({ page, page_size }) => {
    try {
      const res = await adminApi.getFilesFiltered({
        status: 'pending_review',
        page,
        page_size,
      })
      if (res.code === 200 && res.data) {
        return { items: res.data.items || [], total: res.data.total || 0 }
      }
      return { items: [], total: 0 }
    } catch (error) {
      handleError(error)
      return { items: [], total: 0 }
    }
  })

// act 处置：通过（normal，恢复可见）或拒绝（blocked，禁用留证）
const act = async (row: any, status: 'normal' | 'blocked') => {
  acting.value = row.id
  try {
    const res = await adminApi.setFileStatus(row.id, status)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(status === 'normal' ? '已通过' : '已拒绝并禁用')
      await reload()
    } else {
      handleError(new Error(res.message || '操作失败'))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    acting.value = null
  }
}

onMounted(() => {
  reload()
})
</script>

<style scoped>
.moderation-container {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.moderation-card {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title h2 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-title p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.refresh-btn {
  border-radius: var(--radius-md);
  background: var(--primary-color);
  border: none;
  color: white;
}

.moderation-table {
  margin-top: 8px;
}

.content-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.content-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-meta {
  display: flex;
  gap: 8px;
}

.ip-line {
  font-family: monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.pagination-wrapper {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

:deep(.el-table th) {
  background: var(--color-muted) !important;
  font-weight: 600;
}
</style>
