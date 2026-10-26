// 类型漂移守卫：这 10 条业务路由的 wire 类型必须来自 contracts 生成类型。
//
// 为什么需要（2026-10-26 契约收敛列车）：这 10 条路由此前**只存在于 core 的
// 手写路由**里，从未进过契约层 ⇒ 前端**手写**了它们的请求/响应类型 ⇒ 后端改
// 字段名不会编译报错，只在运行时炸（前端与后端双维护的经典形态）。
//
// 守卫的四个口径（全部机械可复算，不靠作者自标 ⇒ 符合 AGENTS.md 规则 13/16
// 「发现机制本身也要能被机械验证」）：
//   ① 钉版：@pigeonbox/contracts 必须 ≥ 0.20.0，且 package.json /
//      package-lock.json / 实装包**三处一致**（版本元数据三处同抬，规则 9）。
//   ② 发现：按**路由路径字面量**扫描 src/（排除测试目录）⇒ 命中文件即为
//      「该路由的前端调用点」。新增调用点自动进核对 ⇒ 忘登记直接变红。
//   ③ 引用：每个调用点必须 import '@pigeonbox/contracts' 并引用该路由的
//      契约类型名 ⇒ 契约层改字段名时前端**编译期**就红。
//   ④ 无手写副本：调用点里不得出现①与契约结构体同名的本地声明、
//      覆盖契约字段集的手写对象字面量声明、或内联对象字面量类型实参
//      （`request<ApiResponse<{ revoked: number }>>` 这类）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listSrcFiles, readSrc, stripComments, matchBrace, srcRoot } from '@/utils/__tests__/sourceScan'

const CONTRACTS_MIN_VERSION = '0.20.0'

/** 契约结构体所在 d.ts（相对 contracts/gen/ts） */
type Dts = 'share' | 'user' | 'notify' | 'p2p' | 'admin'

interface RouteSpec {
  /** 路由路径字面量（前端源码里出现即视为「该路由有前端调用点」） */
  path: string
  /** 该路由的契约类型名（调用点必须引用；名字在调用点源码里出现即算引用） */
  types: string[]
  /** 契约结构体所在 d.ts */
  dts: Dts
  /** 不得被本地手写副本覆盖的契约结构体（≥2 字段者才有判别力） */
  dupStructs?: string[]
  /** 前端暂无调用点（后端已就绪、前端未接）：一旦出现调用点即红 */
  noConsumer?: boolean
  /** 备注 */
  note?: string
}

/**
 * 10 条路由 + 1 条前端实际在用的本地导入面（/admin/local-files/import）。
 *
 * ⚠️ `/api/v1/user/shares/import-local`（契约里的用户侧导入面）**前端从未
 * 调用**——前端的管理台本地文件页走的是 `/admin/local-files/import`
 * （admin 域，带 root 索引）。两条都登记：前者钉「暂无调用点」，后者钉
 * 「调用点必须用契约类型」，谁新增调用点都会被守卫捞出来。
 */
const ROUTES: RouteSpec[] = [
  {
    path: '/share/metadata/',
    types: ['ShareMetadataData'],
    dts: 'share',
    dupStructs: ['ShareMetadataData'],
    note: 'GET /share/metadata/:code（模板字面量前缀）',
  },
  {
    path: '/api/v1/share/multi-direct',
    types: ['MultiShareDirectReq', 'MultiShareData'],
    dts: 'share',
    dupStructs: ['MultiShareData', 'MultiShareDirectReq'],
    note: 'POST /api/v1/share/multi-direct',
  },
  {
    path: '/api/v1/share/multi-bind',
    types: ['MultiShareBindReq', 'MultiShareData'],
    dts: 'share',
    dupStructs: ['MultiShareData', 'MultiShareBindReq'],
    note: 'POST /api/v1/share/multi-bind',
  },
  {
    path: '/api/v1/user/shares/import-local',
    types: ['UserSharesImportLocalData'],
    dts: 'share',
    noConsumer: true,
    note: 'POST /api/v1/user/shares/import-local（前端未接；前端走 admin 面）',
  },
  {
    path: '/api/v1/user/refresh',
    types: ['UserRefreshResp'],
    dts: 'user',
    dupStructs: ['UserRefreshResp'],
    note: 'POST /api/v1/user/refresh（stores/user.ts + request.ts 的 401 刷新链路）',
  },
  {
    path: '/api/v1/user/logout',
    types: ['UserLogoutResp'],
    dts: 'user',
    dupStructs: ['UserLogoutResp'],
    note: 'POST /api/v1/user/logout',
  },
  {
    path: '/api/v1/user/check-auth',
    types: ['UserCheckAuthData'],
    dts: 'user',
    noConsumer: true,
    note: 'GET /api/v1/user/check-auth（前端未接）',
  },
  {
    path: '/user/api-keys/revoke-all',
    types: ['UserAPIKeysRevokeAllData'],
    dts: 'user',
    note: 'POST /user/api-keys/revoke-all（载荷只有 revoked 一个字段 ⇒ 无字段集判别力，靠内联字面量守卫兜底）',
  },
  {
    path: '/api/v1/notifies/public',
    types: ['NotifyPublicListData', 'NotifyPublicItem'],
    dts: 'notify',
    dupStructs: ['NotifyPublicItem'],
    note: 'GET /api/v1/notifies/public',
  },
  {
    path: '/api/v1/federation/resolve',
    types: ['FederationResolveData'],
    dts: 'p2p',
    dupStructs: ['FederationResolveData'],
    note: 'GET /api/v1/federation/resolve',
  },
  {
    path: '/admin/local-files/import',
    types: ['AdminImportLocalFileReq', 'AdminImportLocalFileData'],
    dts: 'admin',
    dupStructs: ['AdminImportLocalFileData'],
    note: 'POST /admin/local-files/import（前端实际在用的本地导入面）',
  },
]

const contractsRoot = resolve(srcRoot, '..', 'node_modules', '@pigeonbox', 'contracts')
const readDts = (d: Dts) => readFileSync(resolve(contractsRoot, 'gen', 'ts', `${d}.d.ts`), 'utf8')

/** 源码文件集合（排除测试目录：守卫自身与行为测试都在里面） */
const SRC_FILES = listSrcFiles().filter((f) => !f.includes('__tests__'))
const SRC_BODY = SRC_FILES.map((f) => [f, stripComments(readSrc(f))] as const)

/** 某路由的前端调用点（命中路径字面量的文件） */
function consumersOf(path: string): string[] {
  return SRC_BODY.filter(([, src]) => src.includes(path)).map(([f]) => f)
}

/** 契约结构体的字段名（取自实装包的生成物 ⇒ 钉版回退会直接缺字段/缺结构体） */
function structFields(dts: string, name: string): string[] {
  const at = dts.indexOf(`interface ${name} {`)
  if (at < 0) return []
  const end = dts.indexOf('\n}', at)
  if (end < 0) return []
  const fields: string[] = []
  for (const line of dts.slice(at, end).split('\n')) {
    const m = /^\s{2}([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(line)
    if (m) fields.push(m[1]!)
  }
  return fields
}

/** 文件里 contracts 命名空间的本地别名（如 shareContract） */
function contractNamespaceAlias(src: string): string | null {
  const m = /import\s+type\s*\{[^}]*?\bas\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*'@pigeonbox\/contracts'/.exec(src)
  return m ? m[1]! : null
}

/**
 * 本地类型声明（interface X {...} / type X = {...} / type X = 别名）的字段名。
 *
 * - `interface X {…}` 与 `type X = {…}`（**对象字面量**）⇒ 带字段集（可判别
 *   是否为契约结构体的手写副本）。
 * - `type X = 其它名字`（**别名**，典型是契约派生）⇒ 字段集为空，但**仍进名字
 *   列表** ⇒ 别名与契约类型同名（会遮蔽契约类型）也能被抓到。
 */
function localTypeDecls(src: string): Array<{ name: string; fields: string[] }> {
  const out: Array<{ name: string; fields: string[] }> = []
  const collect = (name: string, open: number) => {
    const end = matchBrace(src, open)
    if (end < 0) return
    const fields: string[] = []
    for (const line of src.slice(open + 1, end).split('\n')) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(line)
      if (m) fields.push(m[1]!)
    }
    out.push({ name, fields })
  }
  // interface X { ... }
  const ifaceRe = /(?:^|\n)\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\s*(?:extends\s+[^{]+)?\{/g
  let m: RegExpExecArray | null
  while ((m = ifaceRe.exec(src)) !== null) {
    const open = src.indexOf('{', m.index + m[0].length - 1)
    collect(m[1]!, open)
  }
  // type X = { ... }（**只认对象字面量**；`type X = ns.Y` 是契约别名，不算手写副本）
  const typeRe = /(?:^|\n)\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g
  while ((m = typeRe.exec(src)) !== null) {
    const open = src.indexOf('{', m.index + m[0].length - 1)
    collect(m[1]!, open)
  }
  // type X = <别名>（非对象字面量）⇒ 只进名字列表
  const aliasRe = /(?:^|\n)\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=\s*(?!\{)/g
  while ((m = aliasRe.exec(src)) !== null) {
    out.push({ name: m[1]!, fields: [] })
  }
  return out
}

/**
 * 内联对象字面量类型实参（`request<ApiResponse<{ revoked: number }>>` 这类）的字段名。
 *
 * 与 localTypeDecls 分开：内联字面量没有名字，只能按**字段集**判别它是不是
 * 某个契约结构体的手写副本（同名判别对内联无效）。
 */
function inlineObjectTypeFields(src: string): Array<{ fields: string[] }> {
  const out: Array<{ fields: string[] }> = []
  const re = /<\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('{', m.index)
    const end = matchBrace(src, open)
    if (end < 0) continue
    const fields: string[] = []
    for (const line of src.slice(open + 1, end).split('\n')) {
      const fm = /^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(line)
      if (fm) fields.push(fm[1]!)
    }
    out.push({ fields })
    re.lastIndex = open
  }
  return out
}

/** 版本号比较（a ≥ b ?） */
function gte(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return true
}

describe('契约类型漂移守卫（10 条业务路由）', () => {
  it('① 钉版：contracts ≥ 0.20.0 且 package.json / lock / 实装包三处一致', () => {
    const installed = JSON.parse(
      readFileSync(resolve(contractsRoot, 'package.json'), 'utf8'),
    ) as { version: string }
    expect(
      gte(installed.version, CONTRACTS_MIN_VERSION),
      `实装的 @pigeonbox/contracts 是 ${installed.version}，本轮需要 ≥ ${CONTRACTS_MIN_VERSION}`,
    ).toBe(true)

    const pkg = JSON.parse(readFileSync(resolve(srcRoot, '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const dep = pkg.dependencies?.['@pigeonbox/contracts'] ?? ''
    expect(dep, 'package.json 必须钉 contracts 的发布 tgz').toContain('/download/')
    expect(dep, 'package.json 的 contracts 钉版必须与实装版本一致').toContain(
      `/download/v${installed.version}/pigeonbox-contracts-${installed.version}.tgz`,
    )

    const lock = readFileSync(resolve(srcRoot, '..', 'package-lock.json'), 'utf8')
    expect(lock, 'package-lock.json 必须与 package.json 同钉版').toContain(dep)

    // frontend-core 自身的版本号由父会话统一抬 ⇒ 本守卫不碰它，只锁 contracts 钉版
    expect(dep).not.toContain('0.19.0')
  })

  it('②③ 发现 + 引用：每个路由的调用点都引用契约生成类型', () => {
    for (const spec of ROUTES) {
      const consumers = consumersOf(spec.path)
      if (spec.noConsumer) {
        expect(
          consumers,
          `路由 ${spec.path} 此前无前端调用点；现在出现了（${consumers.join(', ')}）——` +
            `新增调用点必须改用 contracts 类型：${spec.types.join(' / ')}`,
        ).toEqual([])
        continue
      }
      expect(consumers.length, `路由 ${spec.path} 应至少有一个前端调用点（${spec.note ?? ''}）`).toBeGreaterThan(0)
      for (const file of consumers) {
        const src = SRC_BODY.find(([f]) => f === file)![1]
        expect(src, `${file} 涉及 ${spec.path} ⇒ 必须 import '@pigeonbox/contracts'`).toContain(
          "from '@pigeonbox/contracts'",
        )
        for (const t of spec.types) {
          expect(src, `${file} 涉及 ${spec.path} ⇒ 必须引用契约类型 ${t}`).toContain(t)
        }
      }
    }
  })

  it('④ 无手写副本：调用点里不得有本地手写的响应/请求类型', () => {
    for (const spec of ROUTES) {
      const consumers = consumersOf(spec.path)
      if (spec.noConsumer) continue
      const dts = readDts(spec.dts)
      for (const file of consumers) {
        const src = SRC_BODY.find(([f]) => f === file)![1]

        // ① 与契约结构体同名的本地声明（会遮蔽契约类型）
        //    纯透传别名（`type X = ns.X`，形状完全相同）不算遮蔽 ⇒ 放行；
        //    形状不同却同名（`type X = Omit<ns.X,…> & {…}`）⇒ 遮蔽，红。
        const locals = localTypeDecls(src)
        const ns = contractNamespaceAlias(src)
        for (const t of spec.types) {
          const declared = locals.filter((l) => l.name === t)
          const pureAlias = ns
            ? new RegExp(`type\\s+${t}\\s*=\\s*${ns}\\.${t}\\b`).test(src)
            : false
          expect(
            declared.length > 0 && !pureAlias,
            `${file} 不得本地声明 ${t}（契约类型已存在；同名不同形即遮蔽，重复声明即双维护）`,
          ).toBe(false)
        }

        // ② 覆盖契约字段集的手写对象字面量声明（本地具名声明 + 内联类型实参）
        const inlines = inlineObjectTypeFields(src)
        for (const struct of spec.dupStructs ?? []) {
          const fields = structFields(dts, struct)
          if (fields.length < 2) continue // 单字段结构体无判别力（如 {revoked}）
          for (const decl of locals) {
            const covered = fields.every((f) => decl.fields.includes(f))
            expect(
              covered,
              `${file} 的本地类型 ${decl.name} 覆盖了契约结构体 ${struct} 的全部字段` +
                `（${fields.join(', ')}）⇒ 是手写副本，必须改成引用 contracts 生成类型`,
            ).toBe(false)
          }
          for (const inline of inlines) {
            const covered = fields.every((f) => inline.fields.includes(f))
            expect(
              covered,
              `${file} 有一处内联对象字面量类型实参覆盖了契约结构体 ${struct} 的全部字段` +
                `（${fields.join(', ')}）⇒ 是手写副本，必须改成引用 contracts 生成类型`,
            ).toBe(false)
          }
        }
      }
    }
  })

  it('④b 契约包确实提供了这 10 条路由的类型（钉版回退会红）', () => {
    const dtsCache = new Map<Dts, string>()
    for (const spec of ROUTES) {
      if (!dtsCache.has(spec.dts)) dtsCache.set(spec.dts, readDts(spec.dts))
      const dts = dtsCache.get(spec.dts)!
      for (const t of spec.types) {
        expect(
          dts.includes(`interface ${t} {`),
          `@pigeonbox/contracts ${CONTRACTS_MIN_VERSION} 的 ${spec.dts}.d.ts 应导出 ${t}`,
        ).toBe(true)
      }
    }
  })
})
