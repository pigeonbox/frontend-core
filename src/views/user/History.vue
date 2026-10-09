<template>
  <div class="history-page">
    <PageHeader :title="t('user.history.title')" :desc="t('user.history.subtitle')" />

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="search"
        :placeholder="t('user.shares.searchPlaceholder')"
        clearable
        class="search-input"
        @keyup.enter="reload()"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button @click="reload()">
        <el-icon><Refresh /></el-icon>
        {{ t('common.refresh') }}
      </el-button>
    </div>

    <!-- 列表（复用 shares api 拉取含 viewer 的项） -->
    <el-table
      v-loading="loading"
      :data="viewedShares"
      style="width: 100%"
      empty-text=" "
      class="history-table"
    >
      <el-table-column :label="t('user.history.viewedAt')" width="170">
        <template #default="{ row }">
          <span v-if="row.viewer_at">{{ formatDate(row.viewer_at) }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.history.viewerIp')" width="160">
        <template #default="{ row }">
          <code class="mono">{{ row.viewer_ip || '—' }}</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.history.shareCode')" width="140">
        <template #default="{ row }">
          <code class="mono code-cell">{{ row.code }}</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.history.fileName')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.is_text_share" class="text-preview">{{ row.text || '—' }}</span>
          <span v-else>{{ row.file_name || row.prefix + row.suffix || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.history.viewerCount')" width="120">
        <template #default="{ row }">
          <el-tag size="small" type="success">{{ row.viewer_count }} {{ t('user.history.times') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.history.createdAt')" width="170">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && viewedShares.length === 0"
      :description="t('user.history.empty')"
    >
      <p class="empty-hint">{{ t('user.history.emptyHint') }}</p>
    </el-empty>

    <!-- 分页 -->
    <div v-if="total > 0" class="pagination-wrapper">
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
  </div>
</template>

<script setup lang="ts">
import { formatDateTime as formatDate } from '@/utils/format'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, Refresh } from '@element-plus/icons-vue'
import { userSharesApi, type UserShareItem } from '@/api/userShares'
import { useTableQuery } from '@/composables/useTableQuery'
import PageHeader from '@/components/data/PageHeader.vue'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { handleError } = useErrorHandler()

const { t } = useI18n()

const search = ref('')

// 服务端 status=viewed 只返回被取件过的分享（total 与列表同源）；
// 此处仅按最近取件时间倒序展示
const viewedShares = computed(() => {
  return [...list.value].sort((a, b) => (b.viewer_at || '').localeCompare(a.viewer_at || ''))
})

const { list, total, page, pageSize, loading, reload, handlePageChange, handleSizeChange } =
  useTableQuery<UserShareItem>(async ({ page, page_size }) => {
    try {
      const res = await userSharesApi.list({
        // viewed：core 侧 viewer_at 非空过滤；此前拉 all 再客户端过滤，
        // 分页 total 是全量分享数，出现「空表却显示共 N 条」
        status: 'viewed',
        search: search.value || undefined,
        page,
        page_size,
      })
      return { items: res.data.items, total: res.data.total }
    } catch (e) {
      handleError(e)
      return { items: [], total: 0 }
    }
  })

onMounted(() => reload())
</script>

<style scoped>
.history-page {
  max-width: 100%;
}

.page-header {
  margin-bottom: var(--spacing-xl);
}

.page-header h2 {
  margin: 0 0 4px;
  color: var(--color-text-primary);
  font-size: var(--text-xl);
  font-weight: 600;
}

.page-desc {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.search-input {
  width: 280px;
}

.history-table {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.mono {
  font-family: 'SF Mono', 'Courier New', monospace;
  font-size: var(--text-sm);
  color: var(--color-text-regular);
}

.code-cell {
  background: var(--color-muted);
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-sm);
}

.text-preview {
  color: var(--color-text-regular);
  font-size: var(--text-sm);
  max-width: 220px;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

.muted {
  color: var(--color-text-tertiary);
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-lg);
}

.empty-hint {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  margin: var(--spacing-sm) 0 0;
}
</style>
