<template>
  <div class="files-container">
    <el-card shadow="never" class="files-card">
      <div class="card-header">
        <div class="header-title">
          <h2>{{ t('admin.files') }}</h2>
          <p>{{ t('admin.filesPage.subtitle') }}</p>
        </div>
        <div class="header-actions">
          <el-button
            type="danger"
            plain
            :disabled="!selectedIds.length"
            @click="batchSetStatus('blocked')"
          >
            {{ selectedIds.length ? t('admin.filesPage.batchBlockCount', { n: selectedIds.length }) : t('admin.filesPage.batchBlock') }}
          </el-button>
          <el-button
            type="success"
            plain
            :disabled="!selectedIds.length"
            @click="batchSetStatus('normal')"
          >
            {{ t('admin.filesPage.batchRestore') }}
          </el-button>
          <el-button
            type="warning"
            plain
            :disabled="!selectedIds.length"
            @click="batchExtendVisible = true"
          >
            {{ t('admin.filesPage.batchExtend') }}
          </el-button>
          <el-button
            type="danger"
            plain
            :disabled="!selectedIds.length"
            @click="batchDelete"
          >
            {{ t('admin.filesPage.batchDelete') }}
          </el-button>
          <el-button @click="reload()" :loading="loading" class="refresh-btn">
            <el-icon><Refresh /></el-icon>
            {{ t('admin.filesPage.refresh') }}
          </el-button>
        </div>
      </div>

      <el-divider />

      <!-- 健康洞察过滤提示（来自仪表盘卡点击） -->
      <el-alert
        v-if="filters.health"
        type="info"
        :closable="true"
        class="health-banner"
        @close="clearHealth"
      >
        <template #title>
          {{ t('admin.filesPage.healthFilter', { label: healthLabel(filters.health) }) }}
        </template>
      </el-alert>

      <!-- 治理筛选栏 -->
      <div class="filter-bar">
        <el-input
          v-model="filters.keyword"
          :placeholder="t('admin.filesPage.keywordPlaceholder')"
          clearable
          style="width: 180px"
          @keyup.enter="applyFilters"
        />
        <el-select v-model="filters.status" :placeholder="t('admin.filesPage.statusPlaceholder')" clearable style="width: 130px">
          <el-option :label="t('admin.filesPage.statusNormal')" value="normal" />
          <el-option :label="t('admin.filesPage.statusBlocked')" value="blocked" />
          <el-option :label="t('admin.filesPage.statusPendingReview')" value="pending_review" />
          <el-option :label="t('admin.filesPage.statusDeleted')" value="deleted" />
        </el-select>
        <el-select v-model="filters.upload_type" :placeholder="t('admin.filesPage.uploadTypePlaceholder')" clearable style="width: 130px">
          <el-option :label="t('admin.filesPage.uploadTypeAnonymous')" value="anonymous" />
          <el-option :label="t('admin.filesPage.uploadTypeAuthenticated')" value="authenticated" />
        </el-select>
        <el-select v-model="filters.expired" :placeholder="t('admin.filesPage.expiredPlaceholder')" clearable style="width: 120px">
          <el-option :label="t('admin.filesPage.expiredNo')" value="false" />
          <el-option :label="t('admin.filesPage.expiredYes')" value="true" />
        </el-select>
        <el-input
          v-model="filters.owner_ip"
          :placeholder="t('admin.filesPage.ipPlaceholder')"
          clearable
          style="width: 140px"
          @keyup.enter="applyFilters"
        />
        <el-input
          v-model="filters.user_id"
          :placeholder="t('admin.filesPage.userIdPlaceholder')"
          clearable
          style="width: 110px"
          @keyup.enter="applyFilters"
        />
        <el-button type="primary" @click="applyFilters">{{ t('admin.filesPage.apply') }}</el-button>
        <el-button @click="resetFilters">{{ t('admin.filesPage.reset') }}</el-button>

        <!-- 保存视图（2026-10-12 对标上游 view-presets）：筛选条件存为命名视图一键切换 -->
        <el-divider direction="vertical" />
        <el-select
          v-model="activeView"
          :placeholder="t('admin.filesPage.savedViewsPlaceholder')"
          clearable
          style="width: 140px"
          @change="applyView"
        >
          <el-option v-for="v in savedViews" :key="v.name" :label="v.name" :value="v.name" />
        </el-select>
        <el-button @click="saveCurrentView">{{ t('admin.filesPage.saveView') }}</el-button>
        <el-button :disabled="!activeView" @click="removeActiveView">{{ t('admin.filesPage.deleteView') }}</el-button>
      </div>

      <el-table
        :data="filesList"
        v-loading="loading"
        class="files-table"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column :label="t('admin.filesPage.colFileInfo')" min-width="230">
          <template #default="{ row }">
            <div class="file-info">
              <div class="file-icon">
                <el-icon size="32" :color="getFileIconColor(row)">
                  <component :is="getFileIcon(row)" />
                </el-icon>
              </div>
              <div class="file-details">
                <div class="file-name">
                  {{ row.file_name || row.code }}
                  <el-tag v-if="row.is_text" size="small" type="success">{{ t('admin.filesPage.tagText') }}</el-tag>
                  <el-tag v-if="(row.file_count || 0) > 1" size="small" type="info">{{ t('admin.filesPage.fileCount', { n: row.file_count }) }}</el-tag>
                </div>
                <div v-if="row.is_text && row.text_preview" class="text-preview">
                  {{ row.text_preview }}
                </div>
                <div class="file-code">
                  <el-tag size="small" type="info">
                    {{ row.code }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="size" :label="t('admin.size')" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="info" effect="plain">
              {{ formatFileSize(row.size) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('admin.filesPage.colStatus')" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="dark">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('admin.uploader')" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.user_id" type="info">
              ID: {{ row.user_id }}
            </el-tag>
            <span v-else class="anonymous">{{ t('admin.filesPage.anonymous') }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="owner_ip" :label="t('admin.filesPage.colIp')" width="140" align="center">
          <template #default="{ row }">
            <span class="owner-ip">{{ row.owner_ip || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="used_count" :label="t('admin.filesPage.colDownloads')" width="96" align="center">
          <template #default="{ row }">
            <div class="download-count">
              <el-icon><Download /></el-icon>
              {{ row.used_count || 0 }}
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" :label="t('admin.createdAt')" width="170">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column prop="expired_at" :label="t('admin.filesPage.colExpiresAt')" width="170">
          <template #default="{ row }">
            <div :class="['expire-time', { expired: isExpired(row.expired_at) }]">
              {{ formatDate(row.expired_at) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('admin.filesPage.colActions')" width="300" align="center" fixed="right" class-name="nowrap-actions">
          <template #default="{ row }">
            <template v-if="row.deleted">
              <el-button type="success" size="small" round @click="restoreDeleted(row)">{{ t('admin.filesPage.restore') }}</el-button>
              <el-button type="danger" size="small" round @click="purgeDeleted(row)">{{ t('admin.filesPage.purge') }}</el-button>
            </template>
            <template v-else>
            <el-button
              v-if="row.status !== 'blocked'"
              type="warning"
              size="small"
              round
              @click="setStatus(row, 'blocked')"
            >
              {{ t('admin.filesPage.block') }}
            </el-button>
            <el-button
              v-else
              type="success"
              size="small"
              round
              @click="setStatus(row, 'normal')"
            >
              {{ t('admin.filesPage.restore') }}
            </el-button>
            <el-button
              v-if="!row.is_text"
              size="small"
              round
              @click="downloadFile(row)"
            >
              {{ t('admin.filesPage.download') }}
            </el-button>
            <el-button size="small" round @click="openEdit(row)">{{ t('admin.filesPage.edit') }}</el-button>
            <el-button
              type="danger"
              size="small"
              @click="deleteFile(row)"
              round
            >
              <el-icon><Delete /></el-icon>
              {{ t('admin.filesPage.delete') }}
            </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
          background
        />
      </div>
    </el-card>

    <!-- 编辑（延期/次数） -->
    <el-dialog v-model="editVisible" :title="t('admin.filesPage.editTitle')" width="420px">
      <el-form label-width="100px">
        <el-form-item :label="t('admin.filesPage.editFileLabel')">
          <span>{{ editTarget?.file_name || editTarget?.code }}</span>
        </el-form-item>
        <el-form-item :label="t('admin.filesPage.extendLabel')">
          <el-select v-model="editForm.expireValue" style="width: 100%">
            <el-option :label="t('admin.filesPage.dayOption', { n: 1 })" :value="1" />
            <el-option :label="t('admin.filesPage.dayOption', { n: 7 })" :value="7" />
            <el-option :label="t('admin.filesPage.dayOption', { n: 30 })" :value="30" />
            <el-option :label="t('admin.filesPage.dayOption', { n: 90 })" :value="90" />
            <el-option :label="t('admin.filesPage.yearOption', { n: 1 })" :value="365" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.filesPage.remainCountLabel')">
          <el-input-number v-model="editForm.expiredCount" :min="-1" :max="999999" />
          <div class="form-hint">{{ t('admin.filesPage.unlimitedHint') }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('admin.filesPage.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">{{ t('admin.filesPage.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 批量延期 -->
    <el-dialog v-model="batchExtendVisible" :title="t('admin.filesPage.batchExtend')" width="420px">
      <p class="form-hint">{{ t('admin.filesPage.batchExtendHint', { n: selectedIds.length }) }}</p>
      <el-select v-model="batchExtendValue" style="width: 100%">
        <el-option :label="t('admin.filesPage.dayOption', { n: 1 })" :value="1" />
        <el-option :label="t('admin.filesPage.dayOption', { n: 7 })" :value="7" />
        <el-option :label="t('admin.filesPage.dayOption', { n: 30 })" :value="30" />
        <el-option :label="t('admin.filesPage.dayOption', { n: 90 })" :value="90" />
        <el-option :label="t('admin.filesPage.yearOption', { n: 1 })" :value="365" />
      </el-select>
      <template #footer>
        <el-button @click="batchExtendVisible = false">{{ t('admin.filesPage.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitBatchExtend">{{ t('admin.filesPage.confirmExtend') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize, toLocaleDateTime as formatDate } from '@/utils/format'
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  Refresh, Document, Picture, Download, Delete,
  VideoPlay, Headset, Reading
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { loadViews, saveView, deleteView } from '@/utils/savedViews'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useRouteParam } from '@/composables/useRouteParam'

const { t } = useI18n()
const { handleError } = useErrorHandler()
const route = useRoute()

type FileStatus = 'normal' | 'blocked' | 'pending_review'

const { list: filesList, total, page, pageSize, loading, reload, handleSizeChange, handlePageChange } =
  useTableQuery<any>(async ({ page, page_size }) => {
    try {
      const params: Record<string, unknown> = { page, page_size }
      if (filters.keyword) params.keyword = filters.keyword
      if (filters.health) params.health = filters.health
      if (filters.status) params.status = filters.status
      if (filters.status === 'deleted') params.deleted = 'only'
      else if (filters.deleted === 'all') params.deleted = 'all'
      else params.deleted = '' 
      if (filters.upload_type) params.upload_type = filters.upload_type
      if (filters.expired) params.expired = filters.expired
      if (filters.owner_ip) params.owner_ip = filters.owner_ip
      if (filters.user_id) {
        const uid = Number(filters.user_id)
        if (Number.isFinite(uid) && uid > 0) params.user_id = uid
      }

      const res = await adminApi.getFilesFiltered(params)
      if (res.code === 200 && res.data) {
        return { items: res.data.items || [], total: res.data.total || 0 }
      }
      return { items: [], total: 0 }
    } catch (error) {
      handleError(error)
      return { items: [], total: 0 }
    }
  })

// 治理筛选条件（对应 GET /admin/files/filter）
const filters = reactive({
  keyword: '',
  health: '',
  status: '',
  upload_type: '',
  expired: '',
  deleted: '',
  owner_ip: '',
  user_id: ''
})

// 健康过滤标签复用 admin.health 族（与仪表盘洞察卡同源）
const HEALTH_KEYS: Record<string, string> = {
  active: 'admin.health.active',
  expired: 'admin.health.expired',
  expiring_soon: 'admin.health.expiringSoon',
  never_picked: 'admin.health.neverPicked',
  forever: 'admin.health.forever',
}

const healthLabel = (h: string): string => (HEALTH_KEYS[h] ? t(HEALTH_KEYS[h]) : h)

const clearHealth = () => {
  filters.health = ''
  reload()
}

// 操作后刷新适配器（处置/删除/改期后调用，语义=刷新当前页）
const fetchFiles = () => reload()



const isExpired = (dateStr: string): boolean => {
  if (!dateStr) return false
  try {
    return new Date(dateStr.replace(' ', 'T')) < new Date()
  } catch {
    return false
  }
}

const statusLabel = (status: string): string => {
  switch (status) {
    case 'blocked': return t('admin.filesPage.statusBlocked')
    case 'pending_review': return t('admin.filesPage.statusPendingReview')
    default: return t('admin.filesPage.statusNormal')
  }
}

const statusTagType = (status: string): 'success' | 'danger' | 'warning' => {
  switch (status) {
    case 'blocked': return 'danger'
    case 'pending_review': return 'warning'
    default: return 'success'
  }
}

const getFileIcon = (row: any) => {
  const filename = row.file_name || ''
  const ext = filename.split('.').pop()?.toLowerCase()

  const iconMap: Record<string, any> = {
    'jpg': Picture,
    'jpeg': Picture,
    'png': Picture,
    'gif': Picture,
    'mp4': VideoPlay,
    'mp3': Headset,
    'txt': Reading,
    'pdf': Document
  }

  return iconMap[ext || ''] || Document
}

const getFileIconColor = (row: any) => {
  const filename = row.file_name || ''
  const ext = filename.split('.').pop()?.toLowerCase()

  const colorMap: Record<string, string> = {
    'jpg': '#409eff',
    'jpeg': '#409eff',
    'png': '#409eff',
    'gif': '#409eff',
    'mp4': '#67c23a',
    'mp3': '#e6a23c',
    'txt': '#909399',
    'pdf': '#f56c6c'
  }

  return colorMap[ext || ''] || '#606266'
}

const applyFilters = () => {
  reload()
}

const resetFilters = () => {
  filters.keyword = ''
  filters.health = ''
  filters.status = ''
  filters.upload_type = ''
  filters.expired = ''
  filters.owner_ip = ''
  filters.user_id = ''
  reload()
}

// ==================== 保存视图（2026-10-12 对标上游 view-presets）====================
// 筛选条件存为命名视图（localStorage 浏览器本地），保存（同名覆盖）/应用/删除。
const FILE_VIEWS_KEY = 'pigeonbox.admin.file-views.v1'
const savedViews = ref(loadViews<Record<string, string>>(FILE_VIEWS_KEY))
const activeView = ref('')

const saveCurrentView = async () => {
  try {
    const { value } = await ElMessageBox.prompt(t('admin.filesPage.saveViewPrompt'), t('admin.filesPage.saveView'), {
      inputValue: activeView.value || '',
      inputPattern: /\S/,
      inputErrorMessage: t('admin.filesPage.viewNameRequired')
    })
    savedViews.value = saveView(FILE_VIEWS_KEY, value, { ...filters })
    activeView.value = value.trim()
    ElMessage.success(t('admin.filesPage.viewSaved', { name: activeView.value }))
  } catch {
    // 用户取消
  }
}

const applyView = (name: string) => {
  const v = savedViews.value.find((x) => x.name === name)
  if (!v) return
  // 先清空全部筛选键再套视图（防视图外残留条件漏过滤）
  Object.assign(filters, {
    keyword: '', health: '', status: '', upload_type: '',
    expired: '', deleted: '', owner_ip: '', user_id: ''
  }, v.filters)
  reload()
}

const removeActiveView = () => {
  if (!activeView.value) return
  savedViews.value = deleteView(FILE_VIEWS_KEY, activeView.value)
  ElMessage.success(t('admin.filesPage.viewDeleted', { name: activeView.value }))
  activeView.value = ''
}

// ==================== 管控状态机 ====================
const restoreDeleted = async (row: any) => {
  try {
    await ElMessageBox.confirm(t('admin.filesPage.restoreConfirmBody', { code: row.code }), t('admin.filesPage.restore'), { type: 'info' })
    const res = await adminApi.restoreFiles([row.id])
    if (res.code === 200) {
      ElMessage.success(t('admin.filesPage.restored'))
      reload()
    }
  } catch (e) {
    if (e !== 'cancel') handleError(e as Error)
  }
}

const purgeDeleted = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      t('admin.filesPage.purgeConfirmBody', { code: row.code }),
      t('admin.filesPage.purge'),
      { type: 'error', confirmButtonText: t('admin.filesPage.purge') }
    )
    const res = await adminApi.purgeFiles([row.id])
    if (res.code === 200) {
      ElMessage.success(t('admin.filesPage.purged'))
      reload()
    }
  } catch (e) {
    if (e !== 'cancel') handleError(e as Error)
  }
}

const setStatus = async (row: any, status: FileStatus) => {
  const isBlock = status === 'blocked'
  try {
    await ElMessageBox.confirm(
      isBlock
        ? t('admin.filesPage.blockConfirmBody', { name: row.file_name || row.code })
        : t('admin.filesPage.restoreShareConfirmBody', { name: row.file_name || row.code }),
      isBlock ? t('admin.filesPage.blockConfirmTitle') : t('admin.filesPage.restoreShareConfirmTitle'),
      { type: isBlock ? 'warning' : 'info' }
    )
  } catch {
    return
  }
  try {
    const res = await adminApi.setFileStatus(row.id, status)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(isBlock ? t('admin.filesPage.blockDone') : t('admin.filesPage.restoreDone'))
      await fetchFiles()
    } else {
      ElMessage.error(res.message || (isBlock ? t('admin.filesPage.blockFailed') : t('admin.filesPage.restoreFailed')))
    }
  } catch (e: any) {
    ElMessage.error(e.message || (isBlock ? t('admin.filesPage.blockFailed') : t('admin.filesPage.restoreFailed')))
  }
}

const batchSetStatus = async (status: FileStatus) => {
  const isBlock = status === 'blocked'
  try {
    await ElMessageBox.confirm(
      isBlock
        ? t('admin.filesPage.batchBlockConfirmBody', { n: selectedIds.value.length })
        : t('admin.filesPage.batchRestoreConfirmBody', { n: selectedIds.value.length }),
      isBlock ? t('admin.filesPage.batchBlock') : t('admin.filesPage.batchRestore'),
      { type: isBlock ? 'warning' : 'info' }
    )
  } catch {
    return
  }
  try {
    const res = await adminApi.batchSetFileStatus(selectedIds.value, status)
    if (res.code === 0 || res.code === 200) {
      const n = res.data?.affected ?? selectedIds.value.length
      ElMessage.success(isBlock ? t('admin.filesPage.batchBlockDone', { n }) : t('admin.filesPage.batchRestoreDone', { n }))
      await fetchFiles()
    } else {
      ElMessage.error(res.message || (isBlock ? t('admin.filesPage.batchBlockFailed') : t('admin.filesPage.batchRestoreFailed')))
    }
  } catch (e: any) {
    ElMessage.error(e.message || (isBlock ? t('admin.filesPage.batchBlockFailed') : t('admin.filesPage.batchRestoreFailed')))
  }
}

const deleteFile = async (file: any) => {
  try {
    await ElMessageBox.confirm(
      t('admin.filesPage.deleteConfirmBody', { name: file.file_name || file.code }),
      t('admin.filesPage.deleteConfirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('admin.filesPage.deleteConfirmBtn'),
        cancelButtonText: t('admin.filesPage.cancel')
      }
    )

    // 使用 code 而不是 ID
    const res = await adminApi.deleteFileByCode(file.code)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(t('admin.filesPage.deleteDone'))
      await fetchFiles()
    } else {
      handleError(new Error(res.message || t('admin.filesPage.deleteFailed')))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('admin.filesPage.deleteFailed'))
    }
  }
}

// ==================== 批量操作 / 编辑 / 下载 ====================
const saving = ref(false)
const selectedRows = ref<any[]>([])
const selectedIds = computed(() => selectedRows.value.map((r) => r.id).filter(Boolean))

const onSelectionChange = (rows: any[]) => {
  selectedRows.value = rows
}

const batchDelete = async () => {
  try {
    await ElMessageBox.confirm(
      t('admin.filesPage.batchDeleteConfirmBody', { n: selectedIds.value.length }),
      t('admin.filesPage.batchDelete'),
      { type: 'warning' }
    )
  } catch {
    return
  }
  saving.value = true
  try {
    const res = await adminApi.batchDeleteFilesByIds(selectedIds.value)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.filesPage.batchDeleteDone', { n: res.data?.deleted ?? selectedIds.value.length }))
      await fetchFiles()
    } else {
      handleError(new Error(res.message || t('admin.filesPage.batchDeleteFailed')))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    saving.value = false
  }
}

const batchExtendVisible = ref(false)
const batchExtendValue = ref(7)
const submitBatchExtend = async () => {
  saving.value = true
  try {
    const res = await adminApi.batchExtendFiles(selectedIds.value, batchExtendValue.value, 'day')
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.filesPage.batchExtendDone', { n: res.data?.extended ?? selectedIds.value.length }))
      batchExtendVisible.value = false
      await fetchFiles()
    } else {
      handleError(new Error(res.message || t('admin.filesPage.batchExtendFailed')))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    saving.value = false
  }
}

const editVisible = ref(false)
const editTarget = ref<any>(null)
const editForm = reactive({ expireValue: 7, expiredCount: -1 })

const openEdit = (row: any) => {
  editTarget.value = row
  editForm.expireValue = 7
  editForm.expiredCount = typeof row.expired_count === 'number' ? row.expired_count : -1
  editVisible.value = true
}

const submitEdit = async () => {
  if (!editTarget.value) return
  saving.value = true
  try {
    const res = await adminApi.updateFile(editTarget.value.id, {
      expire_value: editForm.expireValue,
      expire_style: 'day',
      expired_count: editForm.expiredCount
    })
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.filesPage.saved'))
      editVisible.value = false
      await fetchFiles()
    } else {
      handleError(new Error(res.message || t('admin.filesPage.saveFailed')))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    saving.value = false
  }
}

const downloadFile = async (row: any) => {
  // 管理端下载：/admin/files/:id 受 AdminMiddleware 保护，window.open 带不上
  // 凭证——改为同源 fetch（自动携带会话 Cookie）→ blob → 触发保存
  try {
    const { default: axios } = await import('axios')
    const res = await axios.get(adminApi.fileDownloadUrl(row.id), {
      responseType: 'blob',
      withCredentials: true
    })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = row.file_name || `${row.code}.bin`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    ElMessage.error(e?.response?.status === 401 ? t('admin.filesPage.sessionExpired') : t('admin.filesPage.downloadFailed'))
  }
}

// 仪表盘健康洞察卡跳转入口：?health=expiring_soon 等直达过滤视图。
//
// 两点修正（2026-10-23）：
//   ① 取 route.query 而非手搓 window.location.hash 解析（vue-router hash 模式
//      已经把 '#' 后的 query 解析进 route.query）。
//   ② **参数变化即跟随**：仪表盘 5 张健康卡是 router.push 同一 path、只有 query
//      不同 ⇒ 同一路由记录组件被复用，只在挂载时读一次的话，**连点第二张卡
//      过滤不生效**（与分享页/寄件页同一坑，本仓第三处复发）。
const HEALTH_QUERY_KEYS = ['active', 'expired', 'expiring_soon', 'never_picked', 'forever']
useRouteParam(
  () => route.query.health as string | undefined,
  (h) => {
    if (h && HEALTH_QUERY_KEYS.includes(h)) filters.health = h
    else if (!h) filters.health = ''
    reload()
  }
)
</script>

<style scoped>
.files-container {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.files-card {
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

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.refresh-btn {
  border-radius: var(--radius-md);
  background: var(--primary-color);
  border: none;
  color: white;
  transition: all 0.3s;
}

.refresh-btn:hover {
  box-shadow: var(--shadow-xs);
}

.files-table {
  margin-top: 20px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.file-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: var(--color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 6px;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.text-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-code {
  display: flex;
  gap: 8px;
}

.anonymous {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.owner-ip {
  font-family: monospace;
  font-size: 13px;
  color: var(--color-text-regular);
  /* IP 是不可断的定长串，列宽临界时会被折成两行（实测 223.70.159.239 断成
     "223.70.159.23" + "9"）⇒ 强制单行 */
  white-space: nowrap;
}

.download-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 600;
  color: var(--primary-color);
}

.expire-time {
  color: var(--color-text-regular);
}

.expire-time.expired {
  color: var(--color-danger);
  font-weight: 600;
}

.pagination-wrapper {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

:deep(.el-table) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

:deep(.el-table th) {
  background: var(--color-muted) !important;
  font-weight: 600;
  color: var(--color-text-primary);
}

:deep(.el-table td) {
  padding: 16px 0;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: var(--color-muted);
}
</style>
