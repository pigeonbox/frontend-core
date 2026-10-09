<template>
  <div class="docs-page">
    <!-- 开关降级态：ui.expose_openapi=false 时后端 /openapi.json 恒 404，
         直达 /api-docs 不再拉 spec 渲染坏 Swagger，改为明确提示 -->
    <el-result
      v-if="disabled"
      icon="info"
      :title="t('docs.disabledTitle')"
      :sub-title="t('docs.disabledDesc')"
    >
      <template #extra>
        <el-button type="primary" @click="$router.push('/')">{{ t('docs.backHome') }}</el-button>
      </template>
    </el-result>

    <template v-else>
    <div class="docs-header">
      <h2>{{ t('docs.title') }}</h2>
      <p class="docs-subtitle">{{ t('docs.subtitle') }}</p>
      <el-button-group>
        <el-button @click="loadSpec">
          <el-icon><Refresh /></el-icon>
          {{ t('common.refresh') }}
        </el-button>
        <el-button @click="openInNew">
          <el-icon><Link /></el-icon>
          {{ t('docs.openInNew') }}
        </el-button>
      </el-button-group>
    </div>

    <el-alert
      v-if="error"
      :title="t('docs.loadFailed')"
      :description="error"
      type="error"
      :closable="false"
      class="error-alert"
    />

    <div v-if="loading" class="loading">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <span>{{ t('common.loading') }}</span>
    </div>

    <div ref="swaggerRef" class="swagger-container" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '@/stores/config'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { withBase } from '@/utils/base'

const { handleError } = useErrorHandler()
import { Refresh, Link, Loading } from '@element-plus/icons-vue'
// Swagger UI 集成说明：
// 1. 用默认导入（import SwaggerUIBundle），Vite 对 CommonJS 模块的默认导入互操作最可靠。
//    具名导入 { SwaggerUIBundle } 在某些 Vite 版本下会丢失 .presets 等静态属性。
// 2. 不显式传 presets/layout，SwaggerUIBundle 默认会启用内置 apis preset + BaseLayout，
//    足以渲染标准 OpenAPI 文档（含 Try it out）。
// 3. 之前的写法（具名导入 SwaggerUIStandalonePreset + SwaggerUIBundle.presets.apis）会因
//    ESM 互导丢失属性而崩溃 "Cannot read properties of undefined (reading 'presets')"。
import SwaggerUIBundle from 'swagger-ui-dist/swagger-ui-es-bundle'
import 'swagger-ui-dist/swagger-ui.css'

// swagger-ui-es-bundle 运行时是可调用函数（CommonJS module.exports = fn），
// 但其类型声明是 namespace，导致 TS 报 "not callable"。用类型断言对齐运行时。
const SwaggerUI = SwaggerUIBundle as unknown as (opts: Record<string, unknown>) => { presetApis?: unknown }

const { t } = useI18n()
const configStore = useConfigStore()

// apiDocsEnabled 缺省（config 未加载/老后端）视为开启，仅显式 false 才降级——
// 与 registerEnabled 同一缺省语义，避免配置抖动误伤文档页
const disabled = computed(() => configStore.config?.apiDocsEnabled === false)

const swaggerRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref('')
let ui: ReturnType<typeof SwaggerUI> | null = null

const loadSpec = async () => {
  loading.value = true
  error.value = ''
  // 销毁旧实例
  if (ui) {
    try { ui = null } catch { /* */ }
    if (swaggerRef.value) swaggerRef.value.innerHTML = ''
  }
  try {
    const url = '/openapi.json'
    await nextTick()
    if (!swaggerRef.value) return
    ui = SwaggerUI({
      url,
      domNode: swaggerRef.value,
      deepLinking: true,
      // 不传 presets：SwaggerUIBundle 默认启用内置 apis preset + BaseLayout
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    handleError(e)
  } finally {
    loading.value = false
  }
}

const openInNew = () => {
  window.open(withBase('/openapi.json'), '_blank')
}

onMounted(() => {
  if (disabled.value) return
  loadSpec()
})
onUnmounted(() => {
  ui = null
})
</script>

<style scoped>
.docs-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

.docs-header {
  margin-bottom: 16px;
}

.docs-header h2 {
  margin: 0 0 4px;
  color: var(--color-text-primary);
}

.docs-subtitle {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin: 0 0 16px;
}

.error-alert {
  margin-bottom: 16px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px;
  color: var(--color-text-secondary);
}

.swagger-container {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  min-height: 600px;
  overflow: hidden;
}
</style>
