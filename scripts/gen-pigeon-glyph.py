#!/usr/bin/env python3
"""从品牌真相源 public/favicon.svg 抠出白色信鸽贴片 → public/pigeon-glyph.png。

favicon.svg 是内嵌 512px PNG 的包装（圆角渐变底 + 纯白信鸽、无阴影）。运行时
品牌底座改由 CSS 按主题色现算（main.scss 的 .logo-icon/.logo 渐变），本脚本把
鸽子拆成带 alpha 的透明贴片，几何保持原 512×512 画布（各处 .logo-img 均
width:100% 铺满容器，画布不裁剪才能与原 PNG 像素对位）。

原理：底色在每一行是水平均一的线性垂直渐变，先用左侧空白带（x∈[16,64)，鸽子
bbox 之外）按行做最小二乘拟合 r/g/b(y)；再对每个像素按 px = α·glyph +
(1-α)·tile 解混（w=纯白），α 即贴片透明度、还原色即贴片颜色（抗锯齿边缘还原
为中性白，落在任意主题底色上都干净）。

品牌换版后重跑：python3 scripts/gen-pigeon-glyph.py（需 Pillow）。
"""
import base64
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "public" / "favicon.svg"
OUT = ROOT / "public" / "pigeon-glyph.png"

WHITE = (255.0, 255.0, 255.0)


def load_tile() -> Image.Image:
    m = re.search(r"base64,([A-Za-z0-9+/=]+)", SVG.read_text())
    if not m:
        sys.exit("favicon.svg 中未找到内嵌 PNG")
    return Image.open(__import__("io").BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")


def fit_row_gradient(px: dict, size: tuple[int, int]):
    """左侧空白带按行采样，最小二乘拟合每通道 c(y)=k·y+b。"""
    w, h = size
    ys, rs, gs, bs = [], [], [], []
    for y in range(h):
        row = [px[x, y] for x in range(16, 64)]
        opaque = [p for p in row if p[3] > 250]
        if len(opaque) < 40:  # 顶部/底部圆角区样本不足，跳过
            continue
        ys.append(y)
        rs.append(sum(p[0] for p in opaque) / len(opaque))
        gs.append(sum(p[1] for p in opaque) / len(opaque))
        bs.append(sum(p[2] for p in opaque) / len(opaque))
    def lin(vals):
        n = len(ys)
        sy, sv = sum(ys), sum(vals)
        syy = sum(y * y for y in ys)
        syv = sum(y * v for y, v in zip(ys, vals))
        k = (n * syv - sy * sv) / (n * syy - sy * sy)
        return k, (sv - k * sy) / n
    kr, br = lin(rs)
    kg, bg = lin(gs)
    kb, bb = lin(bs)
    return lambda y: (kr * y + br, kg * y + bg, kb * y + bb)


def main():
    im = load_tile()
    if im.size != (512, 512):
        sys.exit(f"意外尺寸 {im.size}，真相源可能已换版，请核对几何假设")
    px = im.load()
    tile_at = fit_row_gradient(px, im.size)

    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    op = out.load()
    kept = 0
    for y in range(im.size[1]):
        t = tile_at(y)
        d = tuple(WHITE[i] - t[i] for i in range(3))
        dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            alpha = ((r - t[0]) * d[0] + (g - t[1]) * d[1] + (b - t[2]) * d[2]) / dd
            alpha = max(0.0, min(1.0, alpha))
            if alpha < 1 / 255:
                continue
            # 解混还原贴片本色（边缘还原为中性白，避免残留旧靛蓝镶边）
            inv = 1.0 / alpha
            gr = max(0, min(255, round((r - (1 - alpha) * t[0]) * inv)))
            gg = max(0, min(255, round((g - (1 - alpha) * t[1]) * inv)))
            gb = max(0, min(255, round((b - (1 - alpha) * t[2]) * inv)))
            op[x, y] = (gr, gg, gb, round(alpha * 255))
            kept += 1
    out.save(OUT, optimize=True)
    print(f"OK {OUT.name}: {kept} 不透明像素, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
