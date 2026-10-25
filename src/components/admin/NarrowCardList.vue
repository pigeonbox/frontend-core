<script lang="ts">
/**
 * 卡片字段定义：key 既是插槽名也是取数入口，label 复用表格列的 i18n 文本。
 * （放在模块作用域的 <script> 块里导出，供页面侧 import type 使用。）
 */
export interface NarrowField {
  key: string
  label: string
  get?: (row: any) => string | number | undefined | null
}
</script>

<script setup lang="ts">
/**
 * 管理台窄屏卡片列表（≤768px 生效）。
 *
 * **为什么存在**（2026-10-25 真机 390/768 实测）：管理台 9 个表格页用 `el-table`，
 * 列宽合计 ~990~1600px（Files 19 列 / TransferLogs 14 / Activities·Dashboard 13 / …）⇒
 *   · ≤390px：**只露得下 ID 列 + 固定右侧的操作列**，标题/类型/状态/时间等**内容列全被裁**
 *     （Element Plus 的横向滚动条在手机上几乎看不见）⇒ 手机上等于不可用；
 *   · ≤768px：固定操作列（Actions 240~360px）还**盖住**相邻的「状态」列
 *     （与 2026-10-23 记录的「半个字被按钮压住」同型）。
 *
 * **形态**：CSS 双形态（与用户端 `views/user/History.vue` 同款）——表格与卡片
 * **同时渲染**，靠媒体查询互斥显示（纯 CSS，不用 JS 媒体查询 ⇒ 不必等挂载后测量）。
 *   · 表格侧：`<el-table class="admin-table-wide">` ⇒ 窄屏隐藏
 *   · 卡片侧：`<NarrowCardList>` 根节点自带 `.narrow-cards` ⇒ 宽屏隐藏、窄屏显示
 *   开关样式在 `src/styles/main.scss`（全局）——表格与卡片**分属两个组件**，
 *   互斥显示必须两边都命中得到 ⇒ 只能全局放（集中一处也便于守卫钉住）。
 *
 * **字段策展**：`fields` 只列**手机上也该看见**的关键字段（不是把表格 19 列全搬过来
 * ——那会让每张卡片 19 行、页面长到没法用）；标签**复用表格列的同一批 i18n key**
 * ⇒ 不新增翻译、宽窄两屏口径必然一致。
 *
 * 需要特殊渲染（状态标签、操作按钮）的字段用**具名插槽**覆盖：
 *   <NarrowCardList :rows="rows" :fields="fields">
 *     <template #status="{ row }"><el-tag …/></template>
 *     <template #actions="{ row }"><el-button …/></template>
 *   </NarrowCardList>
 */
const props = withDefaults(
  defineProps<{
    /** 行数据（与表格同一份） */
    rows: any[]
    /** 卡片要展示的字段（策展后的关键字段） */
    fields: NarrowField[]
    /** 卡片头部文本（一般是行标题）；不传则不渲染头部 */
    head?: (row: any) => string
    /** 行 key（默认取 row.id，回退 index） */
    rowKey?: (row: any, index: number) => string | number
  }>(),
  { head: undefined, rowKey: undefined },
)

function keyOf(row: any, index: number): string | number {
  if (props.rowKey) return props.rowKey(row, index)
  return row?.id ?? index
}

function valueOf(field: NarrowField, row: any): string | number {
  const v = field.get ? field.get(row) : undefined
  if (v === undefined || v === null || v === '') return '—'
  return v
}
</script>

<template>
  <div class="narrow-cards">
    <div v-for="(row, i) in rows" :key="keyOf(row, i)" class="narrow-card">
      <div v-if="$slots.head || head" class="narrow-card-head">
        <slot name="head" :row="row">{{ head ? head(row) : '' }}</slot>
      </div>
      <div v-for="f in fields" :key="f.key" class="narrow-card-line">
        <span class="narrow-card-label">{{ f.label }}</span>
        <span class="narrow-card-value">
          <slot :name="f.key" :row="row">{{ valueOf(f, row) }}</slot>
        </span>
      </div>
      <div v-if="$slots.actions" class="narrow-card-actions">
        <slot name="actions" :row="row" />
      </div>
    </div>
  </div>
</template>
