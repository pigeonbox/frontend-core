<template>
  <div class="users-container">
    <el-card shadow="never" class="users-card">
      <div class="card-header">
        <div class="header-title">
          <h2>用户管理</h2>
          <p>管理系统中的所有用户账户</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon>
            新建用户
          </el-button>
          <el-button @click="reload()" :loading="loading" class="refresh-btn">
            <el-icon><Refresh /></el-icon>
            刷新数据
          </el-button>
        </div>
      </div>

      <el-divider />

      <el-table 
        :data="usersList" 
        v-loading="loading"
        class="users-table"
      >
        <el-table-column label="用户信息" min-width="200">
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
                    管理员
                  </el-tag>
                </div>
                <div class="user-email">{{ row.email || '未绑定邮箱' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="昵称" width="120">
          <template #default="{ row }">
            {{ row.nickname || '—' }}
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.status === 1 || row.status === 'active' ? 'success' : 'danger'"
              effect="light"
            >
              {{ row.status === 1 || row.status === 'active' ? '正常' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="存储使用" width="140" align="center">
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

        <el-table-column prop="created_at" label="注册时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="240" align="center">
          <template #default="{ row }">
            <el-button
              @click="toggleUserStatus(row)"
              :type="row.status === 1 || row.status === 'active' ? 'warning' : 'success'"
              size="small"
              round
            >
              {{ row.status === 1 || row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
            <el-button @click="openResetPassword(row)" size="small" round>重置密码</el-button>
            <el-button @click="removeUser(row)" type="danger" size="small" round plain>删除</el-button>
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

    <!-- 新建用户 -->
    <el-dialog v-model="createVisible" title="新建用户" width="460px">
      <el-form :model="createForm" label-width="90px">
        <el-form-item label="用户名" required>
          <el-input v-model="createForm.username" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="createForm.email" placeholder="选填" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="createForm.nickname" placeholder="选填" />
        </el-form-item>
        <el-form-item label="初始密码" required>
          <el-input v-model="createForm.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="createForm.role" style="width: 100%">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item label="存储配额">
          <el-select v-model="createForm.quotaUnit" style="width: 100%">
            <el-option label="不限（用系统默认）" :value="0" />
            <el-option label="100 MB" :value="100" />
            <el-option label="1 GB" :value="1024" />
            <el-option label="10 GB" :value="10240" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetVisible" title="重置密码" width="420px">
      <el-form label-width="90px">
        <el-form-item label="用户">
          <span>{{ resetTarget?.username }}</span>
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="resetPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitReset">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize, toLocaleDateTime as formatDate } from '@/utils/format'
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useTableQuery } from '@/composables/useTableQuery'
import { useErrorHandler } from '@/composables/useErrorHandler'

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
    ElMessage.warning('用户名与至少 6 位的密码必填')
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
      ElMessage.success('用户已创建')
      createVisible.value = false
      await fetchUsers()
    } else {
      handleError(new Error(res.message || '创建失败'))
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
    ElMessage.warning('密码至少 6 位')
    return
  }
  saving.value = true
  try {
    const res = await adminApi.resetUserPassword(resetTarget.value.id, resetPassword.value)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success('密码已重置')
      resetVisible.value = false
    } else {
      handleError(new Error(res.message || '重置失败'))
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
      `确定要删除用户 ${user.username} 吗？其分享记录将一并移入回收站。`,
      '确认删除',
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    const res = await adminApi.deleteUser(user.id)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success('已删除')
      await fetchUsers()
    } else {
      handleError(new Error(res.message || '删除失败'))
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
      `确定要${isActive ? '禁用' : '启用'}用户 ${user.username} 吗？`,
      '确认操作',
      { type: 'warning' }
    )

    const res = await adminApi.updateUserStatus(user.id, newStatus)
    if (res.code === 200) {
      ElMessage.success('操作成功')
      await fetchUsers()
    } else {
      handleError(new Error(res.message || '操作失败'))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
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
