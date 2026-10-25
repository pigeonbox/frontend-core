<template>
  <div class="users-container">
    <el-card shadow="never" class="users-card">
      <div class="card-header">
        <div class="header-title">
          <h2>{{ t('admin.users') }}</h2>
          <p>{{ t('admin.usersPage.subtitle') }}</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>
            {{ t('admin.usersPage.create') }}
          </el-button>
          <el-button @click="reload()" :loading="loading" class="refresh-btn">
            <el-icon><Refresh /></el-icon>
            {{ t('admin.usersPage.refresh') }}
          </el-button>
        </div>
      </div>

      <el-divider />

      <el-table
        :data="usersList"
        v-loading="loading"
        class="admin-table-wide users-table"
      >
        <el-table-column :label="t('admin.usersPage.colUserInfo')" min-width="200">
          <template #default="{ row }">
            <div class="user-info">
              <el-avatar :size="40" class="user-avatar">
                {{ row.username?.charAt(0)?.toUpperCase() }}
              </el-avatar>
              <div class="user-details">
                <div class="user-name">
                  {{ row.username }}
                  <el-tag
                    v-if="row.role === 'admin'"
                    type="danger"
                    size="small"
                    effect="dark"
                  >
                    {{ t('admin.usersPage.roleAdmin') }}
                  </el-tag>
                </div>
                <div class="user-email">{{ row.email || t('admin.usersPage.noEmail') }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('admin.nickname')" width="120">
          <template #default="{ row }">
            {{ row.nickname || '—' }}
          </template>
        </el-table-column>

        <el-table-column :label="t('admin.usersPage.colStatus')" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 1 || row.status === 'active' ? 'success' : 'danger'"
              effect="light"
            >
              {{ row.status === 1 || row.status === 'active' ? t('admin.usersPage.statusActive') : t('admin.usersPage.statusDisabled') }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('admin.usersPage.colStorage')" width="140" align="center">
          <template #default="{ row }">
            <el-progress
              :percentage="getStoragePercentage(row)"
              :stroke-width="8"
              :color="getStorageColor(row)"
            />
            <div class="storage-text">
              {{ formatFileSize(row.quota_used || row.total_storage || 0) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" :label="t('admin.registeredAt')" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column :label="t('admin.usersPage.colActions')" width="300" align="center" class-name="nowrap-actions">
          <template #default="{ row }">
            <el-button
              @click="toggleUserStatus(row)"
              :type="row.status === 1 || row.status === 'active' ? 'warning' : 'success'"
              size="small"
              round
            >
              {{ row.status === 1 || row.status === 'active' ? t('admin.usersPage.disable') : t('admin.usersPage.enable') }}
            </el-button>
            <el-button @click="openResetPassword(row)" size="small" round>{{ t('admin.usersPage.resetPassword') }}</el-button>
            <el-button @click="removeUser(row)" type="danger" size="small" round plain>{{ t('admin.usersPage.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 窄屏（≤768px）卡片形态：本表 5 列合计 ~1040px ⇒ 390px 视口下内容列全被裁。
           策展=用户名(头部) + 昵称/状态/存储/注册时间；操作按钮同桌面。 -->
      <NarrowCardList :rows="usersList" :fields="cardFields" :head="cardHead">
        <template #head="{ row }">
          <div class="narrow-file-name">
            {{ row.username }}
            <el-tag v-if="row.role === 'admin'" type="danger" size="small" effect="dark">{{ t('admin.usersPage.roleAdmin') }}</el-tag>
          </div>
          <div class="narrow-text-preview">{{ row.email || t('admin.usersPage.noEmail') }}</div>
        </template>
        <template #status="{ row }">
          <el-tag :type="row.status === 1 || row.status === 'active' ? 'success' : 'danger'" effect="light">
            {{ row.status === 1 || row.status === 'active' ? t('admin.usersPage.statusActive') : t('admin.usersPage.statusDisabled') }}
          </el-tag>
        </template>
        <template #storage="{ row }">
          <el-progress :percentage="getStoragePercentage(row)" :stroke-width="8" :color="getStorageColor(row)" />
          <div class="storage-text">{{ formatFileSize(row.quota_used || row.total_storage || 0) }}</div>
        </template>
        <template #created_at="{ row }">{{ formatDate(row.created_at) }}</template>
        <template #actions="{ row }">
          <el-button
            @click="toggleUserStatus(row)"
            :type="row.status === 1 || row.status === 'active' ? 'warning' : 'success'"
            size="small"
            round
          >
            {{ row.status === 1 || row.status === 'active' ? t('admin.usersPage.disable') : t('admin.usersPage.enable') }}
          </el-button>
          <el-button @click="openResetPassword(row)" size="small" round>{{ t('admin.usersPage.resetPassword') }}</el-button>
          <el-button @click="removeUser(row)" type="danger" size="small" round plain>{{ t('admin.usersPage.delete') }}</el-button>
        </template>
      </NarrowCardList>

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

    <!-- 新建用户 -->
    <el-dialog v-model="createVisible" :title="t('admin.usersPage.create')" width="460px">
      <el-form :model="createForm" label-width="90px">
        <el-form-item :label="t('admin.usersPage.usernameLabel')" required>
          <el-input v-model="createForm.username" :placeholder="t('admin.usersPage.usernamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.usersPage.emailLabel')">
          <el-input v-model="createForm.email" :placeholder="t('admin.usersPage.optional')" />
        </el-form-item>
        <el-form-item :label="t('admin.nickname')">
          <el-input v-model="createForm.nickname" :placeholder="t('admin.usersPage.optional')" />
        </el-form-item>
        <el-form-item :label="t('admin.usersPage.passwordLabel')" required>
          <el-input v-model="createForm.password" type="password" show-password :placeholder="t('admin.usersPage.passwordPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.usersPage.roleLabel')">
          <el-select v-model="createForm.role" style="width: 100%">
            <el-option :label="t('admin.usersPage.roleUser')" value="user" />
            <el-option :label="t('admin.usersPage.roleAdmin')" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.usersPage.quotaLabel')">
          <el-select v-model="createForm.quotaUnit" style="width: 100%">
            <el-option :label="t('admin.usersPage.quotaUnlimited')" :value="0" />
            <el-option label="100 MB" :value="100" />
            <el-option label="1 GB" :value="1024" />
            <el-option label="10 GB" :value="10240" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('admin.usersPage.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">{{ t('admin.usersPage.createBtn') }}</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetVisible" :title="t('admin.usersPage.resetPassword')" width="420px">
      <el-form label-width="90px">
        <el-form-item :label="t('admin.usersPage.userLabel')">
          <span>{{ resetTarget?.username }}</span>
        </el-form-item>
        <el-form-item :label="t('admin.usersPage.newPasswordLabel')" required>
          <el-input v-model="resetPassword" type="password" show-password :placeholder="t('admin.usersPage.passwordPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">{{ t('admin.usersPage.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitReset">{{ t('admin.usersPage.confirmReset') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize, toLocaleDateTime as formatDate } from '@/utils/format'
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'
import NarrowCardList from '@/components/admin/NarrowCardList.vue'

const { t } = useI18n()
const { handleError } = useErrorHandler()

const saving = ref(false)

// 新建用户对话框
const createVisible = ref(false)
const createForm = reactive({
  username: '',
  email: '',
  nickname: '',
  password: '',
  role: 'user',
  quotaUnit: 0
})

// 重置密码对话框
const resetVisible = ref(false)
const resetTarget = ref<any>(null)
const resetPassword = ref('')

const openCreateDialog = () => {
  createForm.username = ''
  createForm.email = ''
  createForm.nickname = ''
  createForm.password = ''
  createForm.role = 'user'
  createForm.quotaUnit = 0
  createVisible.value = true
}

const submitCreate = async () => {
  if (!createForm.username || createForm.password.length < 6) {
    ElMessage.warning(t('admin.usersPage.createRequired'))
    return
  }
  saving.value = true
  try {
    const res = await adminApi.createUser({
      username: createForm.username,
      email: createForm.email || undefined,
      nickname: createForm.nickname || undefined,
      password: createForm.password,
      role: createForm.role,
      max_storage_quota: createForm.quotaUnit > 0 ? createForm.quotaUnit * 1024 * 1024 : 0
    })
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.usersPage.created'))
      createVisible.value = false
      await fetchUsers()
    } else {
      handleError(new Error(res.message || t('admin.usersPage.createFailed')))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    saving.value = false
  }
}

const openResetPassword = (user: any) => {
  resetTarget.value = user
  resetPassword.value = ''
  resetVisible.value = true
}

const submitReset = async () => {
  if (!resetTarget.value || resetPassword.value.length < 6) {
    ElMessage.warning(t('admin.usersPage.passwordTooShort'))
    return
  }
  saving.value = true
  try {
    const res = await adminApi.resetUserPassword(resetTarget.value.id, resetPassword.value)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.usersPage.passwordReset'))
      resetVisible.value = false
    } else {
      handleError(new Error(res.message || t('admin.usersPage.resetFailed')))
    }
  } catch (e: any) {
    handleError(e)
  } finally {
    saving.value = false
  }
}

const removeUser = async (user: any) => {
  try {
    await ElMessageBox.confirm(
      t('admin.usersPage.deleteConfirmBody', { name: user.username }),
      t('admin.usersPage.deleteConfirmTitle'),
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    const res = await adminApi.deleteUser(user.id)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success(t('admin.usersPage.deleted'))
      await fetchUsers()
    } else {
      handleError(new Error(res.message || t('admin.usersPage.deleteFailed')))
    }
  } catch (e: any) {
    handleError(e)
  }
}



const getStoragePercentage = (user: any): number => {
  const used = user.quota_used || user.total_storage || 0
  // 优先读用户实际配额：GET /admin/users 返回 quota_limit（thrift UserItem），
  // max_storage_quota 不存在于该响应（此前修错字段，实际仍是硬编码 1GB）
  const quota = user.quota_limit > 0 ? user.quota_limit : (user.max_storage_quota > 0 ? user.max_storage_quota : 1073741824)
  if (used <= 0 || quota <= 0) return 0
  const percentage = (used / quota) * 100
  // 保留两位小数：原始浮点会以全精度灌进 el-progress 文案（0.00594826...%）
  return Math.round(Math.min(percentage, 100) * 100) / 100
}

// ── 窄屏（≤768px）卡片字段 ──────────────────────────────────────────────────
// 标签**复用表格列的同一批 i18n key** ⇒ 宽窄两屏口径一致、不新增翻译。
const cardFields = computed(() => [
  { key: 'nickname', label: t('admin.nickname') },
  { key: 'status', label: t('admin.usersPage.colStatus') },
  { key: 'storage', label: t('admin.usersPage.colStorage') },
  { key: 'created_at', label: t('admin.registeredAt') },
])
const cardHead = (row: any) => row.username

const getStorageColor = (user: any): string => {
  const percentage = getStoragePercentage(user)
  if (percentage < 50) return '#67c23a'
  if (percentage < 80) return '#e6a23c'
  return '#f56c6c'
}

const { list: usersList, total, page, pageSize, loading, reload, handleSizeChange, handlePageChange } =
  useTableQuery<any>(async ({ page, page_size }) => {
    try {
      const res = await adminApi.getUsers({ page, page_size })
      if (res.code === 200) {
        // 后端 AdminUserList 返回 { items, total, page, page_size }
        if (res.data && Array.isArray(res.data.items)) {
          return { items: res.data.items, total: res.data.total ?? res.data.items.length }
        }
        if (res.data && Array.isArray((res.data as Record<string, unknown>).users)) {
          // 兼容历史响应结构
          const legacy = res.data as Record<string, unknown>
          const users = legacy.users as any[]
          const pg = legacy.pagination as { total?: number } | undefined
          return { items: users, total: pg?.total ?? users.length }
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

// 操作后刷新适配器（新建/编辑/删除后调用）
const fetchUsers = () => reload()

const toggleUserStatus = async (user: any) => {
  try {
    const isActive = user.status === 1 || user.status === 'active'
    const newStatus = isActive ? 0 : 1
    await ElMessageBox.confirm(
      isActive
        ? t('admin.usersPage.disableConfirmBody', { name: user.username })
        : t('admin.usersPage.enableConfirmBody', { name: user.username }),
      t('admin.usersPage.confirmTitle'),
      { type: 'warning' }
    )

    const res = await adminApi.updateUserStatus(user.id, newStatus)
    if (res.code === 200) {
      ElMessage.success(t('admin.usersPage.actionSuccess'))
      await fetchUsers()
    } else {
      handleError(new Error(res.message || t('admin.usersPage.actionFailed')))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('admin.usersPage.actionFailed'))
    }
  }
}

onMounted(() => {
  reload()
})
</script>

<style scoped>
.users-container {
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

.users-card {
  border-radius: var(--radius-xl);
  border: none;
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

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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
  transition: all 0.3s;
}

.refresh-btn:hover {
  box-shadow: var(--shadow-xs);
}

.users-table {
  margin-top: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  font-size: 16px;
  /* 窄视口下列宽钉在 min-width 时，flex 默认收缩会把头像挤成椭圆 */
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-email {
  font-size: 13px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.storage-text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
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
