<template>
  <div class="storage-management">
    <!-- 当前状态 -->
    <el-card v-loading="loading" class="mb">
      <template #header><h3>存储状态</h3></template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="配置类型">
          <el-tag>{{ info.current || 'local' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="实际生效">
          <el-tag :type="info.effective === info.current ? 'success' : 'warning'">
            {{ info.effective || info.current || 'local' }}
          </el-tag>
          <span v-if="info.effective && info.effective !== info.current" class="degraded">
            （配置后端不可用，已降级）
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="数据路径">
          {{ info.data_path || '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="chips">
        <span class="chips-label">支持后端：</span>
        <el-tag v-for="t in info.available || []" :key="t" size="small" class="chip">{{ t }}</el-tag>
      </div>
    </el-card>

    <!-- 站点配额 -->
    <el-card class="mb">
      <template #header><h3>站点存储配额</h3></template>
      <template v-if="quota > 0">
        <el-progress :percentage="usagePercent" :status="usagePercent >= 95 ? 'exception' : 'success'" />
        <p class="quota-text">{{ formatFileSize(used) }} / {{ formatFileSize(quota) }}（统计口径：存活分享合计，未完成分片会话不计入）</p>
      </template>
      <template v-else>
        <p class="quota-text">未启用站点级配额（storage.quota / PB_STORAGE_QUOTA，0=不限）。</p>
      </template>
      <p class="quota-used">当前已用：{{ formatFileSize(used) }}</p>
    </el-card>

    <!-- 切换后端 -->
    <el-card>
      <template #header><h3>切换存储后端</h3></template>
      <el-alert
        title="保存即执行：SSRF 校验 → 认证级 Probe → 热切换 → 持久化；任一失败不改动现有配置"
        type="warning"
        :closable="false"
        class="mb"
      />
      <el-form label-width="120px">
        <el-form-item label="目标类型">
          <el-select v-model="form.type" @change="onTypeChange">
            <el-option v-for="t in allTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-for="f in fields" :key="f.key" :label="f.label">
          <el-switch v-if="f.kind === 'bool'" v-model="values[f.key]" />
          <el-input v-else v-model="values[f.key] as string" :placeholder="f.ph" :type="f.secret ? 'password' : 'text'" show-password />
        </el-form-item>
      </el-form>
      <div>
        <el-button type="primary" :loading="switching" @click="doSwitch">校验并切换</el-button>
        <el-button @click="resetForm">重置</el-button>
      </div>
    </el-card>

    <!-- 宿主授权目录:宿主适配器提供能力时展示(授权列表/选择器/打开目录);
         无宿主部署整卡隐藏 -->
    <el-card v-if="hostDirs !== null">
      <template #header>
        <div class="host-dirs-header">
          <h3>{{ host.name }}授权目录</h3>
          <div>
            <el-button size="small" :loading="picking" @click="pickAndAuthorize">选择并授权目录</el-button>
            <el-button size="small" circle :icon="'Refresh'" @click="loadDirs" />
          </div>
        </div>
      </template>
      <el-alert
        title="管理员授权后应用才可读写对应目录;选择器由宿主系统弹出,授权结果实时生效"
        type="info"
        :closable="false"
        class="mb"
      />
      <el-table v-if="hostDirs.length" :data="hostDirs" size="small">
        <el-table-column label="展示路径" min-width="240">
          <template #default="{ row }">{{ row.semantic || row.path }}</template>
        </el-table-column>
        <el-table-column label="内部路径" min-width="240">
          <template #default="{ row }"><span class="mono">{{ row.path }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="applyAsDataPath(row)">用作数据路径</el-button>
            <el-button size="small" @click="openDir(row)">打开目录</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="尚无授权目录:点击「选择并授权目录」由宿主弹出目录选择器" :image-size="80" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize } from '@/utils/format'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { host } from '@/host'

const { handleError } = useErrorHandler()

interface FieldDef {
  key: string
  label: string
  ph?: string
  kind?: 'text' | 'bool' | 'int'
  secret?: boolean
}

// 各后端的最小可用字段集（完整字段见 server/configs/config.example.yaml 注释段）
const TYPE_DEFS: Record<string, { label: string; fields: FieldDef[] }> = {
  local: { label: '本地存储', fields: [{ key: 'storage_path', label: '数据路径', ph: './data' }] },
  s3: {
    label: 'Amazon S3',
    fields: [
      { key: 'endpoint', label: 'Endpoint', ph: 's3.us-east-1.amazonaws.com' },
      { key: 'bucket', label: 'Bucket' },
      { key: 'access_key', label: 'Access Key' },
      { key: 'secret_key', label: 'Secret Key', secret: true },
      { key: 'region', label: 'Region', ph: 'us-east-1' },
      { key: 'use_ssl', label: '使用 TLS', kind: 'bool' },
      { key: 'path_style', label: 'Path Style', kind: 'bool' },
    ],
  },
  oss: { label: '阿里云 OSS', fields: cloudFields() },
  cos: { label: '腾讯云 COS', fields: cloudFields() },
  bos: { label: '百度云 BOS', fields: cloudFields() },
  ks3: { label: '金山云 KS3', fields: cloudFields() },
  obs: { label: '华为云 OBS', fields: cloudFields() },
  gcs: { label: 'Google Cloud Storage', fields: [...cloudFields(), { key: 'endpoint', label: 'Endpoint', ph: 'storage.googleapis.com' }] },
  webdav: {
    label: 'WebDAV',
    fields: [
      { key: 'webdav_url', label: 'URL', ph: 'https://dav.example.com/dav/' },
      { key: 'webdav_username', label: '用户名' },
      { key: 'webdav_password', label: '密码', secret: true },
      { key: 'root', label: '远端子目录', ph: 'pigeonbox' },
    ],
  },
  ftp: {
    label: 'FTP / FTPS',
    fields: [
      { key: 'ftp_host', label: 'Host', ph: 'nas.local:21' },
      { key: 'ftp_username', label: '用户名' },
      { key: 'ftp_password', label: '密码', secret: true },
      { key: 'ftp_tls', label: 'FTPS(AUTH TLS)', kind: 'bool' },
      { key: 'root', label: '远端子目录', ph: 'pigeonbox' },
    ],
  },
  sftp: {
    label: 'SFTP',
    fields: [
      { key: 'sftp_host', label: 'Host', ph: 'nas.local:22' },
      { key: 'sftp_username', label: '用户名' },
      { key: 'sftp_password', label: '密码', secret: true },
      { key: 'sftp_private_key', label: 'PEM 私钥', secret: true, ph: '与密码二选一' },
      { key: 'sftp_host_key', label: 'Host Key', ph: '可选，known_hosts 行' },
      { key: 'root', label: '远端子目录', ph: 'pigeonbox' },
    ],
  },
  azureblob: {
    label: 'Azure Blob',
    fields: [
      { key: 'azureblob_account', label: 'Account' },
      { key: 'azureblob_container', label: 'Container' },
      { key: 'azureblob_key', label: '共享密钥', secret: true },
      { key: 'azureblob_sas', label: 'SAS', secret: true, ph: '与密钥二选一' },
      { key: 'azureblob_endpoint', label: 'Endpoint', ph: '可选，Azurite/主权云' },
      { key: 'root', label: '容器内前缀', ph: 'pigeonbox' },
    ],
  },
  hdfs: {
    label: 'HDFS (WebHDFS)',
    fields: [
      { key: 'hdfs_endpoint', label: 'WebHDFS 地址', ph: 'http://namenode:9870' },
      { key: 'hdfs_user', label: '代理用户' },
      { key: 'root', label: '远端子目录', ph: 'pigeonbox' },
    ],
  },
  onedrive: {
    label: 'OneDrive',
    fields: [
      { key: 'onedrive_client_id', label: 'Client ID' },
      { key: 'onedrive_client_secret', label: 'Client Secret', secret: true },
      { key: 'onedrive_refresh_token', label: 'Refresh Token', secret: true },
      { key: 'onedrive_tenant', label: 'Tenant', ph: 'common' },
      { key: 'onedrive_drive_id', label: 'Drive ID', ph: '可选，默认 me/drive' },
      { key: 'root', label: '远端子目录', ph: 'pigeonbox' },
    ],
  },
}

function cloudFields(): FieldDef[] {
  return [
    { key: 'region', label: 'Region', ph: '如 cn-hangzhou / ap-guangzhou' },
    { key: 'bucket', label: 'Bucket' },
    { key: 'access_key', label: 'Access Key' },
    { key: 'secret_key', label: 'Secret Key', secret: true },
    { key: 'endpoint', label: 'Endpoint', ph: '留空按 region 推导' },
  ]
}

const allTypes = Object.entries(TYPE_DEFS).map(([value, v]) => ({ value, label: v.label }))
const FIB = 'pigeonbox'

const loading = ref(false)
const switching = ref(false)
const info = reactive<Record<string, string | string[]>>({ current: '', effective: '', data_path: '', available: [] })
const used = ref(0)
const quota = ref(0)
const form = reactive({ type: 'local' })
const values = reactive<Record<string, string | boolean>>({})

const fields = computed(() => TYPE_DEFS[form.type]?.fields ?? [])
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
    if (res.code === 0 || res.code === 200) {
      const d = res.data as Record<string, unknown>
      info.current = (d.current as string) || ''
      info.effective = (d.effective as string) || ''
      info.available = (d.available as string[]) || []
    }
    const st = await adminApi.getEnhancedStats()
    if (st.code === 0 || st.code === 200) {
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
    if (res.code === 0 || res.code === 200) {
      ElMessage.success('已切换并持久化')
      load()
    } else {
      handleError(new Error(res.message || '切换失败'))
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
    if (picked && picked.length) ElMessage.success('授权成功')
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
  ElMessage.success('已填入数据路径,确认无误后点「校验并切换」生效')
}

const openDir = async (item: HostDirItem) => {
  if (!(await host.openDir(item.path))) {
    ElMessage.warning(`当前未运行在${host.name || '受支持的'}宿主中`)
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
