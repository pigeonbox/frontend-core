<template>
  <div class="insights-page">
    <div class="page-head">
      <div class="head-text">
        <h2>{{ t('admin.insights') }}</h2>
        <p>{{ t('admin.insightsPage.subtitle') }}</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="reload">
        {{ t('admin.insightsPage.refresh') }}
      </el-button>
    </div>

    <!-- 取数失败标记：与 Dashboard 同款——「没有数据」与「数据坏了」必须可区分 -->
    <div v-if="statsError || transferError || activitiesError" class="stats-error">
      <el-tag type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
    </div>

    <!-- 概览指标（全部服务端既有字段，前端只做派生） -->
    <el-row :gutter="24" class="stats-row">
      <el-col :span="6" :xs="12">
        <div class="stat-card">
          <div class="stat-value">{{ rateText(pickupRate) }}</div>
          <div class="stat-label">{{ t('admin.insightsPage.statPickupRate') }}</div>
          <div class="stat-hint">{{ t('admin.insightsPage.statPickupRateHint') }}</div>
          <div class="stat-source">{{ t('admin.insightsPage.source', { src: '/admin/stats' }) }}</div>
        </div>
      </el-col>

      <el-col :span="6" :xs="12">
        <div class="stat-card link" role="button" tabindex="0" @click="goNeverPicked" @keyup.enter="goNeverPicked">
          <div class="stat-value">{{ stats.neverPicked }}</div>
          <div class="stat-label">{{ t('admin.insightsPage.statNeverPicked') }}</div>
          <div class="stat-hint">{{ t('admin.insightsPage.statNeverPickedHint') }}</div>
          <div class="stat-source">{{ t('admin.insightsPage.source', { src: '/admin/stats' }) }}</div>
        </div>
      </el-col>

      <el-col :span="6" :xs="12">
        <div class="stat-card">
          <div class="stat-value">{{ enhanced.totalDownloads }}</div>
          <div class="stat-label">{{ t('admin.insightsPage.statTotalDownloads') }}</div>
          <div class="stat-hint">{{ t('admin.insightsPage.statTotalDownloadsHint') }}</div>
          <div class="stat-source">{{ t('admin.insightsPage.source', { src: '/admin/stats/enhanced' }) }}</div>
        </div>
      </el-col>

      <el-col :span="6" :xs="12">
        <div class="stat-card">
          <div class="stat-value">{{ windowDownloads }}</div>
          <div class="stat-label">{{ t('admin.insightsPage.statWindowDownloads') }}</div>
          <div class="stat-hint">{{ t('admin.insightsPage.transferNote', { n: transferItems.length, total: transferTotal }) }}</div>
          <div class="stat-source">{{ t('admin.insightsPage.source', { src: '/admin/logs/transfer' }) }}</div>
        </div>
      </el-col>
    </el-row>

    <!-- 7/30 天趋势：服务端已聚合的序列，直接喂仓内 TrendChart（不引图表库） -->
    <el-card class="chart-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <h3>{{ t('admin.insightsPage.trendTitle') }}</h3>
            <el-tag v-if="trendError" type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
          </div>
          <div class="header-right">
            <el-button-group>
              <el-button
                size="small"
                :type="trendDays === 7 ? 'primary' : 'default'"
                @click="setTrendDays(7)"
              >{{ t('admin.insightsPage.range7d') }}</el-button>
              <el-button
                size="small"
                :type="trendDays === 30 ? 'primary' : 'default'"
                @click="setTrendDays(30)"
              >{{ t('admin.insightsPage.range30d') }}</el-button>
            </el-button-group>
            <span class="source-chip">{{ t('admin.insightsPage.source', { src: '/admin/stats/trend' }) }}</span>
          </div>
        </div>
      </template>
      <TrendChart
        :data="trendData"
        :upload-label="t('admin.uploads')"
        :download-label="t('admin.downloads')"
        :empty-text="t('admin.noData')"
      />
    </el-card>

    <el-row :gutter="24" class="charts-row">
      <!-- 访问时段分布：transfer 日志窗口内 download 按服务器本地小时归桶 -->
      <el-col :span="12" :xs="24">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <div class="header-left">
                <h3>{{ t('admin.insightsPage.hourTitle') }}</h3>
                <el-tag v-if="transferError" type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
              </div>
              <span class="source-chip">{{ t('admin.insightsPage.source', { src: '/admin/logs/transfer' }) }}</span>
            </div>
          </template>
          <p class="block-note">{{ t('admin.insightsPage.hourNote', { n: windowDownloads }) }}</p>
          <div v-if="windowDownloads === 0" class="block-empty">
            <el-icon size="36"><TrendCharts /></el-icon>
            <p>{{ t('admin.noData') }}</p>
          </div>
          <div v-else class="hour-chart" role="img" :aria-label="t('admin.insightsPage.hourTitle')">
            <div v-for="(count, hour) in hourBuckets" :key="hour" class="hour-col">
              <div class="hour-track">
                <div
                  class="hour-bar"
                  :style="{ height: hourBarHeight(count) + '%' }"
                  :title="hourTip(hour, count)"
                ></div>
              </div>
              <span v-if="hour % 3 === 0" class="hour-label">{{ hour }}</span>
              <span v-else class="hour-label placeholder"></span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- TOP 分享：同一窗口按 file_code 聚合 download -->
      <el-col :span="12" :xs="24">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <div class="header-left">
                <h3>{{ t('admin.insightsPage.topTitle') }}</h3>
                <el-tag v-if="transferError" type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
              </div>
              <span class="source-chip">{{ t('admin.insightsPage.source', { src: '/admin/logs/transfer' }) }}</span>
            </div>
          </template>
          <p class="block-note">{{ t('admin.insightsPage.transferNote', { n: transferItems.length, total: transferTotal }) }}</p>
          <div v-if="topShareList.length === 0" class="block-empty">
            <el-icon size="36"><PieChart /></el-icon>
            <p>{{ t('admin.noData') }}</p>
          </div>
          <div v-else class="dist-list">
            <div v-for="(item, idx) in topShareList" :key="item.code" class="dist-item">
              <div class="dist-head">
                <span class="dist-name" :title="item.code">{{ item.name }}</span>
                <span class="dist-count">{{ item.count }} ({{ item.percent.toFixed(0) }}%)</span>
              </div>
              <div class="dist-track">
                <div
                  class="dist-bar"
                  :style="{ width: item.percent + '%', background: distColors[idx % distColors.length] }"
                ></div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 失败原因分布：审计 success=false 按 action 归组 -->
    <el-card class="chart-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <h3>{{ t('admin.insightsPage.failTitle') }}</h3>
            <el-tag v-if="activitiesError" type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
          </div>
          <span class="source-chip">{{ t('admin.insightsPage.source', { src: '/admin/activities' }) }}</span>
        </div>
      </template>
      <p class="block-note">{{ t('admin.insightsPage.activityNote', { n: activityItems.length, total: activityTotal }) }}</p>
      <div v-if="failList.length === 0" class="block-empty">
        <el-icon size="36"><CircleCheck /></el-icon>
        <p>{{ t('admin.insightsPage.failEmpty') }}</p>
      </div>
      <div v-else class="dist-list">
        <div v-for="(item, idx) in failList" :key="item.action" class="dist-item">
          <div class="dist-head">
            <span class="dist-name mono" :title="item.action">{{ item.action }}</span>
            <span class="dist-count">{{ item.count }} ({{ item.percent.toFixed(0) }}%)</span>
          </div>
          <div class="dist-track">
            <div
              class="dist-bar"
              :style="{ width: item.percent + '%', background: distColors[idx % distColors.length] }"
            ></div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Refresh, TrendCharts, PieChart, CircleCheck } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { getAdminBase } from '@/router'
import TrendChart, { type TrendPoint } from '@/components/TrendChart.vue'
import {
  failureBreakdown,
  hourHistogram,
  pickupRatePercent,
  topShares,
} from '@/utils/opsInsights'

const { t } = useI18n()
const router = useRouter()
const adminBase = getAdminBase()

// ── 窗口口径 ──────────────────────────────────────────────────────────────────
// 列表接口只支持分页、无时间过滤 ⇒ 「窗口」= 按 created_at DESC 拉到的**最近 N 条**。
// 首页拿 total 后并行补拉剩余页（≤ 上限）；并发写入会让页边界轻微漂移——
// 运营解读看的是形状不是账本，可接受，故不加串行锁。
const WINDOW_PAGE_SIZE = 100
const TRANSFER_MAX_PAGES = 10 // 最近 1000 条传输日志
const ACTIVITY_MAX_PAGES = 5 // 最近 500 条审计

interface WindowResult {
  items: any[]
  total: number
}

async function fetchWindow(
  fetchPage: (page: number) => Promise<WindowResult>,
  maxPages: number,
): Promise<WindowResult> {
  const first = await fetchPage(1)
  const items: any[] = [...first.items]
  const pages = Math.min(Math.ceil(first.total / WINDOW_PAGE_SIZE), maxPages)
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2)),
    )
    for (const r of rest) items.push(...r.items)
  }
  return { items, total: first.total }
}

// ── 状态 ──────────────────────────────────────────────────────────────────────
const loading = ref(false)
const statsError = ref(false)
const transferError = ref(false)
const activitiesError = ref(false)
const trendError = ref(false)

const stats = reactive({ activeFiles: 0, neverPicked: 0 })
const enhanced = reactive({ totalDownloads: 0 })
const trendDays = ref(7)
const trendData = ref<TrendPoint[]>([])
const transferItems = ref<any[]>([])
const transferTotal = ref(0)
const activityItems = ref<any[]>([])
const activityTotal = ref(0)

// ── 派生（纯函数在 utils/opsInsights.ts，口径见其注释） ──────────────────────
const pickupRate = computed(() => pickupRatePercent(stats.activeFiles, stats.neverPicked))
const windowDownloads = computed(
  () => transferItems.value.filter((r) => r.operation === 'download').length,
)
const hourBuckets = computed(() => hourHistogram(transferItems.value, 'download'))
const topShareList = computed(() => topShares(transferItems.value, 5))
const failList = computed(() => failureBreakdown(activityItems.value, 6))

const distColors = ['var(--primary-color)', '#7c3aed', '#0d9488', '#d97706', '#f43f5e', '#0ea5e9']

const rateText = (v: number | null): string => (v === null ? '—' : v.toFixed(1) + '%')

const maxHour = computed(() => Math.max(...hourBuckets.value, 1))
const hourBarHeight = (count: number): number =>
  count === 0 ? 0 : Math.max((count / maxHour.value) * 100, 4)
const hourTip = (hour: number, count: number): string =>
  String(hour).padStart(2, '0') + ':00 — ' + count

// ── 取数 ──────────────────────────────────────────────────────────────────────
const fetchStats = async () => {
  try {
    const [s, e] = await Promise.all([adminApi.getStats(), adminApi.getEnhancedStats()])
    if (s.code === 200 && s.data) {
      stats.activeFiles = (s.data as any).active_files || 0
      stats.neverPicked = (s.data as any).never_picked_files || 0
    }
    if (e.code === 200 && e.data) enhanced.totalDownloads = e.data.total_downloads || 0
    statsError.value = false
  } catch (err) {
    console.error('ops-insights: fetch stats failed', err)
    statsError.value = true
  }
}

const fetchTrend = async () => {
  try {
    const res = await adminApi.getStatsTrend(trendDays.value)
    const days = (res.data as { days?: TrendPoint[] })?.days
    if (Array.isArray(days) && days.length > 0) {
      trendData.value = days
      trendError.value = false
      return
    }
    trendData.value = []
    trendError.value = true
  } catch (err) {
    console.error('ops-insights: fetch trend failed', err)
    trendData.value = []
    trendError.value = true
  }
}

const fetchTransferWindow = async () => {
  try {
    const w = await fetchWindow(async (page) => {
      const res = await adminApi.getTransferLogsList({ page, page_size: WINDOW_PAGE_SIZE })
      if (res.code !== 200) throw new Error('transfer logs code=' + res.code)
      return { items: res.data?.items || [], total: res.data?.total || 0 }
    }, TRANSFER_MAX_PAGES)
    transferItems.value = w.items
    transferTotal.value = w.total
    transferError.value = false
  } catch (err) {
    console.error('ops-insights: fetch transfer window failed', err)
    transferItems.value = []
    transferTotal.value = 0
    transferError.value = true
  }
}

const fetchActivityWindow = async () => {
  try {
    const w = await fetchWindow(async (page) => {
      const res = await adminApi.getActivities({ page, page_size: WINDOW_PAGE_SIZE })
      if (res.code !== 200) throw new Error('activities code=' + res.code)
      // 契约里 items 的 wire 名是 list（idl admin.thrift: api.body="list"）
      return { items: res.data?.list || [], total: res.data?.total || 0 }
    }, ACTIVITY_MAX_PAGES)
    activityItems.value = w.items
    activityTotal.value = w.total
    activitiesError.value = false
  } catch (err) {
    console.error('ops-insights: fetch activities window failed', err)
    activityItems.value = []
    activityTotal.value = 0
    activitiesError.value = true
  }
}

const setTrendDays = (days: number) => {
  if (trendDays.value === days) return
  trendDays.value = days
  fetchTrend()
}

const reload = async () => {
  loading.value = true
  try {
    await Promise.all([fetchStats(), fetchTrend(), fetchTransferWindow(), fetchActivityWindow()])
  } finally {
    loading.value = false
  }
}

const goNeverPicked = () => {
  router.push({ path: adminBase + '/files', query: { health: 'never_picked' } })
}

onMounted(reload)
</script>

<style scoped>
.insights-page {
  padding: 0;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.head-text h2 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.head-text p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.stats-error {
  margin-bottom: 12px;
}

.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  height: 100%;
  box-sizing: border-box;
  padding: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  transition: border-color 0.2s ease;
}

.stat-card.link {
  cursor: pointer;
}

.stat-card.link:hover,
.stat-card.link:focus-visible {
  border-color: var(--primary-color);
}

.stat-value {
  font-size: 30px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.stat-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.stat-source {
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.charts-row {
  margin-bottom: 24px;
}

.chart-card {
  margin-bottom: 24px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.charts-row .chart-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.source-chip {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.block-note {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.block-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  color: var(--color-text-secondary);
  gap: 8px;
}

.block-empty p {
  margin: 0;
  font-size: 13px;
}

/* 24 小时柱：轨道等分，柱高按窗口内最大小时归一（0 值不画柱） */
.hour-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  min-height: 180px;
}

.hour-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.hour-track {
  width: 100%;
  height: 150px;
  display: flex;
  align-items: flex-end;
  background: var(--color-muted);
  border-radius: 4px;
  overflow: hidden;
}

.hour-bar {
  width: 100%;
  background: var(--primary-color);
  border-radius: 4px 4px 0 0;
  transition: height 0.4s ease;
  min-height: 0;
}

.hour-label {
  margin-top: 6px;
  font-size: 10px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.hour-label.placeholder {
  visibility: hidden;
}

/* 分布条（与 Dashboard 文件类型分布同构：文字在上、实色条+轨道在下） */
.dist-list {
  padding: 4px 0;
}

.dist-item {
  margin-bottom: 16px;
}

.dist-item:last-child {
  margin-bottom: 0;
}

.dist-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.dist-name {
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dist-name.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dist-count {
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.dist-track {
  height: 8px;
  border-radius: 999px;
  background: var(--color-muted);
  overflow: hidden;
}

.dist-bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

@media (max-width: 768px) {
  .hour-chart {
    gap: 2px;
  }

  .hour-track {
    height: 120px;
  }
}
</style>
