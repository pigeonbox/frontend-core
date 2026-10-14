// P2pTransfer.vue — 设备直传操作页（P2a，对称节点 spec §8）。
// 发送(白名单路径→口令)/接收(口令→收件区)/任务列表(轮询+取消+发布为分享)。
// 引导态优先级：多副本禁用 > 二进制缺失 > 未启用(链到配置页) > 正常。
<template>
  <div class="p2p-page">
    <!-- 引导态 -->
    <el-card v-if="!statusLoaded" class="p2p-card" v-loading="true" />
    <el-card v-else-if="status && !status.deploy_allowed" class="p2p-card">
      <el-empty :description="t('admin.p2p.notStandalone')" />
    </el-card>
    <el-card v-else-if="status && !status.available" class="p2p-card">
      <el-empty :description="t('admin.p2p.binaryMissing')" />
    </el-card>
    <el-card v-else-if="status && !status.enabled" class="p2p-card">
      <el-empty>
        <template #description>
          {{ t('admin.p2p.disabledHint') }}
        </template>
        <el-button type="primary" @click="goConfig">{{ t('admin.p2p.goConfig') }}</el-button>
      </el-empty>
    </el-card>

    <template v-else-if="status">
      <!-- 状态横幅 -->
      <el-card class="p2p-card">
        <div class="status-row">
          <el-tag type="success" effect="dark">{{ t('admin.p2p.statusOn') }}</el-tag>
          <span class="status-item">{{ t('admin.p2p.registry') }}: {{ status.registry_url }}</span>
          <span class="status-item">{{ t('admin.p2p.inbox') }}: {{ formatBytes(status.inbox_used) }} / {{ formatBytes(status.inbox_quota) }}</span>
          <span class="status-item dim">p2pc: {{ status.binary_path }}</span>
        </div>
      </el-card>

      <el-row :gutter="16">
        <!-- 发送 -->
        <el-col :xs="24" :md="12">
          <el-card class="p2p-card">
            <template #header>{{ t('admin.p2p.sendTitle') }}</template>
            <el-input
              v-model="sendPathsText"
              type="textarea"
              :rows="4"
              :placeholder="t('admin.p2p.sendPathsPlaceholder')"
            />
            <div class="card-actions">
              <el-button type="primary" :loading="sending" @click="doSend">{{ t('admin.p2p.sendBtn') }}</el-button>
              <span class="field-hint">{{ t('admin.p2p.sendHint') }}</span>
            </div>
          </el-card>
        </el-col>
        <!-- 接收 -->
        <el-col :xs="24" :md="12">
          <el-card class="p2p-card">
            <template #header>{{ t('admin.p2p.recvTitle') }}</template>
            <el-input
              v-model="recvCode"
              :placeholder="t('admin.p2p.recvCodePlaceholder')"
              maxlength="14"
              @input="recvCode = formatCode(recvCode)"
            />
            <div class="card-actions">
              <el-button type="primary" :loading="recving" @click="doRecv">{{ t('admin.p2p.recvBtn') }}</el-button>
              <span class="field-hint">{{ t('admin.p2p.recvHint') }}</span>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 待收邀请(P3:实例间推送,免口令交接) -->
      <el-card class="p2p-card" v-if="invites.length > 0">
        <template #header>{{ t('admin.p2p.invitesTitle') }}</template>
        <div v-for="iv in invites" :key="iv.id" class="invite-row">
          <code class="task-code">{{ iv.code }}</code>
          <span class="invite-from">{{ t('admin.p2p.inviteFrom') }}: {{ iv.from_name || t('admin.p2p.inviteUnknown') }}</span>
          <span class="dim" v-if="iv.note">「{{ iv.note }}」</span>
          <span class="dim">{{ t('admin.p2p.inviteExpires', { n: Math.max(0, Math.floor(iv.expires_in / 60)) }) }}</span>
          <el-button size="small" type="primary" @click="acceptInvite(iv)">{{ t('admin.p2p.inviteAccept') }}</el-button>
        </div>
      </el-card>

      <!-- 任务列表 -->
      <el-card class="p2p-card">
        <template #header>
          <div class="tasks-header">
            <span>{{ t('admin.p2p.tasksTitle') }}</span>
            <el-button size="small" text @click="fetchTasks">{{ t('common.refresh') }}</el-button>
          </div>
        </template>
        <el-table :data="tasks" size="small" v-loading="tasksLoading">
          <el-table-column :label="t('admin.p2p.colKind')" width="90">
            <template #default="{ row }">
              <el-tag :type="row.kind === 'send' ? 'warning' : 'primary'" size="small">
                {{ row.kind === 'send' ? t('admin.p2p.kindSend') : t('admin.p2p.kindRecv') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.p2p.colCode')" min-width="170">
            <template #default="{ row }">
              <template v-if="row.code">
                <code class="task-code">{{ row.code }}</code>
                <el-button size="small" text @click="copyCode(row.code)">{{ t('common.copy') }}</el-button>
                <el-button v-if="row.kind === 'send'" size="small" text type="primary" @click="openPush(row)">
                  {{ t('admin.p2p.pushBtn') }}
                </el-button>
              </template>
              <span v-else class="dim">…</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.p2p.colState')" width="110">
            <template #default="{ row }">
              <el-tag :type="stateTagType(row.state)" size="small">{{ stateLabel(row.state) }}<template v-if="row.state === 'retrying' && row.attempts > 0">({{ row.attempts }})</template></el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.p2p.colBytes')" width="110">
            <template #default="{ row }">{{ formatBytes(row.bytes_done) }}</template>
          </el-table-column>
          <el-table-column :label="t('admin.p2p.colError')" min-width="180">
            <template #default="{ row }">
              <span class="error-text">{{ row.error }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.p2p.colCreated')" width="170">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="180" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.state === 'waiting' || row.state === 'running'"
                size="small"
                type="danger"
                text
                @click="doCancel(row)"
              >{{ t('common.cancel') }}</el-button>
              <el-button
                v-if="row.kind === 'recv' && row.state === 'done'"
                size="small"
                type="primary"
                text
                @click="openPublish(row)"
              >{{ t('admin.p2p.publishBtn') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <!-- 发布为分享对话框 -->
    <el-dialog v-model="publishVisible" :title="t('admin.p2p.publishTitle')" width="460px">
      <el-form label-width="110px">
        <el-form-item :label="t('admin.p2p.publishExpire')">
          <el-input-number v-model="publishForm.expire_value" :min="1" :max="365" style="width: 140px" />
          <span class="field-hint">{{ t('admin.p2p.publishExpireUnit') }}</span>
        </el-form-item>
        <el-form-item :label="t('admin.p2p.publishPassword')">
          <el-switch v-model="publishForm.require_auth" />
        </el-form-item>
        <el-form-item v-if="publishForm.require_auth" :label="t('admin.p2p.publishPasswordValue')">
          <el-input v-model="publishForm.password" type="password" show-password style="width: 220px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="publishing" @click="doPublish">{{ t('admin.p2p.publishConfirm') }}</el-button>
      </template>
    </el-dialog>
    <!-- 推送口令到实例(P3) -->
    <el-dialog v-model="pushVisible" :title="t('admin.p2p.pushTitle')" width="460px">
      <el-form label-width="110px">
        <el-form-item :label="t('admin.p2p.pushTarget')">
          <el-input v-model="pushForm.target_url" :placeholder="t('admin.p2p.pushTargetPlaceholder')" style="width: 320px" />
          <span class="field-hint">{{ t('admin.p2p.pushTargetHint') }}</span>
        </el-form-item>
        <el-form-item :label="t('admin.p2p.pushNote')">
          <el-input v-model="pushForm.note" maxlength="200" :placeholder="t('admin.p2p.pushNotePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pushVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="pushing" @click="doPush">{{ t('admin.p2p.pushConfirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { p2pApi, type P2pTask, type P2pStatus, type P2pInvite } from '@/api/p2p'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()
const router = useRouter()

const status = ref<P2pStatus | null>(null)
const statusLoaded = ref(false)
const tasks = ref<P2pTask[]>([])
const tasksLoading = ref(false)

const sendPathsText = ref('')
const sending = ref(false)
const recvCode = ref('')
const recving = ref(false)

const publishVisible = ref(false)
const publishing = ref(false)
const publishTaskId = ref('')
const publishForm = reactive({ expire_value: 7, expire_style: 'day', require_auth: false, password: '' })

// P3 邀请
const invites = ref<P2pInvite[]>([])
const pushVisible = ref(false)
const pushing = ref(false)
const pushForm = reactive({ code: '', target_url: '', note: '' })

let pollTimer: ReturnType<typeof setInterval> | null = null
// P3 邀请轻轮询(5s;页面在场即轮,量小无负担)
const inviteTimer = setInterval(() => {
  if (status.value?.enabled && status.value.available) void fetchInvites()
}, 5000)

const goConfig = () => router.push(`${adminBasePath()}/config?section=p2p`)

const fetchStatus = async () => {
  try {
    const res = await p2pApi.status()
    if (res.code === 200 || res.code === 0) status.value = res.data
  } catch (e) {
    handleError(e)
  } finally {
    statusLoaded.value = true
  }
}

const fetchTasks = async () => {
  tasksLoading.value = true
  try {
    const res = await p2pApi.tasks()
    if (res.code === 200 || res.code === 0) {
      tasks.value = (res.data.tasks ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
      // 有活跃任务才轮询（空闲不打扰）
      const active = tasks.value.some((x) => x.state === 'waiting' || x.state === 'running' || x.state === 'retrying')
      if (active && !pollTimer) {
        pollTimer = setInterval(fetchTasks, 2000)
      } else if (!active && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }
  } catch (e) {
    handleError(e)
  } finally {
    tasksLoading.value = false
  }
}

const fetchInvites = async () => {
  try {
    const res = await p2pApi.invites()
    if (res.code === 200 || res.code === 0) invites.value = res.data.invites ?? []
  } catch {
    /* 轮询失败静默 */
  }
}

const acceptInvite = async (iv: P2pInvite) => {
  try {
    const res = await p2pApi.acceptInvite(iv.id)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(t('admin.p2p.acceptStarted'))
      await fetchTasks()
      await fetchInvites()
    }
  } catch (e) {
    handleError(e)
  }
}

const openPush = (row: P2pTask) => {
  pushForm.code = row.code
  pushForm.target_url = ''
  pushForm.note = ''
  pushVisible.value = true
}

const doPush = async () => {
  if (!pushForm.target_url.trim()) {
    ElMessage.warning(t('admin.p2p.pushTargetRequired'))
    return
  }
  pushing.value = true
  try {
    const res = await p2pApi.invitePush(pushForm.code, pushForm.target_url.trim(), '', pushForm.note)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(t('admin.p2p.pushSuccess'))
      pushVisible.value = false
    }
  } catch (e) {
    handleError(e)
  } finally {
    pushing.value = false
  }
}

const doSend = async () => {
  const paths = sendPathsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!paths.length) {
    ElMessage.warning(t('admin.p2p.sendPathsRequired'))
    return
  }
  sending.value = true
  try {
    const res = await p2pApi.send(paths)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(t('admin.p2p.sendStarted'))
      sendPathsText.value = ''
      await fetchTasks()
      if (!pollTimer) pollTimer = setInterval(fetchTasks, 2000)
    }
  } catch (e) {
    handleError(e)
  } finally {
    sending.value = false
  }
}

const doRecv = async () => {
  if (!recvCode.value.trim()) {
    ElMessage.warning(t('admin.p2p.recvCodeRequired'))
    return
  }
  recving.value = true
  try {
    const res = await p2pApi.recv(recvCode.value.trim())
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(t('admin.p2p.recvStarted'))
      recvCode.value = ''
      await fetchTasks()
      if (!pollTimer) pollTimer = setInterval(fetchTasks, 2000)
    }
  } catch (e) {
    handleError(e)
  } finally {
    recving.value = false
  }
}

const doCancel = async (row: P2pTask) => {
  try {
    const res = await p2pApi.cancel(row.id)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(t('admin.p2p.canceled'))
      await fetchTasks()
    }
  } catch (e) {
    handleError(e)
  }
}

const openPublish = (row: P2pTask) => {
  publishTaskId.value = row.id
  publishForm.expire_value = 7
  publishForm.expire_style = 'day'
  publishForm.require_auth = false
  publishForm.password = ''
  publishVisible.value = true
}

const doPublish = async () => {
  publishing.value = true
  try {
    const res = await p2pApi.publish(publishTaskId.value, { ...publishForm })
    if (res.code === 200 || res.code === 0) {
      const codes = res.data.share_codes ?? []
      ElMessage.success(t('admin.p2p.published', { codes: codes.join(', ') }))
      publishVisible.value = false
    }
  } catch (e) {
    handleError(e)
  } finally {
    publishing.value = false
  }
}

// ---- 展示辅助 ----
const formatCode = (v: string) => {
  const raw = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12)
  return raw.replace(/(.{4})(.{4})?(.{0,4})?/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'))
}
const formatBytes = (n: number) => {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10))
  return `${(n / 2 ** (10 * i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
const formatTime = (s: string) => (s ? new Date(s).toLocaleString() : '-')
const stateLabel = (s: string) => t(`admin.p2p.state.${s}`)
const stateTagType = (s: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' => {
  switch (s) {
    case 'done': return 'success'
    case 'waiting': return 'warning'
    case 'running': return 'primary'
    case 'failed': return 'danger'
    default: return 'info'
  }
}
const copyCode = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(t('common.copied'))
  } catch {
    /* 剪贴板不可用时静默 */
  }
}

// adminBasePath:从路由推导 admin 前缀（/admin 或自定义管理路径）
const adminBasePath = () => {
  const m = router.currentRoute.value.path.match(/^(.*?\/admin)/)
  return m ? m[1] : '/admin'
}

onMounted(async () => {
  await fetchStatus()
  if (status.value?.enabled && status.value.available) {
    await fetchTasks()
    await fetchInvites()
  }
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  clearInterval(inviteTimer)
})
</script>

<style scoped>
.p2p-page { padding: 4px 0; }
.p2p-card { margin-bottom: 16px; }
.status-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.status-item { font-size: 13px; }
.dim { color: var(--el-text-color-secondary); font-size: 12px; }
.card-actions { margin-top: 12px; display: flex; align-items: center; gap: 12px; }
.field-hint { color: var(--el-text-color-secondary); font-size: 12px; }
.task-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; letter-spacing: 1px; }
.tasks-header { display: flex; justify-content: space-between; align-items: center; }
.error-text { color: var(--el-color-danger); font-size: 12px; word-break: break-all; }
.invite-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; flex-wrap: wrap; }
.invite-from { font-size: 13px; }
</style>
