import { describe, it, expect } from 'vitest'
import { diffPatch, getPath } from '../policyDiff'

describe('getPath 点分路径取值', () => {
  it('嵌套取值与缺失返回 undefined', () => {
    const cur = { upload_ex: { open_upload: true }, user: { useruploadsize: 100 } }
    expect(getPath(cur, 'upload_ex.open_upload')).toBe(true)
    expect(getPath(cur, 'user.useruploadsize')).toBe(100)
    expect(getPath(cur, 'user.nope')).toBeUndefined()
    expect(getPath(cur, 'a.b.c')).toBeUndefined()
    expect(getPath(null, 'x')).toBeUndefined()
  })
})

describe('diffPatch 模板差异预览', () => {
  it('只列会变化的字段，值相同的跳过', () => {
    const current = {
      upload_ex: { open_upload: true, max_file_size: 1024 },
      transfer: { expire_default: 7 },
    }
    const patch = {
      upload_ex: { open_upload: false, max_file_size: 1024 },
      transfer: { expire_default: 3 },
    }
    const rows = diffPatch(current, patch)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.path).sort()).toEqual(['transfer.expire_default', 'upload_ex.open_upload'])
    const open = rows.find((r) => r.path === 'upload_ex.open_upload')!
    expect(open.from).toBe(true)
    expect(open.to).toBe(false)
  })

  it('当前配置缺失的字段也算变化（应用后写入）', () => {
    const rows = diffPatch({}, { user: { allowuserregistration: false } })
    expect(rows).toHaveLength(1)
    expect(rows[0].from).toBeUndefined()
    expect(rows[0].to).toBe(false)
  })

  it('数组叶子整体对比，不展开元素', () => {
    const current = { upload_ex: { allowed_expire_styles: ['day', 'week'] } }
    const same = diffPatch(current, { upload_ex: { allowed_expire_styles: ['day', 'week'] } })
    expect(same).toHaveLength(0)
    const changed = diffPatch(current, { upload_ex: { allowed_expire_styles: ['day'] } })
    expect(changed).toHaveLength(1)
    expect(changed[0].path).toBe('upload_ex.allowed_expire_styles')
  })

  it('patch 里的空对象不产生行', () => {
    expect(diffPatch({}, { upload_ex: {} })).toHaveLength(0)
  })

  it('null 与缺失功能等价（解码进结构体都是零值）：空 → null 不算变化', () => {
    expect(diffPatch({}, { base: { public_url: null } })).toHaveLength(0)
    expect(diffPatch({ base: { public_url: null } }, { base: { public_url: null } })).toHaveLength(0)
  })

  it('显式 null 清空有值字段算变化', () => {
    const rows = diffPatch({ base: { public_url: 'https://a.example.com' } }, { base: { public_url: null } })
    expect(rows).toHaveLength(1)
    expect(rows[0].from).toBe('https://a.example.com')
    expect(rows[0].to).toBeNull()
  })
})
