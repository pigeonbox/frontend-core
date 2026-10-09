import { ref, type Ref } from 'vue'

/**
 * 表格分页查询状态机（2026-10-06 W3 收敛 9 个列表页的 loading/page/pageSize/total 样板）。
 * fetcher 由页面提供（负责 API 调用、筛选参数、错误提示与返回形状归一）；
 * 本 composable 只管分页状态、竞态与事件适配。
 *
 * 竞态守卫：慢请求后到不会覆盖新查询（seq 丢弃），loading 由最后一次 load 收尾。
 */

export interface TableQueryPage {
  page: number
  page_size: number
}

export interface TableQueryResult<T> {
  items: T[]
  total: number
}

export function useTableQuery<T>(
  fetcher: (p: TableQueryPage) => Promise<TableQueryResult<T>>,
  opts: { defaultPageSize?: number } = {}
) {
  const list = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(opts.defaultPageSize ?? 20)
  const loading = ref(false)
  let seq = 0

  /** 加载指定页（默认当前页）；竞态下旧请求结果被丢弃 */
  async function load(targetPage?: number): Promise<void> {
    const mySeq = ++seq
    const p = targetPage ?? page.value
    page.value = p
    loading.value = true
    try {
      const res = await fetcher({ page: p, page_size: pageSize.value })
      if (mySeq !== seq) return
      list.value = res.items
      total.value = res.total
    } finally {
      if (mySeq === seq) loading.value = false
    }
  }

  /** 重查（默认回第 1 页——筛选/tab 变化用） */
  function reload(targetPage = 1): Promise<void> {
    return load(targetPage)
  }

  /** el-pagination @current-change 直连（v-model 已更新 page） */
  function handlePageChange(): Promise<void> {
    return load()
  }

  /** el-pagination @size-change 直连（回第 1 页） */
  function handleSizeChange(): Promise<void> {
    return load(1)
  }

  return {
    list,
    total,
    page,
    pageSize,
    loading,
    load,
    reload,
    handlePageChange,
    handleSizeChange,
  }
}
