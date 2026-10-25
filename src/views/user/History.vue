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
      <el-table-column :label="t('user.history.codeLabel')" width="180">
        <template #default="{ row }">
          <div class="code-stack">
            <code v-if="row.pickup_code" class="mono code-cell code-primary">{{ row.pickup_code }}</code>
            <code class="mono" :class="row.pickup_code ? 'code-sub' : 'code-cell'">{{ row.code }}</code>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.history.fileName')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.is_text_share" class="text-preview">{{ row.text || '—' }}</span>
          <span v-else>{{ row.file_name || '—' }}</span>
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
      <!-- 逐条取件明细（2026-10-24）：一次取件 = 一行。
           多文件逐个下载/断点续传属同一次取件 ⇒ 不会被显示成「取件 N 次」。 -->
      <el-table-column :label="t('user.history.detailTitle')" width="160">
        <template #default="{ row }">
          <el-popover v-if="row.pickups && row.pickups.length" placement="left" :width="340" trigger="hover">
            <template #reference>
              <el-tag size="small" type="info" class="pickup-detail-tag">
                {{ t('user.history.detailCount', { n: row.pickups.length }) }}
              </el-tag>
            </template>
            <div class="pickup-detail">
              <div v-for="(p, i) in row.pickups" :key="i" class="pickup-detail-row">
                <code class="mono pickup-detail-ip">{{ p.ip || '—' }}</code>
                <span class="pickup-detail-time">{{ formatDate(p.picked_at) }}</span>
                <span class="pickup-detail-channel">{{ channelLabel(p.channel) }}</span>
              </div>
            </div>
          </el-popover>
          <span v-else class="muted">{{ t('user.history.detailEmpty') }}</span>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && viewedShares.length === 0"
      :description="t('user.history.empty')"
    >
      <p class="empty-hint">{{ t('user.history.emptyHint') }}</p>
    </el-empty>

    <!-- 窄屏卡片形态（2026-10-24 真机 390px 实测）：表格 7 列共 1160px，
         而手机视口只有 ~374px ⇒ 右侧列（文件名/累计次数/**取件明细**）被裁掉，
         且横向滚动条在手机上几乎看不见 ⇒ 页面基本不可用。
         ⇒ ≤768px 用卡片（每条分享一张，信息完整、无横滑）。 -->
    <div class="pickup-cards">
      <div v-for="row in viewedShares" :key="row.code" class="pickup-card">
        <div class="pickup-card-head">
          <span class="pickup-card-name">
            <span v-if="row.is_text_share" class="text-preview">{{ row.text || '—' }}</span>
            <span v-else>{{ row.file_name || '—' }}</span>
          </span>
          <el-tag size="small" type="success">{{ row.viewer_count }} {{ t('user.history.times') }}</el-tag>
        </div>
        <div class="pickup-card-line">
          <span class="pickup-card-label">{{ t('user.history.viewedAt') }}</span>
          <span>{{ row.viewer_at ? formatDate(row.viewer_at) : '—' }}</span>
        </div>
        <div class="pickup-card-line">
          <span class="pickup-card-label">{{ t('user.history.viewerIp') }}</span>
          <code class="mono">{{ row.viewer_ip || '—' }}</code>
        </div>
        <div class="pickup-card-line">
          <span class="pickup-card-label">{{ t('user.history.codeLabel') }}</span>
          <code v-if="row.pickup_code" class="mono">{{ row.pickup_code }}</code>
          <code v-else class="mono">{{ row.code }}</code>
        </div>
        <div v-if="row.pickups && row.pickups.length" class="pickup-card-line pickup-card-detail">
          <span class="pickup-card-label">{{ t('user.history.detailTitle') }}</span>
          <ul class="pickup-card-list">
            <li v-for="(p, i) in row.pickups" :key="i">
              <code class="mono">{{ p.ip || '—' }}</code>
              <span class="pickup-card-time">{{ formatDate(p.picked_at) }}</span>
              <span class="pickup-card-channel">{{ channelLabel(p.channel) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

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
import { isPickupChannel } from '@/utils/pickupChannel'
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

// 交付面标签（未知通道回显原值；契约里 channel 是可选字段）
const channelLabel = (ch?: string | null) => {
  if (!ch) return '—'
  return isPickupChannel(ch) ? t(`user.history.detailChannel.${ch}`) : ch
}

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

.code-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.code-primary {
  font-weight: 600;
}

.code-sub {
  color: var(--color-text-tertiary);
  font-size: 12px;
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

.pickup-detail-tag {
  cursor: pointer;
}

.pickup-detail-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 0;
  font-size: var(--text-sm);
}

.pickup-detail-ip {
  flex: 0 0 auto;
}

.pickup-detail-time {
  flex: 1 1 auto;
  color: var(--color-text-secondary);
}

.pickup-detail-channel {
  flex: 0 0 auto;
  color: var(--color-text-tertiary, var(--color-text-secondary));
}

/* 窄屏卡片形态：默认不渲染（宽屏走表格） */
.pickup-cards {
  display: none;
}

/* 断点 1024px（不是 768px）：本表 7 列 ≈1160px ⇒ 600~1024px（折叠屏展开态
   内屏 690~900 CSS px / 平板竖屏 / 桌面小窗分屏）同样放不下 ⇒ 旧断点会让这些
   形态落回「表格被裁」形态，与手机上同型。 */
@media (max-width: 1024px) {
  /* 表格在窄屏被裁（7 列 1160px vs 视口 ~374px）⇒ 换卡片 */
  .history-table {
    display: none;
  }

  .pickup-cards {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .pickup-card {
    border: 1px solid var(--color-border, var(--el-border-color));
    border-radius: var(--radius-md, 8px);
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--text-sm);
  }

  .pickup-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .pickup-card-name {
    font-weight: 600;
    color: var(--color-text-primary);
    word-break: break-all;
  }

  .pickup-card-line {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    color: var(--color-text-secondary);
  }

  /* 标签列**按内容自适应**（下限 84px）：固定 84px 时英文长标签（如
     "Pickup / Share Code"）会折成两行（真机 390px 实测）⇒ 标签占一行、值列被挤。
     max-width 46% ⇒ 再长的标签最多占卡片近一半，值列仍留得下位置。
     ⚠️ 本块是**纯 CSS**（<style scoped>，非 scss）⇒ 注释必须用 C 风格块注释，
        双斜杠行注释在纯 CSS 里不合法 ⇒ SFC 编译直接失败（2026-10-25 实录：
        v0.11.24 的 tgz 因此构建失败，壳仓 CI 与 frontend-core CI 都红了）。 */
  .pickup-card-label {
    flex: 0 0 auto;
    min-width: 84px;
    max-width: 46%;
    color: var(--color-text-tertiary, var(--color-text-secondary));
  }

  .pickup-card-detail {
    flex-direction: column;
    gap: 2px;
  }

  /* 标签在**行**方向容器里是固定宽（76px）；到了**列**方向容器里 flex-basis
     会变成**高度** ⇒ 标签下方空出 76px（真机截图实测到的空白带）。此处复位。 */
  .pickup-card-detail .pickup-card-label {
    flex: 0 0 auto;
  }

  .pickup-card-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pickup-card-list li {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .pickup-card-time {
    color: var(--color-text-tertiary, var(--color-text-secondary));
  }

  .pickup-card-channel {
    color: var(--color-text-tertiary, var(--color-text-secondary));
  }
}

/* 折叠屏展开态 / 平板竖屏（600~1024px）：卡片改多列网格 —— 单列在 900px 宽下
   每张卡横跨全宽、标签与值被拉到两端 ⇒ 改 auto-fill 网格（800px→2 列）。 */
@media (min-width: 600px) and (max-width: 1024px) {
  .pickup-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    align-items: start;
  }
}
</style>
