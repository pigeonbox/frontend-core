#!/usr/bin/env bash
# 负对照演练：把每处修复改回「缺陷态」⇒ 对应守卫必须变红 ⇒ 再还原。
# 用法：bash scripts/negctl.sh
set -u
cd "$(dirname "$0")/.." || exit 1

SPECS=(
  "src/views/admin/__tests__/dashboardErrorState.spec.ts"
  "src/i18n/__tests__/parity.spec.ts"
  "src/views/user/__tests__/sharesErrorHandling.spec.ts"
  "src/views/user/__tests__/requestsErrorHandling.spec.ts"
  "src/views/user/__tests__/narrowScreen.spec.ts"
  "src/utils/__tests__/adminFilesDownload.spec.ts"
  "src/i18n/__tests__/teFallback.spec.ts"
  "src/composables/__tests__/useErrorHandler.spec.ts"
  "src/views/user/__tests__/tokensErrorMessage.spec.ts"
  "src/utils/__tests__/setupToken.spec.ts"
  "src/utils/__tests__/orphanExports.spec.ts"
  "src/composables/__tests__/shareFetchRace.spec.ts"
)

PASS=0
FAIL=0

run_spec() {
  npx vitest run "$@" >/tmp/pb_negctl.log 2>&1
  if grep -qE "Test Files.*failed" /tmp/pb_negctl.log; then
    echo "RED"
  elif grep -qE "Test Files.*passed" /tmp/pb_negctl.log; then
    echo "GREEN"
  else
    echo "ERROR"
  fi
}

# apply <file> <python-patch-expr-file>
negctl() {
  local name="$1" file="$2" spec="$3"; shift 3
  cp "$file" "/tmp/pb_negctl_backup.$(basename "$file")"
  python3 "$@" || { echo "[$name] PATCH FAILED"; FAIL=$((FAIL+1)); return; }
  local state
  state=$(run_spec "$spec")
  # 还原
  cp "/tmp/pb_negctl_backup.$(basename "$file")" "$file"
  if [ "$state" = "RED" ]; then
    echo "[$name] 负对照 => ${state}（期望 RED）✔"
    PASS=$((PASS+1))
  else
    echo "[$name] 负对照 => ${state}（期望 RED）✘ 守卫没抓住回归！"
    FAIL=$((FAIL+1))
  fi
}

echo "===== 负对照演练开始 ====="

negctl "D1 仪表盘错误态" src/views/admin/Dashboard.vue \
  src/views/admin/__tests__/dashboardErrorState.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/admin/Dashboard.vue'); s = p.read_text()
old = "    statsError.value = true"
assert old in s
p.write_text(s.replace(old, "    statsError.value = false", 1))
PY

negctl "D2 admin.loadFailed 语言包" src/i18n/locales/zh-CN.ts \
  src/i18n/__tests__/parity.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/i18n/locales/zh-CN.ts'); s = p.read_text()
old = "    loadFailed: '加载失败',\n"
assert old in s
p.write_text(s.replace(old, "", 1))
PY

negctl "D3 Shares 错误被吞" src/views/user/Shares.vue \
  src/views/user/__tests__/sharesErrorHandling.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/Shares.vue'); s = p.read_text()
old = """  try {
    await userSharesApi.restore(row.code)
    ElMessage.success(t('user.shares.restoreSuccess'))
    await loadList()
  } catch (e) {
    handleError(e)
  }"""
new = """  try {
    await userSharesApi.restore(row.code)
    ElMessage.success(t('user.shares.restoreSuccess'))
    await loadList()
  } catch (e) { /* */ }"""
assert old in s
p.write_text(s.replace(old, new, 1))
PY

negctl "D4 Requests 加载失败静默" src/views/user/Requests.vue \
  src/views/user/__tests__/requestsErrorHandling.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/Requests.vue'); s = p.read_text()
old = """  } catch (e) {
    // 取数失败必须显式反馈（2026-10-26 审计）：此前只有 finally ⇒ 后端 5xx 时
    // 页面渲染一张**空表格且零提示** ⇒ 用户以为「自己从没建过请求」。
    handleError(e)
  } finally {"""
new = """  } finally {"""
assert old in s
p.write_text(s.replace(old, new, 1))
PY

negctl "D5 Tokens 无卡片形态" src/views/user/Tokens.vue \
  src/views/user/__tests__/narrowScreen.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/Tokens.vue'); s = p.read_text()
old = 'class="tokens-table admin-table-wide"'
assert old in s
p.write_text(s.replace(old, 'class="tokens-table"', 1))
PY

negctl "D13 Shares 卡片形态回退" src/views/user/Shares.vue \
  src/views/user/__tests__/narrowScreen.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/Shares.vue'); s = p.read_text()
old = """  .shares-table {
    display: none !important;
  }"""
new = """  .shares-table {
    display: block !important;
  }"""
assert old in s
p.write_text(s.replace(old, new, 1))
PY

negctl "D6 管理台下载裸 axios" src/views/admin/Files.vue \
  src/utils/__tests__/adminFilesDownload.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/admin/Files.vue'); s = p.read_text()
old = """    const blob = await request<Blob>({
      url: adminApi.fileDownloadUrl(row.id),
      responseType: 'blob',
      withCredentials: true,
    })"""
new = """    const { default: axios } = await import('axios')
    const blob = (await axios.get(adminApi.fileDownloadUrl(row.id), {
      responseType: 'blob',
      withCredentials: true,
    })).data"""
assert old in s
p.write_text(s.replace(old, new, 1))
PY

negctl "D7 t()||fallback 死代码" src/views/user/Login.vue \
  src/i18n/__tests__/teFallback.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/Login.vue'); s = p.read_text()
old = """        ? (te(translated.i18nKey) ? t(translated.i18nKey) : translated.fallback)"""
new = """        ? (t(translated.i18nKey) || translated.fallback)"""
assert old in s
p.write_text(s.replace(old, new, 1))
PY

negctl "D8 错误标题分支" src/composables/useErrorHandler.ts \
  src/composables/__tests__/useErrorHandler.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/composables/useErrorHandler.ts'); s = p.read_text()
old = "      title = te('common.errorTitle') ? t('common.errorTitle') : 'Error'"
new = "      title = t('common.failed')"
assert old in s
p.write_text(s.replace(old, new, 1))
PY

negctl "D9 撤销失败文案" src/views/user/Tokens.vue \
  src/views/user/__tests__/tokensErrorMessage.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/Tokens.vue'); s = p.read_text()
old = "t('user.tokens.revokeFailed')"
assert old in s
p.write_text(s.replace(old, "t('user.tokens.loadFailed')"))
PY

negctl "D10 首启令牌只读 location.search" src/views/setup/Index.vue \
  src/utils/__tests__/setupToken.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/setup/Index.vue'); s = p.read_text()
old = "  const fromQuery = resolveSetupToken(route.query.token, window.location.search)"
new = "  const fromQuery = new URLSearchParams(window.location.search).get('token')"
assert old in s
p.write_text(s.replace(old, new, 1))
PY

negctl "D11 孤儿导出复活" src/utils/base.ts \
  src/utils/__tests__/orphanExports.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/utils/base.ts'); s = p.read_text()
s += "\n/** 负对照用：无人引用的死导出 */\nexport function neverUsedHelper(): string {\n  return 'x'\n}\n"
p.write_text(s)
PY

negctl "D11 dompurify 悬空依赖" package.json \
  src/utils/__tests__/orphanExports.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('package.json'); s = p.read_text()
old = '    "axios": "1.13.6",\n'
assert old in s
p.write_text(s.replace(old, old + '    "dompurify": "^3.4.12",\n', 1))
PY

negctl "D12 取数竞态守卫" src/views/share/View.vue \
  src/composables/__tests__/shareFetchRace.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/share/View.vue'); s = p.read_text()
old = """    // 已有更新的请求发出 ⇒ 丢弃本次（旧响应不得覆盖新码的内容）
    if (latest.isStale(mySeq)) return

"""
assert old in s
p.write_text(s.replace(old, "", 1))
PY

negctl "OIDC 消费 oidc_code 被删" src/views/user/Login.vue \
  src/views/user/__tests__/oidcErrorHandling.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/Login.vue'); s = p.read_text()
old = """  if (isOidcErrorRedirect(route.query)) {
    oidcErrorKey.value = oidcErrorI18nKey(route.query.oidc_code)
  }
"""
assert old in s
p.write_text(s.replace(old, "", 1))
PY

negctl "OIDC 展示 core 的 msg" src/views/user/OidcCallback.vue \
  src/views/user/__tests__/oidcErrorHandling.spec.ts - <<'PY'
import pathlib
p = pathlib.Path('src/views/user/OidcCallback.vue'); s = p.read_text()
old = "    error.value = t(oidcErrorI18nKey(route.query.oidc_code))"
new = "    error.value = String(route.query.msg ?? '')"
assert old in s
p.write_text(s.replace(old, new, 1))
PY

echo "===== 负对照演练结束：期望 RED $PASS 个，实际失败 $FAIL 个 ====="
exit $FAIL
