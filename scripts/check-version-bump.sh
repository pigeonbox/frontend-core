#!/usr/bin/env bash
# 抬版门禁（frontend-core#96）：库线内容一变先抬自己的版本——package.json 有
# diff 而 VERSION 未抬 ⇒ 红。否则列车 bump 解析「最新已发布 tag」永远钉旧
# tgz：core 仓 CI 绿测的是本地新依赖集，发布物是旧依赖集，两套行为
# （frontend-core#96：v0.18.0 后 pdfjs 4→6 / vue-i18n 9→11 / vite 7→8 三大
# major 只活在 main，列车拿到的 v0.18.0 tgz 仍是旧依赖集）。
#
# 用法:
#   bash scripts/check-version-bump.sh <BASE_SHA> [HEAD_REF]   # 判 base...HEAD
#   bash scripts/check-version-bump.sh --selfcheck             # 自证：临时仓库里
#       伪造「pkg 变了 VERSION 没抬」必须判红（且红因必须是本门禁）、
#       「pkg+VERSION 同抬」必须绿——判据没牙齿或坏了都要红。
#
# 判据只挂 pull_request 路径调用（ci.yml），放 push = 漏网版本已进 main 才报，
# 与 action pin 门禁（frontend-core#90）同取舍。
set -euo pipefail

judge() { # $1=base  $2=head；在调用方当前仓库上做三方 diff 判定
  local base="$1" head="$2" pkg ver out
  pkg="$(git diff --name-only "${base}...${head}" -- package.json | grep -q . && echo yes || echo no)"
  ver="$(git diff --name-only "${base}...${head}" -- VERSION | grep -q . && echo yes || echo no)"
  if [ "$pkg" = yes ] && [ "$ver" = no ]; then
    out="::error::package.json 有变更但 VERSION 未抬——依赖/契约变更必须与抬版同 PR 落地(frontend-core#96),否则列车 bump 钉旧 tgz"
    echo "$out" >&2
    return 1
  fi
  echo "抬版门禁通过(package.json changed=$pkg, VERSION bumped=$ver)"
}

selfcheck() { # 临时 git 仓库造场景，判据必须能分清好坏——恒绿/恒红/坏掉都算失败
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  git init -q "$tmp/repo"
  git -C "$tmp/repo" config user.email selfcheck@invalid
  git -C "$tmp/repo" config user.name selfcheck
  echo '{"name":"x","version":"1.0.0"}' >"$tmp/repo/package.json"
  echo '1.0.0' >"$tmp/repo/VERSION"
  git -C "$tmp/repo" add -A
  git -C "$tmp/repo" commit -qm base
  git -C "$tmp/repo" tag base

  # 场景 1（负对照）：package.json 变了、VERSION 没抬 ⇒ 必须红，且红因必须是
  # 本门禁的判定文案（防「脚本语法坏了也算红」的假负对照）。
  echo '{"name":"x","version":"1.0.0","dep":"new"}' >"$tmp/repo/package.json"
  git -C "$tmp/repo" commit -qam bump-missing
  local out
  if out="$(cd "$tmp/repo" && judge base HEAD 2>&1)"; then
    echo "负对照未转红: pkg 变更未抬版仍放行, 门禁是恒绿摆设" >&2
    return 1
  fi
  grep -q 'VERSION 未抬' <<<"$out" || {
    echo "负对照红了但非目标红因(判据可能坏了): $out" >&2
    return 1
  }

  # 场景 2（正对照）：package.json 与 VERSION 同抬 ⇒ 必须绿。
  echo '{"name":"x","version":"1.1.0","dep":"new"}' >"$tmp/repo/package.json"
  echo '1.1.0' >"$tmp/repo/VERSION"
  git -C "$tmp/repo" commit -qam bumped
  out="$(cd "$tmp/repo" && judge base HEAD 2>&1)" || {
    echo "正对照误伤: pkg+VERSION 同抬却被判红: $out" >&2
    return 1
  }
  grep -q '抬版门禁通过' <<<"$out" || {
    echo "正对照绿了但非本门禁通过文案(判据可能坏了): $out" >&2
    return 1
  }

  # 场景 3：package.json 无变更（纯源码/文档 PR）⇒ 必须绿（不逼无关 PR 抬版）。
  echo 'docs' >"$tmp/repo/README.md"
  git -C "$tmp/repo" add -A
  git -C "$tmp/repo" commit -qm docs-only
  out="$(cd "$tmp/repo" && judge base HEAD 2>&1)" || {
    echo "无关 PR 误伤: 纯文档变更被判红: $out" >&2
    return 1
  }

  echo "自证通过: 未抬版必红(红因可归因)/同抬必绿/无关变更不误伤"
}

case "${1:-}" in
  --selfcheck) selfcheck ;;
  "")
    echo "用法: $0 <BASE_SHA> [HEAD_REF] | $0 --selfcheck" >&2
    exit 64
    ;;
  *) judge "$1" "${2:-HEAD}" ;;
esac
