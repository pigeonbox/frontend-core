#!/usr/bin/env python3
"""变异自证：每条变异都必须让对应 E2E 用例转红（frontend-core#45）。

用法：`python3 scripts/check-e2e-mutation.py`（在仓根执行）

为什么要有它：E2E 用例「全绿」有两种含义——「实现是对的」与「判据根本没在测东西」。
只有把被测行为**故意改坏**、看判据会不会红，才能区分这两者。

纪律（来自历轮踩坑）：
- 不能只在「绿的时候」跑自证 —— 必须先让被测物坏掉，看判据会不会红。
- **每次变异前必须重建产物**：E2E 跑的是 `vite preview` 起的 **dist/**，
  不重建 ⇒ 被测物是变异前的旧产物 ⇒ 变异打不到浏览器 ⇒ 判据恒绿
  （本仓第一版自证脚本就栽在这：症状像「判据没牙齿」，实为**产物陈旧**）。
- 每次变异只改一处，跑完立即还原（`finally` 里无条件还原）。
  ⚠️ 若进程被强杀（SIGKILL），源文件会停在变异态 ⇒ 用 `git checkout -- <file>` 复位
  （同目录会留 `*.mutbak` 备份文件，可手工比对）。
- 判据「全灭」时先查「被测物是不是真被执行了」—— 这里靠「变异后真的红」反证执行到位。
"""
import subprocess, sys, pathlib, shutil, os

REPO = pathlib.Path("/Volumes/zy/pigeonbox/frontend-core")

# (名称, 目标文件, 原串, 变异串, 期望转红的 spec)
MUTATIONS = [
    (
        "M1 取件不带上用户输入的码",
        "src/composables/usePickup.ts",
        "const res = await anonymousApi.retrieve({\n        code,\n        password: pwd || undefined,\n      })",
        "const res = await anonymousApi.retrieve({\n        code: '',\n        password: pwd || undefined,\n      })",
        "e2e/pickup.spec.ts",
    ),
    (
        "M2 后台登录不校验角色（非管理员也放行）",
        "src/views/admin/Login.vue",
        "if (userStore.userInfo?.role !== 'admin') {",
        "if (false as boolean) {",
        "e2e/admin.spec.ts",
    ),
    (
        "M3 文本寄件不提交内容",
        "src/components/upload/TextShare.vue",
        "const res = await shareApi.shareText({\n      text: payloadText,",
        "const res = await shareApi.shareText({\n      text: '',",
        "e2e/send.spec.ts",
    ),
    (
        "M4 取件预检不再识别「需要密码」",
        "src/composables/usePickup.ts",
        "if ((res.code === 200) && res.data?.require_password) {",
        "if (false as boolean) {",
        "e2e/pickup.spec.ts",
    ),
]


def run(spec: str) -> tuple[bool, str]:
    # ⚠️ **必须先重建**：E2E 跑的是**构建产物**（vite preview 起 dist/），
    # 不重建 ⇒ 被测物是**变异前的旧产物** ⇒ 变异永远打不到浏览器 ⇒ 判据恒绿。
    #   （这正是「判据全灭 ⇒ 先确认被测物真被执行了」那一条的现场复现：
    #     症状像「判据没牙齿」，实为**产物陈旧**。）
    b = subprocess.run(
        ["npx", "vite", "build"], cwd=REPO, capture_output=True, text=True, timeout=600
    )
    if b.returncode != 0:
        return False, "构建失败：\n" + b.stdout[-2000:] + b.stderr[-2000:]
    p = subprocess.run(
        ["npx", "playwright", "test", "--project=desktop", spec],
        cwd=REPO, capture_output=True, text=True, timeout=600,
    )
    out = p.stdout + p.stderr
    tail = "\n".join(out.strip().splitlines()[-12:])
    return p.returncode == 0, tail


def main() -> int:
    results = []
    for name, rel, old, new, spec in MUTATIONS:
        path = REPO / rel
        src = path.read_text()
        if old not in src:
            results.append((name, "SKIP", f"未找到变异锚点：{rel}"))
            print(f"[SKIP] {name}：锚点未命中（源码已变？）", flush=True)
            continue
        # 备份 → 变异 → 跑 → 还原
        shutil.copy2(path, path.with_suffix(path.suffix + ".mutbak"))
        path.write_text(src.replace(old, new, 1))
        try:
            green, tail = run(spec)
        finally:
            shutil.move(str(path.with_suffix(path.suffix + ".mutbak")), str(path))
        if green:
            results.append((name, "BAD", "变异后仍然全绿 —— 判据没牙齿"))
            print(f"[BAD ] {name}：变异后仍然全绿 ⇒ 判据无牙齿", flush=True)
            print(tail, flush=True)
        else:
            results.append((name, "OK", "变异后转红"))
            print(f"[ OK ] {name}：变异后转红", flush=True)

    print("\n===== 变异自证汇总 =====")
    bad = 0
    for name, status, note in results:
        print(f"{status:5s} {name} —— {note}")
        if status != "OK":
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
