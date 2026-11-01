<template>
  <div class="activities-container">
    <el-card shadow="never" class="activities-card">
      <div class="card-header">
        <div class="header-title">
          <h2>{{ t('admin.activities') }}</h2>
          <p>{{ t('admin.activitiesPage.subtitle') }}</p>
        </div>
        <div class="header-actions">
          <el-select v-model="filterSource" :placeholder="t('admin.activitiesPage.sourcePlaceholder')" style="width: 120px" @change="resetAndLoad">
            <el-option :label="t('admin.activitiesPage.sourceAll')" value="" />
            <el-option :label="t('admin.activitiesPage.sourceTransfer')" value="transfer" />
            <el-option :label="t('admin.activitiesPage.sourceAudit')" value="audit" />
          </el-select>
          <el-select
            v-model="filterAction"
            :placeholder="t('admin.activitiesPage.actionPlaceholder')"
            clearable
            style="width: 150px"
            :disabled="filterSource === 'transfer'"
            @change="resetAndLoad"
          >
            <el-option :label="t('admin.activitiesPage.actionConfig')" value="config.update" />
            <el-option :label="t('admin.activitiesPage.actionUser')" value="user." />
            <el-option :label="t('admin.activitiesPage.actionFile')" value="file." />
            <el-option :label="t('admin.activitiesPage.actionMaintenance')" value="maintenance." />
          </el-select>
          <el-select
            v-model="filterOperation"
            :placeholder="t('admin.activitiesPage.operationPlaceholder')"
            clearable
            style="width: 120px"
            :disabled="filterSource === 'audit'"
            @change="resetAndLoad"
          >
            <el-option :label="t('admin.activitiesPage.opUpload')" value="upload" />
            <el-option :label="t('admin.activitiesPage.opDownload')" value="download" />
            <el-option :label="t('admin.activitiesPage.opDelete')" value="delete" />
            <el-option :label="t('admin.activitiesPage.opView')" value="view" />
          </el-select>
          <el-button @click="resetAndLoad" :loading="loading">
            <el-icon><Refresh /></el-icon>
            {{ t('admin.activitiesPage.refresh') }}
          </el-button>
        </div>
      </div>

      <el-divider />

      <el-table :data="rows" v-loading="loading" class="admin-table-wide activities-table">
        <el-table-column :label="t('admin.activitiesPage.colTime')" width="170">
          <template #default="{ row }">
            {{ formatDate(row.time) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.activitiesPage.colSource')" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.source === 'transfer' ? 'primary' : 'info'" effect="plain">
              {{ row.source === 'transfer' ? t('admin.activitiesPage.sourceTransfer') : t('admin.activitiesPage.sourceAudit') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.activitiesPage.colActor')" width="140">
          <template #default="{ row }">
            <el-tag size="small" :type="row.actor === 'system' ? 'info' : 'primary'" effect="plain">
              {{ row.actor || 'system' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.activitiesPage.colAction')" width="200">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :title="row.action">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.activitiesPage.colTarget')" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ row.target }}</template>
        </el-table-column>
        <el-table-column prop="ip" :label="t('admin.activitiesPage.colIp')" width="140" />
        <el-table-column :label="t('admin.activitiesPage.colResult')" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">
              {{ row.success ? t('admin.activitiesPage.resultSuccess') : t('admin.activitiesPage.resultFailed') }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 窄屏（≤768px）卡片形态：本表 7 列合计 ~1060px ⇒ 390px 视口下内容列全被裁。
           策展=动作(头部) + 来源/执行者/对象/IP/结果/时间。 -->
      <NarrowCardList :rows="rows" :fields="cardFields" :head="cardHead">
        <template #source="{ row }">
          <el-tag size="small" :type="row.source === 'transfer' ? 'primary' : 'info'" effect="plain">
            {{ row.source === 'transfer' ? t('admin.activitiesPage.sourceTransfer') : t('admin.activitiesPage.sourceAudit') }}
          </el-tag>
        </template>
        <template #actor="{ row }">
          <el-tag size="small" :type="row.actor === 'system' ? 'info' : 'primary'" effect="plain">{{ row.actor || 'system' }}</el-tag>
        </template>
        <template #action="{ row }">
          <el-tag size="small" effect="plain" :title="row.action">{{ actionLabel(row.action) }}</el-tag>
        </template>
        <template #target="{ row }">{{ row.target }}</template>
        <template #ip="{ row }">{{ row.ip }}</template>
        <template #result="{ row }">
          <el-tag :type="row.success ? 'success' : 'danger'" size="small">
            {{ row.success ? t('admin.activitiesPage.resultSuccess') : t('admin.activitiesPage.resultFailed') }}
          </el-tag>
        </template>
        <template #time="{ row }">{{ formatDate(row.time) }}</template>
      </NarrowCardList>

      <div class="stream-footer">
        <span class="stream-count">{{ t('admin.activitiesPage.loadedCount', { n: rows.length }) }}{{ totalCountLabel }}</span>
        <el-button v-if="hasMore" :loading="loading" @click="loadMore">{{ t('admin.activitiesPage.loadMore') }}</el-button>
        <span v-else class="stream-end">{{ t('admin.activitiesPage.streamEnd') }}</span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { toLocaleDateTime as formatDate } from '@/utils/format'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useErrorHandler } from '@/composables/useErrorHandler'
import NarrowCardList from '@/components/admin/NarrowCardList.vue'

const { t } = useI18n()
const { handleError } = useErrorHandler()

// 活动聚合流（2026-10-12 对标上游 activities 单一活动流）：
// 传输记录（/admin/logs/transfer）与管理审计（/admin/activities）合并为一张
// 时间线。跨两源无服务端统一分页，采用"每源各取一页、归一合并、增量加载更多"
// 的流式模型（高频回溯场景：先看最近，按需下翻）。
interface ActivityRow {
  time: string
  source: 'transfer' | 'audit'
  actor: string
  action: string
  target: string
  ip: string
  success: boolean
}

// ── 窄屏（≤768px）卡片字段 ──────────────────────────────────────────────────
// 标签**复用表格列的同一批 i18n key** ⇒ 宽窄两屏口径一致、不新增翻译。
const cardFields = computed(() => [
  { key: 'source', label: t('admin.activitiesPage.colSource') },
  { key: 'actor', label: t('admin.activitiesPage.colActor') },
  { key: 'action', label: t('admin.activitiesPage.colAction') },
  { key: 'target', label: t('admin.activitiesPage.colTarget') },
  { key: 'ip', label: t('admin.activitiesPage.colIp') },
  { key: 'result', label: t('admin.activitiesPage.colResult') },
  { key: 'time', label: t('admin.activitiesPage.colTime') },
])
const cardHead = (row: ActivityRow) => actionLabel(row.action)

const PER_FETCH = 25

const rows = ref<ActivityRow[]>([])
const loading = ref(false)
const filterSource = ref('') // ''=全部 / transfer / audit
const filterAction = ref('')
const filterOperation = ref('')
const auditPage = ref(1)
const transferPage = ref(1)
const auditTotal = ref(0)
const transferTotal = ref(0)
const auditDone = ref(false)
const transferDone = ref(false)

const hasMore = computed(() => {
  if (filterSource.value === 'transfer') return !transferDone.value
  if (filterSource.value === 'audit') return !auditDone.value
  return !auditDone.value || !transferDone.value
})

const totalCountLabel = computed(() => {
  const total = (filterSource.value === 'transfer' ? 0 : auditTotal.value) +
    (filterSource.value === 'audit' ? 0 : transferTotal.value)
  return total > 0 ? t('admin.activitiesPage.totalLabel', { n: total }) : ''
})

const timeMs = (t: string) => {
  const ms = Date.parse((t || '').replace(' ', 'T'))
  return Number.isFinite(ms) ? ms : 0
}

// 审计/传输操作码 → 本地化标签（码表对齐 core audit(ctx, "<op>", ...) 全量；
// 未收录码原样展示并在 title 悬浮保留原始码,便于与日志/工单对照）
const ACTION_KEYS: Record<string, string> = {
  upload: 'admin.activitiesPage.op.upload',
  download: 'admin.activitiesPage.op.download',
  'p2p.send': 'admin.activitiesPage.op.p2pSend',
  'p2p.upload_send': 'admin.activitiesPage.op.p2pUploadSend',
  'p2p.recv': 'admin.activitiesPage.op.p2pRecv',
  'p2p.cancel': 'admin.activitiesPage.op.p2pCancel',
  'p2p.publish': 'admin.activitiesPage.op.p2pPublish',
  'p2p.invite': 'admin.activitiesPage.op.p2pInvite',
  'p2p.invite.accept': 'admin.activitiesPage.op.p2pInviteAccept',
  'p2p.invite.push': 'admin.activitiesPage.op.p2pInvitePush',
  'file.update': 'admin.activitiesPage.op.fileUpdate',
  'file.delete': 'admin.activitiesPage.op.fileDelete',
  'file.block': 'admin.activitiesPage.op.fileBlock',
  'file.unblock': 'admin.activitiesPage.op.fileUnblock',
  'file.status': 'admin.activitiesPage.op.fileStatus',
  'file.purge': 'admin.activitiesPage.op.filePurge',
  'file.restore': 'admin.activitiesPage.op.fileRestore',
  'file.batch_delete': 'admin.activitiesPage.op.fileBatchDelete',
  'file.batch_extend': 'admin.activitiesPage.op.fileBatchExtend',
  'user.create': 'admin.activitiesPage.op.userCreate',
  'user.update': 'admin.activitiesPage.op.userUpdate',
  'user.delete': 'admin.activitiesPage.op.userDelete',
  'user.reset_password': 'admin.activitiesPage.op.userResetPassword',
  'user.update_status': 'admin.activitiesPage.op.userUpdateStatus',
  'config.update': 'admin.activitiesPage.op.configUpdate',
  'maintenance.clean_expired_files': 'admin.activitiesPage.op.maintenanceCleanExpired',
  'maintenance.clean_incomplete_uploads': 'admin.activitiesPage.op.maintenanceCleanIncomplete',
  'notify.created': 'admin.activitiesPage.op.notifyCreated',
}

const actionLabel = (action: string): string => {
  if (ACTION_KEYS[action]) return t(ACTION_KEYS[action])
  // 动态形态 file.batch-<status>（批量启用/禁用）
  if (action.startsWith('file.batch-')) return t('admin.activitiesPage.op.fileBatchStatus')
  return action
}

const auditRow = (r: any): ActivityRow => ({
  time: r.CreatedAt || r.created_at || '',
  source: 'audit',
  actor: r.actor_name || 'system',
  action: r.action || '',
  target: r.target || '',
  ip: r.ip || '',
  success: r.success !== false
})

const transferRow = (r: any): ActivityRow => ({
  time: r.created_at || r.CreatedAt || '',
  source: 'transfer',
  actor: r.username || t('admin.activitiesPage.anonymousActor'),
  action: r.operation || '',
  target: [r.file_name, r.file_code ? `#${r.file_code}` : ''].filter(Boolean).join(' ') || '-',
  ip: r.ip || '',
  success: true // 传输日志只记录成功落账的传输
})

const fetchAudit = async () => {
  try {
    const res = await adminApi.getActivities({
      page: auditPage.value,
      page_size: PER_FETCH,
      action: filterAction.value || undefined
    })
    if (res.code === 200) {
      const data: any = res.data
      const items: any[] = data?.list || []
      auditTotal.value = data?.total ?? 0
      rows.value.push(...items.map(auditRow))
      if (items.length < PER_FETCH) auditDone.value = true
      else auditPage.value++
    }
  } catch (e) {
    handleError(e)
    auditDone.value = true
  }
}

const fetchTransfer = async () => {
  try {
    const res = await adminApi.getTransferLogsList({
      page: transferPage.value,
      page_size: PER_FETCH,
      operation: filterOperation.value || undefined
    })
    if (res.code === 200) {
      const data: any = res.data
      const items: any[] = data?.items || (Array.isArray(data) ? data : [])
      transferTotal.value = data?.total ?? items.length
      rows.value.push(...items.map(transferRow))
      if (items.length < PER_FETCH) transferDone.value = true
      else transferPage.value++
    }
  } catch (e) {
    handleError(e)
    transferDone.value = true
  }
}

const sortRows = () => {
  rows.value.sort((a, b) => timeMs(b.time) - timeMs(a.time))
}

const loadMore = async () => {
  loading.value = true
  try {
    const jobs: Promise<void>[] = []
    if (filterSource.value !== 'transfer' && !auditDone.value) jobs.push(fetchAudit())
    if (filterSource.value !== 'audit' && !transferDone.value) jobs.push(fetchTransfer())
    await Promise.all(jobs)
    sortRows()
  } finally {
    loading.value = false
  }
}

const resetAndLoad = () => {
  rows.value = []
  auditPage.value = 1
  transferPage.value = 1
  auditDone.value = false
  transferDone.value = false
  auditTotal.value = 0
  transferTotal.value = 0
  loadMore()
}

onMounted(resetAndLoad)
</script>

<style scoped>
.activities-container { animation: fadeIn 0.5s ease-in; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.activities-card { border-radius: var(--radius-xl); border: none; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.header-title h2 { margin: 0 0 4px; font-size: 24px; font-weight: 600; color: var(--color-text-primary); }
.header-title p { margin: 0; font-size: 14px; color: var(--color-text-secondary); }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.stream-footer { margin-top: 20px; display: flex; justify-content: center; align-items: center; gap: 16px; }
.stream-count { font-size: 13px; color: var(--color-text-tertiary); }
.stream-end { font-size: 13px; color: var(--color-text-tertiary); }
:deep(.el-table th) { background: var(--color-muted) !important; font-weight: 600; }
</style>
