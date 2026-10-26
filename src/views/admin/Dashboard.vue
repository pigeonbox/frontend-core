<template>
  <div class="dashboard-container">
    <!-- 欢迎卡片 -->
    <div class="welcome-card">
      <div class="welcome-left">
        <h2 class="welcome-title">{{ greeting }}, {{ adminName }} 👋</h2>
        <p class="welcome-subtitle">{{ t('admin.welcomeSubtitle') }}</p>
        <div class="quick-actions">
          <el-button type="primary" round @click="$router.push(adminBase + '/files')">
            <el-icon><Folder /></el-icon>
            {{ t('admin.files') }}
          </el-button>
          <el-button round @click="$router.push(adminBase + '/users')">
            <el-icon><User /></el-icon>
            {{ t('admin.users') }}
          </el-button>
          <el-button round @click="$router.push(adminBase + '/config')">
            <el-icon><Setting /></el-icon>
            {{ t('admin.config') }}
          </el-button>
        </div>
      </div>
      <div class="welcome-right">
        <el-icon size="80"><Avatar /></el-icon>
      </div>
    </div>

    <!-- 统计卡片 -->
    <!-- ⚠️ 2026-10-26 审计修复：取数失败时**必须显式标记**。此前 catch 只
         console.error，随后 stats.* 保持 0、recent* 置空 ⇒ 页面渲染「用户数 0 /
         文件数 0 / 今日上传 0」+ 空表格，与「站点真的没人用」**视觉上完全一致**
         ⇒ 管理员可能据此误触发清理运维。 -->
    <div v-if="statsError" class="stats-error">
      <el-tag type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
    </div>
    <el-row :gutter="24" class="stats-row">
      <el-col :span="6" :xs="12">
        <div class="stat-card tone-primary">
          <div class="stat-icon">
            <el-icon size="32"><User /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.userCount }}</div>
            <div class="stat-label">{{ t('admin.totalUsers') }}</div>
          </div>
        </div>
      </el-col>

      <el-col :span="6" :xs="12">
        <div class="stat-card tone-violet">
          <div class="stat-icon">
            <el-icon size="32"><Folder /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.fileCount }}</div>
            <div class="stat-label">{{ t('admin.totalFiles') }}</div>
          </div>
        </div>
      </el-col>

      <el-col :span="6" :xs="12">
        <div class="stat-card tone-teal">
          <div class="stat-icon">
            <el-icon size="32"><Coin /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ formatFileSize(stats.totalStorage) }}</div>
            <div class="stat-label">{{ t('admin.storageUsed') }}</div>
          </div>
        </div>
      </el-col>

      <el-col :span="6" :xs="12">
        <div class="stat-card tone-amber">
          <div class="stat-icon">
            <el-icon size="32"><TrendCharts /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ animatedStats.todayUploads }}</div>
            <div class="stat-label">{{ t('admin.todayUploads') }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 文件健康洞察（2026-10-07 对标上游 dashboard：每张卡=可点击的过滤器直达处理） -->
    <el-card class="health-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <h3>{{ t('admin.health.title') }}</h3>
          <el-tag type="info" size="small">{{ t('admin.health.subtitle') }}</el-tag>
        </div>
      </template>
      <div class="health-grid">
        <div
          v-for="item in healthCards"
          :key="item.key"
          class="health-item"
          :class="'health-' + item.tone"
          @click="goHealth(item.key)"
        >
          <div class="health-count">{{ item.count }}</div>
          <div class="health-label">{{ t(item.label) }}</div>
          <el-icon class="health-arrow"><ArrowRight /></el-icon>
        </div>
      </div>
    </el-card>

    <!-- 图表区域 -->
    <el-row :gutter="24" class="charts-row">
      <el-col :span="12" :xs="24">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>{{ t('admin.trend7d') }}</h3>
              <el-tag v-if="trendError" type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
              <el-tag v-else type="info">{{ t('admin.realtime') }}</el-tag>
            </div>
          </template>
          <TrendChart
            :data="trendData"
            :upload-label="t('admin.uploads')"
            :download-label="t('admin.downloads')"
            :empty-text="t('admin.noData')"
          />
        </el-card>
      </el-col>

      <el-col :span="12" :xs="24">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>{{ t('admin.fileTypeDist') }}</h3>
              <el-tag type="info">{{ t('admin.realtime') }}</el-tag>
            </div>
          </template>
          <div class="file-type-dist">
            <div
              v-for="(item, idx) in fileTypeDist"
              :key="item.type"
              class="file-type-item"
            >
              <div class="file-type-head">
                <span class="file-type-name">{{ item.type }}</span>
                <span class="file-type-count">{{ item.count }} ({{ item.percent.toFixed(0) }}%)</span>
              </div>
              <div class="file-type-track">
                <div
                  class="file-type-bar"
                  :style="{ width: item.percent + '%', background: typeColors[idx % typeColors.length] }"
                ></div>
              </div>
            </div>
            <div v-if="fileTypeDist.length === 0" class="empty">
              <el-icon size="40" color="var(--color-border)"><PieChart /></el-icon>
              <p>{{ t('admin.noData') }}</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近活动 -->
    <el-row :gutter="24" class="recent-row">
      <el-col :span="12" :xs="24">
        <el-card class="recent-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>
                <el-icon><User /></el-icon>
                {{ t('admin.recentUsers') }}
              </h3>
              <el-tag v-if="recentUsersError" type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
              <el-button text type="primary" @click="$router.push(adminBase + '/users')">
                {{ t('common.viewAll') }}
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table
            :data="recentUsers"
            size="small"
            v-loading="loading"
            class="admin-table-wide"
            :header-cell-style="{ background: 'var(--color-muted)', fontWeight: '600' }"
          >
            <el-table-column :label="t('common.username')">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :size="32" class="user-avatar-small">
                    {{ row.username?.charAt(0)?.toUpperCase() }}
                  </el-avatar>
                  <span>{{ row.username }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('admin.nickname')" prop="nickname" />
            <el-table-column :label="t('admin.registeredAt')" width="160">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column :label="t('common.status')" width="100">
              <template #default="{ row }">
                <!-- status 形态：数字 1/0（/admin/users 列表） -->
                <el-tag :type="isActiveStatus(row.status) ? 'success' : 'danger'" size="small">
                  {{ isActiveStatus(row.status) ? t('common.normal') : t('common.disabled') }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <!-- 窄屏（≤768px）卡片形态（仪表盘两张「最近 N 条」表同样会被裁） -->
          <NarrowCardList :rows="recentUsers" :fields="userCardFields">
            <template #status="{ row }">
              <el-tag :type="isActiveStatus(row.status) ? 'success' : 'danger'" size="small">
                {{ isActiveStatus(row.status) ? t('common.normal') : t('common.disabled') }}
              </el-tag>
            </template>
            <template #created_at="{ row }">{{ formatDate(row.created_at) }}</template>
          </NarrowCardList>
        </el-card>
      </el-col>

      <el-col :span="12" :xs="24">
        <el-card class="recent-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>
                <el-icon><Folder /></el-icon>
                {{ t('admin.recentFiles') }}
              </h3>
              <el-tag v-if="recentFilesError" type="danger" size="small">{{ t('admin.loadFailed') }}</el-tag>
              <el-button text type="primary" @click="$router.push(adminBase + '/files')">
                {{ t('common.viewAll') }}
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table
            :data="recentFiles"
            size="small"
            v-loading="loading"
            class="admin-table-wide"
            :header-cell-style="{ background: 'var(--color-muted)', fontWeight: '600' }"
          >
            <el-table-column :label="t('admin.fileName')" prop="filename" show-overflow-tooltip />
            <el-table-column :label="t('admin.size')" width="100">
              <template #default="{ row }">
                <el-tag type="info" size="small">
                  {{ formatFileSize(row.file_size) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('admin.uploader')" width="100" prop="username" />
            <el-table-column :label="t('admin.uploadedAt')" width="160">
              <template #default="{ row }">
                {{ formatDate(row.created_at) }}
              </template>
            </el-table-column>
          </el-table>

          <NarrowCardList :rows="recentFiles" :fields="fileCardFields">
            <template #file_size="{ row }">
              <el-tag type="info" size="small">{{ formatFileSize(row.file_size) }}</el-tag>
            </template>
            <template #created_at="{ row }">{{ formatDate(row.created_at) }}</template>
          </NarrowCardList>
        </el-card>
      </el-col>
    </el-row>

    <!-- 版本页脚（对标上游 dashboard 版本页脚：服务端/前端版本号；/version 已收归管理员门禁） -->
    <footer class="dash-footer">
      <span>{{ t('admin.serverVersion') }} {{ formatVersion(serverVersion) }}</span>
      <span class="meta-dot">·</span>
      <span>{{ t('admin.frontendVersion') }} {{ formatVersion(appVersion) }}</span>
      <span class="meta-dot">·</span>
      <span>© 2026 PigeonBox</span>
      <span class="meta-dot">·</span>
      <span>Apache-2.0</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { getAdminBase } from '@/router'
const adminBase = getAdminBase()
import { formatFileSize, toLocaleDateTime } from '@/utils/format'
import { ref, reactive, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  User, Folder, Coin, TrendCharts, ArrowRight, PieChart,
  Setting, Avatar
} from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import NarrowCardList from '@/components/admin/NarrowCardList.vue'
import TrendChart, { type TrendPoint } from '@/components/TrendChart.vue'

// vite define 注入的构建版本（package.json,对齐发布列车）
const appVersion = __APP_VERSION__

// ── 窄屏（≤768px）卡片字段 ──────────────────────────────────────────────────
// 标签**复用表格列的同一批 i18n key** ⇒ 宽窄两屏口径一致、不新增翻译。
const userCardFields = computed(() => [
  { key: 'nickname', label: t('admin.nickname') },
  { key: 'status', label: t('common.status') },
  { key: 'created_at', label: t('admin.registeredAt') },
])
const fileCardFields = computed(() => [
  { key: 'file_size', label: t('admin.size') },
  { key: 'username', label: t('admin.uploader') },
  { key: 'created_at', label: t('admin.uploadedAt') },
])

const { t, locale } = useI18n()
const userStore = useUserStore()
const router = useRouter()

const loading = ref(false)

// 取数失败标记（2026-10-26 审计）：三个取数函数各自置位，模板渲染
// `admin.loadFailed` 标签 ⇒ 「没有数据」与「数据坏了」可区分。
// （与趋势图的 trendError 同构；此前三处 catch 只 console.error，页面零标记。）
const statsError = ref(false)
const recentUsersError = ref(false)
const recentFilesError = ref(false)

// 服务端构建版本（/version,管理员门禁;拉取失败静默,页脚显示 —）
const serverVersion = ref('')

// 用户状态激活判定：/admin/users wire 返回数字 1/0（Users.vue 同款双形态兼容）；
// status 形态：**只有数字 1/0**（/admin/users 列表的 wire 形态）；'active' 旧串
// 形态已删（2026-10-25 删除旧版本兼容——唯一产生旧串的 /admin/users/filter 端点
// 前端零调用，已随死导出一并删除）
const isActiveStatus = (s: unknown): boolean => s === 1

// 页脚版本号展示:空值显示 —;dev/commit 哈希等非语义化版本不带 v 前缀
const formatVersion = (v: string) => {
  if (!v) return '—'
  if (/^v/.test(v) || !/^\d/.test(v)) return v
  return `v${v}`
}

interface DashboardStats {
  total_users: number
  total_files: number
  total_size: number
  today_uploads: number
  active_files?: number
  expired_files?: number
  expiring_soon_files?: number
  never_picked_files?: number
  forever_files?: number
}

interface RecentUser {
  username: string
  nickname?: string
  created_at: string
  status: string
}

interface RecentFile {
  filename: string
  file_size: number
  username: string
  created_at: string
}

const stats = reactive({
  userCount: 0,
  fileCount: 0,
  totalStorage: 0,
  todayUploads: 0,
  activeFiles: 0,
  expiredFiles: 0,
  expiringSoonFiles: 0,
  neverPickedFiles: 0,
  foreverFiles: 0,
})

// 文件健康洞察卡（点击=带 health 过滤直达文件管理页）
const healthCards = computed(() => [
  { key: 'active', count: stats.activeFiles, label: 'admin.health.active', tone: 'ok' },
  { key: 'expiring_soon', count: stats.expiringSoonFiles, label: 'admin.health.expiringSoon', tone: 'warn' },
  { key: 'never_picked', count: stats.neverPickedFiles, label: 'admin.health.neverPicked', tone: 'info' },
  { key: 'forever', count: stats.foreverFiles, label: 'admin.health.forever', tone: 'muted' },
  { key: 'expired', count: stats.expiredFiles, label: 'admin.health.expired', tone: 'danger' },
])

const goHealth = (key: string) => {
  router.push({ path: adminBase + '/files', query: { health: key } })
}

const animatedStats = reactive({
  userCount: 0,
  fileCount: 0,
  todayUploads: 0,
})

const recentUsers = ref<RecentUser[]>([])
const recentFiles = ref<RecentFile[]>([])
const trendData = ref<TrendPoint[]>([])

// 文件类型分布的分类色板——与统计卡徽标**同一套语义色**（主色 + 紫 + 青绿 +
// 琥珀 + 玫瑰 + 天蓝），且按「相邻项色相拉开」排序（青竹主色紧邻紫、天蓝压轴）：
// 原色板把天蓝/青绿相邻,青竹主色下第 2、3 根条几乎同色。
// 首色用 var(--primary-color) 跟随主题,其余为固定分类色(明暗底都可读)。
const typeColors = [
  'var(--primary-color)',
  '#7c3aed',
  '#0d9488',
  '#d97706',
  '#f43f5e',
  '#0ea5e9',
]

interface FileTypeStat {
  type: string
  count: number
  percent: number
}
const fileTypeDist = ref<FileTypeStat[]>([])

const adminName = computed(() => userStore.userInfo?.username || 'Admin')
const greeting = computed(() => {
  // 根据小时返回不同时段问候语
  const h = new Date().getHours()
  if (h < 6) return t('dashboard.goodNight')
  if (h < 12) return t('dashboard.goodMorning')
  if (h < 18) return t('dashboard.goodAfternoon')
  return t('dashboard.goodEvening')
})


const formatDate = (dateStr?: string): string =>
  toLocaleDateTime(dateStr, { locale: locale.value === 'zh-CN' ? 'zh-CN' : 'en-US' })

// 数字动画
const animateNumber = (key: 'userCount' | 'fileCount' | 'todayUploads', target: number) => {
  const duration = 1000
  const steps = 60
  const increment = target / steps
  let current = 0
  const timer = setInterval(() => {
    current += increment
    if (current >= target) {
      animatedStats[key] = target
      clearInterval(timer)
    } else {
      animatedStats[key] = Math.floor(current)
    }
  }, duration / steps)
}

const fetchDashboardStats = async () => {
  try {
    const res = await adminApi.getDashboardStats()
    if (res.code === 200 && res.data) {
      const data = res.data as DashboardStats
      stats.userCount = data.total_users || 0
      stats.fileCount = data.total_files || 0
      stats.totalStorage = data.total_size || 0
      stats.todayUploads = data.today_uploads || 0
      stats.activeFiles = data.active_files || 0
      stats.expiredFiles = data.expired_files || 0
      stats.expiringSoonFiles = data.expiring_soon_files || 0
      stats.neverPickedFiles = data.never_picked_files || 0
      stats.foreverFiles = data.forever_files || 0
      animateNumber('userCount', stats.userCount)
      animateNumber('fileCount', stats.fileCount)
      animateNumber('todayUploads', stats.todayUploads)
      statsError.value = false
    }
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error)
    statsError.value = true
  }
}

const fetchRecentUsers = async () => {
  try {
    const res = await adminApi.getRecentUsers()
    if (res.code === 200) {
      // 后端 GET /admin/users 返回 {items,total,page,page_size}（此前读 data.users 恒空）
      const data = res.data as { items?: RecentUser[] } | undefined
      recentUsers.value = Array.isArray(data?.items) ? data.items.slice(0, 5) : []
      recentUsersError.value = false
    }
  } catch (error) {
    console.error('Failed to fetch recent users:', error)
    recentUsers.value = []
    recentUsersError.value = true
  }
}

const fetchRecentFiles = async () => {
  try {
    const res = await adminApi.getRecentFiles()
    if (res.code === 200) {
      // 后端 GET /admin/files 返回 {items,...}，FileItem 字段为 file_name/file_size（
      // 此前读 data.list/uuid_file_name/username 恒空）；管理端列表无 username，置空
      const data = res.data as { items?: Array<{
        file_name?: string
        code?: string
        file_size?: number
        created_at?: string
      }> } | undefined
      const list = Array.isArray(data?.items) ? data.items : []
      recentFiles.value = list.slice(0, 5).map((f) => ({
        filename: f.file_name || f.code || '-',
        file_size: f.file_size || 0,
        username: '-',
        created_at: f.created_at || '',
      }))
      recentFilesError.value = false
    }
  } catch (error) {
    console.error('Failed to fetch recent files:', error)
    recentFiles.value = []
    recentFilesError.value = true
  }
}

const fetchServerVersion = async () => {
  try {
    const res = await adminApi.getVersion()
    if (res.code === 200 && res.version) {
      serverVersion.value = res.version
    }
  } catch {
    // 版本获取失败不影响面板
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchDashboardStats(),
      fetchRecentUsers(),
      fetchRecentFiles(),
      fetchEnhancedStats(),
      fetchTrend(),
      fetchServerVersion(),
    ])
    generateMockFileTypeDist()
  } finally {
    loading.value = false
  }
})

// 趋势序列：后端 /admin/stats/trend 真实数据（uploads 按创建、downloads 按传输日志）。
//
// ⚠️ 2026-10-26 审计修复：原实现拉取失败时**回退 mock**（随机数生成的示例数据）
// ⇒ 面板不空、但管理员会把**假数字当成真实趋势** ⇒ 静默失败（最危险的一类：
// 看起来一切正常，数据是编的）。⇒ 改为：失败就**不画数据** + 显式错误标记
// （`admin.loadFailed`），让「没有数据」和「数据坏了」可区分。
const trendError = ref(false)
const fetchTrend = async () => {
  try {
    const res = await adminApi.getStatsTrend(7)
    const days = (res.data as { days?: TrendPoint[] })?.days
    if (Array.isArray(days) && days.length > 0) {
      trendData.value = days
      trendError.value = false
      return
    }
    trendError.value = true
  } catch {
    trendError.value = true
  }
}

// 富指标（/admin/stats/enhanced）：真实昨日对比/下载总量/top 后缀分布
const enhanced = ref<{
  today_uploads: number
  yesterday_uploads: number
  total_downloads: number
  expired_files: number
  top_suffixes: { suffix: string; count: number }[]
} | null>(null)

const fetchEnhancedStats = async () => {
  try {
    const res = await adminApi.getEnhancedStats()
    if (res.code === 200) {
      enhanced.value = res.data as typeof enhanced.value
    }
  } catch {
    // 富指标失败不影响基础面板
  }
}

const generateMockFileTypeDist = () => {
  // 优先使用后端富指标的真实后缀分布（/admin/stats/enhanced.top_suffixes）
  if (enhanced.value?.top_suffixes?.length) {
    const top = enhanced.value.top_suffixes
    const total = top.reduce((a, b) => a + b.count, 0) || 1
    fileTypeDist.value = top.slice(0, 6).map((s) => ({
      type: s.suffix.replace(/^\./, '').toUpperCase(),
      count: s.count,
      percent: (s.count / total) * 100,
    }))
    return
  }
  // 兜底：基于最近文件推断
  const recent = recentFiles.value
  if (recent.length === 0) {
    fileTypeDist.value = []
    return
  }
  const map = new Map<string, number>()
  for (const f of recent) {
    const ext = f.filename.split('.').pop()?.toLowerCase() || 'other'
    map.set(ext, (map.get(ext) || 0) + 1)
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0)
  fileTypeDist.value = Array.from(map.entries())
    .map(([type, count]) => ({
      type: type.toUpperCase(),
      count,
      percent: (count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
}
</script>

<style scoped>
/* 取数失败标记（2026-10-26）：贴在统计行上方，避免与正常卡片重叠 */
.stats-error {
  margin-bottom: 12px;
}

/* 文件健康洞察卡 */
.health-card {
  margin-bottom: 24px;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.health-item {
  position: relative;
  padding: 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: var(--color-muted);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.health-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary-color);
}

.health-count {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.health-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.health-arrow {
  position: absolute;
  right: 12px;
  top: 16px;
  color: var(--color-text-tertiary);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.health-item:hover .health-arrow {
  opacity: 1;
  color: var(--primary-color);
}

.health-warn .health-count { color: var(--color-warning); }
.health-danger .health-count { color: var(--color-danger); }
.health-ok .health-count { color: var(--color-success); }

@media (max-width: 1024px) {
  .health-grid { grid-template-columns: repeat(2, 1fr); }
}

.dashboard-container {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 欢迎卡片 */
.welcome-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32px 36px;
  margin-bottom: 24px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  color: var(--color-text-primary);
  position: relative;
  overflow: hidden;
}

.welcome-left {
  flex: 1;
  z-index: 1;
}

.welcome-title {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.welcome-subtitle {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.quick-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.quick-actions .el-button {
  background: var(--primary-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-weight: 500;
}

.quick-actions .el-button:hover {
  background: var(--color-surface);
  border-color: var(--primary-color);
}

.welcome-right {
  z-index: 1;
  color: var(--primary-color);
  opacity: 0.12;
}

.stats-row { margin-bottom: 24px; }

.stat-card {
  position: relative;
  padding: 24px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  color: var(--color-text-primary);
  overflow: hidden;
  transition: border-color 0.2s ease;
  cursor: pointer;
}

.stat-card:hover {
  border-color: var(--primary-color);
}

/* 图标色调编码:用户=主色 / 文件=色调2(紫) / 存储=色调3(青绿) / 今日上传=色调4(琥珀)。
   色调 2-4 是**固定语义色板**(utils/accent.ts 的 TONE_PALETTE),不随主色派生 ——
   2026-10-26 起:原为「主色色相偏移」派生,主色一变(墨黑⇒全灰 / 青竹⇒全绿)
   三个徽标就失去区分度。语义四色恒定 ⇒ 换任何主题都认得出。 */
.stat-icon {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  margin-bottom: 16px;
  background: var(--primary-bg);
  color: var(--primary-color);
}

.tone-violet .stat-icon {
  background: var(--stat-tone-2-bg);
  color: var(--stat-tone-2-color);
}

.tone-teal .stat-icon {
  background: var(--stat-tone-3-bg);
  color: var(--stat-tone-3-color);
}

.tone-amber .stat-icon {
  background: var(--stat-tone-4-bg);
  color: var(--stat-tone-4-color);
}

.stat-content {
  position: relative;
  z-index: 1;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.charts-row { margin-bottom: 24px; }

.chart-card {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-primary);
}

.file-type-dist {
  padding: 8px 0;
  min-height: 240px;
}

.file-type-item {
  margin-bottom: 18px;
}

.file-type-item:last-child {
  margin-bottom: 0;
}

/* 文字在上、实色条+浅灰轨道在下——替代旧"文字压半透明色块"的含混布局 */
.file-type-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
  font-size: 13px;
}

.file-type-name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.file-type-count {
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.file-type-track {
  height: 8px;
  border-radius: 999px;
  background: var(--color-muted);
  overflow: hidden;
}

.file-type-bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.file-type-dist .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--color-text-secondary);
}

.recent-row { margin-bottom: 24px; }

/* 版本页脚 */
.dash-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.dash-footer .meta-dot {
  color: var(--color-border);
}

.recent-card {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar-small {
  background: var(--primary-bg);
  color: var(--primary-color);
  font-weight: 600;
  font-size: 14px;
}

:deep(.el-card__header) {
  border-bottom: 1px solid var(--color-border);
  padding: 20px 24px;
}

:deep(.el-card__body) {
  padding: 20px 24px;
}

@media (max-width: 768px) {
  .welcome-card {
    flex-direction: column;
    text-align: center;
    padding: 24px 20px;
  }
  .welcome-right { display: none; }
  .quick-actions { justify-content: center; }
}
</style>
