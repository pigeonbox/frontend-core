// 折叠屏 / 新形态机型适配守卫（2026-10-26，iPhone Duo / Xiaomi 18 Fold 一类）。
//
// 背景：折叠屏把「窄屏」这件事从「手机一种形态」变成**一段连续宽度区间**——
//   · 外屏（合上）：≈390px（与手机同）
//   · 内屏（展开）：≈690~900 CSS px（iPhone/小米折叠屏内屏 6~7.2" 折算）
//   · 中间还夹着平板竖屏（768~1024）与桌面小窗分屏
// 而管理台宽表列宽合计 **990~1600px** ⇒ 旧断点（768px）会让 769~1024 这一整段
// 落回「表格形态」⇒ 与手机上同型的「内容列被裁、固定操作列盖住相邻列」缺陷。
//
// 本守卫钉住本轮的四条新不变量：
//   ① 安全区（刘海/灵动岛/底部指示条/圆角/内屏挖孔）——依赖 viewport-fit=cover；
//   ② 动态视口高度（dvh）——移动端地址栏、折叠屏合上/展开时 100vh 不变；
//   ③ 管理台「表格→卡片」与侧栏抽屉断点 = 1024px（覆盖折叠屏展开态）；
//   ④ 769~1024px 档位下卡片走**多列网格**（单列横跨全宽、标签与值被拉到两端）。
//
// 断言全是**源码级**（项目没有浏览器级 CI；渲染正确性靠真机/浏览器视觉自检），
// 负对照已实跑：去掉 viewport-fit / 去掉安全区 / 把断点改回 768px / 去掉 dvh
// / 去掉网格 ⇒ 各自变红。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// here = src/views/admin/__tests__ ⇒ 上溯三级到 src/
const srcRoot = resolve(here, '..', '..', '..')
const repoRoot = resolve(srcRoot, '..')
const read = (rel: string) => readFileSync(resolve(srcRoot, rel), 'utf8')
const readRepo = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8')

describe('折叠屏适配：安全区', () => {
  it('index.html 必须声明 viewport-fit=cover（否则 env(safe-area-inset-*) 恒为 0）', () => {
    const html = readRepo('index.html')
    const meta = html.match(/<meta\s+name="viewport"[^>]*>/i)
    expect(meta, '应有 viewport meta').not.toBeNull()
    expect(meta![0], 'viewport 必须带 viewport-fit=cover（刘海/灵动岛/底部指示条）').toContain(
      'viewport-fit=cover',
    )
  })

  it('全局必须定义四个安全区变量（env 兜底 0px）', () => {
    // 安全区规则放在独立文件 styles/foldable.css（与 main.scss 的并行改造解耦）
    const scss = read('styles/foldable.css')
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(
        scss,
        `缺少 --safe-${side} 变量（env(safe-area-inset-${side}, 0px)）`,
      ).toMatch(new RegExp(`--safe-${side}:\\s*env\\(safe-area-inset-${side},\\s*0px\\)`))
    }
  })

  it('顶栏必须顶内缩安全区并补偿高度（否则内容压在刘海/挖孔下）', () => {
    const nav = read('components/layout/TopNav.vue')
    expect(nav, 'TopNav 顶栏应有 safe-top 内缩').toMatch(/padding:[^;]*var\(--safe-top/)
    expect(nav, 'TopNav 顶栏高度应补偿安全区（否则被 border-box 挤扁）').toMatch(
      /height:\s*calc\(56px \+ var\(--safe-top/,
    )

    const admin = read('views/admin/index.vue')
    expect(admin, '管理台顶栏应有 safe-top 内缩').toMatch(/padding:[^;]*var\(--safe-top/)
    expect(admin, '管理台抽屉（浮在最上层）应自己承担安全区').toMatch(
      /\.admin-aside[\s\S]*?padding-top:\s*var\(--safe-top/,
    )
  })

  it('顶栏的**变体覆盖**也必须带安全区（否则覆盖掉基础规则的内缩）', () => {
    // 实测缺陷（2026-10-26）：`.top-nav--home` 在基础规则之后覆盖 padding，
    // 若写成 `padding: 0 var(--spacing-md)` ⇒ 基础规则的 safe-top 被抹掉 ⇒
    // 首页顶栏压到刘海/灵动岛下。⇒ 变体覆盖也必须带 var(--safe-top)。
    const nav = read('components/layout/TopNav.vue')
    const paddingDecls = nav.match(/padding:[^;]*;/g) || []
    const topNavDecls = paddingDecls.filter((d) => !d.includes('var(--safe-top'))
    expect(
      topNavDecls,
      `TopNav 的 padding 覆盖里混进了不带安全区的写法：${topNavDecls.join(' / ')}`,
    ).toHaveLength(0)
  })

  it('页面底部必须留出底部安全区（home indicator 不得压住主操作）', () => {
    const scss = read('styles/foldable.css')
    expect(scss, '#app 应有底部安全区内边距').toMatch(
      /#app[\s\S]*?padding-bottom:\s*var\(--safe-bottom/,
    )
  })
})

describe('折叠屏适配：动态视口高度', () => {
  const VH_FILES = [
    'App.vue',
    'layouts/AppLayout.vue',
    'views/home/index.vue',
    'views/home/Send.vue',
    'views/anonymous/Result.vue',
    'views/setup/Index.vue',
    'views/user/Login.vue',
    'views/admin/Login.vue',
    'views/admin/index.vue',
  ]

  it('不得残留裸 100vh（必须成对给出 100dvh 兜底）', () => {
    for (const f of VH_FILES) {
      const src = read(f)
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (!/100vh/.test(line)) return
        // 注释里提到 100vh 是允许的（说明文字），只查**声明行**
        if (!/(min-)?height:\s*(calc\()?100vh/.test(line)) return
        // 允许中间夹注释行（向后看 3 行），但 dvh 必须在声明之后出现
        const lookahead = lines.slice(i + 1, i + 4).join('\n')
        expect(
          lookahead,
          `${f}:${i + 1} 的 100vh 后面必须有 100dvh 兜底（移动端地址栏/折叠屏合上展开时 vh 不变）`,
        ).toMatch(/100dvh/)
      })
    }
  })
})

describe('折叠屏适配：断点提档（769~1024px = 折叠屏展开态/平板竖屏/小窗分屏）', () => {
  it('管理台「表格→卡片」互斥开关必须在 ≤1024px', () => {
    const scss = read('styles/main.scss')
    expect(scss, '管理台互斥开关应在 ≤1024px 断点').toContain('@media (max-width: 1024px)')
    const at = scss.indexOf('@media (max-width: 1024px)')
    const block = scss.slice(at, at + 4000)
    expect(block, '≤1024px 必须隐藏 .admin-table-wide（宽表）').toMatch(
      /\.admin-table-wide\s*\{[^}]*display:\s*none\s*!important/,
    )
    expect(block, '≤1024px 必须显示 .narrow-cards（卡片）').toMatch(
      /\.narrow-cards\s*\{[^}]*display:\s*flex/,
    )
  })

  it('管理台侧栏在 ≤1024px 必须抽屉化（内容区才拿得到整幅宽度）', () => {
    const s = read('views/admin/index.vue')
    const at = s.indexOf('@media (max-width: 1024px)')
    expect(at, '管理台布局应有 ≤1024px 断点').toBeGreaterThan(-1)
    const block = s.slice(at, at + 3000)
    expect(block, '侧栏必须 position: fixed（脱离常规流）').toMatch(
      /\.admin-aside[\s\S]*?position:\s*fixed/,
    )
  })

  it('用户端两张宽表也必须在 ≤1024px 走卡片形态', () => {
    const history = read('views/user/History.vue')
    expect(history, '取件历史页应有 ≤1024px 断点（7 列 ≈1160px）').toContain(
      '@media (max-width: 1024px)',
    )
    expect(history, '取件历史页 ≤1024px 必须隐藏 .history-table').toMatch(
      /@media \(max-width: 1024px\)[\s\S]*?\.history-table\s*\{[^}]*display:\s*none/,
    )

    const dash = read('views/user/Dashboard.vue')
    expect(dash, '用户仪表盘应有 ≤1024px 断点（最近分享 5 列 ≈900px）').toContain(
      '@media (max-width: 1024px)',
    )
    expect(dash, '用户仪表盘应有卡片形态容器').toContain('dashboard-share-cards')
    expect(dash, '≤1024px 必须隐藏 .dashboard-shares-table').toMatch(
      /@media \(max-width: 1024px\)[\s\S]*?\.dashboard-shares-table\s*\{[^}]*display:\s*none/,
    )
  })

  it('卡片形态的操作按钮必须抬到触控热区（EP size=small 仅 24px 高）', () => {
    // 折叠屏/手机是**触摸**设备：卡片里的操作按钮用的是 size="small"
    // （Element Plus 高度仅 24px）⇒ 命中率极差（移动端可点目标建议 ≥44px，
    // EP 自带 large 才是 40px）⇒ 卡片形态下必须显式抬高命中框。
    const scss = read('styles/foldable.css')
    const cardActions = scss.slice(scss.indexOf('.narrow-card-actions'))
    expect(
      cardActions,
      '管理台卡片操作按钮须抬到 ≥40px（触控热区）',
    ).toMatch(/min-height:\s*40px/)

    const dash = read('views/user/Dashboard.vue')
    const dashActions = dash.slice(dash.indexOf('.dashboard-share-actions'))
    expect(
      dashActions,
      '用户仪表盘卡片操作按钮须抬到 ≥40px（触控热区）',
    ).toMatch(/min-height:\s*40px/)
  })

  it('600~1024px 档位下三处卡片列表都必须走多列网格（单列会横跨全宽、难读）', () => {
    const gridBand = '@media (min-width: 600px) and (max-width: 1024px)'

    const scss = read('styles/main.scss')
    expect(scss, '管理台卡片应有 600~1024px 网格档').toContain(gridBand)
    // 在**网格档块内**断言（文件里首个 .narrow-cards 是「宽屏默认隐藏」那条）
    const bandAt = scss.indexOf(gridBand)
    const band = scss.slice(bandAt, bandAt + 600)
    expect(band, '管理台卡片网格应为 auto-fill minmax(280px, 1fr)').toMatch(
      /\.narrow-cards\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(280px,\s*1fr\)\)/,
    )

    const history = read('views/user/History.vue')
    expect(history, '取件历史卡片应有 600~1024px 网格档').toContain(gridBand)

    const dash = read('views/user/Dashboard.vue')
    expect(dash, '仪表盘卡片应有 600~1024px 网格档').toContain(gridBand)
  })
})
