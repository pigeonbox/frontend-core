<template>
  <div class="tokens-page">
    <PageHeader :title="t('user.tokens.title')" :desc="t('user.tokens.subtitle')">
      <template #actions>
        <el-button
          :disabled="activeCount === 0"
          type="danger"
          plain
          @click="revokeAll"
        >
          <el-icon><Delete /></el-icon>
          {{ t('user.tokens.revokeAll') }}
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          {{ t('user.tokens.create') }}
        </el-button>
      </template>
    </PageHeader>

    <el-table
      v-loading="loading"
      :data="list"
      style="width: 100%"
      empty-text=" "
      class="tokens-table"
    >
      <el-table-column :label="t('user.tokens.name')" min-width="160">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.tokens.prefix')" width="150">
        <template #default="{ row }">
          <code class="key-prefix">{{ row.prefix }}…</code>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.tokens.status')" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.revoked" size="small" type="danger">{{ t('user.tokens.revoked') }}</el-tag>
          <el-tag v-else-if="isExpired(row)" size="small" type="warning">{{ t('user.tokens.expired') }}</el-tag>
          <el-tag v-else size="small" type="success">{{ t('user.tokens.active') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.tokens.lastUsed')" width="180">
        <template #default="{ row }">
          <span>{{ formatTime(row.last_used_at, t('user.tokens.neverUsed')) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.tokens.lastIP')" width="150">
        <template #default="{ row }">
          <span>{{ row.last_used_ip || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.tokens.expiresAt')" width="180">
        <template #default="{ row }">
          <span>{{ formatTime(row.expires_at, t('user.tokens.never')) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.tokens.createdAt')" width="180">
        <template #default="{ row }">
          <span>{{ formatTime(row.created_at, '-') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('user.tokens.actions')" width="110" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="!row.revoked"
            size="small"
            type="danger"
            plain
            @click="revoke(row)"
          >
            {{ t('user.tokens.revoke') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 签发对话框 -->
    <el-dialog
      v-model="createVisible"
      :title="t('user.tokens.create')"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px">
        <el-form-item :label="t('user.tokens.name')">
          <el-input
            v-model="createForm.name"
            :placeholder="t('user.tokens.namePlaceholder')"
            maxlength="100"
          />
        </el-form-item>
        <el-form-item :label="t('user.tokens.expiryLabel')">
          <el-select v-model="createForm.expiresInDays" style="width: 100%">
            <el-option :label="t('user.tokens.never')" :value="0" />
            <el-option :label="t('user.tokens.days30')" :value="30" />
            <el-option :label="t('user.tokens.days90')" :value="90" />
            <el-option :label="t('user.tokens.days365')" :value="365" />
          </el-select>
        </el-form-item>
        <el-alert
          :title="t('user.tokens.expiryHint')"
          type="info"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('user.tokens.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">
          {{ t('user.tokens.createSubmit') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 明文一次性展示对话框 -->
    <el-dialog
      v-model="resultVisible"
      :title="t('user.tokens.keyResultTitle')"
      width="480px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <el-alert
        :title="t('user.tokens.keyOnceWarning')"
        type="error"
        :closable="false"
        show-icon
      />
      <div class="plain-key-box">
        <code>{{ createdKey }}</code>
      </div>
      <p class="docs-hint">{{ t('user.tokens.docsHint') }}</p>
      <template #footer>
        <el-button @click="copyKey">
          <el-icon><CopyDocument /></el-icon>
          {{ copied ? t('user.tokens.copied') : t('user.tokens.copy') }}
        </el-button>
        <el-button type="primary" @click="finishCreate">
          {{ t('user.tokens.iSaved') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Plus, CopyDocument, Delete } from '@element-plus/icons-vue'
import { userApi, type ApiKeyItem } from '@/api/user'
import { copyToClipboard } from '@/utils/clipboard'
import PageHeader from '@/components/data/PageHeader.vue'

const { t } = useI18n()

const loading = ref(false)
const list = ref<ApiKeyItem[]>([])

const activeCount = computed(() => list.value.filter((k) => !k.revoked && !isExpired(k)).length)

const createVisible = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', expiresInDays: 0 })

const resultVisible = ref(false)
const createdKey = ref('')
const createdKeyId = ref(0)
const copied = ref(false)

const isExpired = (row: ApiKeyItem) =>
  !!row.expires_at && new Date(row.expires_at).getTime() < Date.now()

const formatTime = (v: string | null, fallback: string) =>
  v ? new Date(v).toLocaleString() : fallback

const loadList = async () => {
  loading.value = true
  try {
    const res = await userApi.listApiKeys()
    list.value = res.keys
  } catch {
    ElMessage.error(t('user.tokens.loadFailed'))
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  createForm.value = { name: '', expiresInDays: 0 }
  createVisible.value = true
}

const submitCreate = async () => {
  creating.value = true
  try {
    const payload: { name?: string; expires_in_days?: number } = {}
    if (createForm.value.name.trim()) payload.name = createForm.value.name.trim()
    if (createForm.value.expiresInDays > 0) payload.expires_in_days = createForm.value.expiresInDays
    const res = await userApi.createApiKey(payload)
    createdKey.value = res.data.key
    createdKeyId.value = res.data.api_key.id
    copied.value = false
    createVisible.value = false
    resultVisible.value = true
  } catch {
    ElMessage.error(t('user.tokens.createFailed'))
  } finally {
    creating.value = false
  }
}

const copyKey = async () => {
  const key = createdKey.value
  const ok = await copyToClipboard(key)
  if (ok) {
    copied.value = true
  } else {
    // 最终兜底：明文已 user-select:all，提示手动全选复制
    ElMessage.info(t('user.tokens.copyManually'))
  }
}

const finishCreate = () => {
  resultVisible.value = false
  loadList()
}

const revoke = async (row: ApiKeyItem) => {
  try {
    await ElMessageBox.confirm(
      t('user.tokens.revokeWarning', { name: row.name }),
      t('user.tokens.revokeConfirmTitle'),
      { type: 'warning', confirmButtonText: t('user.tokens.revoke'), cancelButtonText: t('user.tokens.cancel') },
    )
  } catch {
    return
  }
  try {
    await userApi.revokeApiKey(row.id)
    ElMessage.success(t('user.tokens.revokeSuccess'))
    loadList()
  } catch {
    ElMessage.error(t('user.tokens.loadFailed'))
  }
}

const revokeAll = async () => {
  const count = activeCount.value
  if (count === 0) {
    ElMessage.info(t('user.tokens.noActiveKeys'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('user.tokens.revokeAllWarning', { count }),
      t('user.tokens.revokeAllConfirmTitle'),
      { type: 'warning', confirmButtonText: t('user.tokens.revokeAll'), cancelButtonText: t('user.tokens.cancel') },
    )
  } catch {
    return
  }
  try {
    const res = await userApi.revokeAllApiKeys()
    ElMessage.success(t('user.tokens.revokeAllSuccess', { count: res.data.revoked }))
    loadList()
  } catch {
    ElMessage.error(t('user.tokens.loadFailed'))
  }
}

onMounted(loadList)
</script>

<style scoped>
.tokens-page {
  padding: 0;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.page-desc {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.key-prefix {
  font-family: monospace;
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
}
.plain-key-box {
  margin-top: 14px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  word-break: break-all;
}
.plain-key-box code {
  font-family: monospace;
  font-size: 14px;
  user-select: all;
}
.docs-hint {
  margin: 10px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
