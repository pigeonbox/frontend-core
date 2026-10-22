<template>
  <el-dialog
    v-model="visible"
    :title="t('home.shareSuccess')"
    width="min(600px, 92vw)"
    :close-on-click-modal="false"
  >
    <div class="share-result">
      <el-result :icon="'success'" :title="t('home.shareSuccess')" :sub-title="t('home.shareSuccessSubtitle')" />

      <!-- E2E 提示：链接含解密密钥 -->
      <el-alert
        v-if="shareE2EKey"
        type="warning"
        :title="t('home.e2eLinkWarning')"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />

      <!-- 6 位取件码主视觉（2026-10-16 双码收敛拍板：主推取件码，8 位分享码从弹窗
           退场——/share/{code} 链接通道与首页粘贴兜底保留，兼容零破坏） -->
      <div v-if="sharePickupCode" class="pickup-hero">
        <span class="pickup-label">{{ t('home.pickupStrip.label') }}</span>
        <div class="code-big">{{ sharePickupCode }}</div>
        <el-button size="large" @click="copyPickup">
          <el-icon><CopyDocument /></el-icon>
          {{ t('home.pickupStrip.copy') }}
        </el-button>
      </div>

      <!-- 有效期回显（真相源=服务端 /share/metadata 的 expired_at；取不到则不显示） -->
      <div v-if="expireHint" class="expire-chip">
        <el-icon><Clock /></el-icon>
        <span>{{ expireHint }}</span>
      </div>

      <!-- 站点公网地址未配 → 提醒分享者（2026-10-22 审计 S6）：
           分享链接按浏览器 origin 生成，内网部署会把**内网地址**发给外网的人，
           对方只看到"无法访问此网站"，完全不知道原因；且分享者自己毫无察觉。 -->
      <el-alert
        v-if="!publicUrlConfigured"
        type="warning"
        :closable="false"
        show-icon
        class="public-url-warn"
        :title="t('home.delivery.publicUrlMissingTitle')"
        :description="t('home.delivery.publicUrlMissingDesc')"
      />

      <!-- 交付文本（一次投递 = 一件可直接转发的交付物：码 + 站点 + 操作说明） -->
      <div class="delivery">
        <div class="delivery-head">
          <span class="delivery-label">
            <el-icon><Position /></el-icon>
            {{ t('home.delivery.label') }}
          </span>
          <span class="delivery-site">{{ siteBase }}</span>
        </div>
        <el-input :model-value="deliveryText" readonly type="textarea" :rows="2" class="delivery-text" />
        <div class="delivery-actions">
          <el-button type="primary" @click="copyDeliveryText">
            <el-icon><CopyDocument /></el-icon>
            {{ t('home.delivery.copy') }}
          </el-button>
          <el-button v-if="canNativeShare" @click="nativeShare">
            <el-icon><Share /></el-icon>
            {{ t('home.delivery.share') }}
          </el-button>
          <el-button @click="downloadGuideCard">
            <el-icon><Download /></el-icon>
            {{ t('home.delivery.guideCard') }}
          </el-button>
        </div>
        <p class="code-hint">{{ t('home.delivery.hint') }}</p>
      </div>

      <!-- 分享方式页签（链接 / 二维码 / 命令行） -->
      <el-tabs v-model="shareMethod" class="share-method-tabs">
        <!-- 完整 URL -->
        <el-tab-pane name="url">
          <template #label>
            <span class="tab-label">
              <el-icon><Link /></el-icon>
              {{ t('home.shareMethod.url') }}
            </span>
          </template>
          <div class="url-display">
            <el-input v-model="shareUrl" readonly size="large">
              <template #append>
                <el-button type="primary" @click="copyShareUrl">
                  <el-icon><CopyDocument /></el-icon>
                  {{ t('home.copyLink') }}
                </el-button>
              </template>
            </el-input>
            <p class="code-hint">{{ t('home.shareMethod.urlHint') }}</p>
          </div>
        </el-tab-pane>

        <!-- 二维码 -->
        <el-tab-pane name="qrcode">
          <template #label>
            <span class="tab-label">
              <el-icon><PictureFilled /></el-icon>
              {{ t('home.shareMethod.qrcode') }}
            </span>
          </template>
          <div v-if="qrCodeDataUrl" class="qrcode-display">
            <img :src="qrCodeDataUrl" :alt="t('home.qrCodeTip')" class="qrcode-image" />
            <p class="code-hint">{{ t('home.qrCodeTip') }}</p>
          </div>
          <div v-else class="qrcode-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>{{ t('common.loading') }}</span>
          </div>
        </el-tab-pane>

        <!-- 命令行下载（仅文件分享且无密码/无 E2E 时提供） -->
        <el-tab-pane v-if="wgetAvailable" name="terminal">
          <template #label>
            <span class="tab-label">
              <el-icon><Monitor /></el-icon>
              {{ t('home.shareMethod.terminal') }}
            </span>
          </template>
          <div class="wget-display">
            <el-input :model-value="wgetCommand" readonly type="textarea" :rows="2" class="wget-command" />
            <el-button type="primary" @click="copyWget">
              <el-icon><CopyDocument /></el-icon>
              {{ t('home.shareMethod.wgetCopy') }}
            </el-button>
            <p class="code-hint">{{ t('home.shareMethod.wgetHint') }}</p>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 命令行不可用原因（密码/E2E 分享） -->
      <p v-if="!wgetAvailable && wgetNoteKey" class="wget-note">
        <el-icon><InfoFilled /></el-icon>
        {{ t(wgetNoteKey) }}
      </p>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import { useI18n } from 'vue-i18n'
import {
  Link, CopyDocument, PictureFilled, Loading, Monitor, InfoFilled,
  Share, Download, Clock, Position
} from '@element-plus/icons-vue'
import { copyToClipboard } from '@/utils/clipboard'
import { localHistory } from '@/utils/localHistory'
import { useConfigStore } from '@/stores/config'
import { publicApi } from '@/api/public'
import type { ShareResult } from '@/types/share'

/**
 * 分享成功弹窗（2026-10-06 收敛自 home/index.vue 内联实现）：
 * 2026-10-22 交付面重做——「一次投递 = 一件可直接转发的交付物」：
 *   ① 交付文本（6 位取件码 + 站点地址 + 操作说明）可一键复制；
 *   ② 原生分享（navigator.share，不支持时降级为复制交付文本）；
 *   ③ 收件人引导卡（canvas 手绘 480×640，PNG 下载，内嵌二维码）；
 *   ④ 有效期回显（真相源=服务端 /share/metadata 的 expired_at，取不到不显示）。
 * 分享方式三选一（URL / 二维码 / 命令行），含 hash 路由 URL 修正与 E2E 密钥并入 query。
 * 2026-10-07 对标上游成功弹窗模式：+命令行下载 Tab（仅无密码/无 E2E 的文件分享）
 * +发件记录写入本机（utils/localHistory，仅存 code+链接，不存密码/密钥）。
 * 调用方在分享成功回调里 `ref.open(result)` 即可。
 */
const { t } = useI18n()
const configStore = useConfigStore()

const visible = ref(false)
const shareUrl = ref('')
const shareCode = ref('')
const qrCodeDataUrl = ref('')
// E2E 密钥（有值时弹窗提示"链接含解密密钥"）
const shareE2EKey = ref('')
// 6 位取件码（文本/文件分享同权铸造；空=E2E 密文等未铸造场景）
const sharePickupCode = ref('')
// 命令行 Tab 可用性判定载荷
const shareFileName = ref('')
const shareHasPassword = ref(false)
// 分享方式：URL / 二维码 / 命令行（取件码已升主视觉，不再作为页签）
const shareMethod = ref<'url' | 'qrcode' | 'terminal'>('url')
// 过期时间（RFC3339；null=永久有效）；expireKnown=false 表示未取到 → 不展示
const expiredAt = ref<string | null>(null)
const expireKnown = ref(false)
// 「按取件次数」过期：服务端只给时间（count 的过期条件是次数用尽）⇒ 记本地
// 选择值，弹窗才能说清「对方最多可取 N 次」（2026-10-22）
const expireCountValue = ref(0)

// 站点公网地址：publicUrl（管理台配置）→ 未配置则回退浏览器当前地址
const siteBase = computed(() => configStore.siteBaseUrl)
const publicUrlConfigured = computed(() => !!configStore.publicUrl)

// 匿名直链下载端点仅文件分享可用（文本分享走 /share/:code 详情页）
const wgetAvailable = computed(() => !!shareFileName.value && !shareHasPassword.value && !shareE2EKey.value)
const wgetNoteKey = computed(() => {
  if (wgetAvailable.value) return ''
  if (shareE2EKey.value) return 'home.shareMethod.wgetE2ENote'
  if (shareHasPassword.value) return 'home.shareMethod.wgetPasswordNote'
  return ''
})

const wgetCommand = computed(() => {
  const name = shareFileName.value || 'download'
  return `wget -O "${name}" "${siteBase.value}/anonymous/download/${shareCode.value}"`
})

// 交付文本：一件可直接转发的交付物（码 + 站点 + 操作说明）
const deliveryText = computed(() => {
  if (sharePickupCode.value) {
    return t('home.delivery.text', {
      code: sharePickupCode.value,
      site: siteBase.value,
      action: t('home.delivery.action'),
    })
  }
  // 无取件码（E2E 密文分享等）：退化为"带链接的交付文本"，链接含解密密钥
  return t('home.delivery.textLink', { site: siteBase.value, url: shareUrl.value })
})

// 有效期回显文案（服务端真相；取不到不显示，绝不显示错的）
const expireHint = computed(() => {
  // 「按取件次数」优先：过期条件是次数用尽，时间只是兜底 ⇒ 先说次数
  // （2026-10-22：count 样式此前在界面上根本选不到，这条路径是新增的）
  if (expireCountValue.value > 0) {
    return t('home.delivery.expireCount', { n: expireCountValue.value })
  }
  if (!expireKnown.value) return ''
  if (!expiredAt.value) return t('home.delivery.expireForever')
  const ms = new Date(expiredAt.value).getTime() - Date.now()
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return t('home.delivery.expirePassed')
  const days = Math.ceil(ms / 86400000)
  if (days >= 1) return t('home.delivery.expireDays', { n: days })
  const hours = Math.ceil(ms / 3600000)
  if (hours >= 1) return t('home.delivery.expireHours', { n: hours })
  return t('home.delivery.expireMinutes', { n: Math.ceil(ms / 60000) })
})

// 原生分享能力（不支持时 UI 隐藏该按钮，其余交付手段始终可用）
const canNativeShare = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'
)

/**
 * 用站点公网地址替换分享链接的 origin（仅 publicUrl 已配置时替换；
 * 未配置则保留服务端下发的链接，避免丢掉服务端自带的路径前缀）。
 */
const withSiteBase = (rawUrl: string, code: string): string => {
  if (!publicUrlConfigured.value) return rawUrl
  let base: URL
  try {
    base = new URL(siteBase.value)
  } catch {
    try {
      base = new URL(`https://${siteBase.value}`)
    } catch {
      return rawUrl
    }
  }
  const prefix = base.pathname.replace(/\/+$/, '')
  const hashIdx = rawUrl.indexOf('#')
  const hashRoute = hashIdx >= 0 ? rawUrl.slice(hashIdx + 1) : `/share/${code}`
  return `${base.origin}${prefix}/#${hashRoute}`
}

const open = async (result: ShareResult) => {
  // 8 位分享码（/share/{code} 链接通道）
  shareCode.value = result.code
  // E2E 密钥随链接传递（hash 路由 query，永不发往服务器）
  shareE2EKey.value = result.e2e_key || ''
  sharePickupCode.value = result.pickup_code || ''
  shareFileName.value = result.file_name || ''
  shareHasPassword.value = !!result.has_password
  expireCountValue.value =
    result.expire_style === 'count' && (result.expire_value ?? 0) > 0 ? result.expire_value! : 0

  // 确保使用正确的 hash 路由格式
  let url = result.full_share_url || result.share_url

  // 如果 URL 不包含 #，则添加（适配 hash 路由模式）
  if (!url.includes('#')) {
    // 如果是相对路径 /share/xxx，转换为完整 URL
    if (url.startsWith('/')) {
      url = `${window.location.origin}/#${url}`
    } else {
      // 否则在路径前添加 #
      const pathIndex = url.indexOf('/share/')
      if (pathIndex > 0) {
        url = url.substring(0, pathIndex) + '/#' + url.substring(pathIndex)
      }
    }
  }

  // 站点公网地址优先（NAS 内网部署时别把内网地址发给外部用户）
  url = withSiteBase(url, result.code)

  // E2E：密钥并入 hash 内 query（#/share/CODE?key=xxx；客户端可见、服务端不可见）
  if (shareE2EKey.value) {
    url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(shareE2EKey.value)
  }

  shareUrl.value = url
  shareMethod.value = 'url' // 主视觉=取件码；页签默认完整链接
  visible.value = true

  // 发件记录（本机 localStorage；双码并存：code=8 位分享码 / pickup_code=6 位取件码；
  // 永不含密码/密钥）——localHistory.ts 的类型放宽由主线合并
  localHistory.pushSend({
    code: result.code,
    url,
    name: shareFileName.value || undefined,
    pickup_code: result.pickup_code || undefined,
  } as Parameters<typeof localHistory.pushSend>[0])

  // 生成二维码
  try {
    const qrData = url
    qrCodeDataUrl.value = await QRCode.toDataURL(qrData, {
      width: 220,
      margin: 2,
      color: {
        dark: '#303133',
        light: '#ffffff'
      }
    })
  } catch (error) {
    console.error('生成二维码失败:', error)
    qrCodeDataUrl.value = ''
  }

  // 有效期回显：服务端真相源（/share/metadata 免密码、不扣次数）
  void loadExpire(result.code)
}

/** 拉取分享元数据取过期时间；失败静默（宁可不显示，也不显示错的） */
const loadExpire = async (code: string) => {
  expiredAt.value = null
  expireKnown.value = false
  if (!code) return
  try {
    const res = await publicApi.getShareMetadata(code)
    if ((res.code === 0 || res.code === 200) && res.data) {
      expiredAt.value = res.data.expired_at ?? null
      expireKnown.value = true
    }
  } catch (error) {
    console.warn('取件元数据获取失败（不展示有效期）:', error)
  }
}

const copyShareUrl = async () => {
  const ok = await copyToClipboard(shareUrl.value)
  if (ok) ElMessage.success(t('home.linkCopied'))
  else ElMessage.error(t('home.copyLinkFailed'))
}

const copyPickup = async () => {
  const ok = await copyToClipboard(sharePickupCode.value)
  if (ok) ElMessage.success(t('home.codeCopied') || t('home.linkCopied'))
  else ElMessage.error(t('home.copyLinkFailed'))
}

const copyDeliveryText = async () => {
  const ok = await copyToClipboard(deliveryText.value)
  if (ok) ElMessage.success(t('home.delivery.copied'))
  else ElMessage.error(t('home.copyLinkFailed'))
}

const copyWget = async () => {
  const ok = await copyToClipboard(wgetCommand.value)
  if (ok) ElMessage.success(t('home.shareMethod.wgetCopied'))
  else ElMessage.error(t('home.copyLinkFailed'))
}

/** 原生分享（navigator.share）：用户取消（AbortError）不报错，其他失败降级复制交付文本 */
const nativeShare = async () => {
  if (!canNativeShare.value) {
    ElMessage.warning(t('home.delivery.shareUnavailable'))
    return
  }
  try {
    await navigator.share({
      title: t('home.shareSuccess'),
      text: deliveryText.value,
      url: shareUrl.value,
    })
  } catch (error) {
    const name = (error as { name?: string })?.name
    if (name === 'AbortError') return // 用户主动取消：静默
    console.warn('系统分享失败，降级为复制交付文本:', error)
    await copyDeliveryText()
  }
}

// ==================== 收件人引导卡（canvas 手绘 480×640，PNG 下载） ====================
const CARD_W = 480
const CARD_H = 640

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('引导卡二维码加载失败'))
    img.src = src
  })

/** 折行：拉丁词整体保留，CJK 逐字断行 */
const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const tokens = text.match(/[A-Za-z0-9'’.,:;!?()\-/]+|\s+|[^\s]/g) || []
  const lines: string[] = []
  let line = ''
  for (const token of tokens) {
    const candidate = line + token
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
      continue
    }
    lines.push(line.trimEnd())
    line = token.trimStart()
    // 单个超长 token（长 URL）逐字符硬断
    while (ctx.measureText(line).width > maxWidth && line.length > 1) {
      let cut = line.length - 1
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--
      lines.push(line.slice(0, cut))
      line = line.slice(cut)
    }
  }
  if (line.trim()) lines.push(line.trimEnd())
  return lines
}

const drawRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string
) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

/** 绘制引导卡：站点名 + 取件码 + 二维码 + 操作说明 + 站点地址 */
const renderGuideCard = async (): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 不可用')

  const fontFamily = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  const monoFamily = '"SF Mono", Menlo, Consolas, monospace'

  // 背景 + 顶部品牌条
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = '#1b1c20'
  ctx.fillRect(0, 0, CARD_W, 112)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 26px ${fontFamily}`
  ctx.fillText(configStore.siteName(), CARD_W / 2, 50)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `400 14px ${fontFamily}`
  ctx.fillText(t('home.delivery.cardSubtitle'), CARD_W / 2, 80)

  // 取件码块（无取件码时改为链接块）
  drawRoundRect(ctx, 60, 148, CARD_W - 120, 112, 16, '#f5f6f8')
  ctx.fillStyle = '#909399'
  ctx.font = `400 15px ${fontFamily}`
  ctx.fillText(
    sharePickupCode.value ? t('home.delivery.cardCodeLabel') : t('home.delivery.cardLinkLabel'),
    CARD_W / 2,
    182
  )
  ctx.fillStyle = '#1b1c20'
  if (sharePickupCode.value) {
    ctx.font = `700 52px ${monoFamily}`
    ctx.fillText(sharePickupCode.value, CARD_W / 2, 240)
  } else {
    ctx.font = `500 18px ${monoFamily}`
    const link = shareUrl.value
    ctx.fillText(link.length > 34 ? `${link.slice(0, 32)}…` : link, CARD_W / 2, 238)
  }

  // 二维码（链接）
  const qrSize = 216
  const qrDataUrl = await QRCode.toDataURL(shareUrl.value, {
    width: qrSize,
    margin: 1,
    color: { dark: '#1b1c20', light: '#ffffff' },
  })
  const qrImg = await loadImage(qrDataUrl)
  ctx.drawImage(qrImg, (CARD_W - qrSize) / 2, 288, qrSize, qrSize)

  // 操作说明（折行）
  ctx.fillStyle = '#606266'
  ctx.font = `400 16px ${fontFamily}`
  const instruction = t('home.delivery.cardInstruction', { site: siteBase.value })
  const lines = wrapLines(ctx, instruction, CARD_W - 80)
  lines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, CARD_W / 2, 548 + i * 24)
  })

  // 底部站点地址
  ctx.fillStyle = '#909399'
  ctx.font = `400 13px ${fontFamily}`
  const site = siteBase.value
  ctx.fillText(site.length > 48 ? `${site.slice(0, 46)}…` : site, CARD_W / 2, CARD_H - 22)

  return canvas
}

const downloadGuideCard = async () => {
  try {
    const canvas = await renderGuideCard()
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `pigeonbox-pickup-${sharePickupCode.value || 'share'}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    ElMessage.success(t('home.delivery.guideCardDone'))
  } catch (error) {
    console.error('生成引导卡失败:', error)
    ElMessage.error(t('home.delivery.guideCardFailed'))
  }
}

defineExpose({ open })
</script>

<style scoped>
.share-method-tabs {
  margin-top: var(--spacing-lg);
}

.share-method-tabs :deep(.el-tabs__item) {
  font-size: var(--text-sm);
  font-weight: 500;
  padding: 0 var(--spacing-lg);
}

.share-method-tabs :deep(.el-tabs__active-bar) {
  height: 2px;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  font-weight: 500;
}

.code-hint {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  margin: var(--spacing-sm) 0 var(--spacing-md);
  text-align: center;
}

.url-display {
  padding: var(--spacing-lg) var(--spacing-sm);
}

.qrcode-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-xl) var(--spacing-md);
}

.qrcode-image {
  width: 200px;
  height: 200px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.qrcode-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-2xl);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.wget-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg) var(--spacing-sm);
}

.wget-command :deep(textarea) {
  font-family: 'SF Mono', Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
}

/* 取件码主视觉卡：墨底大码+虚线描边卡（原 6 位码快捷条升格，双码收敛后唯一码面） */
.pickup-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 12px 0 4px;
  padding: 18px 14px 16px;
  border: 1px dashed var(--primary-color);
  border-radius: var(--radius-lg);
  background: var(--primary-bg);
}

.pickup-label {
  color: var(--color-text-secondary);
  font-size: 13px;
}

/* 墨底白字重音大码块（明暗模式同形态，天然高对比） */
.code-big {
  font-size: 46px;
  font-weight: 700;
  letter-spacing: 10px;
  text-indent: 10px; /* 抵消末字符字距，保持视觉居中 */
  color: #ffffff;
  background: #1b1c20;
  padding: var(--spacing-lg) var(--spacing-2xl);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  font-family: 'SF Mono', 'Courier New', monospace;
}

/* 有效期胶囊：服务端真相回显（取不到不渲染） */
.expire-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 10px auto 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--color-muted);
  color: var(--color-text-secondary);
  font-size: 13px;
}

/* 交付文本块：一次投递 = 一件可直接转发的交付物 */
.delivery {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-card-bg);
}

.delivery-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.delivery-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.delivery-site {
  font-size: 12px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}

.delivery-text :deep(textarea) {
  font-size: 13px;
  line-height: 1.6;
}

.delivery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.wget-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: var(--spacing-md) 0 0;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.share-result {
  padding: var(--spacing-lg) 0;
}
</style>
