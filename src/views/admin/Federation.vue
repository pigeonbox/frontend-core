// Federation.vue — 跨站联邦管理台（Wave B'：设备直传面整体退役后的联邦入口）。
//
// 只做联邦面的三件事：
//   ① 待收邀请箱（其他实例推送过来的口令信封）：列出 + 认领
//   ② 向对端实例推送口令（免口令交接）
//   ③ 在线名录对端选择器（p2pd 名录透传，零敏感）
//
// 明确不含任何直传语义：无状态探测/任务列表/发送/接收/取消/配对裁决/发布为分享
// （这些端点已随直传面从 contracts idl/p2p.thrift 删除，见 contracts 4c3d188）。
// 认领邀请在新契约下退化为**纯信封动作**（出箱 + 留痕 + 返回信封），实际的文件
// 接收由 PigeonBeam 客户端完成。
<template>
  <div class="fed-page">
    <!-- 这是什么：白话说明条 -->
    <el-alert type="info" :closable="false" class="fed-how">
      <template #title>
        {{ t('admin.federation.howStrip') }}
      </template>
      {{ t('admin.federation.howCounterpart') }}
    </el-alert>

    <!-- 待收邀请（来自其他实例） -->
    <el-card class="fed-card">
      <template #header>
        <div class="fed-card-header">
          <span>{{ t('admin.federation.invitesTitle') }}</span>
          <el-button size="small" text @click="fetchInvites">{{ t('common.refresh') }}</el-button>
        </div>
      </template>
      <el-empty v-if="!invites.length" :description="t('admin.federation.invitesEmpty')" :image-size="72" />
      <div v-for="iv in invites" :key="iv.id" class="invite-row">
        <code class="invite-code">{{ iv.code }}</code>
        <span class="invite-from">
          {{ t('admin.federation.inviteFrom') }}: {{ iv.from_name || t('admin.federation.inviteUnknown') }}
        </span>
        <span class="dim" v-if="iv.note">「{{ iv.note }}」</span>
        <span class="dim">{{ t('admin.federation.inviteExpires', { n: expiresMin(iv) }) }}</span>
        <el-button size="small" type="primary" :loading="acceptingId === iv.id" @click="acceptInvite(iv)">
          {{ t('admin.federation.inviteAccept') }}
        </el-button>
      </div>
    </el-card>

    <!-- 推送口令到对端实例 -->
    <el-card class="fed-card">
      <template #header>{{ t('admin.federation.pushTitle') }}</template>
      <p class="push-intro">{{ t('admin.federation.pushIntro') }}</p>

      <!-- 在线名录对端选择器：选中即自动填对端地址 -->
      <div class="peer-row">
        <el-select
          v-model="inviteTo"
          filterable
          clearable
          :placeholder="t('admin.federation.peerPlaceholder')"
          :loading="peersLoading"
          class="peer-select"
          @visible-change="(v: boolean) => v && fetchPeers()"
        >
          <el-option v-for="p in sortedPeers" :key="p.node_id" :value="p.node_id" :label="peerLabel(p)">
            <span class="peer-name">{{ p.name || t('admin.federation.inviteUnknown') }}</span>
            <span class="dim peer-fp">{{ shortFp(p.node_id) }}</span>
          </el-option>
          <template #empty>
            <span v-if="peersError" class="dim peer-error">{{ t('admin.federation.peerUnavailable') }}</span>
            <span v-else class="dim">{{ t('admin.federation.peerEmpty') }}</span>
          </template>
        </el-select>
        <el-tooltip v-if="peersError" :content="t('admin.federation.peerUnavailableTip')">
          <el-button link size="small" @click="fetchPeers">{{ t('admin.federation.peerRetry') }}</el-button>
        </el-tooltip>
      </div>

      <el-form label-width="110px" class="push-form">
        <el-form-item :label="t('admin.federation.pushCode')">
          <el-input
            v-model="pushForm.code"
            :placeholder="t('admin.federation.pushCodePlaceholder')"
            style="width: 320px"
          />
        </el-form-item>
        <el-form-item :label="t('admin.federation.pushTarget')">
          <el-input
            v-model="pushForm.target_url"
            :placeholder="t('admin.federation.pushTargetPlaceholder')"
            style="width: 320px"
          />
          <span class="field-hint">{{ t('admin.federation.pushTargetHint') }}</span>
        </el-form-item>
        <el-form-item :label="t('admin.federation.pushNote')">
          <el-input
            v-model="pushForm.note"
            maxlength="200"
            :placeholder="t('admin.federation.pushNotePlaceholder')"
          />
        </el-form-item>
      </el-form>
      <div class="card-actions">
        <el-button type="primary" :loading="pushing" @click="doPush">
          {{ t('admin.federation.pushConfirm') }}
        </el-button>
      </div>
    </el-card>

    <!-- 认领结果：纯信封（accept 不再拉起任何传输） -->
    <el-dialog v-model="acceptedVisible" :title="t('admin.federation.acceptedTitle')" width="460px">
      <p class="field-hint">{{ t('admin.federation.acceptedHint') }}</p>
      <div class="accepted-box">
        <code class="accepted-code">{{ acceptedInvite?.code }}</code>
        <el-button type="primary" @click="copyCode(acceptedInvite?.code || '')">
          {{ t('common.copy') }}
        </el-button>
      </div>
      <template #footer>
        <el-button type="primary" @click="acceptedVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { p2pApi, type P2pInvite, type P2pDirectoryPeer } from '@/api/p2p'
import { useConfigStore } from '@/stores/config'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()
const configStore = useConfigStore()

// ---- 待收邀请 ----
const invites = ref<P2pInvite[]>([])
const acceptingId = ref('')

const expiresMin = (iv: P2pInvite): number => Math.max(0, Math.floor((iv.expires_in ?? 0) / 60))

const fetchInvites = async () => {
  try {
    const res = await p2pApi.invites()
    if (res.code === 200) invites.value = res.data?.invites ?? []
  } catch {
    /* 轮询失败静默（页面仍可手动刷新） */
  }
}

const acceptedVisible = ref(false)
const acceptedInvite = ref<P2pInvite | null>(null)

const acceptInvite = async (iv: P2pInvite) => {
  acceptingId.value = iv.id
  try {
    const res = await p2pApi.acceptInvite(iv.id)
    if (res.code === 200) {
      // 新契约：accept 返回纯信封 { invite }
      acceptedInvite.value = res.data?.invite ?? iv
      acceptedVisible.value = true
      ElMessage.success(t('admin.federation.acceptStarted'))
      await fetchInvites()
    }
  } catch (e) {
    handleError(e)
  } finally {
    acceptingId.value = ''
  }
}

// ---- 推送口令到对端 ----
const pushing = ref(false)
const pushForm = reactive({ code: '', target_url: '', note: '' })

const doPush = async () => {
  if (!pushForm.code.trim()) {
    ElMessage.warning(t('admin.federation.pushCodeRequired'))
    return
  }
  if (!pushForm.target_url.trim()) {
    ElMessage.warning(t('admin.federation.pushTargetRequired'))
    return
  }
  pushing.value = true
  try {
    const res = await p2pApi.invitePush(
      pushForm.code.trim(),
      pushForm.target_url.trim(),
      configStore.siteName(),
      pushForm.note,
    )
    if (res.code === 200) {
      ElMessage.success(t('admin.federation.pushSuccess'))
      if (inviteTo.value) rememberPeer(inviteTo.value)
      pushForm.code = ''
      pushForm.note = ''
    }
  } catch (e) {
    handleError(e)
  } finally {
    pushing.value = false
  }
}

// ---- 在线名录对端选择器 ----
const peers = ref<P2pDirectoryPeer[]>([])
const peersError = ref(false)
const peersLoading = ref(false)
const inviteTo = ref('')

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

const peerLabel = (p: P2pDirectoryPeer) => `${p.name || 'p2p'} · ${shortFp(p.node_id)}`
const shortFp = (id: string) => (id.length > 10 ? id.slice(0, 10) : id)

const fetchPeers = async () => {
  peersLoading.value = true
  try {
    const res = await p2pApi.directory()
    if (res.code === 200) {
      peers.value = res.data?.peers ?? []
      peersError.value = false
    } else {
      peersError.value = true
    }
  } catch {
    // 名录不可达不打断推送，但不再全静默：下拉空态/重试入口可见
    peersError.value = true
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

// 选中名录对端 → 自动填对端对外地址（NAT 后可能为空，留空手填）
watch(inviteTo, (id) => {
  if (!id) return
  const peer = peers.value.find((p) => p.node_id === id)
  if (peer?.url) pushForm.target_url = peer.url
})

// ---- 剪贴板 ----
const copyCode = async (code: string) => {
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success(t('common.copied'))
  } catch {
    /* 剪贴板不可用时静默 */
  }
}

// ---- 轮询：邀请轻轮询（5s；页面在场即轮，量小无负担）----
let inviteTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await fetchInvites()
  void fetchPeers() // 名录对端背景加载（失败静默）
  inviteTimer = setInterval(() => {
    if (!document.hidden) void fetchInvites()
  }, 5000)
})

onUnmounted(() => {
  if (inviteTimer) clearInterval(inviteTimer)
})
</script>

<style scoped>
.fed-page { padding: 4px 0; }
.fed-card { margin-bottom: 16px; }
.fed-how { margin-bottom: 16px; }
.fed-how :deep(.el-alert__title) { font-weight: 600; }
.fed-card-header { display: flex; align-items: center; justify-content: space-between; }
.dim { color: var(--el-text-color-secondary); font-size: 12px; }
.invite-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; flex-wrap: wrap; }
.invite-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px; letter-spacing: 1px;
}
.invite-from { font-size: 13px; }
.push-intro { margin: 0 0 10px; font-size: 13px; color: var(--el-text-color-secondary); line-height: 1.6; }
.peer-row { margin-bottom: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.peer-select { flex: 1 1 240px; min-width: 200px; }
.peer-name { margin-right: 8px; }
.peer-fp { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.push-form { max-width: 520px; }
.card-actions { margin-top: 12px; display: flex; align-items: center; gap: 12px; }
.field-hint { color: var(--el-text-color-secondary); font-size: 12px; }
.accepted-box {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-radius: 10px;
  background: var(--el-fill-color-light); margin-top: 10px;
}
.accepted-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 20px; font-weight: 700; letter-spacing: 2px;
}
</style>
