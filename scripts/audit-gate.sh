#!/usr/bin/env bash
# audit-gate.sh —— npm audit 门禁（判据=可动作性，详见 scripts/audit-classify.mjs 顶部说明）
#
# 用法：
#   scripts/audit-gate.sh              # 真跑（联网）：npm audit → 分类 → 判红/放行
#   scripts/audit-gate.sh --selfcheck  # 负对照自检（纯本地、不联网）
#
# ⚠️ 必须显式官方 registry：npmmirror 对 /-/npm/v1/security/* 返回 404
#    ⇒ 任何默认走镜像源的审计都会**静默拿不到数据**（假绿）。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

REGISTRY="${PB_AUDIT_REGISTRY:-https://registry.npmjs.org}"
ALLOWLIST="${PB_AUDIT_ALLOWLIST:-security/audit-unfixable.json}"

selfcheck() {
  echo "=== audit 门禁判据：负对照自检 ==="
  tmp="$(mktemp -d /tmp/pb-audit-selfcheck.XXXXXX)"
  trap 'rm -rf "$tmp"' EXIT

  mk() { printf '%s' "$2" >"$tmp/$1"; }

  allow="$tmp/allow.json"
  mk allow.json '{"schema":"1","entries":[{"id":"GHSA-test-registered","package":"demo","reason":"测试","tracking_issue":"https://example/1","review_by":"2026-12-31"}]}'
  mk fixable.json '{"vulnerabilities":{"demo":{"severity":"high","fixAvailable":true,"via":[{"source":1,"name":"demo","title":"可修复","url":"https://github.com/advisories/GHSA-test-fixable","severity":"high","range":"<1.0.0"}]}}}'
  mk fixable-self.json '{"vulnerabilities":{"demo":{"severity":"high","fixAvailable":{"name":"demo","version":"1.2.3"},"via":[{"source":1,"name":"demo","title":"本包有补丁","url":"https://github.com/advisories/GHSA-test-fixable","severity":"high","range":"<1.0.0"}]}}}'
  mk unfixable-unreg.json '{"vulnerabilities":{"demo":{"severity":"high","fixAvailable":false,"via":[{"source":2,"name":"demo","title":"无补丁","url":"https://github.com/advisories/GHSA-test-unregistered","severity":"high","range":"*"}]}}}'
  mk unfixable-crosspkg.json '{"vulnerabilities":{"demo":{"severity":"high","fixAvailable":{"name":"parent","version":"9.9.9"},"via":[{"source":2,"name":"demo","title":"无补丁","url":"https://github.com/advisories/GHSA-test-unregistered","severity":"high","range":"*"}]}}}'
  mk unfixable-reg.json '{"vulnerabilities":{"demo":{"severity":"high","fixAvailable":false,"via":[{"source":2,"name":"demo","title":"无补丁","url":"https://github.com/advisories/GHSA-test-registered","severity":"high","range":"*"}]}}}'
  mk clean.json '{"vulnerabilities":{}}'

  node scripts/audit-classify.mjs "$tmp/fixable.json" "$allow" >/dev/null 2>&1 &&
    {
      echo "✗ 负对照①：可修复的高危必须判红，却放行了"
      exit 1
    }
  node scripts/audit-classify.mjs "$tmp/fixable-self.json" "$allow" >/dev/null 2>&1 &&
    {
      echo "✗ 负对照②：本包有补丁版时必须判红，却放行了"
      exit 1
    }
  node scripts/audit-classify.mjs "$tmp/unfixable-unreg.json" "$allow" >/dev/null 2>&1 &&
    {
      echo "✗ 负对照③：未登记的无补丁高危必须判红，却放行了"
      exit 1
    }
  node scripts/audit-classify.mjs "$tmp/unfixable-crosspkg.json" "$allow" >/dev/null 2>&1 &&
    {
      echo "✗ 负对照④：npm 只建议升依赖方时，本包无补丁 ⇒ 必须走登记判据，却放行了"
      exit 1
    }
  node scripts/audit-classify.mjs "$tmp/unfixable-reg.json" "$allow" >/dev/null 2>&1 ||
    {
      echo "✗ 负对照⑤：已登记的无补丁高危应当放行，却判红了"
      exit 1
    }
  node scripts/audit-classify.mjs "$tmp/clean.json" "$allow" >/dev/null 2>&1 ||
    {
      echo "✗ 负对照⑥：无高危应当放行，却判红了"
      exit 1
    }

  echo "✓ audit 门禁判据自检通过（6 项负对照）"
}

if [ "${1:-}" = "--selfcheck" ]; then
  selfcheck
  exit 0
fi

echo "npm audit（显式官方 registry=${REGISTRY}）…"
audit_json="$(mktemp /tmp/pb-audit.XXXXXX.json)"
trap 'rm -f "$audit_json"' EXIT
if ! npm audit --package-lock-only --audit-level=high --registry="$REGISTRY" --json >"$audit_json" 2>/dev/null; then
  # npm audit 有漏洞时退出码非 0 ⇒ 那是**结论**不是执行失败；只有拿不到 JSON 才算失败。
  if [ ! -s "$audit_json" ]; then
    echo "✗ npm audit 未产出 JSON（registry 不可达？）——门禁不允许在无数据时放行"
    exit 1
  fi
fi
node scripts/audit-classify.mjs "$audit_json" "$ALLOWLIST"
