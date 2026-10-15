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
      <!-- 这是什么/对端是谁：白话说明条（2026-10-15 易用性重设计） -->
      <el-alert type="info" :closable="false" class="p2p-how">
        <template #title>
          {{ t('admin.p2p.howStrip') }}
        </template>
        {{ t('admin.p2p.howCounterpart') }}
      </el-alert>

      <!-- 状态横幅 -->
      <el-card class="p2p-card">
        <div class="status-row">
          <el-tag type="success" effect="dark">{{ t('admin.p2p.statusOn') }}</el-tag>
          <span class="status-item">{{ t('admin.p2p.registry') }}: {{ status.registry_url }}</span>
          <span class="status-item">{{ t('admin.p2p.inbox') }}: {{ formatBytes(status.inbox_used) }} / {{ formatBytes(status.inbox_quota) }}</span>
          <span class="status-item dim">p2pc: {{ status.binary_path }}</span>
        </div>
        <!-- 注册中心不可达：最近任务失败归因到注册中心时亮提示（2026-10-15 失败态易用性） -->
        <el-alert v-if="registryUnreachable" type="warning" :closable="false" class="p2p-registry-alert">
          <template #title>
            {{ t('admin.p2p.registryUnreachable', { url: status.registry_url }) }}
            <el-link size="small" @click="goConfig">{{ t('admin.p2p.goConfig') }}</el-link>
          </template>
        </el-alert>
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
            <div class="whitelist-chips" v-if="sendRoots.length">
              <span class="dim">{{ t('admin.p2p.whitelistChipsLabel') }}</span>
              <el-tag
                v-for="root in sendRoots"
                :key="root"
                class="whitelist-chip"
                @click="appendSendRoot(root)"
              >{{ root }}</el-tag>
            </div>
            <div class="whitelist-chips" v-else>
              <span class="dim">{{ t('admin.p2p.whitelistEmpty') }}
                <el-link size="small" @click="goConfig">{{ t('admin.p2p.goConfig') }}</el-link>
              </span>
            </div>
            <div class="peer-row">
              <el-select
                v-model="inviteTo"
                filterable
                clearable
                :placeholder="t('admin.p2p.peerPlaceholder')"
                :loading="peersLoading"
                class="peer-select"
                @visible-change="(v: boolean) => v && fetchPeers()"
              >
                <el-option v-for="p in sortedPeers" :key="p.node_id" :value="p.node_id" :label="peerLabel(p)">
                  <span class="peer-name">{{ p.name || t('admin.p2p.inviteUnknown') }}</span>
                  <span class="dim peer-fp">{{ shortFp(p.node_id) }}</span>
                </el-option>
                <template #empty>
                  <span class="dim">{{ t('admin.p2p.peerEmpty') }}</span>
                </template>
              </el-select>
              <el-input
                v-if="inviteTo"
                v-model="inviteNote"
                maxlength="200"
                :placeholder="t('admin.p2p.peerNotePlaceholder')"
                class="peer-note"
              />
            </div>
            <div class="card-actions">
              <el-button type="primary" :loading="sending" @click="doSend">{{ t('admin.p2p.sendBtn') }}</el-button>
              <span class="field-hint">{{ inviteTo ? t('admin.p2p.peerHint') : t('admin.p2p.sendHint') }}</span>
            </div>
          </el-card>
        </el-col>
        <!-- 接收 -->
        <el-col :xs="24" :md="12">
          <el-card class="p2p-card">
            <template #header>{{ t('admin.p2p.recvTitle') }}</template>
            <p class="recv-intro">{{ t('admin.p2p.recvIntro') }}</p>
            <el-input
              v-model="recvCode"
              :placeholder="t('admin.p2p.recvCodePlaceholder')"
              maxlength="14"
              @input="recvCode = formatCode(recvCode)"
            >
              <template #prefix><el-icon><Key /></el-icon></template>
            </el-input>
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
            <div class="tasks-header-actions">
              <el-checkbox v-model="hideEnded" size="small">{{ t('admin.p2p.hideEnded') }}</el-checkbox>
              <el-button size="small" text @click="fetchTasks">{{ t('common.refresh') }}</el-button>
            </div>
          </div>
        </template>
        <el-table :data="visibleTasks" size="small" v-loading="tasksLoading">
          <template #empty>
            <el-empty :description="t('admin.p2p.taskEmpty')" :image-size="72" />
          </template>
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
              <span class="error-text">{{ plainError(row.error) }}</span>
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
    <!-- 发送成功：口令结果框（大口令+对端接收指引，2026-10-15 易用性重设计） -->
    <el-dialog v-model="codeVisible" :title="t('admin.p2p.codeDialogTitle')" width="520px" :close-on-click-modal="false">
      <div class="code-result">
        <p class="code-result-tip">{{ t('admin.p2p.codeValidTip') }}</p>
        <div class="code-result-box">
          <code class="code-result-pass">{{ lastSentCode }}</code>
          <el-button type="primary" @click="copyCode(lastSentCode)">
            {{ t('common.copy') }}
          </el-button>
        </div>
        <el-divider content-position="left">{{ t('admin.p2p.codeHowTitle') }}</el-divider>
        <ol class="code-how">
          <li>{{ t('admin.p2p.codeHowDesktop') }}</li>
          <li>{{ t('admin.p2p.codeHowCli') }}<code class="code-how-cmd">p2pc recv {{ lastSentCode }}</code></li>
        </ol>
        <p class="code-result-warn">{{ t('admin.p2p.codeWarn') }}</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="codeVisible = false">{{ t('common.confirm') }}</el-button>
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
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { p2pApi, type P2pTask, type P2pStatus, type P2pInvite, type P2pDirectoryPeer } from '@/api/p2p'
import { adminApi } from '@/api/admin'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()
const router = useRouter()

const status = ref<P2pStatus | null>(null)
const statusLoaded = ref(false)
const tasks = ref<P2pTask[]>([])
const tasksLoading = ref(false)
// 失败态易用性（2026-10-15）：已结束任务可折叠；注册中心不可达自动亮提示条
const hideEnded = ref(false)
const visibleTasks = computed(() => {
  if (!hideEnded.value) return tasks.value
  const active = new Set(['waiting', 'running', 'retrying'])
  return tasks.value.filter((t) => active.has(t.state))
})
const registryUnreachable = computed(() =>
  tasks.value.some((t) => /注册中心不可用|注册中心均无/.test(t.error ?? '')),
)
// p2pc 原始错误 → 白话+对策（前缀 "p2pc 退出: exit status N; " 一并剥除）
const plainError = (raw: string): string => {
  if (!raw) return ''
  const msg = raw.replace(/^p2pc 退出:\s*exit status \d+;\s*/, '')
  if (/注册中心不可用/.test(msg)) return t('admin.p2p.errRegistryDown')
  if (/均无该口令|无该口令|not found/i.test(msg)) return t('admin.p2p.errCodeUnknown')
  if (/配对等待|配对/.test(msg) && /timeout|超时/i.test(msg)) return t('admin.p2p.errPairTimeout')
  if (/i\/o timeout/.test(msg)) return t('admin.p2p.errNetworkTimeout')
  return msg
}

const sendPathsText = ref('')
const sending = ref(false)
const recvCode = ref('')
const recving = ref(false)

// 发送白名单（系统配置 p2p.direct.send_roots）点选快速填入（2026-10-15 易用性重设计：
// 免得让用户手抄服务器内部路径）
const sendRoots = ref<string[]>([])
const appendSendRoot = (root: string) => {
  const cur = sendPathsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  if (cur.includes(root)) return
  sendPathsText.value = [...cur, root].join('\n')
}

// 发送成功口令结果框
const codeVisible = ref(false)
const lastSentCode = ref('')
// 口令由 p2pc 异步生成：创建时可能为空，记下任务 id，任务列表轮询到口令再弹结果框
const pendingCodeTaskId = ref('')

const fetchSendRoots = async () => {
  try {
    const res = await adminApi.getConfig()
    if (res.code === 200 || res.code === 0) {
      sendRoots.value = (res.data?.p2p?.direct?.send_roots ?? []).filter(Boolean)
    }
  } catch {
    /* 白名单读取失败静默（仅影响点选快捷，手填不受影响） */
  }
}

// 在线名录对端选择(2026-10-14 邀请信箱:密封邀请免手抄口令,近用优先)
const peers = ref<P2pDirectoryPeer[]>([])
const peersLoading = ref(false)
const inviteTo = ref('')
const inviteNote = ref('')
const RECENT_PEERS_KEY = 'pb.p2p.recentPeers'
const recentPeerIds = ref<string[]>(loadRecentPeers())

function loadRecentPeers(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PEERS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}

const sortedPeers = computed(() => {
  const rank = (id: string) => {
    const i = recentPeerIds.value.indexOf(id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...peers.value].sort((a, b) => rank(a.node_id) - rank(b.node_id))
})

const peerLabel = (p: P2pDirectoryPeer) => `${p.name || 'p2pc'} · ${shortFp(p.node_id)}`
const shortFp = (id: string) => (id.length > 10 ? id.slice(0, 10) : id)

const fetchPeers = async () => {
  peersLoading.value = true
  try {
    const res = await p2pApi.directory()
    if (res.code === 200 || res.code === 0) peers.value = res.data.peers ?? []
  } catch {
    /* 名录不可达静默(公共注册中心波动常见,不该打断发送卡) */
  } finally {
    peersLoading.value = false
  }
}

const rememberPeer = (id: string) => {
  const next = [id, ...recentPeerIds.value.filter((x) => x !== id)].slice(0, 5)
  recentPeerIds.value = next
  try {
    localStorage.setItem(RECENT_PEERS_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式等存储不可用时静默 */
  }
}

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
      // 待弹口令的任务：轮询到 p2pc 生成口令后弹结果框（仅一次）
      if (pendingCodeTaskId.value) {
        const t = tasks.value.find((x) => x.id === pendingCodeTaskId.value)
        if (t?.code) {
          lastSentCode.value = t.code
          codeVisible.value = true
          pendingCodeTaskId.value = ''
        }
      }
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
    const res = await p2pApi.send(paths, inviteTo.value || undefined, inviteNote.value || undefined)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(t('admin.p2p.sendStarted'))
      const invited = !!inviteTo.value
      const tid = res.data?.task?.id ?? ''
      const code = res.data?.task?.code ?? ''
      if (code && !invited) {
        lastSentCode.value = code
        codeVisible.value = true
      } else if (tid && !invited) {
        pendingCodeTaskId.value = tid
      }
      if (invited) {
        const peer = peers.value.find((p) => p.node_id === inviteTo.value)
        ElMessage.info(t('admin.p2p.peerInviteQueued', { peer: peerLabel(peer ?? { node_id: inviteTo.value, name: '', url: '', box_pub: '', online_since: 0 }) }))
        rememberPeer(inviteTo.value)
      }
      sendPathsText.value = ''
      inviteTo.value = ''
      inviteNote.value = ''
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
  void fetchSendRoots()
  if (status.value?.enabled && status.value.available) {
    await fetchTasks()
    await fetchInvites()
    void fetchPeers() // 名录对端背景加载(失败静默)
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
.p2p-how { margin-bottom: 16px; }
.p2p-how :deep(.el-alert__title) { font-weight: 600; }
.status-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.status-item { font-size: 13px; }
.dim { color: var(--el-text-color-secondary); font-size: 12px; }
.card-actions { margin-top: 12px; display: flex; align-items: center; gap: 12px; }
.field-hint { color: var(--el-text-color-secondary); font-size: 12px; }
.whitelist-chips { margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.whitelist-chip { cursor: pointer; font-family: ui-monospace, Menlo, monospace; }
.whitelist-chip:hover { opacity: 0.8; }
.recv-intro { margin: 0 0 10px; font-size: 13px; color: var(--el-text-color-secondary); line-height: 1.6; }
.task-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; letter-spacing: 1px; }
.tasks-header { display: flex; justify-content: space-between; align-items: center; }
.tasks-header-actions { display: flex; align-items: center; gap: 12px; }
.p2p-registry-alert { margin-top: 10px; }
.error-text { color: var(--el-color-danger); font-size: 12px; word-break: break-all; }
.invite-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; flex-wrap: wrap; }
.invite-from { font-size: 13px; }
.peer-row { margin-top: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.peer-select { flex: 1 1 240px; min-width: 200px; }
.peer-note { flex: 1 1 180px; min-width: 160px; }
.peer-name { margin-right: 8px; }
.peer-fp { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
/* 口令结果框 */
.code-result-tip { margin: 0 0 10px; color: var(--el-text-color-secondary); font-size: 13px; }
.code-result-box {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-radius: 10px;
  background: #1b1c20; margin-bottom: 6px;
}
.code-result-pass {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 24px; font-weight: 700; letter-spacing: 3px; color: #fff;
}
.code-how { margin: 8px 0 0; padding-left: 20px; line-height: 1.9; font-size: 13px; color: var(--el-text-color-primary); }
.code-how-cmd {
  display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 6px;
  background: var(--el-fill-color, #f0f1f5); font-family: ui-monospace, Menlo, monospace; font-size: 12px;
}
.code-result-warn { margin: 12px 0 0; font-size: 12px; color: var(--el-color-danger); }
</style>
