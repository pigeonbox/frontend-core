// PigeonBeam 入口（2026-11-03 Phase 3）：config store 的 beamBaseUrl 是失败卡片
// 「用 PigeonBeam 加速传」按钮的渲染门禁——空 = 零渲染（不给必然打不开的坏入口）。
// 判据：未配置/空串 ⇒ ''（前端据空串不渲染）；有值 ⇒ 去空白后透出。
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigStore } from '../config'

describe('config store · beamBaseUrl（Beam 入口渲染门禁）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未配置 / 空串 ⇒ 空串（前端据空串零渲染）', () => {
    const store = useConfigStore()
    store.config = null
    expect(store.beamBaseUrl).toBe('')
    store.config = { beamBaseUrl: '' } as never
    expect(store.beamBaseUrl).toBe('')
    store.config = { beamBaseUrl: '   ' } as never
    expect(store.beamBaseUrl).toBe('')
  })

  it('有值 ⇒ 去空白透出（前端据非空渲染入口）', () => {
    const store = useConfigStore()
    store.config = { beamBaseUrl: '  https://beam.example.com/entry  ' } as never
    expect(store.beamBaseUrl).toBe('https://beam.example.com/entry')
  })

  it('缺字段（老后端未下发）⇒ 空串（不给坏入口）', () => {
    const store = useConfigStore()
    store.config = { name: 'PigeonBox' } as never
    expect(store.beamBaseUrl).toBe('')
  })
})
