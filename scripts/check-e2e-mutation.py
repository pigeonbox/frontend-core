#!/usr/bin/env python3
"""变异自证：每条变异都必须让对应 E2E 用例转红（frontend-core#45 / pigeonbox#331）。

用法：`python3 scripts/check-e2e-mutation.py [--only <名称子串>]`（任意目录可执行）

为什么要有它：E2E 用例「全绿」有两种含义——「实现是对的」与「判据根本没在测东西」。
只有把被测行为**故意改坏**、看判据会不会红，才能区分这两者。

流程（pigeonbox#331 起）：
1. 锚点预检：全部变异锚点必须在源码里**唯一命中**；失配即判红并点名
   「元测试需要更新」——不许静默放过（旧版 SKIP 进汇总但语义含糊）。
2. 基线：未变异时**每条被覆盖的 spec 必须绿**。基线不绿 ⇒ 「变异后转红」
   是假信号（本来就红的用例经不起任何变异检验）⇒ 直接判红中止。
3. 每条变异：备份 → 变异 → 重建产物 → 跑对应 spec → **必须转红** → 还原。
   变异后仍绿 ⇒ 判红（判据没牙齿）。

纪律（来自历轮踩坑）：
- 不能只在「绿的时候」跑自证 —— 必须先让被测物坏掉，看判据会不会红。
- **每次变异前必须重建产物**：E2E 跑的是 `vite preview` 起的 **dist/**，
  不重建 ⇒ 被测物是变异前的旧产物 ⇒ 变异打不到浏览器 ⇒ 判据恒绿
  （本仓第一版自证脚本就栽在这：症状像「判据没牙齿」，实为**产物陈旧**）。
- 每次变异只改一处，跑完立即还原（`finally` 里无条件还原），还原后**逐字节
  校验**与原文一致；不一致判红。
  ⚠️ 若进程被强杀（SIGKILL），源文件会停在变异态 ⇒ 用 `git checkout -- <file>` 复位
  （同目录会留 `*.mutbak` 备份文件，可手工比对；正常路径下还原后即删除）。
- 判据「全灭」时先查「被测物是不是真被执行了」—— 这里靠「变异后真的红」反证执行到位。
- 仓库根由脚本自身位置推导（零硬编码路径）：换机器 / CI runner 直接可跑。
- **输出语言固定中文**；判定只依据进程退出码，不解析任何本地化文案
  （避免把 i18n 文案变化误判为「判据失效」）。
"""
import pathlib
import shutil
import subprocess
import sys

# 仓库根 = 脚本所在目录的上一级（零硬编码路径，pigeonbox#331）
REPO = pathlib.Path(__file__).resolve().parent.parent

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
    (
        # download.spec.ts 的变异点（pigeonbox#331 补齐：每条 spec 至少一个变异点）。
        # 语义：用户取消保存后**仍继续下载**——「先取保存句柄、再发请求」被破坏。
        # 一处连续块替换同时断掉两条取消出口（抛出型取消 / 返回 null 型取消），
        # 不依赖无头浏览器里保存对话框的具体取消形态。
        "M5 取消保存后仍继续下载（一个字节都不下载被破坏）",
        "src/utils/downloader.ts",
        "    } catch (err) {\n      if (isAbortLike(err)) throw new DownloadCancelledError()\n      throw err\n    }\n    if (!target) throw new DownloadCancelledError()",
        "    } catch {\n      // 变异：吞掉保存取消\n    }",
        "e2e/download.spec.ts",
    ),
]


def build() -> tuple[bool, str]:
    # ⚠️ **必须先重建**：E2E 跑的是**构建产物**（vite preview 起 dist/），
    # 不重建 ⇒ 被测物是**变异前的旧产物** ⇒ 变异永远打不到浏览器 ⇒ 判据恒绿。
    #   （这正是「判据全灭 ⇒ 先确认被测物真被执行了」那一条的现场复现：
    #     症状像「判据没牙齿」，实为**产物陈旧**。）
    b = subprocess.run(
        ["npx", "vite", "build"], cwd=REPO, capture_output=True, text=True, timeout=600
    )
    if b.returncode != 0:
        return False, "构建失败：\n" + b.stdout[-2000:] + b.stderr[-2000:]
    return True, ""


def run_spec(spec: str) -> tuple[bool, str]:
    p = subprocess.run(
        ["npx", "playwright", "test", "--project=desktop", spec],
        cwd=REPO, capture_output=True, text=True, timeout=600,
    )
    out = p.stdout + p.stderr
    tail = "\n".join(out.strip().splitlines()[-12:])
    return p.returncode == 0, tail


def main() -> int:
    only = None
    if "--only" in sys.argv:
        i = sys.argv.index("--only")
        if i + 1 >= len(sys.argv):
            print("用法：--only <名称子串>", flush=True)
            return 2
        only = sys.argv[i + 1]

    selected = [m for m in MUTATIONS if only is None or only in m[0]]
    if not selected:
        print(f"[FAIL] --only {only!r} 没有匹配到任何变异点", flush=True)
        return 2

    # ── ① 锚点预检：失配 = 元测试坏了，必须判红点名，不许静默放过 ──
    anchor_fail = False
    for name, rel, old, _new, _spec in selected:
        path = REPO / rel
        if not path.exists():
            print(f"[FAIL] {name}：目标文件不存在：{rel} —— 元测试需要更新", flush=True)
            anchor_fail = True
            continue
        n = path.read_text().count(old)
        if n != 1:
            print(
                f"[FAIL] {name}：变异锚点在 {rel} 命中 {n} 处（应恰好 1 处）"
                " —— 元测试需要更新",
                flush=True,
            )
            anchor_fail = True
    if anchor_fail:
        print("\n===== 变异自证汇总 =====")
        print("FAIL  锚点预检未通过 —— 元测试需要更新（锚点随源码漂移，判据牙齿未经证明）")
        return 1

    # ── ② 基线：未变异时每条被覆盖的 spec 必须绿 ──
    specs = sorted({m[4] for m in selected})
    ok, tail = build()
    if not ok:
        print(f"[FAIL] 基线构建失败：\n{tail}", flush=True)
        return 1
    for spec in specs:
        green, tail = run_spec(spec)
        if not green:
            print(f"[FAIL] 基线不绿：{spec} 未变异就红 —— 无法用它证明变异牙齿", flush=True)
            print(tail, flush=True)
            return 1
        print(f"[ OK ] 基线绿：{spec}", flush=True)

    # ── ③ 逐条变异：必须转红，跑完立即还原并逐字节校验 ──
    results = []
    for name, rel, old, new, spec in selected:
        path = REPO / rel
        src = path.read_text()
        bak = path.with_suffix(path.suffix + ".mutbak")
        shutil.copy2(path, bak)
        path.write_text(src.replace(old, new, 1))
        built, green = False, False
        try:
            built, tail = build()
            if built:
                green, tail = run_spec(spec)
        finally:
            shutil.move(str(bak), str(path))
        if path.read_text() != src:
            print(f"[FAIL] {name}：还原后内容与原文不一致：{rel} —— 请手工复位", flush=True)
            results.append((name, "FAIL", "还原失败"))
            continue
        if not built:
            results.append((name, "FAIL", "变异后构建失败（不是判据问题）"))
            print(f"[FAIL] {name}：变异后构建失败：\n{tail}", flush=True)
        elif green:
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
