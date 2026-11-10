<template>
  <div class="maintenance-tools">
    <!-- 新版本提示：只有**确实有更新**时才出现。
         查不到 / 已关闭 / 已是最新都不打扰——更新检查是锦上添花，
         不是让用户每次打开后台都看到一个「可能有问题」的横幅。 -->
    <el-alert
      v-if="update.available"
      type="success"
      :closable="false"
      show-icon
      class="update-alert"
    >
      <template #title>
        {{ t('admin.maintenancePage.updateAvailable', { latest: update.latest, current: update.current }) }}
      </template>
      <div class="update-body">
        <span v-if="update.stale" class="update-stale">
          {{ t('admin.maintenancePage.updateStale') }}
        </span>
        <el-link
          v-if="update.url"
          type="primary"
          :href="update.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('admin.maintenancePage.updateViewRelease') }}
        </el-link>
      </div>
    </el-alert>

    <!-- ClamAV 扫描器存活（core#121 尾巴）：ClamAV 是 fail-open——扫描器挂掉时
         文件照常放行、业务不阻断，但「没在扫描」必须可见（WARN 而非阻断红：
         放行是既定策略，不是本站故障）。仅在服务端上报了该段且启用、探活失败时出现。 -->
    <el-alert
      v-if="clamav.present && clamav.enabled && clamav.degraded"
      type="warning"
      :closable="false"
      show-icon
      class="update-alert"
    >
      <template #title>
        {{ t('admin.maintenancePage.clamavDegradedTitle') }}
      </template>
      <div class="update-body">
        <span v-if="clamav.last_error" class="update-stale">
          {{ t('admin.maintenancePage.clamavPingError', { error: clamav.last_error }) }}
        </span>
        <span v-if="clamav.degraded_count > 0" class="update-stale">
          {{ t('admin.maintenancePage.clamavFailOpen', { total: clamav.scans_in_window, n: clamav.degraded_count }) }}
        </span>
      </div>
    </el-alert>

    <!-- 系统状态卡片 -->
    <el-row :gutter="20" class="status-row">
      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-success"><CircleCheckFilled /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.maintenancePage.statusTitle') }}</h4>
              <p class="text-success">{{ t('admin.maintenancePage.statusOk') }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-info"><Timer /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.maintenancePage.versionTitle') }}</h4>
              <p>{{ systemInfo.version }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-warning"><Files /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.totalFiles') }}</h4>
              <p>{{ systemInfo.totalFiles }}</p>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="status-card">
          <div class="status-item">
            <el-icon size="30" class="icon-danger"><Folder /></el-icon>
            <div class="status-info">
              <h4>{{ t('admin.maintenancePage.totalSizeTitle') }}</h4>
              <p>{{ formatFileSize(systemInfo.totalSize) }}</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 维护工具 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="tool-card">
          <template #header>
            <div class="card-header">
              <el-icon><Delete /></el-icon>
              <span>{{ t('admin.maintenancePage.toolsTitle') }}</span>
            </div>
          </template>

          <div class="tool-list">
            <div class="tool-item">
              <div class="tool-info">
                <h4>{{ t('admin.maintenancePage.cleanExpiredTitle') }}</h4>
                <p>{{ t('admin.maintenancePage.cleanExpiredDesc') }}</p>
              </div>
              <el-button
                type="danger"
                @click="cleanExpiredFiles"
                :loading="cleaningExpired"
              >
                {{ t('admin.maintenancePage.run') }}
              </el-button>
            </div>

            <el-divider />

            <div class="tool-item">
              <div class="tool-info">
                <h4>{{ t('admin.maintenancePage.optimizeTitle') }}</h4>
                <p>{{ t('admin.maintenancePage.optimizeDesc') }}</p>
              </div>
              <el-button
                type="primary"
                @click="optimizeDatabase"
                :loading="optimizing"
              >
                {{ t('admin.maintenancePage.run') }}
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="tool-card">
          <template #header>
            <div class="card-header">
              <el-icon><DocumentChecked /></el-icon>
              <span>{{ t('admin.maintenancePage.infoTitle') }}</span>
            </div>
          </template>

          <el-descriptions :column="1" border>
            <el-descriptions-item :label="t('admin.maintenancePage.goVersion')">
              {{ systemInfo.goVersion }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.buildTime')">
              {{ systemInfo.buildTime }}
            </el-descriptions-item>
            <el-descriptions-item label="Git Commit">
              {{ systemInfo.gitCommit }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.updateLatest')">
              {{ latestVersionText }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.osInfo')">
              {{ systemInfo.osInfo }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.cpuCores')">
              {{ systemInfo.cpuCores }}
            </el-descriptions-item>
            <!-- ClamAV 存活一行：旧版服务端不带 moderation 段时整行不渲染
                 （「未取到 ≠ 未启用」，与 pb doctor 同口径） -->
            <el-descriptions-item v-if="clamav.present" :label="t('admin.maintenancePage.clamavTitle')">
              <span :class="clamav.enabled && clamav.degraded ? 'clamav-warn' : ''">{{ clamavStatusText }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
    <!-- 备份（5.1.0 定时自动备份）：状态 + 包列表 + 立即备份 / 下载。
         未启用时仍然展示这一块——「我这台机器有没有备份、备份在哪」是运维
         最先问的问题，藏起来只会让人以为功能不存在。 -->
    <el-row :gutter="20" class="backup-row">
      <el-col :span="24">
        <el-card class="tool-card">
          <template #header>
            <div class="card-header">
              <el-icon><FolderOpened /></el-icon>
              <span>{{ t('admin.maintenancePage.backupTitle') }}</span>
              <el-tag
                :type="backup.enabled ? 'success' : 'info'"
                size="small"
                class="backup-tag"
              >
                {{ backup.enabled ? t('admin.maintenancePage.backupEnabled', { at: backup.at }) : t('admin.maintenancePage.backupDisabled') }}
              </el-tag>
              <div class="backup-actions">
                <el-button size="small" :loading="backupLoading" @click="fetchBackups()">
                  {{ t('admin.maintenancePage.backupRefresh') }}
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  :loading="backup.running"
                  :disabled="backup.running"
                  @click="runBackupNow"
                >
                  {{ backup.running ? t('admin.maintenancePage.backupRunning') : t('admin.maintenancePage.backupRunNow') }}
                </el-button>
              </div>
            </div>
          </template>

          <el-alert
            v-if="!backup.enabled"
            type="info"
            :closable="false"
            show-icon
            :title="t('admin.maintenancePage.backupDisabledHint')"
            class="backup-alert"
          />
          <el-alert
            v-if="backup.last_error"
            type="error"
            :closable="false"
            show-icon
            :title="t('admin.maintenancePage.backupError', { error: backup.last_error })"
            class="backup-alert"
          />

          <el-descriptions :column="2" border size="small">
            <el-descriptions-item :label="t('admin.maintenancePage.backupDir')">
              {{ backup.dir || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.backupAt')">
              {{ backup.at || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.backupKeep')">
              {{ backup.keep > 0 ? backup.keep : t('admin.maintenancePage.backupKeepUnlimited') }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.backupCount')">
              {{ t('admin.maintenancePage.backupCountValue', { n: backup.count, size: formatFileSize(backup.total_bytes) }) }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.maintenancePage.backupLast')">
              {{ backup.last_backup_at ? formatDateTime(backup.last_backup_at) : t('admin.maintenancePage.backupNever') }}
            </el-descriptions-item>
          </el-descriptions>

          <el-table
            :data="backup.items"
            size="small"
            class="backup-table"
            :empty-text="t('admin.maintenancePage.backupListEmpty')"
          >
            <el-table-column
              prop="name"
              :label="t('admin.maintenancePage.backupFile')"
              min-width="300"
              show-overflow-tooltip
            />
            <el-table-column :label="t('admin.maintenancePage.backupSize')" width="120">
              <template #default="{ row }">{{ formatFileSize(row.size) }}</template>
            </el-table-column>
            <el-table-column :label="t('admin.maintenancePage.backupTime')" width="200">
              <template #default="{ row }">
                {{ row.created_at ? formatDateTime(row.created_at) : '-' }}
              </template>
            </el-table-column>
            <el-table-column width="110">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="downloadBackup(row.name)">
                  {{ t('admin.maintenancePage.backupDownload') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize, formatDateTime } from '@/utils/format'
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  CircleCheckFilled,
  Timer,
  Files,
  Folder,
  Delete,
  DocumentChecked,
  FolderOpened
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import type { BackupOverview } from '@/api/admin'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { t } = useI18n()
const { handleError } = useErrorHandler()

const cleaningExpired = ref(false)
const optimizing = ref(false)

// 更新状态。默认 source='unknown'：**先假设查不到**，拿到结果才升级为 github。
// 反过来的话（默认 github + 空 latest）会让模板先闪一下「无法检查」再变——
// 而查不到本来就是常态（离线部署、内网、关闭检查）。
const update = reactive({
  current: '',
  latest: '',
  available: false,
  source: 'unknown' as 'github' | 'disabled' | 'unknown',
  stale: false,
  url: ''
})

const systemInfo = reactive({
  version: '-',
  goVersion: '-',
  buildTime: '-',
  gitCommit: '-',
  osInfo: '-',
  cpuCores: 0,
  totalFiles: 0,
  totalSize: 0
})


// ===== 备份（5.1.0 定时自动备份）=====
//
// 默认值按「未启用 + 空列表」：这是**没配置过**的机器的真实状态，也是唯一
// 不会在首屏闪出错误结论的初值（同 update 段的教训）。
const backup = reactive<BackupOverview>({
  enabled: false,
  dir: '',
  keep: 0,
  at: '',
  count: 0,
  total_bytes: 0,
  last_file: '',
  last_size: 0,
  last_backup_at: '',
  running: false,
  last_error: '',
  items: []
})
const backupLoading = ref(false)
// 轮询句柄：备份在后台跑，页面要知道它什么时候结束。
let backupPollTimer: ReturnType<typeof setTimeout> | undefined

const stopBackupPoll = () => {
  if (backupPollTimer) {
    clearTimeout(backupPollTimer)
    backupPollTimer = undefined
  }
}

// 取备份状态与列表。静默失败：备份卡片是附加信息，取不到不该让整页报错。
const fetchBackups = async (quiet = false) => {
  if (!quiet) backupLoading.value = true
  try {
    const res = await adminApi.getBackups()
    if (res.code === 200 && res.data) {
      Object.assign(backup, {
        enabled: Boolean(res.data.enabled),
        dir: res.data.dir || '',
        keep: res.data.keep || 0,
        at: res.data.at || '',
        count: res.data.count || 0,
        total_bytes: res.data.total_bytes || 0,
        last_file: res.data.last_file || '',
        last_size: res.data.last_size || 0,
        last_backup_at: res.data.last_backup_at || '',
        running: Boolean(res.data.running),
        last_error: res.data.last_error || '',
        items: res.data.items || []
      })
      // 还在跑 ⇒ 5s 后再看一次；跑完即停（不常驻轮询）。
      stopBackupPoll()
      if (backup.running) {
        backupPollTimer = setTimeout(async () => {
          await fetchBackups(true)
        }, 5000)
      }
    }
  } catch {
    // 保持上一次的状态，页面照常可用
  } finally {
    if (!quiet) backupLoading.value = false
  }
}

// 立即备份：服务端立刻返回（导出在后台跑）⇒ 这里只负责把状态刷成「正在备份」。
const runBackupNow = async () => {
  try {
    const res = await adminApi.runBackup()
    if (res.code === 200) {
      if (res.data?.started) {
        ElMessage.success(t('admin.maintenancePage.backupStarted'))
      } else {
        ElMessage.info(t('admin.maintenancePage.backupAlreadyRunning'))
      }
      await fetchBackups(true)
    } else {
      handleError(new Error(res.message || t('admin.maintenancePage.backupRunFailed', { error: res.message || '' })))
    }
  } catch (error: any) {
    handleError(new Error(error?.message || t('admin.maintenancePage.backupRunFailed', { error: String(error?.message || '') })))
  }
}

// 下载：走 blob + 临时 object URL。直接用 <a href> 会 401（端点要鉴权头）。
const downloadBackup = async (name: string) => {
  try {
    const blob = await adminApi.downloadBackup(name)
    const url = URL.createObjectURL(blob as unknown as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error(t('admin.maintenancePage.backupDownloadFailed'))
  }
}
const cleanExpiredFiles = async () => {
  try {
    await ElMessageBox.confirm(
      t('admin.maintenancePage.cleanConfirmBody'),
      t('admin.maintenancePage.cleanConfirmTitle'),
      { type: 'warning' }
    )

    cleaningExpired.value = true
    const res = await adminApi.cleanExpiredFiles()
    if (res.code === 200) {
      ElMessage.success(t('admin.maintenancePage.cleaned', { n: res.data.deleted_count || 0 }))
      await fetchSystemInfo()
    } else {
      handleError(new Error(res.message || t('admin.maintenancePage.cleanFailed')))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('admin.maintenancePage.cleanFailed'))
    }
  } finally {
    cleaningExpired.value = false
  }
}

const optimizeDatabase = async () => {
  try {
    await ElMessageBox.confirm(
      t('admin.maintenancePage.optimizeConfirmBody'),
      t('admin.maintenancePage.optimizeConfirmTitle')
    )

    optimizing.value = true
    const res = await adminApi.optimizeDatabase()
    if (res.code === 200) {
      ElMessage.success(t('admin.maintenancePage.optimizeDone'))
    } else {
      handleError(new Error(res.message || t('admin.maintenancePage.optimizeFailed')))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('admin.maintenancePage.optimizeFailed'))
    }
  } finally {
    optimizing.value = false
  }
}

// ===== ClamAV 扫描器存活（core#121 尾巴）=====
// 初值按「未取到」：旧版服务端不带 moderation 段 ⇒ 该行/告警都不出现，
// 而不是误报「未启用」（「未取到 ≠ 未启用」，与 pb doctor 同口径）。
const clamav = reactive({
  present: false,
  enabled: false,
  degraded: false,
  degraded_count: 0,
  scans_in_window: 0,
  last_ok: false,
  last_error: '',
  last_latency_ms: 0
})

// 「病毒扫描」一行的显示文本：未启用 / 不可用（当前放行）/ 正常（带探活耗时）。
const clamavStatusText = computed(() => {
  if (!clamav.enabled) return t('admin.maintenancePage.clamavDisabled')
  if (clamav.degraded) return t('admin.maintenancePage.clamavDegraded')
  return t('admin.maintenancePage.clamavHealthy', { ms: clamav.last_latency_ms })
})

// 「最新版本」一行的显示文本。
// 三种非「有版本号」的情形各给一句人话，而不是留空或显示 undefined：
// 空白会让人以为字段坏了，而这里是**可预期的状态**，不是故障。
const latestVersionText = computed(() => {
  if (update.source === 'disabled') return t('admin.maintenancePage.updateDisabled')
  if (update.source === 'unknown' || !update.latest) return t('admin.maintenancePage.updateUnknown')
  return update.latest
})

// 取更新状态。失败**静默**：这是维护页的附加信息，
// 不能因为 GitHub 连不上就让整页报错（同 server#88 的教训：缺一路数据 ≠ 服务故障）。
const fetchUpdate = async () => {
  try {
    const res = await adminApi.getDiagnostics()
    if (res.code === 200 && res.data) {
      if (res.data.update) {
        const u = res.data.update
        update.current = u.current || ''
        update.latest = u.latest || ''
        update.available = Boolean(u.available)
        update.source = u.source || 'unknown'
        update.stale = Boolean(u.stale)
        update.url = u.url || ''
      }
      // ===== ClamAV 存活（core#121 尾巴）=====
      // 只在服务端确实上报了 moderation 段时才亮这一块（旧版缺段 = 不渲染，
      // 不是「未启用」）；clamav 子段同理。
      const m = res.data.moderation
      if (m) {
        clamav.present = true
        const c = m.clamav
        if (c) {
          clamav.enabled = Boolean(c.enabled)
          clamav.degraded = Boolean(c.degraded)
          clamav.degraded_count = c.degraded_count || 0
          clamav.scans_in_window = c.scans_in_window || 0
          clamav.last_ok = Boolean(c.last_ping?.ok)
          clamav.last_error = c.last_ping?.error || ''
          clamav.last_latency_ms = c.last_ping?.duration_ms || 0
        }
      }
    }
  } catch {
    // 保持 source='unknown'，页面照常可用
  }
}

const fetchSystemInfo = async () => {
  try {
    // 获取系统信息
    const infoRes = await adminApi.getSystemInfo()
    if (infoRes.code === 200 && infoRes.data) {
      systemInfo.version = infoRes.data.pigeonbox_version || '-'
      systemInfo.goVersion = infoRes.data.go_version || '-'
      systemInfo.buildTime = infoRes.data.build_time || '-'
      systemInfo.gitCommit = infoRes.data.git_commit || '-'
      systemInfo.osInfo = infoRes.data.os_info || '-'
      systemInfo.cpuCores = infoRes.data.cpu_cores || 0
    }

    // 获取统计数据
    const statsRes = await adminApi.getStats()
    if (statsRes.code === 200 && statsRes.data) {
      systemInfo.totalFiles = statsRes.data.total_files || 0
      systemInfo.totalSize = statsRes.data.total_size || 0
    }
  } catch (error) {
    console.error(t('admin.maintenancePage.fetchInfoFailed'), error)
  }
}

onMounted(() => {
  fetchSystemInfo()
  fetchUpdate()
  fetchBackups()
})

// 卸载时停掉轮询，避免离开页面后还在打接口。
onUnmounted(() => {
  stopBackupPoll()
})
</script>

<style scoped>
.maintenance-tools {
  padding: 0;
}

.status-row {
  margin-bottom: 20px;
}

.status-card {
  height: 100%;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 15px;
}

.status-info h4 {
  margin: 0 0 5px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.status-info p {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.text-success {
  color: var(--color-success) !important;
}

.icon-success {
  color: var(--color-success);
}

.icon-info {
  color: var(--primary-color);
}

.icon-warning {
  color: var(--color-warning);
}

.icon-danger {
  color: var(--color-danger);
}

.tool-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.update-alert {
  margin-bottom: 20px;
}

.update-body {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.update-stale {
  opacity: 0.75;
}

.tool-list {
  padding: 10px 0;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 0;
}

.tool-info h4 {
  margin: 0 0 5px;
  font-size: 16px;
  font-weight: 600;
}

.tool-info p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.backup-row {
  margin-top: 20px;
}

.backup-tag {
  margin-left: 10px;
}

.backup-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.backup-alert {
  margin-bottom: 12px;
}

.backup-table {
  margin-top: 12px;
}

.clamav-warn {
  color: var(--color-warning);
}
</style>
