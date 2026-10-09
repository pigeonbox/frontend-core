<template>
  <div class="announcements">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <h3>公告管理</h3>
          <el-button type="primary" @click="openCreate">新建公告</el-button>
        </div>
      </template>

      <el-table :data="items" style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'maintenance' ? 'warning' : 'info'">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="levelTagType(row.level)">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'info'">
              {{ row.status === 1 ? '已发布' : row.status === 2 ? '已下线' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="start_at" label="生效时间" width="170">
          <template #default="{ row }">{{ row.start_at || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" class-name="nowrap-actions">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status === 1" size="small" type="warning" plain @click="setStatus(row, 2)">下线</el-button>
            <el-button v-else size="small" type="success" plain @click="setStatus(row, 1)">发布</el-button>
            <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>暂无公告</template>
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

    <el-dialog v-model="dlg" :title="editId ? '编辑公告' : '新建公告'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="form.content" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type">
            <el-option label="系统" value="system" />
            <el-option label="功能更新" value="feature" />
            <el-option label="维护" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="form.level">
            <el-option label="info" value="info" />
            <el-option label="success" value="success" />
            <el-option label="warning" value="warning" />
            <el-option label="error" value="error" />
          </el-select>
        </el-form-item>
        <el-form-item label="生效时间">
          <el-date-picker v-model="form.start_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" placeholder="留空=立即" />
        </el-form-item>
        <el-form-item label="失效时间">
          <el-date-picker v-model="form.end_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" placeholder="留空=长期" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/api/admin'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'

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

const typeLabel = (t: string) => (t === 'maintenance' ? '维护' : t === 'feature' ? '功能' : '系统')
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
    ElMessage.warning('标题与内容必填')
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
      ElMessage.success('已保存')
      dlg.value = false
      load()
    } else {
      handleError(new Error(res.message || '保存失败'))
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
      ElMessage.success(status === 1 ? '已发布' : '已下线')
      load()
    } else {
      handleError(new Error(res.message || '操作失败'))
    }
  } catch (e) {
    handleError(e)
  }
}

const onDelete = async (row: NotifyRow) => {
  try {
    await ElMessageBox.confirm(`确定删除公告「${row.title}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  const res = await adminApi.deleteNotify(row.id)
  if (res.code === 0 || res.code === 200) {
    ElMessage.success('已删除')
    load()
  } else {
    handleError(new Error(res.message || '删除失败'))
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

/* 操作列三按钮（编辑/下线/删除）不折行 */
:deep(.nowrap-actions .cell) {
  white-space: nowrap;
}
</style>
