import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { anonymousApi } from '@/api/anonymous'
import { federationApi } from '@/api/federation'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { localHistory } from '@/utils/localHistory'

/**
 * 匿名取件状态机（2026-10-09 自 /retrieve 页融合进首页输入组件）：
 * 输入码 → submit 就地 Peek 预检——无密码直接取件跳结果页；
 * 有密码进 needPassword 相位，由宿主渲染内联密码框（密码永不做自动尝试）；
 * 本站未命中走联邦回退（ElMessageBox 引导跳源节点），未命中才落全局错误 toast。
 * deps 全部可注入（router/handleError/记录/弹窗/i18n），便于 vitest 纯逻辑测试。
 */
export type PickupPhase = 'input' | 'submitting' | 'needPassword'

export interface PickupDeps {
  router?: { push: (location: { path: string; query: Record<string, string> }) => void }
  handleError?: (e: unknown) => void
  /** 成功取件后的本机记录（默认 localHistory.pushPickup） */
  recordPickup?: (rec: { code: string; name?: string; size?: number }) => void
  info?: (message: string) => void
  alert?: (message: string, title: string, options?: Record<string, unknown>) => Promise<unknown>
  confirm?: (message: string, title: string, options?: Record<string, unknown>) => Promise<unknown>
  t?: (key: string, params?: Record<string, unknown>) => string
  jumpExternal?: (url: string) => void
}

export interface PickupController {
  phase: Ref<PickupPhase>
  activeCode: Ref<string>
  password: Ref<string>
  /** 就地取件入口：Peek 预检 → 直取 / 要密码 */
  submit: (code: string) => Promise<void>
  /** needPassword 相位：带密码取件（失败留在相位内可重试） */
  confirmPassword: () => Promise<void>
  /** 放弃密码输入，回到输入态 */
  cancelPassword: () => void
}

// vue-router/vue-i18n 等仅可在组件 setup 内调用——deps 短路保证测试可绕开
export function usePickup(deps: PickupDeps = {}): PickupController {
  const router = deps.router ?? useRouter()
  const t =
    deps.t ??
    (useI18n().t as unknown as (key: string, params?: Record<string, unknown>) => string)
  const { handleError } = deps.handleError ? { handleError: deps.handleError } : useErrorHandler()
  const recordPickup =
    deps.recordPickup ?? ((rec: { code: string; name?: string; size?: number }) => localHistory.pushPickup(rec))
  const info = deps.info ?? ((message: string) => void ElMessage.info(message))
  const boxAlert = deps.alert ?? ElMessageBox.alert
  const boxConfirm = deps.confirm ?? ElMessageBox.confirm
  const jumpExternal = deps.jumpExternal ?? ((url: string) => { window.location.href = url })

  const phase = ref<PickupPhase>('input')
  const activeCode = ref('')
  const password = ref('')

  // 联邦回退（P2P M2）：本站查无此码时问联邦注册中心。
  // 命中 → 弹确认框，用户同意后跳源节点取件页预填口令（hash 路由）；
  // 未命中/未启用/网络失败 → 静默返回 false，回退本地错误提示。
  // isDeviceNodeUrl p2pc 等直传客户端注册时使用占位 url(direct.invalid),
  // 无真实网页可跳。
  const isDeviceNodeUrl = (url: string): boolean => {
    try {
      const u = new URL(url)
      return !/^https?:$/.test(u.protocol) || /(^|\.)direct\.invalid$/i.test(u.hostname)
    } catch {
      return true
    }
  }

  const tryFederationJump = async (code: string): Promise<boolean> => {
    if (!code) return false
    try {
      const res = await federationApi.resolve(code)
      const data = res.data
      if ((res.code === 200 || res.code === 0) && data?.available && data.url) {
        // 设备直传节点(p2pc 占位 url)不可网页取件:提示到设备端接收
        if (isDeviceNodeUrl(data.url)) {
          try {
            await boxAlert(
              t('federation.deviceDesc', { name: data.name || data.url }),
              t('federation.deviceTitle'),
              { confirmButtonText: t('common.confirm'), type: 'info' },
            )
          } catch {
            /* 用户关闭 */
          }
          return true
        }
        // 跳本站自身=公告过期残留,视为未命中走本地错误
        try {
          if (new URL(data.url).origin === location.origin) return false
        } catch {
          /* url 非法按未命中处理 */
        }
        try {
          await boxConfirm(
            t('federation.confirm', { name: data.name || data.url }),
            t('federation.title'),
            {
              confirmButtonText: t('federation.go'),
              cancelButtonText: t('common.cancel'),
              type: 'info',
            },
          )
        } catch {
          return true // 用户取消：视为已处理，不再弹本地错误
        }
        const base = data.url.endsWith('/') ? data.url : `${data.url}/`
        // 跨站协议固定为对方站点的 /retrieve?code=（旧版节点仍以独立页承接；
        // 新版节点该路由是兼容重定向回首页取件），勿随本次融合改动
        jumpExternal(`${base}#/retrieve?code=${encodeURIComponent(code)}`)
        return true
      }
    } catch {
      // registry 不可达/未启用：静默降级为纯单站体验
    }
    return false
  }

  // 双击/连击防抖：Peek 与取件全程占住（phase 翻转前有 await 窗口，不能用相位做闸）
  let inFlight = false

  const retrieveInternal = async (code: string, pwd?: string) => {
    phase.value = 'submitting'
    try {
      const res = await anonymousApi.retrieve({
        code,
        password: pwd || undefined,
      })
      // 后端成功码两代约定并存：200（旧 handler）/ 0（resp.Success）
      if ((res.code === 200 || res.code === 0) && res.data) {
        // 记入本机取件记录（仅 code+文件名+大小，不含密码），再跳结果页
        recordPickup({
          code,
          name: res.data.file_name || undefined,
          size: res.data.file_size || undefined,
        })
        phase.value = 'input'
        router.push({
          path: '/retrieve/result',
          query: { data: encodeURIComponent(JSON.stringify(res.data)) },
        })
      } else {
        // 本站未命中 → 联邦回退：命中则引导直跳源节点取件页
        const jumped = await tryFederationJump(code)
        if (!jumped) {
          handleError({ code: res.code, message: res.message, trace_id: res.trace_id })
        }
        // 密码相位失败留在相位内，密码保留可重试；其余回输入态
        phase.value = pwd !== undefined ? 'needPassword' : 'input'
      }
    } catch (e) {
      // 本站 miss 表现为 HTTP 404 → request util 抛异常走这里:
      // 联邦回退必须在 catch 路径同样尝试,否则 404 形态的未命中永远绕过全网取件
      const jumped = await tryFederationJump(code)
      if (!jumped) {
        handleError(e)
      }
      phase.value = pwd !== undefined ? 'needPassword' : 'input'
    }
  }

  const submit = async (code: string) => {
    const c = code.trim()
    if (!c || inFlight || phase.value !== 'input') return
    activeCode.value = c
    inFlight = true
    try {
      try {
        const res = await anonymousApi.search(c)
        if ((res.code === 200 || res.code === 0) && res.data?.require_password) {
          password.value = ''
          phase.value = 'needPassword'
          info(t('anonymous.needPasswordHint'))
          return
        }
      } catch {
        // 预检失败（限流/网络）：静默走正常取件路径，由 retrieve 给出真实错误
      }
      await retrieveInternal(c)
    } finally {
      inFlight = false
    }
  }

  const confirmPassword = async () => {
    if (inFlight || phase.value !== 'needPassword') return
    inFlight = true
    try {
      await retrieveInternal(activeCode.value, password.value)
    } finally {
      inFlight = false
    }
  }

  const cancelPassword = () => {
    phase.value = 'input'
    password.value = ''
    activeCode.value = ''
  }

  return { phase, activeCode, password, submit, confirmPassword, cancelPassword }
}
