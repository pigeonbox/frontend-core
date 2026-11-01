/**
 * 「最新请求获胜」守卫（竞态丢弃）。
 *
 * ⚠️ 2026-10-26 审计：分享详情页的 fetchShare 此前**无任何请求序号**
 * ⇒ 两次取数重叠时（密码重试 A、随即切码 B）**后到的旧响应会覆盖新数据**
 * ⇒ 地址栏是 B 码、页面渲染 A 码的内容（正是本仓已复发三次的
 * 「内容挂在别的地址下」那类缺陷）。
 *
 * 与 composables/useTableQuery.ts 的 seq 丢弃机制同款；抽成独立 composable 是
 * 为了**能单测**（本仓无组件测试基建，视图层只能做源码级断言）。
 *
 * 用法：
 *   const { begin, isStale } = useLatestRequest()
 *   const mySeq = begin()
 *   const res = await fetch()
 *   if (isStale(mySeq)) return   // 已有更新的请求发出 ⇒ 丢弃本次响应
 */
export function useLatestRequest() {
  let seq = 0

  /** 开始一次请求，返回本次的序号 */
  function begin(): number {
    return ++seq
  }

  /** 本次请求是否已被更新的请求取代（是 ⇒ 丢弃本次响应） */
  function isStale(mySeq: number): boolean {
    return mySeq !== seq
  }

  return { begin, isStale }
}
