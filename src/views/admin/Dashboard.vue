<template>
  <div class="dashboard-container">
    <!-- 欢迎卡片 -->
    <div class="welcome-card">
      <div class="welcome-left">
        <h2 class="welcome-title">{{ greeting }}, {{ adminName }} 👋</h2>
        <p class="welcome-subtitle">{{ t('admin.welcomeSubtitle') }}</p>
        <div class="quick-actions">
          <el-button type="primary" round @click="$router.push('/admin/files')">
            <el-icon><Folder /></el-icon>
            {{ t('admin.files') }}
          </el-button>
          <el-button round @click="$router.push('/admin/users')">
            <el-icon><User /></el-icon>
            {{ t('admin.users') }}
          </el-button>
          <el-button round @click="$router.push('/admin/config')">
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
    <el-row :gutter="24" class="stats-row">
      <el-col :span="6">
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

      <el-col :span="6">
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

      <el-col :span="6">
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

      <el-col :span="6">
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
      <el-col :span="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>{{ t('admin.trend7d') }}</h3>
              <el-tag type="info">{{ t('admin.realtime') }}</el-tag>
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

      <el-col :span="12">
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
      <el-col :span="12">
        <el-card class="recent-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>
                <el-icon><User /></el-icon>
                {{ t('admin.recentUsers') }}
              </h3>
              <el-button text type="primary" @click="$router.push('/admin/users')">
                {{ t('common.viewAll') }}
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table
            :data="recentUsers"
            size="small"
            v-loading="loading"
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
                <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'active' ? t('common.normal') : t('common.disabled') }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="recent-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <h3>
                <el-icon><Folder /></el-icon>
                {{ t('admin.recentFiles') }}
              </h3>
              <el-button text type="primary" @click="$router.push('/admin/files')">
                {{ t('common.viewAll') }}
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <el-table
            :data="recentFiles"
            size="small"
            v-loading="loading"
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
import TrendChart, { type TrendPoint } from '@/components/TrendChart.vue'

// vite define 注入的构建版本（package.json,对齐发布列车）
const appVersion = __APP_VERSION__

const { t, locale } = useI18n()
const userStore = useUserStore()
const router = useRouter()

const loading = ref(false)

// 服务端构建版本（/version,管理员门禁;拉取失败静默,页脚显示 —）
const serverVersion = ref('')

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
  router.push({ path: '/admin/files', query: { health: key } })
}

const animatedStats = reactive({
  userCount: 0,
  fileCount: 0,
  todayUploads: 0,
})

const recentUsers = ref<RecentUser[]>([])
const recentFiles = ref<RecentFile[]>([])
const trendData = ref<TrendPoint[]>([])

// 图表分类色板——与品牌靛蓝同族的中饱和色,按序取色保证相邻项对比清晰;
// 弃用旧粉紫渐变系(#f093fb/#fa709a):0.2 透明度下发灰且花哨,不符合"简约不简单"
const typeColors = ['#5e6ad2', '#0ea5e9', '#14b8a6', '#f59e0b', '#f43f5e', '#8b5cf6']

interface FileTypeStat {
  type: string
  count: number
  percent: number
}
const fileTypeDist = ref<FileTypeStat[]>([])

const adminName = computed(() => userStore.userInfo?.username || 'Admin')
const greeting = computed(() => {
  // 根据小时返回不同时段问候语（仅 zh-CN）
  const h = new Date().getHours()
  if (locale.value === 'zh-CN') {
    if (h < 6) return '夜深了'
    if (h < 12) return '早上好'
    if (h < 18) return '下午好'
    return '晚上好'
  }
  if (h < 6) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
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
    }
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error)
  }
}

const fetchRecentUsers = async () => {
  try {
    const res = await adminApi.getRecentUsers()
    if (res.code === 200) {
      // 后端 GET /admin/users 返回 {items,total,page,page_size}（此前读 data.users 恒空）
      const data = res.data as { items?: RecentUser[] } | RecentUser[] | undefined
      if (data && Array.isArray((data as { items: RecentUser[] }).items)) {
        recentUsers.value = (data as { items: RecentUser[] }).items.slice(0, 5)
      } else if (Array.isArray(data)) {
        recentUsers.value = data.slice(0, 5)
      } else {
        recentUsers.value = []
      }
    }
  } catch (error) {
    console.error('Failed to fetch recent users:', error)
    recentUsers.value = []
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
        size?: number
        created_at?: string
        CreatedAt?: string
      }> } | RecentFile[] | undefined
      if (data && Array.isArray((data as { items: unknown[] }).items)) {
        const list = (data as { items: Array<{
          file_name?: string
          code?: string
          file_size?: number
          size?: number
          created_at?: string
          CreatedAt?: string
        }> }).items
        recentFiles.value = list.slice(0, 5).map((f) => ({
          filename: f.file_name || f.code || '-',
          file_size: f.file_size || f.size || 0,
          username: '-',
          created_at: f.created_at || f.CreatedAt || '',
        }))
      } else if (Array.isArray(data)) {
        recentFiles.value = (data as RecentFile[]).slice(0, 5)
      } else {
        recentFiles.value = []
      }
    }
  } catch (error) {
    console.error('Failed to fetch recent files:', error)
    recentFiles.value = []
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

// 趋势序列：后端 /admin/stats/trend 真实数据（uploads 按创建、downloads 按传输日志）；
// 拉取失败时回退 mock，面板不空白
const fetchTrend = async () => {
  try {
    const res = await adminApi.getStatsTrend(7)
    const days = (res.data as { days?: TrendPoint[] })?.days
    if (Array.isArray(days) && days.length > 0) {
      trendData.value = days
      return
    }
  } catch {
    // 回退 mock
  }
  generateMockTrend()
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
    if (res.code === 0 || res.code === 200) {
      enhanced.value = res.data as typeof enhanced.value
    }
  } catch {
    // 富指标失败不影响基础面板
  }
}

const generateMockTrend = () => {
  // 后端尚未提供 /admin/stats/trend — 临时基于总数生成示例数据
  const base = Math.max(stats.todayUploads, 10)
  const now = new Date()
  const days: TrendPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const uploads = Math.floor(base * (0.4 + Math.random() * 0.8))
    const downloads = Math.floor(uploads * (0.6 + Math.random() * 0.6))
    days.push({ date: dateStr, uploads, downloads })
  }
  trendData.value = days
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

/* 图标语义色编码:用户=accent / 文件=紫 / 存储=青绿 / 今日上传=琥珀 */
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
  background: rgba(124, 58, 237, 0.1);
  color: #7c3aed;
}

.tone-teal .stat-icon {
  background: rgba(13, 148, 136, 0.1);
  color: #0d9488;
}

.tone-amber .stat-icon {
  background: rgba(217, 119, 6, 0.1);
  color: #d97706;
}

html.dark .tone-teal .stat-icon {
  background: rgba(45, 212, 191, 0.16);
  color: #2dd4bf;
}

html.dark .tone-violet .stat-icon {
  background: rgba(167, 139, 250, 0.16);
  color: #a78bfa;
}

html.dark .tone-amber .stat-icon {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
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
