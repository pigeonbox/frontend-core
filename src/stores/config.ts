import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { publicApi, type PublicConfig } from '@/api/public'
// ⚠️ 别名：store 里对外暴露的 computed 与工具函数同名，直接 import 会**自引用**
// （const setupTokenRequired = computed(() => setupTokenRequired(...)) ⇒ TDZ 报错）。
import {
  readCapabilities,
  setupTokenRequired as capsSetupTokenRequired,
  deploymentMode as capsDeploymentMode,
  publicUrlConfigured as capsPublicUrlConfigured,
  federationUsable as capsFederationUsable,
} from '@/utils/capabilities'

export const useConfigStore = defineStore('config', () => {
  const config = ref<PublicConfig | null>(null)
  const loading = ref(false)
  const loaded = ref(false)

  // 获取配置
  const fetchConfig = async (force = false) => {
    // 如果已经加载过且不强制刷新，直接返回
    if (loaded.value && !force && config.value) {
      return config.value
    }

    loading.value = true
    try {
      const res = await publicApi.getConfig()
      if ((res.code === 200) && res.data) {
        config.value = res.data
        loaded.value = true
        return res.data
      }
    } catch (error) {
      console.error('获取配置失败:', error)
    } finally {
      loading.value = false
    }
    
    return null
  }

  // 刷新配置（管理员修改配置后调用）
  const refreshConfig = async () => {
    return fetchConfig(true)
  }

  // 获取站点名称
  const siteName = () => {
    return config.value?.name || 'PigeonBox'
  }

  // 获取站点描述
  const siteDescription = () => {
    return config.value?.description || '安全、便捷的文件分享系统'
  }

  // 站点公网地址（base.public_url）：管理台配置的对外可达地址；
  // 空 = 未配置 → 调用方回退浏览器当前地址（内网部署会把内网地址发出去）
  const publicUrl = computed(() => (config.value?.publicUrl || '').trim())

  // 公网地址 → 浏览器当前地址 的回退链（分享链接/交付文本统一走这里）
  const siteBaseUrl = computed(() => {
    const configured = publicUrl.value.replace(/\/+$/, '')
    if (configured) return configured
    return typeof window !== 'undefined' ? window.location.origin : ''
  })

  // 联邦是否启用（生效值=后端 overlay 后的全局 conf，多副本模式下被强制降级为 false）：
  // 取件台据此显式提示「本柜没有就去联网站点找」；缺省/未下发 = 单站 → 不提示
  const federationEnabled = computed(() => config.value?.federationEnabled === true)

  // 跨站取件（联邦）是否**可用**——能不能向用户承诺这个能力。
  // = 服务端声明 **且** 不是多副本拓扑。
  //
  // ⚠️ 为什么不直接用 federationEnabled：多副本拓扑下联邦**架构上不可用**
  // （节点身份是进程级 Ed25519，多副本语义未定义）。服务端虽会在启动时降级，
  // 但运行期一次管理台保存 / 一次多副本配置广播就会把降级**复活**
  // ⇒ 单看服务端声明等于把「能不能用」这件事**外包**给了服务端一处约束。
  // ⇒ 前端按部署模式再兜一层（老后端能力位未知 ⇒ 不受影响）。
  const federationUsable = computed(() =>
    capsFederationUsable(config.value, config.value?.federationEnabled === true),
  )

  // 能力位（2026-10-30）：服务端按运行时真实状态下发的一份真相源。
  // 读法统一走 utils/capabilities（缺字段=未知，不得据此隐藏功能）。
  const capabilities = computed(() => readCapabilities(config.value))
  const setupTokenRequired = computed(() => capsSetupTokenRequired(config.value))
  const deploymentMode = computed(() => capsDeploymentMode(config.value))
  const publicUrlConfigured = computed(() => capsPublicUrlConfigured(config.value))

  return {
    config,
    loading,
    loaded,
    fetchConfig,
    refreshConfig,
    siteName,
    siteDescription,
    publicUrl,
    siteBaseUrl,
    federationEnabled,
    federationUsable,
    capabilities,
    setupTokenRequired,
    deploymentMode,
    publicUrlConfigured,
  }
})
