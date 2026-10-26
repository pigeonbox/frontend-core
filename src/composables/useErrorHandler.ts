// 统一错误处理 composable：把后端业务错误对象 / AxiosError / 普通 Error
// 翻译成 i18n 文案，并通过 window event 触发 ErrorToast 组件显示
import { useI18n } from 'vue-i18n'
import { ERRCODE_KEY_MAP, translateError } from '@/utils/api-interceptor'

export interface ErrorToastItem {
  id: number
  level: 'error' | 'warning' | 'info' | 'success'
  title: string
  message: string
  traceId: string
  duration: number
}

export interface HandleOptions {
  /** 静默：只 log，不弹 toast */
  silent?: boolean
  /** fallback title */
  title?: string
  /** 自定义 level，默认 error */
  level?: ErrorToastItem['level']
  /** 持续毫秒，0 不自动消失 */
  duration?: number
}

export function useErrorHandler() {
  const { t, te } = useI18n()

  function handleError(e: unknown, opts: HandleOptions = {}): {
    i18nKey: string | null
    fallback: string
    code: number | null
    traceId: string
  } {
    const translated = translateError(e)

    // 1. 解析 i18n 文案
    let title = opts.title ?? ''
    let message = translated.fallback
    if (translated.i18nKey) {
      // ⚠️ vue-i18n 缺键时**返回键名本身**（不是空串）⇒ `t(k) || fallback`
      // 的右半边**永不生效**（死代码，2026-10-26 审计）⇒ 用 te() 判「键在不在」。
      message = te(translated.i18nKey) ? t(translated.i18nKey) : translated.fallback
    }

    // 标题统一用 common.errorTitle（**不要复用 notify.title**——那是「系统公告」，
    // 套件中心公告的标题；2026-10-22 审计：每个业务错误的 toast 标题都是
    // 「系统公告」，用户会以为是站点公告、而不是自己的操作失败了）。
    //
    // ⚠️ 2026-10-26 审计修复：此前标题按 `e instanceof BizError` 分支，而
    // BizError **从未被抛出**（request.ts 真正 reject 的是普通对象
    // {code, message, trace_id}）⇒ 该分支恒为假 ⇒ 标题恒为 common.failed，
    // 注释里声称的 common.errorTitle 从未生效。⇒ 删掉不可达分支，标题直接
    // 定为 errorTitle（错误标题对业务错误与网络错误都成立）。
    if (!title) {
      title = te('common.errorTitle') ? t('common.errorTitle') : 'Error'
    }

    // 2. 静默模式
    if (opts.silent) {
      // eslint-disable-next-line no-console
      console.error('[error]', { code: translated.code, message, traceId: translated.traceId, err: e })
      return translated
    }

    // 3. 触发全局 toast 事件（ErrorToast 已在 App.vue 全局挂载，为唯一错误 toast 通道；
    //    原 ElMessage 兼容通道造成双弹，2026-10-06 W3 移除）
    const detail: Omit<ErrorToastItem, 'id'> = {
      level: opts.level ?? 'error',
      title,
      message,
      traceId: translated.traceId,
      duration: opts.duration ?? 5000,
    }
    window.dispatchEvent(new CustomEvent('app:error-toast', { detail }))

    return translated
  }

  /** 仅取翻译文案，不弹 toast */
  function translateOnly(e: unknown): string {
    const tr = translateError(e)
    if (tr.i18nKey) {
      // 同上：缺键时 t() 返回键名本身 ⇒ 必须用 te() 判存在性
      return te(tr.i18nKey) ? t(tr.i18nKey) : tr.fallback
    }
    return tr.fallback
  }

  return {
    handleError,
    translateOnly,
    ERRCODE_KEY_MAP,
  }
}
