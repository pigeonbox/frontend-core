<template>
  <div class="announcements">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <h3>{{ t('admin.announcements') }}</h3>
          <el-button type="primary" @click="openCreate">{{ t('admin.announcementsPage.create') }}</el-button>
        </div>
      </template>

      <el-table :data="items" style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" :label="t('admin.announcementsPage.colTitle')" min-width="200" show-overflow-tooltip />
        <el-table-column :label="t('admin.announcementsPage.colType')" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'maintenance' ? 'warning' : 'info'">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.announcementsPage.colLevel')" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="levelTagType(row.level)">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.announcementsPage.colStatus')" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'info'">
              {{ row.status === 1 ? t('admin.announcementsPage.statusPublished') : row.status === 2 ? t('admin.announcementsPage.statusOffline') : t('admin.announcementsPage.statusDraft') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="start_at" :label="t('admin.announcementsPage.colStartAt')" width="170">
          <template #default="{ row }">{{ row.start_at || '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('admin.announcementsPage.colActions')" width="220" fixed="right" class-name="nowrap-actions">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">{{ t('admin.announcementsPage.edit') }}</el-button>
            <el-button v-if="row.status === 1" size="small" type="warning" plain @click="setStatus(row, 2)">{{ t('admin.announcementsPage.offline') }}</el-button>
            <el-button v-else size="small" type="success" plain @click="setStatus(row, 1)">{{ t('admin.announcementsPage.publish') }}</el-button>
            <el-button size="small" type="danger" plain @click="onDelete(row)">{{ t('admin.announcementsPage.delete') }}</el-button>
          </template>
        </el-table-column>
        <template #empty>{{ t('admin.announcementsPage.empty') }}</template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="dlg" :title="editId ? t('admin.announcementsPage.editTitle') : t('admin.announcementsPage.create')" width="560px">
      <el-form label-width="90px">
        <el-form-item :label="t('admin.announcementsPage.colTitle')" required>
          <el-input v-model="form.title" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('admin.announcementsPage.labelContent')" required>
          <el-input v-model="form.content" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item :label="t('admin.announcementsPage.colType')">
          <el-select v-model="form.type">
            <el-option :label="t('admin.announcementsPage.typeSystem')" value="system" />
            <el-option :label="t('admin.announcementsPage.typeFeature')" value="feature" />
            <el-option :label="t('admin.announcementsPage.typeMaintenance')" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.announcementsPage.colLevel')">
          <el-select v-model="form.level">
            <el-option label="info" value="info" />
            <el-option label="success" value="success" />
            <el-option label="warning" value="warning" />
            <el-option label="error" value="error" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.announcementsPage.colStartAt')">
          <el-date-picker v-model="form.start_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" :placeholder="t('admin.announcementsPage.startPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.announcementsPage.labelEndAt')">
          <el-date-picker v-model="form.end_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" :placeholder="t('admin.announcementsPage.endPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">{{ t('admin.announcementsPage.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">{{ t('admin.announcementsPage.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { adminApi } from '@/api/admin'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()

interface NotifyRow {
  id: number
  title: string
  content: string
  type: string
  level: string
  status: number
  start_at?: string | null
  end_at?: string | null
}

const saving = ref(false)
const dlg = ref(false)
const editId = ref<number | null>(null)
const form = ref({ title: '', content: '', type: 'system', level: 'info', start_at: '', end_at: '' })

const typeLabel = (v: string) => (v === 'maintenance' ? t('admin.announcementsPage.typeMaintenance') : v === 'feature' ? t('admin.announcementsPage.typeFeatureShort') : t('admin.announcementsPage.typeSystem'))
const levelTagType = (l: string) => (l === 'error' ? 'danger' : l === 'warning' ? 'warning' : l === 'success' ? 'success' : 'info')

const { list: items, total, page, loading, reload, handlePageChange } = useTableQuery<NotifyRow>(
  async ({ page, page_size }) => {
    try {
      const res = await adminApi.listNotifies({ page, page_size })
      if (res.code === 0 || res.code === 200) {
        const d = res.data as Record<string, unknown>
        const list = (d.list || d.items || d.notifies) as NotifyRow[] | undefined
        const items = Array.isArray(list) ? list : Array.isArray(d) ? (d as unknown as NotifyRow[]) : []
        return { items, total: Number(d.total ?? items.length) }
      }
      return { items: [], total: 0 }
    } catch (e) {
      handleError(e)
      return { items: [], total: 0 }
    }
  },
  { defaultPageSize: 20 }
)

// 操作后刷新适配器（原 load 无参语义=当前页）
const load = () => reload(page.value)

const openCreate = () => {
  editId.value = null
  form.value = { title: '', content: '', type: 'system', level: 'info', start_at: '', end_at: '' }
  dlg.value = true
}

const openEdit = (row: NotifyRow) => {
  editId.value = row.id
  form.value = {
    title: row.title,
    content: row.content,
    type: row.type,
    level: row.level,
    start_at: row.start_at || '',
    end_at: row.end_at || '',
  }
  dlg.value = true
}

const doSave = async () => {
  if (!form.value.title || !form.value.content) {
    ElMessage.warning(t('admin.announcementsPage.titleContentRequired'))
    return
  }
  saving.value = true
  try {
    const payload: Record<string, unknown> = { ...form.value }
    if (!payload.start_at) delete payload.start_at
    if (!payload.end_at) delete payload.end_at
    const res = editId.value
      ? await adminApi.updateNotify(editId.value, payload)
      : await adminApi.createNotify(payload)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.announcementsPage.saved'))
      dlg.value = false
      load()
    } else {
      handleError(new Error(res.message || t('admin.announcementsPage.saveFailed')))
    }
  } catch (e) {
    handleError(e)
  } finally {
    saving.value = false
  }
}

const setStatus = async (row: NotifyRow, status: number) => {
  try {
    const res = await adminApi.updateNotify(row.id, {
      title: row.title, content: row.content, type: row.type, level: row.level, status,
    })
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(status === 1 ? t('admin.announcementsPage.publishedToast') : t('admin.announcementsPage.offlineToast'))
      load()
    } else {
      handleError(new Error(res.message || t('admin.announcementsPage.actionFailed')))
    }
  } catch (e) {
    handleError(e)
  }
}

const onDelete = async (row: NotifyRow) => {
  try {
    await ElMessageBox.confirm(t('admin.announcementsPage.deleteConfirmBody', { name: row.title }), t('admin.announcementsPage.deleteConfirmTitle'), { type: 'warning' })
  } catch {
    return
  }
  const res = await adminApi.deleteNotify(row.id)
  if (res.code === 0 || res.code === 200) {
    ElMessage.success(t('admin.announcementsPage.deleted'))
    load()
  } else {
    handleError(new Error(res.message || t('admin.announcementsPage.deleteFailed')))
  }
}

onMounted(load)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pager {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

</style>
