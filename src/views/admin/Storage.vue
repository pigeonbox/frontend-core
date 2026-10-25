<template>
  <div class="storage-management">
    <!-- 当前状态 -->
    <el-card v-loading="loading" class="mb">
      <template #header><h3>{{ t('admin.storagePage.statusTitle') }}</h3></template>
      <el-descriptions :column="3" border>
        <el-descriptions-item :label="t('admin.storagePage.labelConfigType')">
          <el-tag>{{ info.current || 'local' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('admin.storagePage.labelEffective')">
          <el-tag :type="info.effective === info.current ? 'success' : 'warning'">
            {{ info.effective || info.current || 'local' }}
          </el-tag>
          <span v-if="info.effective && info.effective !== info.current" class="degraded">
            {{ t('admin.storagePage.degradedHint') }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('admin.storagePage.labelDataPath')">
          {{ info.data_path || '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="chips">
        <span class="chips-label">{{ t('admin.storagePage.availableBackends') }}</span>
        <el-tag v-for="bt in info.available || []" :key="bt" size="small" class="chip">{{ bt }}</el-tag>
      </div>
    </el-card>

    <!-- 站点配额 -->
    <el-card class="mb">
      <template #header><h3>{{ t('admin.storagePage.quotaTitle') }}</h3></template>
      <template v-if="quota > 0">
        <el-progress :percentage="usagePercent" :status="usagePercent >= 95 ? 'exception' : 'success'" />
        <p class="quota-text">{{ formatFileSize(used) }} / {{ formatFileSize(quota) }}{{ t('admin.storagePage.quotaStatHint') }}</p>
      </template>
      <template v-else>
        <p class="quota-text">{{ t('admin.storagePage.quotaDisabledHint') }}</p>
      </template>
      <p class="quota-used">{{ t('admin.storagePage.currentUsage') }}{{ formatFileSize(used) }}</p>
    </el-card>

    <!-- 切换后端 -->
    <el-card>
      <template #header><h3>{{ t('admin.storagePage.switchTitle') }}</h3></template>
      <el-alert
        :title="t('admin.storagePage.switchAlert')"
        type="warning"
        :closable="false"
        class="mb"
      />
      <el-alert
        :title="t('admin.storagePage.envOverrideAlert')"
        type="info"
        :closable="false"
        class="mb"
      />
      <el-form label-width="120px">
        <el-form-item :label="t('admin.storagePage.targetType')">
          <el-select v-model="form.type" @change="onTypeChange">
            <el-option v-for="bt in allTypes" :key="bt.value" :label="bt.label" :value="bt.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-for="f in fields" :key="f.key" :label="f.label">
          <el-switch v-if="f.kind === 'bool'" v-model="values[f.key]" />
          <el-input v-else v-model="values[f.key] as string" :placeholder="f.ph" :type="f.secret ? 'password' : 'text'" show-password />
        </el-form-item>
      </el-form>
      <div>
        <el-button type="primary" :loading="switching" @click="doSwitch">{{ t('admin.storagePage.switchBtn') }}</el-button>
        <el-button @click="resetForm">{{ t('admin.storagePage.reset') }}</el-button>
      </div>
    </el-card>

    <!-- 宿主授权目录:宿主适配器提供能力时展示(授权列表/选择器/打开目录);
         无宿主部署整卡隐藏 -->
    <el-card v-if="hostDirs !== null">
      <template #header>
        <div class="host-dirs-header">
          <h3>{{ t('admin.storagePage.hostDirsTitle', { host: host.name }) }}</h3>
          <div>
            <el-button size="small" :loading="picking" @click="pickAndAuthorize">{{ t('admin.storagePage.pickBtn') }}</el-button>
            <el-button size="small" circle :icon="'Refresh'" @click="loadDirs" />
          </div>
        </div>
      </template>
      <el-alert
        :title="t('admin.storagePage.hostDirsAlert')"
        type="info"
        :closable="false"
        class="mb"
      />
      <el-table v-if="hostDirs.length" :data="hostDirs" size="small" class="admin-table-wide">
        <el-table-column :label="t('admin.storagePage.colSemantic')" min-width="240">
          <template #default="{ row }">{{ row.semantic || row.path }}</template>
        </el-table-column>
        <el-table-column :label="t('admin.storagePage.colPath')" min-width="240">
          <template #default="{ row }"><span class="mono">{{ row.path }}</span></template>
        </el-table-column>
        <el-table-column :label="t('admin.storagePage.colActions')" width="220">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="applyAsDataPath(row)">{{ t('admin.storagePage.useAsDataPath') }}</el-button>
            <el-button size="small" @click="openDir(row)">{{ t('admin.storagePage.openDir') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <!-- 窄屏（≤768px）卡片形态 -->
      <NarrowCardList v-if="hostDirs.length" :rows="hostDirs" :fields="cardFields" :head="cardHead">
        <template #path="{ row }"><span class="mono">{{ row.path }}</span></template>
        <template #actions="{ row }">
          <el-button size="small" type="primary" plain @click="applyAsDataPath(row)">{{ t('admin.storagePage.useAsDataPath') }}</el-button>
          <el-button size="small" @click="openDir(row)">{{ t('admin.storagePage.openDir') }}</el-button>
        </template>
      </NarrowCardList>
      <el-empty v-else :description="t('admin.storagePage.noHostDirs')" :image-size="80" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize } from '@/utils/format'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { adminApi } from '@/api/admin'
import { useErrorHandler } from '@/composables/useErrorHandler'
import NarrowCardList from '@/components/admin/NarrowCardList.vue'
import { host } from '@/host'

// ── 窄屏（≤768px）卡片字段 ──────────────────────────────────────────────────
// 标签**复用表格列的同一批 i18n key** ⇒ 宽窄两屏口径一致、不新增翻译。
const cardFields = computed(() => [
  { key: 'path', label: t('admin.storagePage.colPath') },
])
const cardHead = (row: any) => row.semantic || row.path

const { t } = useI18n()
const { handleError } = useErrorHandler()

interface FieldDef {
  key: string
  label: string
  ph?: string
  kind?: 'text' | 'bool' | 'int'
  secret?: boolean
}

// 各后端的最小可用字段集（完整字段见 server/configs/config.example.yaml 注释段）。
// label/ph 为 i18n key（admin. 前缀），纯 ASCII 品牌词/术语保持字面量
const TYPE_DEFS: Record<string, { label: string; fields: FieldDef[] }> = {
  local: { label: 'admin.storagePage.type.local', fields: [{ key: 'storage_path', label: 'admin.storagePage.labelDataPath', ph: './data' }] },
  s3: {
    label: 'Amazon S3',
    fields: [
      { key: 'endpoint', label: 'Endpoint', ph: 's3.us-east-1.amazonaws.com' },
      { key: 'bucket', label: 'Bucket' },
      { key: 'access_key', label: 'Access Key' },
      { key: 'secret_key', label: 'Secret Key', secret: true },
      { key: 'region', label: 'Region', ph: 'us-east-1' },
      { key: 'use_ssl', label: 'admin.storagePage.field.useTls', kind: 'bool' },
      { key: 'path_style', label: 'Path Style', kind: 'bool' },
    ],
  },
  oss: { label: 'admin.storagePage.type.oss', fields: cloudFields() },
  cos: { label: 'admin.storagePage.type.cos', fields: cloudFields() },
  bos: { label: 'admin.storagePage.type.bos', fields: cloudFields() },
  ks3: { label: 'admin.storagePage.type.ks3', fields: cloudFields() },
  obs: { label: 'admin.storagePage.type.obs', fields: cloudFields() },
  gcs: { label: 'Google Cloud Storage', fields: [...cloudFields(), { key: 'endpoint', label: 'Endpoint', ph: 'storage.googleapis.com' }] },
  webdav: {
    label: 'WebDAV',
    fields: [
      { key: 'webdav_url', label: 'URL', ph: 'https://dav.example.com/dav/' },
      { key: 'webdav_username', label: 'admin.storagePage.field.username' },
      { key: 'webdav_password', label: 'admin.storagePage.field.password', secret: true },
      { key: 'root', label: 'admin.storagePage.field.remoteRoot', ph: 'pigeonbox' },
    ],
  },
  ftp: {
    label: 'FTP / FTPS',
    fields: [
      { key: 'ftp_host', label: 'Host', ph: 'nas.local:21' },
      { key: 'ftp_username', label: 'admin.storagePage.field.username' },
      { key: 'ftp_password', label: 'admin.storagePage.field.password', secret: true },
      { key: 'ftp_tls', label: 'FTPS(AUTH TLS)', kind: 'bool' },
      { key: 'root', label: 'admin.storagePage.field.remoteRoot', ph: 'pigeonbox' },
    ],
  },
  sftp: {
    label: 'SFTP',
    fields: [
      { key: 'sftp_host', label: 'Host', ph: 'nas.local:22' },
      { key: 'sftp_username', label: 'admin.storagePage.field.username' },
      { key: 'sftp_password', label: 'admin.storagePage.field.password', secret: true },
      { key: 'sftp_private_key', label: 'admin.storagePage.field.pemKey', secret: true, ph: 'admin.storagePage.field.eitherPassword' },
      { key: 'sftp_host_key', label: 'Host Key', ph: 'admin.storagePage.field.hostKeyPh' },
      { key: 'root', label: 'admin.storagePage.field.remoteRoot', ph: 'pigeonbox' },
    ],
  },
  azureblob: {
    label: 'Azure Blob',
    fields: [
      { key: 'azureblob_account', label: 'Account' },
      { key: 'azureblob_container', label: 'Container' },
      { key: 'azureblob_key', label: 'admin.storagePage.field.sharedKey', secret: true },
      { key: 'azureblob_sas', label: 'SAS', secret: true, ph: 'admin.storagePage.field.eitherKey' },
      { key: 'azureblob_endpoint', label: 'Endpoint', ph: 'admin.storagePage.field.endpointPhAzurite' },
      { key: 'root', label: 'admin.storagePage.field.containerPrefix', ph: 'pigeonbox' },
    ],
  },
  hdfs: {
    label: 'HDFS (WebHDFS)',
    fields: [
      { key: 'hdfs_endpoint', label: 'admin.storagePage.field.webhdfsAddr', ph: 'http://namenode:9870' },
      { key: 'hdfs_user', label: 'admin.storagePage.field.proxyUser' },
      { key: 'root', label: 'admin.storagePage.field.remoteRoot', ph: 'pigeonbox' },
    ],
  },
  onedrive: {
    label: 'OneDrive',
    fields: [
      { key: 'onedrive_client_id', label: 'Client ID' },
      { key: 'onedrive_client_secret', label: 'Client Secret', secret: true },
      { key: 'onedrive_refresh_token', label: 'Refresh Token', secret: true },
      { key: 'onedrive_tenant', label: 'Tenant', ph: 'common' },
      { key: 'onedrive_drive_id', label: 'Drive ID', ph: 'admin.storagePage.field.driveIdPh' },
      { key: 'root', label: 'admin.storagePage.field.remoteRoot', ph: 'pigeonbox' },
    ],
  },
}

function cloudFields(): FieldDef[] {
  return [
    { key: 'region', label: 'Region', ph: 'admin.storagePage.field.regionPh' },
    { key: 'bucket', label: 'Bucket' },
    { key: 'access_key', label: 'Access Key' },
    { key: 'secret_key', label: 'Secret Key', secret: true },
    { key: 'endpoint', label: 'Endpoint', ph: 'admin.storagePage.field.endpointPhRegion' },
  ]
}

// i18n key（admin. 前缀）→ 翻译；纯 ASCII 品牌词/术语原样透出
const labelOf = (x: { label: string }) => (x.label.startsWith('admin.') ? t(x.label) : x.label)
const phOf = (x: { ph?: string }) => (x.ph && x.ph.startsWith('admin.') ? t(x.ph) : x.ph)

const allTypes = computed(() =>
  Object.entries(TYPE_DEFS).map(([value, v]) => ({ value, label: labelOf(v) }))
)
const FIB = 'pigeonbox'

const loading = ref(false)
const switching = ref(false)
const info = reactive<Record<string, string | string[]>>({ current: '', effective: '', data_path: '', available: [] })
const used = ref(0)
const quota = ref(0)
const form = reactive({ type: 'local' })
const values = reactive<Record<string, string | boolean>>({})

const fields = computed(() =>
  (TYPE_DEFS[form.type]?.fields ?? []).map((f) => ({ ...f, label: labelOf(f), ph: phOf(f) }))
)
const usagePercent = computed(() => (quota.value > 0 ? Math.min(100, Math.round((used.value / quota.value) * 100)) : 0))

const onTypeChange = () => resetForm()
const resetForm = () => {
  for (const k of Object.keys(values)) delete values[k]
  for (const f of TYPE_DEFS[form.type]?.fields ?? []) {
    values[f.key] = f.kind === 'bool' ? (f.key === 'use_ssl') : ''
  }
}

const load = async () => {
  loading.value = true
  try {
    const res = await adminApi.getStorageInfo()
    if (res.code === 200) {
      const d = res.data as Record<string, unknown>
      info.current = (d.current as string) || ''
      info.effective = (d.effective as string) || ''
      info.available = (d.available as string[]) || []
    }
    const st = await adminApi.getEnhancedStats()
    if (st.code === 200) {
      const d = st.data as Record<string, unknown>
      used.value = Number(d.storage_used || 0)
      quota.value = Number(d.storage_quota || 0)
    }
  } catch (e) {
    handleError(e)
  } finally {
    loading.value = false
  }
}

// 表单值 → 扁平候选配置（与 conf.StorageConfig JSON 同构）
const buildPayload = (): Record<string, unknown> => {
  const v = (k: string) => (typeof values[k] === 'string' ? (values[k] as string).trim() : values[k])
  const root = v('root')
  const payload: Record<string, unknown> = { type: form.type, root: root || FIB }
  switch (form.type) {
    case 'local':
      payload.storage_path = v('storage_path') || './data'
      break
    case 's3':
      payload.s3 = { endpoint: v('endpoint'), bucket: v('bucket'), access_key: v('access_key'), secret_key: v('secret_key'), region: v('region'), use_ssl: values.use_ssl !== false, path_style: values.path_style === true }
      break
    case 'oss': case 'cos': case 'bos': case 'ks3': case 'obs': case 'gcs':
      payload[form.type] = { region: v('region'), bucket: v('bucket'), access_key: v('access_key'), secret_key: v('secret_key'), endpoint: v('endpoint') }
      break
    case 'webdav':
      payload.webdav = { endpoint: v('webdav_url'), username: v('webdav_username'), password: v('webdav_password') }
      payload.root = root || FIB
      break
    case 'ftp':
      payload.ftp = { host: v('ftp_host'), username: v('ftp_username'), password: v('ftp_password'), tls: values.ftp_tls ? 'true' : 'false', root: root || FIB }
      break
    case 'sftp':
      payload.sftp = { host: v('sftp_host'), username: v('sftp_username'), password: v('sftp_password'), private_key: v('sftp_private_key'), host_key: v('sftp_host_key'), root: root || FIB }
      break
    case 'azureblob':
      payload.azureblob = { account: v('azureblob_account'), container: v('azureblob_container'), key: v('azureblob_key'), sas: v('azureblob_sas'), endpoint: v('azureblob_endpoint'), root: root || FIB }
      break
    case 'hdfs':
      payload.hdfs = { endpoint: v('hdfs_endpoint'), user: v('hdfs_user'), root: root || FIB }
      break
    case 'onedrive':
      payload.onedrive = { client_id: v('onedrive_client_id'), client_secret: v('onedrive_client_secret'), refresh_token: v('onedrive_refresh_token'), tenant: v('onedrive_tenant') || 'common', drive_id: v('onedrive_drive_id'), root: root || FIB }
      break
  }
  return payload
}

const doSwitch = async () => {
  switching.value = true
  try {
    const res = await adminApi.updateStorageConfig(buildPayload())
    if (res.code === 200) {
      ElMessage.success(t('admin.storagePage.switched'))
      load()
    } else {
      handleError(new Error(res.message || t('admin.storagePage.switchFailed')))
    }
  } catch (e) {
    handleError(e)
  } finally {
    switching.value = false
  }
}


// ---- 宿主授权目录(经宿主适配器 SPI;default 适配器恒 null → 整卡隐藏) ----
interface HostDirItem {
  path: string
  semantic: string
}
const hostDirs = ref<HostDirItem[] | null>(null)
const picking = ref(false)

const loadDirs = async () => {
  const items = await host.listAuthorizedDirs()
  if (items !== null) hostDirs.value = items
}

const pickAndAuthorize = async () => {
  picking.value = true
  try {
    const picked = await host.pickAuthorizedDir()
    if (picked && picked.length) ElMessage.success(t('admin.storagePage.authorized'))
    await loadDirs()
  } finally {
    picking.value = false
  }
}

// 授权目录一键用作本地存储数据路径:切到 local 类型并回填 storage_path
const applyAsDataPath = (item: HostDirItem) => {
  form.type = 'local'
  onTypeChange()
  values.storage_path = item.path
  ElMessage.success(t('admin.storagePage.dataPathFilled'))
}

const openDir = async (item: HostDirItem) => {
  if (!(await host.openDir(item.path))) {
    ElMessage.warning(t('admin.storagePage.notInHost', { host: host.name || t('admin.storagePage.supportedHost') }))
  }
}

// 能力可能由适配器异步探测( installHost→init ),watch 即便挂载时未就绪
// 也能在能力就位后加载
watch(
  () => host.capabilities.sharedDirs,
  (v) => {
    if (v) void loadDirs()
  },
  { immediate: true }
)

onMounted(() => {
  resetForm()
  load()
})
</script>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.host-dirs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.host-dirs-header h3 {
  margin: 0;
}
.mono {
  font-family: var(--el-font-family, monospace);
  font-size: 12px;
  word-break: break-all;
}
.chips {
  margin-top: 12px;
}
.chips-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-right: 6px;
}
.chip {
  margin-right: 6px;
}
.degraded {
  color: var(--el-color-warning);
  font-size: 12px;
  margin-left: 6px;
}
.quota-text {
  margin: 10px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.quota-used {
  margin: 6px 0 0;
  font-size: 13px;
}
</style>
