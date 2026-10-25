<template>
  <div class="local-files">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ t('admin.localFilesPage.title') }}</span>
          <div class="header-actions">
            <template v-if="!featureDisabled">
              <el-select v-model="rootIdx" class="root-select" :placeholder="t('admin.localFilesPage.rootPlaceholder')" @change="onRootChange">
                <el-option v-for="(r, i) in roots" :key="i" :label="r" :value="i" />
              </el-select>
              <el-button :icon="'Refresh'" circle @click="load" />
              <!-- 宿主联动:在宿主文件管理器中打开当前目录 -->
              <el-button v-if="hostAvailable" @click="openInHostFileManager">{{ t('admin.localFilesPage.openInFileManager') }}</el-button>
            </template>
          </div>
        </div>
      </template>

      <div v-if="!featureDisabled" class="breadcrumb-bar">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>
            <el-link type="primary" @click="goto('')">{{ t('admin.localFilesPage.root') }}</el-link>
          </el-breadcrumb-item>
          <el-breadcrumb-item v-for="seg in dirSegments" :key="seg.path">
            <el-link type="primary" @click="goto(seg.path)">{{ seg.name }}</el-link>
          </el-breadcrumb-item>
        </el-breadcrumb>
        <span v-if="!roots.length" class="empty-hint">
          {{ t('admin.localFilesPage.disabledHint') }}
        </span>
      </div>

      <!-- 功能不可用的引导态:不再发注定失败请求弹全局错误,直接说明配置路径。
           两种情形分级:未启用 vs 已启用但白名单目录为空(后端报错文案不同) -->
      <el-empty v-if="featureDisabled" :description="noRootsGuide ? t('admin.localFilesPage.emptyNoRoots') : t('admin.localFilesPage.emptyDisabled')">
        <div class="disabled-guide">
          <p v-if="noRootsGuide">
            {{ t('admin.localFilesPage.noRootsGuideBody') }}
          </p>
          <p v-else>
            {{ t('admin.localFilesPage.disabledGuidePrefix') }}
            <code>upload.local_import.enabled</code>
            {{ t('admin.localFilesPage.disabledGuideMid') }}
            <code>roots</code>
            {{ t('admin.localFilesPage.disabledGuideSuffix') }}
          </p>
          <el-button type="primary" @click="$router.push(adminBase + '/config')">{{ t('admin.localFilesPage.goConfig') }}</el-button>
        </div>
      </el-empty>
      <el-table v-else v-loading="loading" :data="entries" class="admin-table-wide" style="width: 100%">
        <el-table-column :label="t('admin.localFilesPage.colName')" min-width="280">
          <template #default="{ row }">
            <el-icon class="file-icon"><Document v-if="!row.is_dir" /><Folder v-else /></el-icon>
            <el-link v-if="row.is_dir" type="primary" @click="goto(row.path)">{{ row.name }}</el-link>
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.size')" width="120">
          <template #default="{ row }">
            {{ row.is_dir ? '—' : formatFileSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('admin.localFilesPage.colModified')" width="180">
          <template #default="{ row }">{{ formatTime(row.mod_time) }}</template>
        </el-table-column>
        <el-table-column :label="t('admin.localFilesPage.colActions')" :width="hostAvailable ? 360 : 240" fixed="right" class-name="nowrap-actions">
          <template #default="{ row }">
            <template v-if="!row.is_dir">
              <el-button size="small" type="primary" @click="openImport(row)">{{ t('admin.localFilesPage.genCode') }}</el-button>
              <el-button size="small" type="danger" plain @click="onDelete(row)">{{ t('admin.localFilesPage.delete') }}</el-button>
              <!-- 宿主联动:用宿主应用打开/查看详情 -->
              <template v-if="hostAvailable">
                <el-button size="small" @click="openInHost(row)">{{ t('admin.localFilesPage.open') }}</el-button>
                <el-button size="small" @click="detailsInHost(row)">{{ t('admin.localFilesPage.details') }}</el-button>
              </template>
            </template>
            <el-button v-else-if="hostAvailable" size="small" @click="openDirInHost(row)">{{ t('admin.localFilesPage.openDir') }}</el-button>
          </template>
        </el-table-column>
        <template #empty>{{ t('admin.localFilesPage.emptyDir') }}</template>
      </el-table>

      <!-- 窄屏（≤768px）卡片形态：条件与上面表格的 v-else 等价（不插在 v-if/v-else
           中间，免得打断指令链）。 -->
      <NarrowCardList v-if="!featureDisabled" :rows="entries" :fields="cardFields">
        <template #head="{ row }">
          <el-icon class="file-icon"><Document v-if="!row.is_dir" /><Folder v-else /></el-icon>
          <el-link v-if="row.is_dir" type="primary" @click="goto(row.path)">{{ row.name }}</el-link>
          <span v-else>{{ row.name }}</span>
        </template>
        <template #size="{ row }">{{ row.is_dir ? '—' : formatFileSize(row.size) }}</template>
        <template #modified="{ row }">{{ formatTime(row.mod_time) }}</template>
        <template #actions="{ row }">
          <template v-if="!row.is_dir">
            <el-button size="small" type="primary" @click="openImport(row)">{{ t('admin.localFilesPage.genCode') }}</el-button>
            <el-button size="small" type="danger" plain @click="onDelete(row)">{{ t('admin.localFilesPage.delete') }}</el-button>
            <template v-if="hostAvailable">
              <el-button size="small" @click="openInHost(row)">{{ t('admin.localFilesPage.open') }}</el-button>
              <el-button size="small" @click="detailsInHost(row)">{{ t('admin.localFilesPage.details') }}</el-button>
            </template>
          </template>
          <el-button v-else-if="hostAvailable" size="small" @click="openDirInHost(row)">{{ t('admin.localFilesPage.openDir') }}</el-button>
        </template>
      </NarrowCardList>
    </el-card>

    <!-- 生成提取码对话框 -->
    <el-dialog v-model="importVisible" :title="t('admin.localFilesPage.importTitle')" width="480px">
      <el-form label-width="90px">
        <el-form-item :label="t('admin.localFilesPage.fileLabel')">
          <span class="mono">{{ importForm.path }}</span>
        </el-form-item>
        <el-form-item :label="t('request.formExpire')">
          <el-input-number v-model="importForm.expire_value" :min="1" :max="3650" />
          <el-select v-model="importForm.expire_style" class="style-select">
            <el-option :label="t('request.unitDay')" value="day" />
            <el-option :label="t('request.unitWeek')" value="week" />
            <el-option :label="t('request.unitMonth')" value="month" />
            <el-option :label="t('request.unitYear')" value="year" />
            <el-option :label="t('request.unitForever')" value="forever" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.localFilesPage.pickupPasswordLabel')">
          <el-switch v-model="importForm.require_auth" />
          <el-input
            v-if="importForm.require_auth"
            v-model="importForm.password"
            class="pwd-input"
            :placeholder="t('admin.localFilesPage.pickupPasswordPlaceholder')"
            show-password
          />
        </el-form-item>
        <el-form-item :label="t('admin.localFilesPage.customCodeLabel')">
          <el-input v-model="importForm.custom_code" :placeholder="t('admin.localFilesPage.customCodePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importVisible = false">{{ t('admin.localFilesPage.cancel') }}</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">{{ t('admin.localFilesPage.generate') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { getAdminBase } from '@/router'
const adminBase = getAdminBase()
import { formatFileSize } from '@/utils/format'
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Document, Folder } from '@element-plus/icons-vue'
import { localFilesApi, type LocalFileEntry } from '@/api/localFiles'
import { useErrorHandler } from '@/composables/useErrorHandler'
import NarrowCardList from '@/components/admin/NarrowCardList.vue'
import { host } from '@/host'

// ── 窄屏（≤768px）卡片字段 ──────────────────────────────────────────────────
// 标签**复用表格列的同一批 i18n key** ⇒ 宽窄两屏口径一致、不新增翻译。
const cardFields = computed(() => [
  { key: 'size', label: t('admin.size') },
  { key: 'modified', label: t('admin.localFilesPage.colModified') },
])

const { t } = useI18n()
const { handleError } = useErrorHandler()

const roots = ref<string[]>([])
const rootIdx = ref(0)
const dir = ref('')
const entries = ref<LocalFileEntry[]>([])
const loading = ref(false)
// 功能未启用(服务端 upload.local_import.enabled=false):展示配置引导而非报错
const featureDisabled = ref(false)
// 已启用但白名单目录为空:引导文案换成补 roots 的指向(与未启用分级)
const noRootsGuide = ref(false)
// 宿主文件动作可用性(适配器能力声明;default 恒 false → 按钮不渲染)
const hostAvailable = computed(() => host.capabilities.fileActions)

const isDisabledMessage = (msg?: string) =>
  !!msg && (msg.includes(t('admin.localFilesPage.serverDisabledPattern')) || msg.includes(t('admin.localFilesPage.serverNoRootsPattern')))

const applyDisabledState = (msg?: string) => {
  featureDisabled.value = true
  noRootsGuide.value = !!msg && msg.includes(t('admin.localFilesPage.serverNoRootsPattern'))
}

const dirSegments = computed(() => {
  const parts = dir.value.split('/').filter(Boolean)
  let acc = ''
  return parts.map((p) => {
    acc = acc ? `${acc}/${p}` : p
    return { name: p, path: acc }
  })
})

const load = async () => {
  loading.value = true
  try {
    const resp = await localFilesApi.list(rootIdx.value, dir.value)
    if (resp.code === 200) {
      featureDisabled.value = false
      roots.value = resp.data.roots || []
      entries.value = resp.data.entries || []
    } else if (isDisabledMessage(resp.message)) {
      applyDisabledState(resp.message)
    } else {
      ElMessage.error(resp.message || t('admin.localFilesPage.loadFailed'))
    }
  } catch (e) {
    const msg = (e as { message?: string })?.message
    const respMsg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    if (isDisabledMessage(msg) || isDisabledMessage(respMsg)) {
      applyDisabledState(msg || respMsg)
    } else {
      handleError(e)
    }
  } finally {
    loading.value = false
  }
}

const onRootChange = () => {
  dir.value = ''
  load()
}

// 当前浏览目录的绝对路径(root + 相对 dir)
const currentDirPath = computed(() => {
  const root = roots.value[rootIdx.value] || ''
  if (!root) return ''
  const rel = dir.value.replace(/^\//, '')
  return rel ? `${root}/${rel}` : root
})

// ---- 宿主文件动作(经宿主适配器 SPI;失败提示不含平台专名) ----
const notInHostWarning = () => ElMessage.warning(t('admin.localFilesPage.notInHost'))

const openInHostFileManager = async () => {
  if (!currentDirPath.value) return
  if (!(await host.openDir(currentDirPath.value))) notInHostWarning()
}

const openInHost = async (row: LocalFileEntry) => {
  if (!(await host.openFile(row.path))) notInHostWarning()
}

const detailsInHost = async (row: LocalFileEntry) => {
  if (!(await host.showFileDetails([row.path]))) notInHostWarning()
}

const openDirInHost = async (row: LocalFileEntry) => {
  if (!(await host.openDir(row.path))) notInHostWarning()
}

const goto = (path: string) => {
  dir.value = path
  load()
}

const onDelete = async (row: LocalFileEntry) => {
  try {
    await ElMessageBox.confirm(t('admin.localFilesPage.deleteConfirmBody', { name: row.name }), t('admin.localFilesPage.deleteConfirmTitle'), {
      type: 'warning',
      confirmButtonText: t('admin.localFilesPage.delete'),
      cancelButtonText: t('admin.localFilesPage.cancel'),
    })
  } catch {
    return
  }
  try {
    await localFilesApi.remove(rootIdx.value, row.path)
    ElMessage.success(t('admin.localFilesPage.deleted'))
    load()
  } catch (e) {
    handleError(e)
  }
}

const importVisible = ref(false)
const importing = ref(false)
const importForm = ref({
  path: '',
  expire_value: 7,
  expire_style: 'day',
  require_auth: false,
  password: '',
  custom_code: '',
})

const openImport = (row: LocalFileEntry) => {
  importForm.value = {
    path: row.path,
    expire_value: 7,
    expire_style: 'day',
    require_auth: false,
    password: '',
    custom_code: '',
  }
  importVisible.value = true
}

const doImport = async () => {
  const f = importForm.value
  if (f.require_auth && !f.password) {
    ElMessage.warning(t('admin.localFilesPage.passwordRequired'))
    return
  }
  importing.value = true
  try {
    const resp = await localFilesApi.importShare({
      root: rootIdx.value,
      path: f.path,
      expire_value: f.expire_value,
      expire_style: f.expire_style,
      require_auth: f.require_auth,
      password: f.password || undefined,
      custom_code: f.custom_code || undefined,
    })
    if (!(resp.code === 200)) {
      ElMessage.error(resp.message || t('admin.localFilesPage.importFailed'))
      return
    }
    const data = resp.data
    importVisible.value = false
    const codeText = data?.code ? t('admin.localFilesPage.importedCode', { code: data.code }) : t('admin.localFilesPage.imported')
    ElMessage.success(codeText)
    if (data?.share_url) {
      await navigator.clipboard?.writeText(data.share_url).catch(() => undefined)
      ElMessage({ message: t('admin.localFilesPage.shareUrlCopied', { url: data.share_url }), type: 'success', duration: 5000 })
    }
  } catch (e) {
    handleError(e)
  } finally {
    importing.value = false
  }
}


const formatTime = (s: string): string => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

onMounted(load)
</script>

<style scoped>
.local-files {
  padding: 0;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.root-select {
  width: 280px;
}
.breadcrumb-bar {
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.empty-hint {
  color: var(--el-color-warning);
  font-size: 13px;
}
.file-icon {
  margin-right: 6px;
  vertical-align: -2px;
}
.mono {
  font-family: monospace;
  word-break: break-all;
}
.style-select {
  width: 100px;
  margin-left: 12px;
}
.pwd-input {
  width: 180px;
  margin-left: 12px;
}
.disabled-guide {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.8;
}
.disabled-guide code {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-muted);
  font-family: monospace;
  color: var(--color-text-primary);
}
</style>
