// Telegram / Bark 推送渠道配置面板守卫（2026-11-01 core#31 第二批：admin 配置面）。
//
// core 侧配置形状：SystemConfig.notify.telegram = {bot_token, chat_id}、
// notify.bark = {server_url, device_key}，缺省空 = 禁用该渠道；配置走通用端点
// GET/PUT /admin/config（notify 段指针语义：body 未带该段 = 保留现状）。
//
// 为什么是「源码级」：本仓**没有组件测试基建**（无 @vue/test-utils、无 jsdom，
// 见 src/utils/__tests__/sourceScan.ts 说明）⇒ 视图层只能做源码级断言，防的是
// 「重构时把渠道输入/保存载荷/脱敏删了」这类无声回归；渲染正确性靠真机自检。
//
// 守卫口径（均剥注释后扫描，避免注释里的示例代码误报）：
//   ① 渲染：Telegram/Bark 四个字段都绑到 exForm.notify 对应嵌套字段；
//   ② 脱敏：bot_token 必须是 password 型输入（不回显明文）；
//   ③ 保存：notify 分区保存载荷必须带 telegram + bark 两段（与 webhook/smtp 同一
//      putConfig({notify: …}) 提交路径，漏段 = 管理员填了却永远不生效）；
//   ④ 回读：GET 快照必须合并 telegram/bark（否则表单回显漂移）；
//   ⑤ 语义提示：「缺省空 = 禁用」的 UI 提示两语言都在且非空；
//   ⑥ i18n：telegram/bark 键 zh-CN 与 en-US 齐全（parity.spec 只对账集合对称，
//      不管「用到的键是否存在」之外的取舍，这里把面板键钉死）。
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

const configVue = stripComments(readSrc('views/admin/Config.vue'))
const adminTs = stripComments(readSrc('api/admin.ts'))

/** 取语言包里点分路径的叶子值 */
const msg = (dict: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], dict)

describe('Telegram/Bark 配置面板渲染', () => {
  it('四个字段都绑定到 exForm.notify 的对应嵌套字段', () => {
    for (const bind of [
      'exForm.notify.telegram.bot_token',
      'exForm.notify.telegram.chat_id',
      'exForm.notify.bark.server_url',
      'exForm.notify.bark.device_key',
    ]) {
      expect(configVue, `应有 v-model 绑定 ${bind}`).toMatch(new RegExp(`v-model="${bind.replace(/\./g, '\\.')}"`))
    }
  })

  it('bot_token 是 password 型输入（不回显明文），chat_id/device_key 为常规文本', () => {
    // 属性顺序无关：v-model 与 type="password" 出现在同一个 el-input 标签内即可
    expect(configVue, 'bot_token 输入必须脱敏').toMatch(
      /<el-input[^>]*v-model="exForm\.notify\.telegram\.bot_token"[\s\S]{0,200}?type="password"/
    )
    expect(configVue, 'chat_id 不应是 password 型').not.toMatch(
      /<el-input[^>]*v-model="exForm\.notify\.telegram\.chat_id"[\s\S]{0,200}?type="password"/
    )
    expect(configVue, 'device_key 不应是 password 型').not.toMatch(
      /<el-input[^>]*v-model="exForm\.notify\.bark\.device_key"[\s\S]{0,200}?type="password"/
    )
  })

  it('表单缺省含 telegram/bark 嵌套对象（缺省空 = 禁用）', () => {
    expect(configVue).toMatch(/telegram:\s*\{\s*bot_token:\s*'',\s*chat_id:\s*''/)
    expect(configVue).toMatch(/bark:\s*\{\s*server_url:\s*'',\s*device_key:\s*''/)
  })
})

describe('Telegram/Bark 保存链路', () => {
  it("notify 分区保存载荷携带 telegram + bark 两段（putConfig 同一提交路径）", () => {
    const at = configVue.indexOf("case 'notify':")
    expect(at, "应存在 case 'notify': 分支").toBeGreaterThan(-1)
    const block = configVue.slice(at, configVue.indexOf('break', at))
    expect(block, '保存载荷应含 webhook_url（与既有渠道同路径）').toMatch(/webhook_url:/)
    expect(block, '保存载荷应含 smtp 既有段').toMatch(/smtp:/)
    expect(block, '保存载荷缺 telegram 段 ⇒ 管理员填了不生效').toMatch(/telegram:/)
    expect(block, '保存载荷缺 bark 段 ⇒ 管理员填了不生效').toMatch(/bark:/)
  })

  it('GET 快照合并 sec.notify.telegram / sec.notify.bark 并做 null 归一', () => {
    expect(configVue).toMatch(/sec\.notify\.telegram\)\s*Object\.assign\(exForm\.value\.notify\.telegram/)
    expect(configVue).toMatch(/sec\.notify\.bark\)\s*Object\.assign\(exForm\.value\.notify\.bark/)
    // 后端下发 null 时归一为空对象（v-model 绑定需要稳定的嵌套对象）
    expect(configVue).toMatch(/!exForm\.value\.notify\.telegram\)\s*exForm\.value\.notify\.telegram\s*=/)
    expect(configVue).toMatch(/!exForm\.value\.notify\.bark\)\s*exForm\.value\.notify\.bark\s*=/)
  })

  it('api/admin.ts 的 notify 配置类型含 telegram/bark 字段', () => {
    expect(adminTs, 'TelegramNotifyUpdate 应含 bot_token/chat_id').toMatch(
      /interface TelegramNotifyUpdate \{[\s\S]*?bot_token\?: string[\s\S]*?chat_id\?: string/
    )
    expect(adminTs, 'BarkNotifyUpdate 应含 server_url/device_key').toMatch(
      /interface BarkNotifyUpdate \{[\s\S]*?server_url\?: string[\s\S]*?device_key\?: string/
    )
    expect(adminTs, 'AdminConfigUpdate 应能携带 notify 段').toMatch(/notify\?: NotifyConfigUpdate/)
  })
})

describe('Telegram/Bark 配置面 i18n', () => {
  const keys = [
    'admin.configPage.sections.telegram',
    'admin.configPage.sections.bark',
    'admin.configPage.notify.telegramBotToken',
    'admin.configPage.notify.telegramBotTokenPlaceholder',
    'admin.configPage.notify.telegramChatId',
    'admin.configPage.notify.telegramChatIdPlaceholder',
    'admin.configPage.notify.telegramHint',
    'admin.configPage.notify.barkServerUrl',
    'admin.configPage.notify.barkServerUrlPlaceholder',
    'admin.configPage.notify.barkDeviceKey',
    'admin.configPage.notify.barkDeviceKeyPlaceholder',
    'admin.configPage.notify.barkHint',
  ]

  it('zh-CN 与 en-US 的渠道键齐全且非空', () => {
    for (const k of keys) {
      for (const [name, dict] of [
        ['zh-CN', zhCN],
        ['en-US', enUS],
      ] as const) {
        const v = msg(dict, k)
        expect(typeof v, `${name} 缺键或类型不对：${k}`).toBe('string')
        expect((v as string).length, `${name} 键值为空：${k}`).toBeGreaterThan(0)
      }
    }
  })

  it('「缺省空 = 禁用」语义提示在两语言里都在场', () => {
    expect(String(msg(zhCN, 'admin.configPage.notify.telegramHint'))).toContain('留空即禁用')
    expect(String(msg(zhCN, 'admin.configPage.notify.barkHint'))).toContain('留空即禁用')
    expect(String(msg(enUS, 'admin.configPage.notify.telegramHint'))).toContain('leave empty to disable')
    expect(String(msg(enUS, 'admin.configPage.notify.barkHint'))).toContain('leave empty to disable')
  })
})
