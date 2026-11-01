<template>
  <el-dialog v-model="visible" :title="t('history.title')" width="520px">
    <el-tabs v-model="activeTab">
      <el-tab-pane name="pickup">
        <template #label>
          <span class="hist-tab-label">
            <el-icon><Download /></el-icon>
            {{ t('history.pickup') }}
          </span>
        </template>
        <template v-if="pickupList.length">
          <div class="hist-list">
            <div
              v-for="rec in pickupList"
              :key="rec.code + rec.time"
              class="hist-row"
              :class="{ 'hist-row-expired': rec.expired }"
              @click="onPickup(rec)"
            >
              <span class="hist-code">{{ rec.pickup_code || rec.code }}</span>
              <span class="hist-name">{{ rec.name || t('history.share') }}</span>
              <el-tag v-if="rec.expired" size="small" type="info" class="hist-expired-tag">
                {{ t('history.expired') }}
              </el-tag>
              <span class="hist-time">{{ formatTime(rec.time) }}</span>
            </div>
          </div>
          <div class="hist-actions">
            <el-button size="small" text type="danger" @click="clearPickup">
              {{ t('history.clear') }}
            </el-button>
          </div>
        </template>
        <el-empty v-else :description="t('history.empty')" :image-size="72" />
      </el-tab-pane>

      <el-tab-pane name="send">
        <template #label>
          <span class="hist-tab-label">
            <el-icon><Upload /></el-icon>
            {{ t('history.send') }}
          </span>
        </template>
        <template v-if="sendList.length">
          <div class="hist-list">
            <div
              v-for="rec in sendList"
              :key="rec.code + rec.time"
              class="hist-row"
              :class="{ 'hist-row-expired': rec.expired }"
              @click="onCopySend(rec)"
            >
              <!-- 发件记录回显**用户手上真正持有的 6 位取件码**（2026-10-22）：
                   此前回显 8 位分享码，与用户在成功弹窗里拿到的码不是同一个，
                   复制出来的东西对不上。pickup_code 缺失时回退分享码。 -->
              <span class="hist-code">{{ rec.pickup_code || rec.code }}</span>
              <span class="hist-name">{{ rec.name || t('history.share') }}</span>
              <el-tag v-if="rec.expired" size="small" type="info" class="hist-expired-tag">
                {{ t('history.expired') }}
              </el-tag>
              <span class="hist-time">{{ formatTime(rec.time) }}</span>
            </div>
          </div>
          <div class="hist-actions">
            <el-button size="small" text type="danger" @click="clearSend">
              {{ t('history.clear') }}
            </el-button>
          </div>
        </template>
        <el-empty v-else :description="t('history.empty')" :image-size="72" />
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Download, Upload } from '@element-plus/icons-vue'
import { copyToClipboard } from '@/utils/clipboard'
import { localHistory, type LocalShareRecord } from '@/utils/localHistory'

/**
 * 本机取件/发件记录弹窗（对标上游"取件记录/发件记录"，2026-10-07）：
 * 数据源=localStorage（见 utils/localHistory.ts），仅本设备可见。
 * 取件行点击 emit `pickup(code)` 由调用方路由；发件行点击复制完整链接。
 */
const { t } = useI18n()

const visible = ref(false)
const activeTab = ref<'pickup' | 'send'>('pickup')
const pickupList = ref<LocalShareRecord[]>([])
const sendList = ref<LocalShareRecord[]>([])

const emit = defineEmits<{ pickup: [code: string] }>()

const open = (tab: 'pickup' | 'send' = 'pickup') => {
  pickupList.value = localHistory.getPickup()
  sendList.value = localHistory.getSend()
  activeTab.value = tab
  visible.value = true
}

const formatTime = (ts: number) => {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

const onPickup = (rec: LocalShareRecord) => {
  // 已过期的记录不再跳取件（2026-10-22）：跳过去只会在取件页拿到一句过期，
  // 用户以为是自己输错了码。留在列表里置灰即可。
  if (rec.expired) {
    ElMessage.warning(t('history.expiredHint'))
    return
  }
  visible.value = false
  emit('pickup', rec.pickup_code || rec.code)
}

const onCopySend = async (rec: LocalShareRecord) => {
  if (rec.expired) {
    ElMessage.warning(t('history.expiredHint'))
    return
  }
  if (!rec.url) return
  const ok = await copyToClipboard(rec.url)
  if (ok) ElMessage.success(t('home.linkCopied'))
}

const clearPickup = () => {
  localHistory.clearPickup()
  pickupList.value = []
  ElMessage.success(t('history.cleared'))
}

const clearSend = () => {
  localHistory.clearSend()
  sendList.value = []
  ElMessage.success(t('history.cleared'))
}

defineExpose({ open })
</script>

<style scoped>
.hist-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hist-list {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.hist-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border-light);
  transition: background-color 0.15s ease;
}

.hist-row:last-child {
  border-bottom: none;
}

/* 已过期记录置灰（2026-10-22）：记录无过期标识时，过期分享长期滞留，
   点「取件」才知过期——用户会以为是自己输错了码。 */
.hist-row-expired {
  opacity: 0.55;
  cursor: default;
}

.hist-expired-tag {
  flex: 0 0 auto;
}

.hist-row:hover {
  background: var(--color-muted);
}

.hist-code {
  font-family: 'SF Mono', Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
  font-size: 15px;
  color: var(--primary-color);
  min-width: 72px;
}

.hist-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text-primary);
}

.hist-time {
  font-size: 12px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.hist-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
