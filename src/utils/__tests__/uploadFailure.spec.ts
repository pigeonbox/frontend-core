// 上传失败分类守卫（2026-11-03 大文件上传缺陷修复配套）。
//
// 钉两件事：
//  ① classifyUploadFailure 的分类口径（超时/被拦/配额/体积/服务端/兜底）——
//     报错文案要**指方向**，分类错位（把「网慢超时」说成「被拦」）比不分类更误导；
//  ② PresignUploadDialog.vue 的接线（源码级守卫——本仓无组件测试基建）：
//     PUT 超时必须用 uploadTimeoutForSize 按文件大小给预算（而非固定 300s），
//     且失败文案必须走 classifyUploadFailure 分类。
import { describe, it, expect } from 'vitest'
import {
  classifyUploadFailure,
  isPermanentUploadFailure,
  uploadError,
  SERVER_DETAIL_KINDS,
} from '../uploadFailure'
import { uploadTimeoutForSize, UPLOAD_MIN_TIMEOUT_MS, UPLOAD_MAX_TIMEOUT_MS } from '@/api/_xhr'
import { readSrc, stripComments } from '@/utils/__tests__/sourceScan'

describe('classifyUploadFailure（失败分类）', () => {
  it('消息含 timeout / 超时 → timeout（网慢/带宽不足）', () => {
    expect(classifyUploadFailure(0, 'Timeout')).toBe('timeout')
    expect(classifyUploadFailure(undefined, '上传超时')).toBe('timeout')
    expect(classifyUploadFailure(500, 'gateway timeout')).toBe('timeout')
  })

  it.each([
    ['Network error', 0],
    ['Failed to fetch', 0],
    ['net::ERR_CONNECTION_REFUSED', 0],
    ['Network Error', undefined],
    ['网络错误', 0],
  ])('消息 %s → blocked（连接被拒/代理拦截）', (msg, code) => {
    expect(classifyUploadFailure(code, msg)).toBe('blocked')
  })

  it('code 30002（存储配额超限）→ quota', () => {
    expect(classifyUploadFailure(30002, '存储配额不足')).toBe('quota')
    expect(classifyUploadFailure(30002)).toBe('quota')
  })

  it('code 30011（文件类型/内容被拒）→ type（2026-11-03：.AppImage 误杀实录）', () => {
    expect(classifyUploadFailure(30011, '文件内容与扩展名不符（检测到 ELF (linux executable)）')).toBe('type')
    expect(classifyUploadFailure(30011)).toBe('type')
  })

  it.each([10010, 30008])('code %i（体积被拒）→ size', (code) => {
    expect(classifyUploadFailure(code)).toBe('size')
  })

  it.each([500, 502, 503])('HTTP %i 且无传输层语义消息 → server', (code) => {
    expect(classifyUploadFailure(code, 'Internal Error')).toBe('server')
  })

  it('未知业务码/无信息 → unknown（兜底）', () => {
    expect(classifyUploadFailure(10004, '类型不支持')).toBe('unknown')
    expect(classifyUploadFailure(undefined)).toBe('unknown')
    expect(classifyUploadFailure(0)).toBe('unknown')
  })

  it('传输层语义优先于错误码（消息判传输层，code 兜底）', () => {
    // 5xx + 消息含 timeout ⇒ 网慢超时（用户该换通道/稍后再试），不是「服务端故障」
    expect(classifyUploadFailure(502, 'Timeout')).toBe('timeout')
  })
})

describe('uploadTimeoutForSize（PUT 超时按文件大小给预算）', () => {
  it('小文件 → 下限 300s（与旧行为一致，不改既有语义）', () => {
    expect(uploadTimeoutForSize(5 * 1024 * 1024)).toBe(UPLOAD_MIN_TIMEOUT_MS)
  })
  it('非法体积（0/负/NaN）→ 下限 300s（防御）', () => {
    expect(uploadTimeoutForSize(0)).toBe(UPLOAD_MIN_TIMEOUT_MS)
    expect(uploadTimeoutForSize(-1)).toBe(UPLOAD_MIN_TIMEOUT_MS)
    expect(uploadTimeoutForSize(NaN)).toBe(UPLOAD_MIN_TIMEOUT_MS)
  })
  it('1.35GiB → ~72 分钟（远超旧 300s；负对照：回固定 300s 必红）', () => {
    const budget = uploadTimeoutForSize(1.35 * 1024 * 1024 * 1024)
    expect(budget).toBeGreaterThan(60 * 60 * 1000)   // > 1 小时
    expect(budget).toBeLessThanOrEqual(UPLOAD_MAX_TIMEOUT_MS)
  })
  it('体积越大预算越大（单调不减）', () => {
    expect(uploadTimeoutForSize(200 * 1024 * 1024)).toBeGreaterThanOrEqual(uploadTimeoutForSize(100 * 1024 * 1024))
    expect(uploadTimeoutForSize(2 * 1024 * 1024 * 1024)).toBeGreaterThan(uploadTimeoutForSize(200 * 1024 * 1024))
  })
  it('超大体积截到上限 2h（防挂死）', () => {
    expect(uploadTimeoutForSize(100 * 1024 * 1024 * 1024)).toBe(UPLOAD_MAX_TIMEOUT_MS)
    expect(uploadTimeoutForSize(1024 * 1024 * 1024 * 1024 * 1024)).toBe(UPLOAD_MAX_TIMEOUT_MS)
  })
})

describe('isPermanentUploadFailure（永久性业务拒绝不重试）', () => {
  it.each([
    [30011, '文件内容与扩展名不符（检测到 ELF）'], // 类型/内容被拒（真机实录）
    [30002, '存储配额超限'],
    [10010, '文件过大: 最大允许 4294967296 字节'],
    [10012, '上传已关闭'],
    [30013, '内容未通过审核'],
    [30014, '上传会话已完成'],
  ])('code %i 是永久性拒绝（重试同通道必然同样失败）', (code, msg) => {
    expect(isPermanentUploadFailure(code, msg)).toBe(true)
    expect(isPermanentUploadFailure(code)).toBe(true)
  })

  it.each([
    [0, 'Timeout'],
    [0, 'Network error'],
    [500, 'Internal Error'],
    [undefined, 'something odd'],
    [10004, '资源不存在'],
  ])('code %i / %s 可重试（传输层抖动或未知失败）', (code, msg) => {
    expect(isPermanentUploadFailure(code, msg)).toBe(false)
  })
})

describe('uploadError（业务码随错误上抛）', () => {
  it('Error 携带 code，分类才看得见业务码', () => {
    const e = uploadError(30011, '文件内容与扩展名不符（检测到 ELF）')
    expect(e).toBeInstanceOf(Error)
    expect((e as { code?: number }).code).toBe(30011)
    expect(e.message).toContain('扩展名')
    expect(classifyUploadFailure((e as { code?: number }).code, e.message)).toBe('type')
  })
  it('type 分类要附服务端原文（具体原因不能被通用文案抹掉）', () => {
    expect(SERVER_DETAIL_KINDS.has('type')).toBe(true)
    expect(SERVER_DETAIL_KINDS.has('quota')).toBe(true)
    expect(SERVER_DETAIL_KINDS.has('size')).toBe(true)
    expect(SERVER_DETAIL_KINDS.has('timeout')).toBe(false)
  })
})

describe('PresignUploadDialog.vue 接线（源码级）', () => {
  const src = stripComments(readSrc('components/upload/PresignUploadDialog.vue'))

  it('xhrRaw 的 PUT 超时按文件大小给预算（不能是固定值）', () => {
    expect(src).toMatch(/uploadTimeoutForSize\s*\(/)
  })
  it('失败文案走 classifyUploadFailure 分类（不再裸上屏单句「上传失败」）', () => {
    expect(src).toMatch(/classifyUploadFailure\s*\(/)
  })
  it('init/complete 的业务错误用 uploadError 上抛（code 不得丢失，至少 2 处）', () => {
    expect(src.match(/uploadError\s*\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
  it('重试分支以 isPermanentUploadFailure 把关（永久性业务拒绝不整文件重传）', () => {
    // 判据＝**取反使用**（!isPermanentUploadFailure(...) 才是把关形态）：
    // 仅「调用存在」挡不住 `false && isPermanentUploadFailure(...)` 这类废除变异。
    // 负对照：还原成无脑 `retryCount < 2` 重试 ⇒ 本条红
    expect(src).toMatch(/!\s*isPermanentUploadFailure\s*\(/)
  })
  it('业务拒绝上屏服务端原文（SERVER_DETAIL_KINDS 拼接）', () => {
    // 负对照：errorMessage 只取通用 hint ⇒ 本条红
    expect(src).toMatch(/SERVER_DETAIL_KINDS\s*\.\s*has\s*\(/)
  })
})
