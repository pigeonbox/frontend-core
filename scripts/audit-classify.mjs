#!/usr/bin/env node
// audit-classify.mjs —— npm audit 公告分类器（判据：可动作性，不是「有没有漏洞」）。
//
// # 为什么要有这个分类器（2026-11-18 实录）
//
// 前端仓的 npm audit 门禁原判据是「有 high 就红」。2026-11-17 npm 公告库更新了
// picomatch 的 ReDoS 公告（GHSA-fc5q-39xc-vjpf）：
//
//     vulnerable_version_range: <= 4.0.7    first_patched_version: null
//
// ⇒ **所有已发布版本都中招、且没有任何版本能修**（4.0.7 就是最新）。
// 而 picomatch 由**生产依赖** vue-router 5.x 直接引入（npm ls --omit=dev 可见）
// ⇒ 连 --omit=dev 也救不了 ⇒ 原判据从此**恒红**。
//
// 恒红的门禁等于没有门禁：它会连带把生态 CI 基线闸门拖红 ⇒ 发布列车发不出车，
// 而**没有任何升级动作能消除它**。⇒ 判据必须换到「可动作性」这一维度：
//
//   ① high/critical 且**本包有补丁版可升** ⇒ 判红（能消除就必须消除，口径不变）。
//   ② high/critical 且**本包无补丁版可升** ⇒ 必须在 security/audit-unfixable.json
//     **显式登记**（公告号/包名/理由/跟踪单号/复核日期）⇒ 未登记即判红。
//     登记≠放行，是「已知未修复」：清单会被响亮打印，每条都带跟踪单与复核日期。
//
// # 为什么判据能自愈（不是永久放松）
//
// 判「本包有没有补丁版」用的信号是 npm 给**公告归属包**条目的 fixAvailable：
//   · fixAvailable === true                 ⇒ 有补丁（本包可升）⇒ ①
//   · fixAvailable = {name: 本包, version}  ⇒ 有补丁（本包可升）⇒ ①
//   · fixAvailable = {name: 别的包}         ⇒ npm 建议升的是**依赖方**，
//     而公告自身范围（如 <=4.0.7）覆盖了本包**所有**已发布版本 ⇒ 本包无补丁 ⇒ ②
// ⇒ 一旦上游出了补丁版（picomatch 4.0.8），fixAvailable 变成 {name:'picomatch'}
//   ⇒ 判据自动回到 ① ⇒ 门禁立刻转红**逼我们升级** ⇒ 登记项必须删。
//
// # 为什么仍保留原有负对照
//
// 既有负对照把 immutable 钉回 5.1.5（同一条 npm audit 必须判红）——immutable 的
// 公告**有补丁版**（fixAvailable=true）⇒ 落在 ① ⇒ 依旧判红 ⇒ 门禁牙齿没被磨掉。
//
// 用法：audit-classify.mjs <audit.json> [allowlist.json]
// 退出码：0 = 通过；1 = 违反判据；2 = 用法错。
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
if (argv.length < 1 || argv.length > 2) {
  console.error('用法: audit-classify.mjs <audit.json> [allowlist.json]')
  process.exit(2)
}

const audit = JSON.parse(readFileSync(argv[0], 'utf8'))
const allowlistPath = argv[1] || 'security/audit-unfixable.json'
const registered = new Map()
try {
  const raw = JSON.parse(readFileSync(allowlistPath, 'utf8'))
  for (const e of raw.entries || []) registered.set(e.id, e)
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.error('✗ 允许清单读取失败: ' + err.message)
    process.exit(2)
  }
}

// ownerFixable：公告归属包自身是否有可直接升到的补丁版。
function ownerFixable(ownerEntry, pkgName) {
  const fix = ownerEntry ? ownerEntry.fixAvailable : undefined
  if (fix === true) return true
  if (fix && typeof fix === 'object') {
    // npm 建议升的是**别的包**⇒ 本包自身无补丁可升（例如建议降级父包）。
    return fix.name === pkgName
  }
  return false
}

const vulns = audit.vulnerabilities || {}
const advisories = new Map()
for (const [entryName, v] of Object.entries(vulns)) {
  const via = Array.isArray(v.via) ? v.via : []
  for (const item of via) {
    if (!item || typeof item !== 'object') continue
    const sev = String(item.severity || v.severity || '').toLowerCase()
    if (sev !== 'high' && sev !== 'critical') continue
    const id = item.url ? String(item.url).split('/').pop() : (item.source || entryName)
    const pkg = item.name || entryName
    const fixable = ownerFixable(vulns[pkg], pkg)
    const cur = advisories.get(id)
    if (cur) {
      cur.fixable = cur.fixable && fixable
    } else {
      advisories.set(id, {
        id: id,
        title: item.title || pkg,
        severity: sev,
        pkg: pkg,
        range: item.range || '',
        fixable: fixable,
      })
    }
  }
}

const list = [...advisories.values()].sort((a, b) => a.id.localeCompare(b.id))
const fixable = list.filter((a) => a.fixable)
const unfixable = list.filter((a) => !a.fixable)

let bad = 0
if (fixable.length > 0) {
  bad++
  console.error('✗ 可修复的 high/critical 公告（本包有补丁可升 ⇒ 必须升级消除）:')
  for (const a of fixable) {
    console.error('   - ' + a.id + ' ' + a.pkg + ' sev=' + a.severity + ' range=' + a.range + ' :: ' + a.title)
  }
}

const unregistered = unfixable.filter((a) => !registered.has(a.id))
if (unregistered.length > 0) {
  bad++
  console.error('✗ 无补丁版的高危公告未登记（登记=显式承认并挂跟踪单，不是不用管）:')
  for (const a of unregistered) {
    console.error('   - ' + a.id + ' ' + a.pkg + ' sev=' + a.severity + ' range=' + a.range + ' :: ' + a.title)
  }
  console.error('  请在 ' + allowlistPath + ' 登记（公告号/包名/理由/跟踪单号/复核日期）。')
}

if (unfixable.length > 0) {
  console.log('=== 已知未修复（上游未出补丁）清单 ===')
  for (const a of unfixable) {
    const reg = registered.get(a.id)
    const tail = reg ? (' | 跟踪单 ' + (reg.tracking_issue || '缺') + ' | 复核 ' + (reg.review_by || '缺')) : ' | **未登记**'
    console.log('   - ' + a.id + ' ' + a.pkg + ' sev=' + a.severity + ' range=' + a.range + tail)
  }
}

if (bad > 0) process.exit(1)
console.log('✓ audit 判据通过（可修复高危 0 条；已知未修复 ' + unfixable.length + ' 条已登记）')
process.exit(0)
