<template>
  <div class="requests-page">
    <PageHeader :title="t('request.pageTitle')" :desc="t('request.pageDesc')" />

    <!-- 创建表单 -->
    <el-card class="create-card" shadow="never">
      <template #header>{{ t('request.createTitle') }}</template>
      <el-form :inline="true" class="create-form">
        <el-form-item :label="t('request.formTitle')">
          <el-input v-model="form.title" :placeholder="t('request.formTitlePh')" maxlength="100" style="width: 220px" />
        </el-form-item>
        <el-form-item :label="t('request.formMaxFiles')">
          <el-input-number v-model="form.max_files" :min="0" :max="100" controls-position="right" />
          <span class="hint">{{ t('request.unlimitedHint') }}</span>
        </el-form-item>
        <el-form-item :label="t('request.formMaxBytes')">
          <el-select v-model="form.max_bytes_mb" style="width: 130px">
            <el-option :label="t('request.unlimited')" :value="0" />
            <el-option label="100 MB" :value="100" />
            <el-option label="500 MB" :value="500" />
            <el-option label="1 GB" :value="1024" />
            <el-option label="5 GB" :value="5120" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('request.formExpire')">
          <div class="expire-inputs">
            <el-input-number
              v-model="form.expire_value"
              :min="1"
              :max="999"
              controls-position="right"
              :disabled="form.expire_style === 'forever'"
              style="width: 110px"
            />
            <el-select v-model="form.expire_style" style="width: 92px">
              <el-option :label="t('request.unitDay')" value="day" />
              <el-option :label="t('request.unitWeek')" value="week" />
              <el-option :label="t('request.unitMonth')" value="month" />
              <el-option :label="t('request.unitYear')" value="year" />
              <el-option :label="t('request.unitForever')" value="forever" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="creating" @click="create">{{ t('request.createBtn') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 链接列表 -->
    <el-card shadow="never" style="margin-top: 16px">
      <template #header>{{ t('request.listTitle') }}</template>
      <el-table :data="list" v-loading="loadingList" style="width: 100%" class="admin-table-wide">
        <el-table-column :label="t('request.formTitle')" prop="title" min-width="160">
          <template #default="{ row }">{{ row.title || t('request.noTitle') }}</template>
        </el-table-column>
        <el-table-column :label="t('request.statusCol')" width="100">
          <template #default="{ row }">
            <el-tag v-if="isExpired(row)" type="danger" size="small">{{ t('request.expired') }}</el-tag>
            <el-tag v-else type="success" size="small">{{ t('request.active') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('request.usageCol')" width="140">
          <template #default="{ row }">{{ t('request.usedTimes', { n: row.used_count ?? 0 }) }} / {{ formatSize(row.recv_bytes) }}</template>
        </el-table-column>
        <el-table-column :label="t('request.expireCol')" width="170">
          <template #default="{ row }">{{ row.expired_at ? new Date(row.expired_at).toLocaleString() : t('request.forever') }}</template>
        </el-table-column>
        <el-table-column :label="t('request.actionsCol')" width="220" fixed="right" class-name="nowrap-actions">
          <template #default="{ row }">
            <el-button size="small" type="primary" text @click="copyLink(row.token)">
              <el-icon><CopyDocument /></el-icon> {{ t('request.copyLink') }}
            </el-button>
            <el-popconfirm :title="t('request.revokeConfirm')" @confirm="remove(row.token)">
              <template #reference>
                <el-button size="small" type="danger" text>{{ t('request.revoke') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 窄屏（≤1024px）卡片形态：本表 5 列合计 ~790px（其中操作列 220px 且
           fixed="right"）⇒ 手机 / 折叠屏内屏 / 平板竖屏放不下 ⇒ 内容列被裁、
           固定操作列**盖住**相邻列（与 user/Shares.vue 同型缺陷）。
           表格与卡片**同时渲染**、纯 CSS 互斥（全局 .admin-table-wide / .narrow-cards）。 -->
      <NarrowCardList :rows="list" :fields="cardFields" :row-key="(row: FileRequestItem) => row.token">
        <template #head="{ row }">{{ row.title || t('request.noTitle') }}</template>
        <template #status="{ row }">
          <el-tag v-if="isExpired(row)" type="danger" size="small">{{ t('request.expired') }}</el-tag>
          <el-tag v-else type="success" size="small">{{ t('request.active') }}</el-tag>
        </template>
        <template #usage="{ row }">
          {{ t('request.usedTimes', { n: row.used_count ?? 0 }) }} / {{ formatSize(row.recv_bytes) }}
        </template>
        <template #expire="{ row }">
          {{ row.expired_at ? new Date(row.expired_at).toLocaleString() : t('request.forever') }}
        </template>
        <template #actions="{ row }">
          <el-button size="small" type="primary" text @click="copyLink(row.token)">
            <el-icon><CopyDocument /></el-icon> {{ t('request.copyLink') }}
          </el-button>
          <el-popconfirm :title="t('request.revokeConfirm')" @confirm="remove(row.token)">
            <template #reference>
              <el-button size="small" type="danger" text>{{ t('request.revoke') }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </NarrowCardList>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { formatFileSize as formatSize } from '@/utils/format'
import { ref, onMounted, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { CopyDocument } from '@element-plus/icons-vue'
import { requestApi, type FileRequestItem } from '@/api/request'
import { copyToClipboard } from '@/utils/clipboard'
import PageHeader from '@/components/data/PageHeader.vue'
import NarrowCardList from '@/components/admin/NarrowCardList.vue'
import { useErrorHandler } from '@/composables/useErrorHandler'

const { handleError } = useErrorHandler()

const { t } = useI18n()

const list = ref<FileRequestItem[]>([])
const loadingList = ref(false)
const creating = ref(false)

const form = reactive({
  title: '',
  max_files: 0,
  max_bytes_mb: 0,
  expire_value: 7,
  expire_style: 'day',
})

const isExpired = (row: FileRequestItem) =>
  !!row.expired_at && new Date(row.expired_at).getTime() < Date.now()

// 窄屏卡片字段策展（标签复用表格列的同一批 i18n key ⇒ 宽窄两屏口径一致）
const cardFields = computed(() => [
  { key: 'status', label: t('request.statusCol') },
  { key: 'usage', label: t('request.usageCol') },
  { key: 'expire', label: t('request.expireCol') },
])

const buildLink = (token: string) => `${window.location.origin}/#/request/${token}`

const load = async () => {
  loadingList.value = true
  try {
    const res = await requestApi.listMine()
    if (res.code === 200) list.value = res.data || []
  } catch (e) {
    // 取数失败必须显式反馈（2026-10-26 审计）：此前只有 finally ⇒ 后端 5xx 时
    // 页面渲染一张**空表格且零提示** ⇒ 用户以为「自己从没建过请求」。
    handleError(e)
  } finally {
    loadingList.value = false
  }
}

const create = async () => {
  creating.value = true
  try {
    const res = await requestApi.create({
      title: form.title,
      max_files: form.max_files,
      max_bytes: form.max_bytes_mb * 1024 * 1024,
      expire_value: form.expire_value,
      expire_style: form.expire_style,
    })
    if (res.code === 200) {
      ElMessage.success(t('request.created'))
      await load()
      const last = list.value[0]
      if (last) await copyLink(last.token)
    } else {
      throw new Error(res.message || '创建失败')
    }
  } catch (e: unknown) {
    handleError(e)
  } finally {
    creating.value = false
  }
}

const copyLink = async (token: string) => {
  const link = buildLink(token)
  const ok = await copyToClipboard(link)
  if (ok) {
    ElMessage.success(t('request.copied'))
  } else {
    // 剪贴板完全不可用（极旧浏览器等）：把链接摆出来让用户手动复制
    ElMessageBox.alert(link, t('request.copyLink'), { confirmButtonText: t('common.confirm') })
  }
}

const remove = async (token: string) => {
  // 撤销失败必须有提示（2026-10-26 审计）：此前整个函数**没有 try/catch** ⇒
  // popconfirm 回调 reject ⇒ 无提示、列表不刷新 ⇒ **用户以为撤销成功，
  // 实际链接仍可对外投递**（最危险的一类静默失败）。
  try {
    const res = await requestApi.remove(token)
    if (res.code === 200) {
      ElMessage.success(t('request.revoked'))
      await load()
    } else {
      handleError(new Error(res.message || '撤销失败'))
    }
  } catch (e) {
    handleError(e)
  }
}

onMounted(load)
</script>

<style scoped>
.requests-page {
  max-width: 1000px;
}
.page-header h2 {
  margin: 0 0 6px;
  font-size: 22px;
  color: var(--color-text-primary);
}
.page-header p {
  margin: 0 0 16px;
  color: var(--color-text-secondary);
  font-size: 14px;
}
.create-card :deep(.el-card__header) {
  font-weight: 600;
}
.create-form .hint {
  margin-left: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.create-form .expire-inputs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
