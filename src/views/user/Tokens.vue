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
      class="tokens-table admin-table-wide"
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
      <el-table-column :label="t('user.tokens.status')" width="180">
        <template #default="{ row }">
          <el-tag v-if="row.revoked" size="small" type="danger">{{ t('user.tokens.revoked') }}</el-tag>
          <el-tag v-else-if="isExpired(row)" size="small" type="warning">{{ t('user.tokens.expired') }}</el-tag>
          <el-tag v-else size="small" type="success">{{ t('user.tokens.active') }}</el-tag>
          <!-- 权限范围（contracts v0.20.5）：贴在状态列旁，不另开一列
               （本表 8 列已 ~1210px，窄屏卡片形态才是主战场） -->
          <el-tag
            v-for="(tag, i) in scopeTagsOf(row)"
            :key="`scope-${i}`"
            size="small"
            type="info"
            class="scope-tag"
          >
            {{ tag.label }}
          </el-tag>
          <!-- 吊销时间（contracts v0.20.7 补齐）：撤销是**软撤销 + 审计留痕**
               （列表含已撤销项）⇒「什么时候被吊销的」是审计的关键信息。
               此前服务端只落库不回传 ⇒ 前端根本拿不到 ⇒ 做成**第二行小字**，
               不藏进 tooltip（审计信息不该靠 hover 才看得到）。 -->
          <div v-if="row.revoked && row.revoked_at" class="revoked-at">
            {{ t('user.tokens.revokedAt') }}: {{ row.revoked_at }}
          </div>
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

    <!-- 窄屏（≤1024px）卡片形态：本表 8 列合计 ~1210px（操作列 110px 还
         fixed="right"）⇒ 手机 / 折叠屏内屏 / 平板竖屏放不下 ⇒ 密钥名/前缀/状态
         等内容列被裁（Element Plus 横向滚动条在手机上几乎看不见）。
         表格与卡片**同时渲染**、纯 CSS 互斥（全局 .admin-table-wide / .narrow-cards）。 -->
    <NarrowCardList :rows="list" :fields="cardFields" :row-key="(row: ApiKeyItem) => row.id">
      <template #head="{ row }">
        <span>{{ row.name }}</span>
      </template>
      <template #prefix="{ row }">
        <code class="key-prefix">{{ row.prefix }}…</code>
      </template>
      <template #status="{ row }">
        <el-tag v-if="row.revoked" size="small" type="danger">{{ t('user.tokens.revoked') }}</el-tag>
        <el-tag v-else-if="isExpired(row)" size="small" type="warning">{{ t('user.tokens.expired') }}</el-tag>
        <el-tag v-else size="small" type="success">{{ t('user.tokens.active') }}</el-tag>
        <el-tag
          v-for="(tag, i) in scopeTagsOf(row)"
          :key="`scope-${i}`"
          size="small"
          type="info"
          class="scope-tag"
        >
          {{ tag.label }}
        </el-tag>
        <div v-if="row.revoked && row.revoked_at" class="revoked-at">
          {{ t('user.tokens.revokedAt') }}: {{ row.revoked_at }}
        </div>
      </template>
      <template #last_used_at="{ row }">
        {{ formatTime(row.last_used_at, t('user.tokens.neverUsed')) }}
      </template>
      <template #last_used_ip="{ row }">{{ row.last_used_ip || '-' }}</template>
      <template #expires_at="{ row }">{{ formatTime(row.expires_at, t('user.tokens.never')) }}</template>
      <template #created_at="{ row }">{{ formatTime(row.created_at, '-') }}</template>
      <template #actions="{ row }">
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
    </NarrowCardList>

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
        <el-form-item :label="t('user.tokens.scopeLabel')">
          <el-select
            v-model="createForm.scopes"
            multiple
            style="width: 100%"
            :placeholder="t('user.tokens.scopePlaceholder')"
          >
            <el-option :label="t('user.tokens.scopeAdmin')" value="admin" />
            <el-option :label="t('user.tokens.scopeUser')" value="user" />
            <el-option :label="t('user.tokens.scopeShare')" value="share" />
          </el-select>
        </el-form-item>
        <el-alert
          :title="t('user.tokens.expiryHint')"
          type="info"
          :closable="false"
          show-icon
        />
        <el-alert
          :title="t('user.tokens.scopeHint')"
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
import NarrowCardList from '@/components/admin/NarrowCardList.vue'

const { t } = useI18n()

const loading = ref(false)
const list = ref<ApiKeyItem[]>([])

// 窄屏卡片字段策展（标签复用表格列的同一批 i18n key ⇒ 宽窄两屏口径一致）
const cardFields = computed(() => [
  { key: 'prefix', label: t('user.tokens.prefix') },
  { key: 'status', label: t('user.tokens.status') },
  { key: 'last_used_at', label: t('user.tokens.lastUsed') },
  { key: 'last_used_ip', label: t('user.tokens.lastIP') },
  { key: 'expires_at', label: t('user.tokens.expiresAt') },
  { key: 'created_at', label: t('user.tokens.createdAt') },
])

const activeCount = computed(() => list.value.filter((k) => !k.revoked && !isExpired(k)).length)

const createVisible = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', expiresInDays: 0, scopes: [] as string[] })

const resultVisible = ref(false)
const createdKey = ref('')
const createdKeyId = ref(0)
const copied = ref(false)

// scopeOptions 权限范围取值（与服务端 pkg/middleware 的词汇表同款）。
const scopeOptions = [
  { value: 'admin', labelKey: 'user.tokens.scopeAdmin' },
  { value: 'user', labelKey: 'user.tokens.scopeUser' },
  { value: 'share', labelKey: 'user.tokens.scopeShare' },
]

/**
 * 该 Key 的权限范围标签。
 *
 * **空范围 = 全量**（与服务端一致：老 Key 无需重建）⇒ 显式标一个「全量」标签，
 * 否则用户看到空白会以为「没配范围 = 什么都不能干」。
 */
const scopeTagsOf = (row: ApiKeyItem) => {
  const scopes = row.scopes ?? []
  if (scopes.length === 0) {
    return [{ label: t('user.tokens.scopeFull') }]
  }
  return scopes.map((v) => {
    const opt = scopeOptions.find((o) => o.value === v)
    return { label: opt ? t(opt.labelKey) : v }
  })
}

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
  // 每次打开都重置为「全量」（scopes 空数组 = 全量，与既有 Key 同口径）
  createForm.value = { name: '', expiresInDays: 0, scopes: [] }
  createVisible.value = true
}

const submitCreate = async () => {
  creating.value = true
  try {
    const payload: { name?: string; expires_in_days?: number; scopes?: string[] } = {}
    if (createForm.value.name.trim()) payload.name = createForm.value.name.trim()
    if (createForm.value.expiresInDays > 0) payload.expires_in_days = createForm.value.expiresInDays
    // 权限范围：空数组 = 全量（服务端口径）；显式传空数组与不传等价，
    // 这里始终传 ⇒ 前端与后端对「没选」的理解是同一个。
    payload.scopes = createForm.value.scopes
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
    // 吊销失败 ≠ 加载失败（2026-10-26 审计）：复用 loadFailed 会弹出
    // 「加载 API Key 列表失败」⇒ 与用户刚做的操作完全无关，看不出哪一步失败。
    ElMessage.error(t('user.tokens.revokeFailed'))
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
    // 同上：批量吊销失败用 revokeFailed，不用 loadFailed
    ElMessage.error(t('user.tokens.revokeFailed'))
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
/* 吊销时间（审计信息）：弱化但**始终可见**（不做成 tooltip） */
.revoked-at {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}
</style>
