// 退役字段守卫（2026-10-26 兼容层清理）。
//
// 本轮从契约层到前端删掉了一组**恒空死字段**与**旧配置键**：
//   - UserShareItemData.prefix / UserFileItem.prefix+suffix
//     （旧直传布局的「原始名拆分」：真机 310 行恒空、无写入方）
//   - download.presign_anonymous_enabled（旧直传开关，语义已并入 presign_policy）
//
// 为什么需要源码级守卫（项目没有浏览器级 CI，渲染正确性靠真机视觉自检）：
//   ① 类型层：契约已删字段 ⇒ 任何 `row.prefix` 引用都会在 typecheck 变红；
//      但「row.file_name || row.prefix + row.suffix || '—'」这种**回退链**在
//      类型上完全合法（prefix 若还在类型里就合法），删了类型它就编译不过 ——
//      也就是说，**类型收口本身已把回退链钉死**，此守卫防的是「有人把 prefix
//      加回契约/本地类型再写回退链」。
//   ② 配置键：旧键已从契约与后端删除，但前端可能重新引入二次推导
//      （历史上有过一次：Config.vue 按旧键推导 presign_policy）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// here = src/views/user/__tests__ ⇒ 上溯三级到 src/
const srcRoot = resolve(here, '..', '..', '..')
const read = (rel: string) => readFileSync(resolve(srcRoot, rel), 'utf8')

describe('退役字段守卫', () => {
  it('用户侧视图不再引用分享条目的 prefix/suffix 回退链', () => {
    for (const rel of ['views/user/Shares.vue', 'views/user/History.vue']) {
      const src = read(rel)
      expect(src, `${rel} 不应再出现 row.prefix`).not.toMatch(/row\.prefix/)
      expect(src, `${rel} 不应再出现 row.suffix`).not.toMatch(/row\.suffix/)
    }
  })

  it('管理台配置页不再按旧直传开关推导策略', () => {
    const src = read('views/admin/Config.vue')
    // 只判**代码引用**（属性访问/赋值），注释里说明「旧键已退役」是允许的
    expect(src, '不应再读取旧直传开关').not.toMatch(/\.presign_anonymous_enabled\b/)
    expect(src, '不应再写回旧直传开关').not.toMatch(/presign_anonymous_enabled\s*[:=]/)
  })

  it('契约类型里已无 prefix/suffix（分享条目）', () => {
    // 契约包是**纯类型**包（无运行时导出）⇒ 直接读安装到 node_modules 的 .d.ts 源码断言。
    const contractsRoot = resolve(here, '..', '..', '..', '..', 'node_modules', '@pigeonbox', 'contracts', 'gen', 'ts')
    const shareDts = readFileSync(resolve(contractsRoot, 'share.d.ts'), 'utf8')
    const userDts = readFileSync(resolve(contractsRoot, 'user.d.ts'), 'utf8')

    // 只截取结构体块本身（到第一个闭合大括号为止）——否则会连带后面的结构体
    // （如 APIKeyData.prefix 是**活功能**，不能误判）。
    const structBlock = (dts: string, name: string): string => {
      const at = dts.indexOf(`interface ${name} {`)
      expect(at, `${name} 应存在`).toBeGreaterThan(-1)
      const end = dts.indexOf('}', at)
      return dts.slice(at, end)
    }

    const shareStruct = structBlock(shareDts, 'UserShareItemData')
    expect(shareStruct, 'UserShareItemData 应已无 prefix').not.toMatch(/\bprefix:\s*string/)
    expect(shareStruct, 'UserShareItemData 应已无 suffix').not.toMatch(/\bsuffix:\s*string/)

    const userStruct = structBlock(userDts, 'UserFileItem')
    expect(userStruct, 'UserFileItem 应已无 prefix').not.toMatch(/\bprefix:\s*string/)
    expect(userStruct, 'UserFileItem 应已无 suffix').not.toMatch(/\bsuffix:\s*string/)

    // APIKeyData.prefix 是活功能（密钥前缀）——不得被误删
    const apiKeyStruct = structBlock(userDts, 'APIKeyData')
    expect(apiKeyStruct, 'APIKeyData.prefix 是活功能，应保留').toMatch(/\bprefix:\s*string/)
  })
})
