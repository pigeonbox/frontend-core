import { describe, it, expect, vi } from 'vitest'
import { useTableQuery } from '../useTableQuery'

const delayed = <T,>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms))

describe('useTableQuery', () => {
  it('reload 拉取并填充 list/total；默认回第 1 页', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [1, 2], total: 42 })
    const q = useTableQuery<number>(fetcher)
    await q.reload()
    expect(q.list.value).toEqual([1, 2])
    expect(q.total.value).toBe(42)
    expect(q.page.value).toBe(1)
    expect(fetcher).toHaveBeenCalledWith({ page: 1, page_size: 20 })
  })

  it('翻页/改页大小：handlePageChange 用当前页，handleSizeChange 回第 1 页', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const q = useTableQuery<number>(fetcher)
    q.page.value = 3
    await q.handlePageChange()
    expect(fetcher).toHaveBeenLastCalledWith({ page: 3, page_size: 20 })
    await q.handleSizeChange()
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, page_size: 20 })
    expect(q.page.value).toBe(1)
  })

  it('竞态：慢的旧请求后到不覆盖新结果，loading 由最后一次收尾', async () => {
    let resolveA!: (v: { items: number[]; total: number }) => void
    const fetcher = vi.fn((p: { page: number }) =>
      p.page === 1 ? new Promise<{ items: number[]; total: number }>((r) => (resolveA = r)) : delayed({ items: [9], total: 1 }, 10)
    )
    const q = useTableQuery<number>(fetcher)
    const p1 = q.load(1)
    const p2 = q.load(2)
    resolveA({ items: [1, 1], total: 99 }) // 旧请求先返回
    await Promise.all([p1, p2])
    expect(q.list.value).toEqual([9]) // 新结果保留，旧结果被丢弃
    expect(q.total.value).toBe(1)
    expect(q.loading.value).toBe(false)
  })

  it('fetcher 抛错：loading 收尾且异常向上传播（由页面 catch 提示）', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'))
    const q = useTableQuery<number>(fetcher)
    await expect(q.reload()).rejects.toThrow('boom')
    expect(q.loading.value).toBe(false)
  })

  it('defaultPageSize 可调', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const q = useTableQuery<number>(fetcher, { defaultPageSize: 50 })
    await q.reload()
    expect(fetcher).toHaveBeenCalledWith({ page: 1, page_size: 50 })
  })
})
