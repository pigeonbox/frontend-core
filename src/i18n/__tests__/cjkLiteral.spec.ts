// 源码级 CJK 字面量守卫（frontend-core#101）。
//
// parity/drift 守卫防的是「键在译文不在 / 译文里混中文」；防不了**压根没走 t()**
// 的硬编码中文上屏（实录：views/user/OidcCallback.vue 模板与脚本整段中文，
// 非中文用户走 OIDC 登录（含失败分支）直接看到中文）。
//
// 扫描口径：src/ 下 .ts/.vue（排除语言包与测试目录）——先剥注释（stripComments）
// 再找中文：注释里的中文是给开发者看的、不上屏；语言包本来就是数据。
//
// 判据收窄到**表意文字**（汉字）：全角标点/符号（；：「」，）单独放行——
// 「t() 结果后面跟个全角分号」是排版瑕疵、不是「中文上屏」，把它算违规会把
// Federation/Pickup/setup 三处模板标点卷进来，模糊守卫的真正目标。
//
// 白名单（按字面量剥离，每条注明理由；与 parity.spec SERVER_MATCH_KEYS 同源的
// 服务端匹配串必须保持中文是已知设计——翻掉会静默失效）：
//   ① 服务端报文匹配串（serverDisabledPattern/serverNoRootsPattern 同源）；
//   ② utils/uploadFailure.ts 的 msg.includes 归因——同为匹配后端中文原样报文；
//   ③ 语言自名（LocaleSwitcher 按惯例以自身语言展示语种）；
//   ④ Dashboard 时段问候语——只在 locale==='zh-CN' 分支渲染，非中文用户不可见；
//   ⑤ 引导卡生成失败的两处诊断 Error——调用方 catch 后只进 console.error，
//      不上屏（ShareResultDialog.vue「生成引导卡失败」catch 实证）。
// 文件级豁免：utils/e2e.ts——加密工具的诊断性 Error（8 处 throw），调用方在
//   UI 边界统一映射 i18n（views/share/View.vue decryptShareText/submitE2ePassword
//   catch 后改写 t('share.decryptFailed')/t('share.e2ePasswordWrong') 实证）；
//   上传链仅在浏览器缺 crypto.getRandomValues 等极端场景触发。遗留债务：如要
//   彻底收口需给工具层接 i18n，单独立单（不阻断本守卫生效）。
import { describe, it, expect } from 'vitest'
import { listSrcFiles, readSrc, stripComments } from '@/utils/__tests__/sourceScan'

/** 表意文字（汉字）：中文上屏的判据。CJK 标点/全角符号不单独构成违规。 */
const IDEOGRAPH_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** 已知设计白名单（字面量剥离；改动前先读上面的理由清单） */
const ALLOW_LITERALS = [
  // ① 服务端报文匹配串（与 parity.spec SERVER_MATCH_KEYS 同源）
  '本地文件功能未启用',
  '白名单目录',
  // ② 上传失败归因匹配（utils/uploadFailure.ts msg.includes 后端中文报文）
  '超时',
  '网络',
  // ③ 语言自名（components/LocaleSwitcher.vue）
  '中文',
  '日本語',
  // ④ Dashboard 时段问候语（views/user/Dashboard.vue greeting，zh-CN 分支门控）
  '夜深了',
  '早上好',
  '下午好',
  '晚上好',
  // ⑤ 引导卡生成失败诊断（components/share/ShareResultDialog.vue，catch→console）
  '引导卡二维码加载失败',
  'canvas 不可用',
]

/** 文件级豁免：加密工具诊断性 Error（理由见头注） */
const ALLOW_FILES = new Set(['utils/e2e.ts'])

function cjkOffenders(rel: string): string[] {
  if (ALLOW_FILES.has(rel)) return []
  const out: string[] = []
  const lines = stripComments(readSrc(rel)).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    // console.* 是开发者日志，不上屏
    if (/\bconsole\.(log|warn|error|info|debug)\s*\(/.test(line)) continue
    let s = line
    for (const allow of ALLOW_LITERALS) s = s.split(allow).join('')
    if (!IDEOGRAPH_RE.test(s)) continue
    out.push(`${i + 1}: ${s.trim().slice(0, 120)}`)
  }
  return out
}

describe('源码 CJK 字面量守卫（frontend-core#101）', () => {
  it('src/ 里上屏中文字面量必须走 i18n（白名单/注释/console/标点除外）', () => {
    const files = listSrcFiles().filter(
      (f) => !f.includes('__tests__') && !f.startsWith('i18n/locales/'),
    )
    expect(files.length, '应能枚举到源码文件').toBeGreaterThan(10)
    // 守卫自身必须扫得到 OIDC 回调页（本单的事故文件）——扫描口径悄悄失效应即刻暴露
    expect(files).toContain('views/user/OidcCallback.vue')

    const reported: string[] = []
    for (const f of files) {
      for (const snippet of cjkOffenders(f)) reported.push(`${f}:${snippet}`)
    }
    expect(reported, `源码出现硬编码中文（应改走 t()）：\n${reported.join('\n')}`).toEqual([])
  })

  it('白名单只放行注释里写明的已知设计（防白名单无声膨胀）', () => {
    // 每条白名单字面量必须在头注/条目旁有理由：新增条目改上面的注释清单
    expect(ALLOW_LITERALS.length).toBe(12)
    expect([...ALLOW_FILES]).toEqual(['utils/e2e.ts'])
  })
})
