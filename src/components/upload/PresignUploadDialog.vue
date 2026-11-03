<template>
  <el-dialog
    v-model="visible"
    :title="t('upload_view.presign.init')"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="presign-dialog">
      <div class="file-summary">
        <el-icon size="32" class="icon-primary"><Document /></el-icon>
        <div class="file-info">
          <div class="file-name">{{ file?.name }}</div>
          <div class="file-size">{{ formatFileSize(file?.size || 0) }}</div>
        </div>
      </div>

      <!-- 先出码（#474）：上传前提前铸造取件码，长传期间即可告知收件人 -->
      <div v-if="mintedCode" class="code-card">
        <div class="code-label">{{ t('upload_view.presign.codeReady') }}</div>
        <div class="code-value">{{ mintedCode }}</div>
        <div class="code-hint">{{ t('upload_view.presign.codeReadyHint') }}</div>
      </div>

      <el-progress
        :percentage="progress"
        :stroke-width="10"
        :status="progressStatus"
        class="upload-progress"
      />

      <div class="status-text">
        <el-icon v-if="!failed"><Loading /></el-icon>
        <el-icon v-else color="#f56c6c"><CircleCloseFilled /></el-icon>
        <span>{{ statusText }}</span>
      </div>

      <!-- 速度 + ETA（设计 B3）；低速预估超时时黄字预警 -->
      <div v-if="speedText && !failed && !completed" class="speed-text" :class="{ 'speed-warn': speedWarn }">
        <span>{{ speedText }}</span>
        <span v-if="speedWarn" class="speed-warn-hint">{{ t('upload_view.presign.slowWarn') }}</span>
      </div>

      <div v-if="failed" class="error-detail">
        <el-alert
          :title="errorMessage"
          type="error"
          :closable="false"
          show-icon
        />
        <!-- 失败卡片动作（2026-11-03 设计 B2）：可重试失败=重试/换分片通道/复制诊断；
             永久业务拒绝=复制诊断/更换文件（换通道同样会被拒，不给必然失败的按钮） -->
        <div class="error-actions">
          <!-- 用 PigeonBeam 加速传（2026-11-03 Phase 3）：失败时跳转交接到 Beam
               设备直传客户端（可重试/永久拒绝都给——它是另一条传输路径）。
               beamBaseUrl 空=零渲染。 -->
          <el-button v-if="beamBaseUrl" type="primary" @click="openBeam">
            {{ t('upload.useBeam') }}
          </el-button>
          <el-button v-if="retryable" @click="copyDiag">
            {{ t('upload_view.presign.copyDiag') }}
          </el-button>
          <el-button v-if="retryable" type="warning" @click="switchChannel">
            {{ t('upload_view.presign.switchChannel') }}
          </el-button>
          <el-button v-if="retryable" type="primary" @click="retry">
            {{ t('upload.retry') }}
          </el-button>
          <template v-else>
            <el-button @click="copyDiag">
              {{ t('upload_view.presign.copyDiag') }}
            </el-button>
            <el-button type="primary" @click="replaceFile">
              {{ t('upload_view.presign.replaceFile') }}
            </el-button>
          </template>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button v-if="!completed" @click="handleCancel" :disabled="cancelling">
        {{ t('common.cancel') }}
      </el-button>
      <el-button v-if="completed" type="primary" @click="close">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { formatFileSize } from '@/utils/format'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  Document, Loading, CircleCloseFilled
} from '@element-plus/icons-vue'
import { presignApi, type PresignCompleteData, type PresignUploadProgress } from '@/api/presign'
import { anonymousApi } from '@/api/anonymous'
import { xhrRaw, uploadTimeoutForSize } from '@/api/_xhr'
import { classifyUploadFailure, isPermanentUploadFailure, uploadError, SERVER_DETAIL_KINDS, switchChannelError, formatUploadDiagnostics } from '@/utils/uploadFailure'
import { copyToClipboard } from '@/utils/clipboard'
import { useConfigStore } from '@/stores/config'
import { createSpeedMeter, formatSpeed, formatEtaHms } from '@/utils/transferSpeed'

/**
 * 预签名直传对话框（2026-10-06 W2 Promise 化：调用方 `ref.open(file, options)` 拿
 * Promise，成功 resolve/终失败 reject 并自动关闭——此前调用方用 200ms setInterval
 * 轮询组件状态。内部保留重试≤2 与秒传快路径；取消/中断类错误直接 reject 不重试
 * （原实现 abort 后会落进重试分支静默重传，属存量 bug）。
 */
const { t } = useI18n()

// PigeonBeam 加速传（2026-11-03 Phase 3）：失败时跳转交接到 Beam 设备直传客户端。
// 空 = 未配置 ⇒ 零渲染。仅跳转交接，浏览器端不编排 Beam 传输。
const configStore = useConfigStore()
const beamBaseUrl = computed(() => configStore.beamBaseUrl)
const openBeam = () => {
  const base = beamBaseUrl.value
  if (!base) return
  window.open(`${base}${base.includes('?') ? '&' : '?'}source=web-upload`, '_blank', 'noopener,noreferrer')
}

export interface PresignOptions {
  expire_value: number
  expire_style: string
  require_auth: boolean
  password?: string
  /** 文件备注（可空，随分享展示给取件人） */
  note?: string
  /** E2E 客户端加密分享（占位通道不带 encrypted 标记，先出码对其跳过） */
  e2e?: boolean
  /**
   * 进度透出（2026-11-03）：把内部 PUT 的原始字节数与阶段交给调用方。
   *
   * 此前弹窗里本就有的 xhrRaw 进度**只画在弹窗内** ⇒ 上传列表那一行恒 0%
   * （大文件走 presign 时，用户在列表里看不到任何进度反馈）。
   */
  onProgress?: (p: PresignUploadProgress) => void
}

const file = ref<File | null>(null)
const options = ref<PresignOptions>({ expire_value: 24, expire_style: 'hour', require_auth: false })

const visible = ref(false)

const progress = ref(0)
const statusText = ref('')
const mintedCode = ref('')
const failed = ref(false)
const errorMessage = ref('')
const completed = ref(false)
const cancelling = ref(false)

/** 失败诊断快照（「复制诊断信息」按钮数据源；open() 复位） */
const lastDiag = ref<{ code?: number; message: string; traceId?: string } | null>(null)
/** 实时速度/ETA（设计 B3）：滑窗测速，进度条下方展示；低速预估超时黄字预警 */
const meter = createSpeedMeter()
const speedText = ref('')
const speedWarn = ref(false)
/** 失败卡片保持打开期间的原错误（「更换文件/取消」结算给 queue 用；最终必须结算，
 *  否则 queue 永远 await） */
let activeError: unknown = null
/** 可重试失败（非永久业务拒绝）：卡片给 重试/换分片通道/复制诊断；
 *  永久拒绝（类型/配额/体积）只给 复制诊断/更换文件——换通道同样会被拒，不给坏按钮 */
const retryable = computed(
  () => lastDiag.value !== null && !isPermanentUploadFailure(lastDiag.value.code, lastDiag.value.message)
)

const progressStatus = computed(() => {
  if (failed.value) return 'exception'
  if (completed.value) return 'success'
  return ''
})

let activeResolve: ((r: PresignCompleteData) => void) | null = null
let activeReject: ((e: unknown) => void) | null = null

const open = (f: File, opts: PresignOptions): Promise<PresignCompleteData> => {
  file.value = f
  options.value = opts
  mintedCode.value = ''
  failed.value = false
  completed.value = false
  errorMessage.value = ''
  lastDiag.value = null
  activeError = null
  visible.value = true
  return new Promise<PresignCompleteData>((resolve, reject) => {
    activeResolve = resolve
    activeReject = reject
    void doUpload(0)
  })
}

const finish = (result: PresignCompleteData) => {
  activeResolve?.(result)
  activeResolve = null
  activeReject = null
  close()
}

const fail = (e: unknown) => {
  activeReject?.(e)
  activeResolve = null
  activeReject = null
  close()
}

let putAbort: AbortController | null = null
let currentUploadId = ''
let currentToken = ''

const doUpload = async (retryCount = 0) => {
  const f = file.value
  if (!f) return
  activeError = null
  failed.value = false
  completed.value = false
  progress.value = 0
  statusText.value = t('upload_view.presign.init')

  try {
    // 0. 计算秒传指纹（大文件跳过，避免整文件进内存）
    statusText.value = t('upload_view.presign.hashing')
    const fileHash = await presignApi.computeFileHash(f)

    // 0.5 先出码（#474）：上传前提前铸造 6 位取件码占位，长传期间即可告知收件人，
    // 完成后对象经 pickup_code 绑定回填该占位。铸造失败（如匿名上传被关）静默
    // 降级普通流程——码在上传完成后随结果下发。E2E 分享跳过（占位记录不带
    // encrypted 标记，绑定后详情页无从得知需前端解密）。
    if (!options.value.e2e && !mintedCode.value) {
      try {
        const gen = await anonymousApi.generate({
          file_name: f.name,
          file_size: f.size,
          expire_value: options.value.expire_value || 24,
          expire_style: options.value.expire_style || 'hour',
          password: options.value.password,
        })
        if (presignApi.isOk(gen.code) && gen.data?.code) {
          mintedCode.value = gen.data.code
        }
      } catch {
        // 降级普通流程
      }
    }

    // 1. 申请预签名 URL（携带先出码时绑定占位；无则正常建分享）
    const initRes = await presignApi.init({
      file_name: f.name,
      file_size: f.size,
      content_type: f.type || 'application/octet-stream',
      expire_value: options.value.expire_value || 24,
      expire_style: options.value.expire_style || 'hour',
      require_auth: options.value.require_auth,
      password: options.value.password,
      file_hash: fileHash || undefined,
      note: options.value.note,
      pickup_code: mintedCode.value || undefined,
    })
    if (!presignApi.isOk(initRes.code) || !initRes.data) {
      // uploadError 保留业务码：失败分类（classifyUploadFailure）要按码判定
      throw uploadError(initRes.code, initRes.message || 'Init failed',
        (initRes as { trace_id?: string }).trace_id)
    }
    const initData = initRes.data

    // 1.5 秒传命中：服务端已有相同哈希+大小的分享，免直传直接出码
    if (initData.existed && initData.share_code) {
      options.value.onProgress?.({ phase: 'complete', loaded: f.size, total: f.size })
      progress.value = 100
      completed.value = true
      statusText.value = t('upload_view.quickUploadHit')
      finish({
        code: initData.share_code,
        url: initData.share_url || '',
        file_name: f.name,
        file_size: f.size,
        download_url: initData.share_url || '',
      })
      return
    }

    currentUploadId = initData.upload_id
    currentToken = initData.token

    // 2. PUT 直传（xhrRaw：进度 + 中断 + 自定义签发头；进度封顶 95% 留给 complete）
    options.value.onProgress?.({ phase: 'init', loaded: 0, total: 0 })
    // 超时按**文件大小**给预算（2026-11-03）：原先固定 300s 与体积无关，
    // 而实测家宽上行 ~0.86MB/s ⇒ 1.35GB 需 ~26 分钟 ⇒ 300s 必掐断。
    statusText.value = t('upload_view.presign.upload')
    putAbort = new AbortController()
    meter.reset()
    speedText.value = ''
    speedWarn.value = false
    const putStartedAt = Date.now()
    await xhrRaw({
      url: initData.upload_url,
      method: initData.method || 'PUT',
      headers: {
        ...(initData.headers || {}),
        ...(f.type ? { 'Content-Type': f.type } : {}),
      },
      body: f,
      timeout: uploadTimeoutForSize(f.size),
      signal: putAbort.signal,
      onProgress: (loaded, total) => {
        progress.value = Math.round((loaded / total) * 95)
        options.value.onProgress?.({ phase: 'put', loaded, total })
        // 速度 + ETA（设计 B3）：滑窗测速展示在进度条下方
        meter.record(loaded)
        const bps = meter.speedBps()
        const eta = meter.etaSeconds(total - loaded)
        const { h, m, s } = formatEtaHms(eta ?? 0)
        speedText.value = eta === null
          ? t('upload_view.presign.speedOnly', { speed: formatSpeed(bps) })
          : t('upload_view.presign.speedEta', {
              speed: formatSpeed(bps),
              eta: h > 0 ? t('upload.etaHms', { h, m, s }) : t('upload.etaMs', { m, s }),
            })
        // 低速预警：按当前速度 + 已耗时预估，超时预算内传不完 ⇒ 黄字提前告警
        speedWarn.value = eta !== null
          && Date.now() - putStartedAt + eta * 1000 > uploadTimeoutForSize(f.size)
      },
    })
    putAbort = null

    // 3. Complete
    options.value.onProgress?.({ phase: 'complete', loaded: f.size, total: f.size })
    statusText.value = t('upload_view.presign.complete')
    progress.value = 97
    const completeRes = await presignApi.complete({
      upload_id: initData.upload_id,
      token: initData.token,
      object_key: initData.object_key,
    })
    if (!presignApi.isOk(completeRes.code) || !completeRes.data) {
      // 业务码随错误上抛（2026-11-03）：此前 throw new Error(message) 把 code
      // 丢在门外 ⇒ 30011「文件类型不允许」被分类成 unknown、还被整份重传 2 次
      throw uploadError(completeRes.code, completeRes.message || 'Complete failed',
        (completeRes as { trace_id?: string }).trace_id)
    }

    progress.value = 100
    completed.value = true
    statusText.value = t('upload.success')
    finish(completeRes.data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    const code = (e as { code?: number })?.code
    // 取消/中断不重试（原实现会落进重试分支静默重传）
    if (msg === 'Cancelled' || msg === 'Aborted') {
      fail(new Error(msg))
      return
    }
    // 永久性业务拒绝（类型/内容被拒、配额、体积、上传关闭……）不自动重试：
    // 同一份文件走同一条通道再传一遍必然同样失败，只会把大文件带宽再烧两遍
    //（2026-11-03 真机实录：1.35GB 被 30011 拒后又被整份重传 2 次才报错）。
    if (!isPermanentUploadFailure(code, msg) && retryCount < 2) {
      statusText.value = `Retrying (${retryCount + 1}/3)...`
      void doUpload(retryCount + 1)
      return
    }
    failed.value = true
    // 失败分类（2026-11-03）：旧实现只显示「上传失败」，用户无法判断是网慢、
    // 被浏览器/代理拦截，还是配额/体积/类型被拒 ⇒ 只能盲目重试。
    // 现在按错误码 + 消息分类，给出**可据此行动**的文案；业务拒绝附服务端原文
    //（「文件内容与扩展名不符（检测到 ELF）」这类具体原因不能被通用文案抹掉）。
    const kind = classifyUploadFailure(code, msg)
    const hint = t(`upload_view.failure.${kind}`)
    errorMessage.value = SERVER_DETAIL_KINDS.has(kind) && msg ? `${hint}\n${msg}` : hint
    statusText.value = t('upload_view.presign.failed')
    // 失败卡片**保持打开**（2026-11-03 设计 B2）：此前这里直接 fail(e) ⇒ close()
    // 连带把 failed/errorMessage 重置 ⇒ error-detail 从未真正渲染过（死 UI，
    // #69 的服务端原文上屏在这个面上从未显示）。现在等用户选动作——
    // 重试 / 换分片通道（reject switchChannelError ⇒ queue 回退 multi-chunk）/
    // 复制诊断信息 / 更换文件或取消（reject 原错误 ⇒ queue 落任务行）。
    lastDiag.value = {
      code,
      message: msg,
      traceId: (e as { traceId?: string })?.traceId ?? (e as { trace_id?: string })?.trace_id,
    }
    activeError = e
  }
}

const retry = () => {
  activeError = null
  void doUpload(0)
}

/** 换分片通道：拒绝并让 queue 回退 multi-chunk（isSwitchChannelRequested 分支） */
const switchChannel = () => {
  activeError = null
  fail(switchChannelError())
}

/** 更换文件：把原错误结算给 queue（任务行显示原因），用户移除该行换文件 */
const replaceFile = () => {
  const e = activeError ?? new Error('Upload failed')
  activeError = null
  fail(e)
}

/** 复制诊断信息：code/message/trace_id 一键复制（贴给管理员即可对日志检索） */
const copyDiag = async () => {
  const d = lastDiag.value
  const ok = await copyToClipboard(formatUploadDiagnostics({
    file: file.value?.name, code: d?.code, message: d?.message, traceId: d?.traceId,
  }))
  ElMessage[ok ? 'success' : 'error'](
    t(ok ? 'upload_view.presign.diagCopied' : 'upload_view.presign.diagCopyFailed')
  )
}

const handleCancel = async () => {
  cancelling.value = true
  try {
    if (putAbort) {
      putAbort.abort()
      putAbort = null
    }
    if (currentUploadId && currentToken) {
      try {
        await presignApi.abort({
          upload_id: currentUploadId,
          token: currentToken,
        })
      } catch {
        // ignore abort failure
      }
    }
    ElMessage.info(t('upload_view.presign.abort'))
    fail(new Error('Cancelled'))
  } finally {
    cancelling.value = false
  }
}

const close = () => {
  visible.value = false
  // 重置
  progress.value = 0
  failed.value = false
  completed.value = false
  errorMessage.value = ''
}

defineExpose({ open })
</script>

<style scoped>
.presign-dialog {
  padding: 0 4px;
}

.file-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-muted);
  border-radius: var(--radius-lg);
  margin-bottom: 24px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 600;
  color: var(--color-text-primary);
  word-break: break-all;
  margin-bottom: 4px;
}

.file-size {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.upload-progress {
  margin-bottom: 16px;
}

.status-text {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  font-size: 14px;
  color: var(--color-text-regular);
}

.error-detail {
  margin-top: 16px;
}

.speed-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary, #909399);
}

.speed-text.speed-warn {
  color: var(--el-color-warning, #e6a23c);
}

.error-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.icon-primary {
  color: var(--primary-color);
}
/* 先出码卡片：上传前展示提前铸造的取件码 */
.code-card {
  margin: 12px 0 4px;
  padding: 12px 16px;
  border: 1px dashed var(--primary-color);
  border-radius: var(--radius-md);
  background: var(--color-muted);
  text-align: center;
}

.code-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.code-value {
  margin: 4px 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--primary-color);
  font-family: var(--code-font, monospace);
}

.code-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
