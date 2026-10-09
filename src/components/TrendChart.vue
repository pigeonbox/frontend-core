<template>
  <div ref="containerRef" class="trend-chart">
    <!-- 空态 -->
    <div v-if="points.length === 0" class="chart-empty">
      <el-icon :size="36"><TrendCharts /></el-icon>
      <p>{{ emptyText }}</p>
    </div>

    <template v-else>
      <svg
        :width="width"
        :height="height"
        :viewBox="`0 0 ${width} ${height}`"
        class="chart-svg"
        @pointermove="onPointerMove"
        @pointerleave="hoverIndex = null"
      >
        <defs>
          <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" class="area-stop" stop-opacity="0.22" />
            <stop offset="100%" class="area-stop" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- 横向网格 + Y 轴标签 -->
        <g>
          <line
            v-for="(g, i) in gridLines"
            :key="`g-${i}`"
            :x1="padding.left"
            :x2="width - padding.right"
            :y1="g.y"
            :y2="g.y"
            class="grid-line"
            :class="{ baseline: i === gridLines.length - 1 }"
          />
          <text
            v-for="(g, i) in gridLines"
            :key="`yl-${i}`"
            :x="padding.left - 8"
            :y="g.y + 3.5"
            text-anchor="end"
            class="axis-label"
          >
            {{ g.label }}
          </text>
        </g>

        <!-- X 轴标签(自动抽稀防重叠) -->
        <text
          v-for="p in xLabels"
          :key="`xl-${p.i}`"
          :x="p.x"
          :y="height - 6"
          text-anchor="middle"
          class="axis-label"
        >
          {{ p.label }}
        </text>

        <!-- 悬浮参考线 -->
        <line
          v-if="hoverPoint"
          :x1="hoverPoint.x"
          :x2="hoverPoint.x"
          :y1="padding.top"
          :y2="baselineY"
          class="hover-guide"
        />

        <!-- 上传面积渐变 + 双系列平滑曲线 -->
        <path v-if="uploadAreaPath" :d="uploadAreaPath" fill="url(#uploadGradient)" class="area" />
        <path v-if="uploadPath" :d="uploadPath" pathLength="1" class="line line-upload" />
        <path v-if="downloadPath" :d="downloadPath" pathLength="1" class="line line-download" />

        <!-- 系列末端点(常驻,锚定最新值) -->
        <circle v-if="lastPoint" :cx="lastPoint.x" :cy="lastPoint.uploadY" r="3" class="hover-dot dot-upload" />
        <circle
          v-if="lastPoint && hasDownload"
          :cx="lastPoint.x"
          :cy="lastPoint.downloadY"
          r="3"
          class="hover-dot dot-download"
        />

        <!-- 悬浮数据点 -->
        <g v-if="hoverPoint">
          <circle :cx="hoverPoint.x" :cy="hoverPoint.uploadY" r="4" class="hover-dot dot-upload" />
          <circle
            v-if="hasDownload"
            :cx="hoverPoint.x"
            :cy="hoverPoint.downloadY"
            r="4"
            class="hover-dot dot-download"
          />
        </g>
      </svg>

      <div class="chart-legend">
        <div class="legend-item">
          <span class="legend-dot upload"></span>
          <span>{{ uploadLabel }}</span>
        </div>
        <div v-if="hasDownload" class="legend-item">
          <span class="legend-dot download"></span>
          <span>{{ downloadLabel }}</span>
        </div>
      </div>

      <!-- 悬浮数值气泡 -->
      <div v-if="hoverPoint && hoverData" class="chart-tip" :style="tipStyle">
        <div class="tip-date">{{ hoverData.date }}</div>
        <div class="tip-row">
          <span class="tip-dot upload"></span>
          <span class="tip-label">{{ uploadLabel }}</span>
          <span class="tip-value">{{ hoverData.uploads }}</span>
        </div>
        <div v-if="hasDownload" class="tip-row">
          <span class="tip-dot download"></span>
          <span class="tip-label">{{ downloadLabel }}</span>
          <span class="tip-value">{{ hoverData.downloads }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TrendCharts } from '@element-plus/icons-vue'

export interface TrendPoint {
  date: string // YYYY-MM-DD or label
  uploads: number
  downloads?: number
}

interface Props {
  data: TrendPoint[]
  height?: number
  uploadLabel?: string
  downloadLabel?: string
  emptyText?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: 240,
  uploadLabel: 'Uploads',
  downloadLabel: 'Downloads',
  emptyText: '暂无数据',
})

const containerRef = ref<HTMLElement | null>(null)
const width = ref(600)

// 实测容器宽度后按 1:1 像素渲染——此前 preserveAspectRatio="none" 会把圆点
// 拉成椭圆、轴文字横向变形;ResizeObserver 保证卡片宽度变化时跟随
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (!containerRef.value) return
  const initial = Math.floor(containerRef.value.clientWidth)
  if (initial > 0) width.value = initial
  resizeObserver = new ResizeObserver((entries) => {
    const w = Math.floor(entries[0]?.contentRect.width ?? 0)
    if (w > 0) width.value = w
  })
  resizeObserver.observe(containerRef.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())

const hasDownload = computed(() => props.data.some((d) => d.downloads !== undefined))

const maxValue = computed(() => {
  if (!props.data || props.data.length === 0) return 100
  let max = 0
  for (const p of props.data) {
    if (p.uploads > max) max = p.uploads
    if (p.downloads !== undefined && p.downloads > max) max = p.downloads
  }
  // 归整到 4 的倍数,网格刻度标签才是整齐的整数步进(而非 13/10/7/3/0)
  return Math.ceil((Math.max(max, 10) * 1.1) / 4) * 4
})

// Y 轴数值缩写:1200→1.2k,轴标签过宽时动态让出左内边距
const fmtNum = (v: number): string => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
  return `${Math.round(v)}`
}

const maxLabel = fmtNum(maxValue.value)
const padding = computed(() => ({
  top: 12,
  right: 16,
  bottom: 26,
  left: Math.max(32, maxLabel.length * 7 + 14),
}))

const chartH = computed(() => props.height - padding.value.top - padding.value.bottom)
const baselineY = computed(() => padding.value.top + chartH.value)

const gridLines = computed(() =>
  [0, 1, 2, 3, 4].map((i) => ({
    y: padding.value.top + chartH.value * (1 - i / 4),
    label: fmtNum((maxValue.value * i) / 4),
  })),
)

const points = computed(() => {
  if (!props.data || props.data.length === 0) return []
  const chartW = width.value - padding.value.left - padding.value.right
  const n = props.data.length
  return props.data.map((d, i) => {
    const x = padding.value.left + (i / Math.max(n - 1, 1)) * chartW
    const uploadY = padding.value.top + chartH.value - (d.uploads / maxValue.value) * chartH.value
    const downloadY =
      d.downloads !== undefined
        ? padding.value.top + chartH.value - (d.downloads / maxValue.value) * chartH.value
        : uploadY
    // 截取 label 后几位（MM-DD）
    const label = d.date.length >= 10 ? d.date.slice(5) : d.date
    return { x, uploadY, downloadY, label }
  })
})

const lastPoint = computed(() => {
  const pts = points.value
  return pts.length > 0 ? pts[pts.length - 1]! : null
})

const xLabels = computed(() => {
  const pts = points.value
  const n = pts.length
  if (n === 0) return []
  const usable = width.value - padding.value.left - padding.value.right
  const maxLabels = Math.max(2, Math.floor(usable / 64))
  const step = Math.ceil(n / maxLabels)
  const out: { i: number; x: number; label: string }[] = []
  for (let i = 0; i < n; i += step) out.push({ i, x: pts[i]!.x, label: pts[i]!.label })
  const last = n - 1
  if (last % step !== 0) out.push({ i: last, x: pts[last]!.x, label: pts[last]!.label })
  return out
})

// 单调三次插值(Fritsch–Carlson)——曲线平滑且不过冲,不会画出低于 0 的假波谷
const smoothPath = (pts: { x: number; y: number }[]): string => {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`
  const r = (v: number) => Math.round(v * 100) / 100
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]!.x - pts[i]!.x
    slope[i] = (pts[i + 1]!.y - pts[i]!.y) / dx[i]!
  }
  const tangents: number[] = [slope[0]!]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1]! * slope[i]! <= 0) {
      tangents[i] = 0
    } else {
      const w1 = 2 * dx[i]! + dx[i - 1]!
      const w2 = dx[i]! + 2 * dx[i - 1]!
      tangents[i] = (w1 + w2) / (w1 / slope[i - 1]! + w2 / slope[i]!)
    }
  }
  tangents[n - 1] = slope[n - 2]!
  let d = `M ${r(pts[0]!.x)} ${r(pts[0]!.y)}`
  for (let i = 0; i < n - 1; i++) {
    const cx1 = pts[i]!.x + dx[i]! / 3
    const cy1 = pts[i]!.y + (tangents[i]! * dx[i]!) / 3
    const cx2 = pts[i + 1]!.x - dx[i]! / 3
    const cy2 = pts[i + 1]!.y - (tangents[i]! * dx[i]!) / 3
    d += ` C ${r(cx1)} ${r(cy1)}, ${r(cx2)} ${r(cy2)}, ${r(pts[i + 1]!.x)} ${r(pts[i + 1]!.y)}`
  }
  return d
}

const uploadPath = computed(() =>
  smoothPath(points.value.map((p) => ({ x: p.x, y: p.uploadY }))),
)

const uploadAreaPath = computed(() => {
  const pts = points.value
  if (pts.length === 0) return ''
  const baseY = padding.value.top + chartH.value
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  return `${uploadPath.value} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`
})

const downloadPath = computed(() => {
  if (!hasDownload.value) return ''
  return smoothPath(points.value.map((p) => ({ x: p.x, y: p.downloadY })))
})

// ---- 悬浮交互 ----
const hoverIndex = ref<number | null>(null)

const hoverPoint = computed(() =>
  hoverIndex.value === null ? null : points.value[hoverIndex.value] ?? null,
)
const hoverData = computed(() =>
  hoverIndex.value === null ? null : props.data[hoverIndex.value] ?? null,
)

const onPointerMove = (e: PointerEvent) => {
  const pts = points.value
  if (pts.length === 0) return
  const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < pts.length; i++) {
    const dist = Math.abs(pts[i]!.x - x)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  hoverIndex.value = best
}

const tipStyle = computed(() => {
  const p = hoverPoint.value
  if (!p) return {}
  const tipWidth = 148
  let left = p.x + 14
  if (left + tipWidth > width.value - 4) left = p.x - tipWidth - 14
  const top = Math.max(Math.min(p.uploadY, p.downloadY) - 16, 4)
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
})
</script>

<style scoped>
.trend-chart {
  position: relative;
  width: 100%;
}

.chart-svg {
  display: block;
  max-width: 100%;
}

.grid-line {
  stroke: var(--color-border-light, var(--color-border));
  stroke-width: 1;
  stroke-dasharray: 4, 4;
}

.grid-line.baseline {
  stroke: var(--color-border);
  stroke-dasharray: none;
}

.axis-label {
  font-size: 10px;
  fill: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.hover-guide {
  stroke: var(--color-border);
  stroke-width: 1;
}

.line {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 入场画线动画:pathLength=1 归一化后 dashoffset 1→0 */
.line-upload {
  stroke: #5e6ad2;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: trend-draw 0.9s ease-out forwards;
}

.line-download {
  stroke: #0d9488;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: trend-draw 0.9s 0.1s ease-out forwards;
}

.area {
  opacity: 0;
  animation: trend-fade 0.9s 0.3s ease-out forwards;
}

@keyframes trend-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes trend-fade {
  to {
    opacity: 1;
  }
}

.hover-dot {
  stroke: var(--color-surface);
  stroke-width: 2;
}

/* 图表系列色 = 固定对比色对,不跟运行时 accent——accent 有 6 种预设
   (indigo/blue/emerald/amber/rose/ink),上传线若跟 accent,emerald 主题下
   会与绿色系下载线融成一片;固定色对保证任意主题下两条线都分辨得清。
   上传=品牌靛蓝(带面积渐变),下载=青绿;暗色下各提亮一档。 */
.dot-upload {
  fill: #5e6ad2;
}

.dot-download {
  fill: #0d9488;
}

.area-stop {
  stop-color: #5e6ad2;
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dot.upload {
  background: #5e6ad2;
}

.legend-dot.download {
  background: #0d9488;
}

.chart-tip {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  min-width: 128px;
  padding: 8px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.12));
  font-size: 12px;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.tip-date {
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.tip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.tip-label {
  flex: 1;
  padding-right: 10px;
  color: var(--color-text-secondary);
}

.tip-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tip-dot.upload {
  background: #5e6ad2;
}

.tip-dot.download {
  background: #0d9488;
}

.chart-empty {
  height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.chart-empty p {
  margin: 0;
}

/* 暗色:系列色各提亮一档 */
html.dark .line-upload {
  stroke: #8e97e0;
}

html.dark .dot-upload {
  fill: #8e97e0;
}

html.dark .area-stop {
  stop-color: #8e97e0;
}

html.dark .line-download {
  stroke: #2dd4bf;
}

html.dark .dot-download {
  fill: #2dd4bf;
}

html.dark .legend-dot.upload,
html.dark .tip-dot.upload {
  background: #8e97e0;
}

html.dark .legend-dot.download,
html.dark .tip-dot.download {
  background: #2dd4bf;
}
</style>
