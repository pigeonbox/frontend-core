// 分享详情页取数竞态守卫（2026-10-26 审计 P2 · 缺陷 12）。
//
// 事故形态：fetchShare 此前**无任何请求序号** ⇒ 两次取数重叠时（密码重试 A、
// 随即切码 B）**后到的旧响应会覆盖新数据** ⇒ 地址栏是 B 码、页面渲染 A 码的
// 内容（正是本仓已复发三次的「内容挂在别的地址下」那类缺陷）。
//
// 修法：引入本地自增 seq（composables/useLatestRequest），`mySeq !== seq` 时
// 直接丢弃本次响应——与 composables/useTableQuery.ts 的 seq 丢弃机制同款。
//
// 本仓无组件测试基建 ⇒ 竞态行为在 composable 层直接单测（同一套调用序列），
// 外加一条源码级断言钉住「分享页真的用上了这个守卫」。
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { readSrc } from '@/utils/__tests__/sourceScan'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('分享详情页取数竞态（旧响应不得覆盖新码）', () => {
  it('A 慢 B 快 ⇒ 最终内容必须是 B', async () => {
    const { begin, isStale } = useLatestRequest()
    const shareData = ref<string | null>(null)

    // 与 views/share/View.vue 的 fetchShare 同款：取号 → await → 判陈旧 → 落数据
    const fetchShare = async (tag: string, delay: number) => {
      const mySeq = begin()
      const res = await sleep(delay).then(() => tag)
      if (isStale(mySeq)) return
      shareData.value = res
    }

    await Promise.all([fetchShare('A', 50), fetchShare('B', 5)])
    expect(shareData.value, '后到的旧响应（A）不得覆盖新码（B）的内容').toBe('B')
  })

  it('去掉守卫 ⇒ 旧响应会覆盖新码（负对照语义）', async () => {
    // 同一场景，但**不判陈旧**（模拟守卫被删）⇒ 最终内容变成 A
    const { begin } = useLatestRequest()
    const shareData = ref<string | null>(null)
    const fetchShareNoGuard = async (tag: string, delay: number) => {
      begin()
      const res = await sleep(delay).then(() => tag)
      shareData.value = res
    }
    await Promise.all([fetchShareNoGuard('A', 50), fetchShareNoGuard('B', 5)])
    expect(shareData.value, '无守卫时旧响应确实会覆盖（这正是缺陷形态）').toBe('A')
  })

  it('分享页必须真的用上这个守卫（begin + isStale）', () => {
    const src = readSrc('views/share/View.vue')
    expect(src, '应 import useLatestRequest').toContain(
      "import { useLatestRequest } from '@/composables/useLatestRequest'"
    )
    expect(src, '取数前应取本次序号').toMatch(/const mySeq = latest\.begin\(\)/)
    expect(src, '响应回来后应判陈旧并丢弃').toMatch(/if \(latest\.isStale\(mySeq\)\) return/)
    // 成功分支与错误分支都要判陈旧（旧请求不得覆盖新状态）
    const staleChecks = src.match(/latest\.isStale\(mySeq\)/g) || []
    expect(staleChecks.length, '陈旧判定点过少（守卫可能被误删）').toBeGreaterThanOrEqual(3)
  })
})
