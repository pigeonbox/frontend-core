// 首帧引导：必须在首帧前同步执行（index.html 以 <script src> 同步引入，
// 不用 type=module——module 是 deferred，会晚于首帧）。
// 做两件事——
// 1) 主题（语义与 src/stores/theme.ts 严格一致：app_theme light/dark/auto，缺省 auto）；
// 2) accent 主题色（与 src/utils/accent.ts 同公式同变量族）：读 localStorage 缓存
//    立即上色，避免配置请求返回前主色在 main.scss 默认值与 accent 之间跳变。
// 独立文件化（2026-10-05 审计）：配合 nginx 层 CSP script-src 'self'——
// 内联脚本将迫使 CSP 开 'unsafe-inline'，等于放弃脚本注入防护。
;(function () {
  try {
    var m = localStorage.getItem('app_theme')
    var dark =
      m === 'dark' ||
      ((m === null || m === 'auto') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) document.documentElement.classList.add('dark')
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'

    var hex = localStorage.getItem('app_accent')
    if (hex && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
      var n = parseInt(hex.trim().slice(1), 16)
      var c = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
      var mixTo = function (t, k) {
        var f = function (a, b) { return Math.round(a + (b - a) * k) }
        return 'rgb(' + f(base.r, t.r) + ',' + f(base.g, t.g) + ',' + f(base.b, t.b) + ')'
      }
      var W = { r: 255, g: 255, b: 255 }
      var D = { r: 10, g: 10, b: 10 }
      var base = c
      if (dark) {
        // 暗色主色：先提亮 30%，不足与深色底(#0a0a0a)的 4.5:1 对比度则继续提亮
        // （与 src/utils/accent.ts 的 darkBase 同公式；灰阶 accent 墨黑需 42%）
        var lum = function (v) {
          var s = v / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        var lumOf = function (o) {
          return 0.2126 * lum(o.r) + 0.7152 * lum(o.g) + 0.0722 * lum(o.b)
        }
        var ratio = function (a, b) {
          var la = lumOf(a), lb = lumOf(b)
          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
        }
        var r = 0.3
        base = { r: Math.round(c.r + (255 - c.r) * r), g: Math.round(c.g + (255 - c.g) * r), b: Math.round(c.b + (255 - c.b) * r) }
        while (r < 1 && ratio(base, D) < 4.5) {
          r = Math.min(1, Math.round((r + 0.01) * 100) / 100)
          base = { r: Math.round(c.r + (255 - c.r) * r), g: Math.round(c.g + (255 - c.g) * r), b: Math.round(c.b + (255 - c.b) * r) }
        }
      }
      var to = dark ? D : W
      var blk = { r: 0, g: 0, b: 0 }
      var s = document.documentElement.style
      s.setProperty('--el-color-primary', 'rgb(' + base.r + ',' + base.g + ',' + base.b + ')')
      s.setProperty('--el-color-primary-light-3', mixTo(to, 0.3))
      s.setProperty('--el-color-primary-light-5', mixTo(to, 0.5))
      s.setProperty('--el-color-primary-light-7', mixTo(to, 0.7))
      s.setProperty('--el-color-primary-light-8', mixTo(to, 0.8))
      s.setProperty('--el-color-primary-light-9', mixTo(to, 0.88))
      s.setProperty('--el-color-primary-dark-2', mixTo(dark ? W : blk, 0.2))
      s.setProperty('--primary-color', 'rgb(' + base.r + ',' + base.g + ',' + base.b + ')')
      s.setProperty('--primary-hover', mixTo(to, 0.18))
      s.setProperty('--primary-active', mixTo(dark ? W : blk, 0.3))
      s.setProperty('--primary-bg', dark
        ? 'rgba(' + base.r + ',' + base.g + ',' + base.b + ',0.14)'
        : mixTo(W, 0.9))
      s.setProperty('--primary-color-rgb', base.r + ',' + base.g + ',' + base.b)
      s.setProperty('--primary-gradient', 'linear-gradient(135deg, rgb(' + base.r + ',' + base.g + ',' + base.b + ') 0%, rgb(' + base.r + ',' + base.g + ',' + base.b + ') 100%)')
    }
  } catch (e) {
    /* noop */
  }
})()
