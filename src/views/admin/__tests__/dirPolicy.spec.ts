// 目录策略分区守卫（core#159：按目录配额/分享策略）。
//
// core 侧配置形状：GET /admin/config 的 data 里新增 share 段——
//   { share: { directory_policies: [{ root, quota_bytes, share_mode }] } }
// - root         绝对路径前缀
// - quota_bytes  字节；0 = 不限
// - share_mode   "" / "allow" = 放行；"deny" = 该目录禁止生成分享
//
// 为什么是「源码级」：本仓没有组件测试基建（无 @vue/test-utils、无 jsdom，
// 见 src/utils/__tests__/sourceScan.ts 说明）⇒ 视图层只能做源码级断言，防的是
// 「重构时把分区/字段/保存载荷删了」这类无声回归；渲染正确性靠真机自检。
//
// 守卫口径（均剥注释后扫描，避免注释里的示例代码误报）：
//   ① 分区入口：导航项 + ?section= 深链 ID + divider 三者齐备（漏任一项 ⇒ 管理员
//      进不去这个分区，策略改不动）；
//   ② 字段：root 文本 / quota_bytes 数字（0=不限）/ share_mode 下拉两档（allow/deny）；
//   ③ 回读：GET 快照解析 share 段并做归一（core 视 "" 与 "allow" 等价；老实例不下发
//      该段 ⇒ 归一为空列表，不能留上一轮的脏数据）；
//   ④ 保存：**整段替换**语义——core 的 share 段「带了=整体覆盖、缺省=不改」⇒ 本分区
//      保存必须把 share 段带上，且**清空全部策略时提交空列表**（不是省略该段）。
//      这是本守卫最要紧的一条：省略该段 ⇒ 管理员删光策略后保存不生效（假成功）；
//   ⑤ i18n：五个语言包都齐全部键且非空（漏一个语言 ⇒ 该语种面板出现原始键名）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import jaJP from '@/i18n/locales/ja-JP'
import deDE from '@/i18n/locales/de-DE'
import ruRU from '@/i18n/locales/ru-RU'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const configVue = stripComments(readSrc('views/admin/Config.vue'))

/** 取语言包里点分路径的叶子值 */
const msg = (dict: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], dict)

const I18N_KEYS = [
  'admin.configPage.nav.dirPolicy',
  'admin.configPage.navDesc.dirPolicy',
  'admin.configPage.sections.dirPolicy',
  'admin.configPage.dirPolicy.intro',
  'admin.configPage.dirPolicy.empty',
  'admin.configPage.dirPolicy.root',
  'admin.configPage.dirPolicy.rootPlaceholder',
  'admin.configPage.dirPolicy.rootRequired',
  'admin.configPage.dirPolicy.rootNotAbsolute',
  'admin.configPage.dirPolicy.quota',
  'admin.configPage.dirPolicy.quotaHint',
  'admin.configPage.dirPolicy.shareMode',
  'admin.configPage.dirPolicy.shareModeAllow',
  'admin.configPage.dirPolicy.shareModeDeny',
  'admin.configPage.dirPolicy.shareModeHint',
  'admin.configPage.dirPolicy.add',
  'admin.configPage.dirPolicy.remove',
]

describe('目录策略分区入口', () => {
  it('导航项 + 深链 section ID + divider 齐备（漏任一项 ⇒ 管理员进不去）', () => {
    expect(configVue, 'SECTION_IDS 应含 dirPolicy（?section= 深链才认这个分区）').toMatch(
      /const SECTION_IDS = \[[^\]]*'dirPolicy'/
    )
    expect(configVue, '导航项应指向本分区的新 i18n 键').toMatch(
      /id: 'dirPolicy', labelKey: 'admin\.configPage\.nav\.dirPolicy', descKey: 'admin\.configPage\.navDesc\.dirPolicy'/
    )
    expect(configVue, '分区表单应由 activeSection 驱动').toMatch(
      /v-else-if="activeSection === 'dirPolicy'"/
    )
    expect(configVue, '分区应有 divider 标题').toMatch(/t\('admin\.configPage\.sections\.dirPolicy'\)/)
  })

  it('三个字段都可编辑：root 文本 / quota_bytes 数字 / share_mode 下拉两档', () => {
    expect(configVue, 'root 应绑定到策略行的 root').toMatch(/v-model="policy\.root"/)
    expect(configVue, 'quota_bytes 应是数字输入且 0 为下限（0=不限）').toMatch(
      /v-model="policy\.quota_bytes"[^>]*:min="0"/
    )
    expect(configVue, 'share_mode 应绑定到策略行').toMatch(/v-model="policy\.share_mode"/)
    expect(configVue, 'share_mode 下拉应有 allow 档（放行）').toMatch(/value="allow"/)
    expect(configVue, 'share_mode 下拉应有 deny 档（禁止生成分享）').toMatch(/value="deny"/)
  })

  it('可增删策略行', () => {
    expect(configVue, '应有新增策略的入口').toMatch(/addDirPolicy/)
    expect(configVue, '应有删除策略行的入口').toMatch(/removeDirPolicy/)
  })
})

describe('目录策略回读链路', () => {
  it('GET 快照解析 share 段；老实例不下发该段 ⇒ 归一为空列表', () => {
    expect(configVue, '应读取 share.directory_policies').toMatch(/sec\.share\?\.directory_policies/)
    expect(configVue, '非数组/缺段时归一为空列表（不留上一轮脏数据）').toMatch(
      /dirPolicies\.value = Array\.isArray\(policyList\) \? policyList\.map\(normalizeDirPolicy\) : \[\]/
    )
  })

  it('归一：share_mode 空串按 allow 处理（core 视 "" 与 allow 等价）；quota 非法值归 0', () => {
    expect(configVue).toMatch(/share_mode: p\.share_mode === 'deny' \? 'deny' : 'allow'/)
    expect(configVue).toMatch(
      /quota_bytes: Number\.isFinite\(quota\) && quota > 0 \? Math\.floor\(quota\) : 0/
    )
  })
})

describe('目录策略保存链路（整段替换语义）', () => {
  const at = configVue.indexOf("case 'dirPolicy':")
  const block = at > -1 ? configVue.slice(at, configVue.indexOf('break', at)) : ''

  it("存在 dirPolicy 保存分支，且载荷带 share 段（段缺省=不改 ⇒ 漏段=改了不生效)", () => {
    expect(at, "应存在 case 'dirPolicy': 分支").toBeGreaterThan(-1)
    expect(block, '保存载荷缺 share 段 ⇒ 管理员改了策略永远不生效').toMatch(/await putConfig\(/)
    expect(block, '保存载荷缺 share 段').toMatch(/share:\s*\{/)
    expect(block, '保存载荷缺 directory_policies 列表').toMatch(/directory_policies:/)
  })

  it('清空全部策略时也提交空列表（不得用 length 做条件门，否则「删光」是假成功）', () => {
    expect(block, '不得按列表长度条件提交 ⇒ 清空策略必须提交空列表').not.toMatch(
      /dirPolicies\.value\.length/
    )
  })

  it('提交前做机械归一（root 去空白、quota 取整、share_mode 只留两档）', () => {
    expect(block).toMatch(/root: p\.root\.trim\(\)/)
    expect(block).toMatch(
      /quota_bytes: Number\.isFinite\(p\.quota_bytes\) && p\.quota_bytes > 0 \? Math\.floor\(p\.quota_bytes\) : 0/
    )
    expect(block).toMatch(/share_mode: p\.share_mode === 'deny' \? 'deny' : 'allow'/)
  })
})

describe('目录策略 i18n', () => {
  it('五个语言包都齐全部键且非空', () => {
    const dicts: Array<[string, unknown]> = [
      ['zh-CN', zhCN],
      ['en-US', enUS],
      ['ja-JP', jaJP],
      ['de-DE', deDE],
      ['ru-RU', ruRU],
    ]
    for (const [name, dict] of dicts) {
      for (const key of I18N_KEYS) {
        const v = msg(dict, key)
        expect(typeof v, `${name} 缺键 ${key}`).toBe('string')
        expect((v as string).trim().length, `${name} 的 ${key} 为空`).toBeGreaterThan(0)
      }
    }
  })
})
