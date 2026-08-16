#!/usr/bin/env python3
"""Original geometric Minecart Switch catalog card. No baked-in title text."""
import math
import struct
import zlib
from pathlib import Path

W, H = 1280, 720


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, pixels: bytearray) -> None:
    raw = b""
    stride = W * 4
    for y in range(H):
        raw += b"\x00" + pixels[y * stride : (y + 1) * stride]
    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def setp(px, x, y, rgb, a=255):
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 4
        src_a = a / 255.0
        for c in range(3):
            px[i + c] = int(px[i + c] * (1 - src_a) + rgb[c] * src_a)
        px[i + 3] = 255


def fill_rect(px, x0, y0, x1, y1, rgb, a=255):
    for y in range(max(0, y0), min(H, y1)):
        for x in range(max(0, x0), min(W, x1)):
            setp(px, x, y, rgb, a)


def fill_circle(px, cx, cy, r, rgb, a=255):
    r2 = r * r
    for y in range(max(0, int(cy - r)), min(H, int(cy + r + 1))):
        for x in range(max(0, int(cx - r)), min(W, int(cx + r + 1))):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                setp(px, x, y, rgb, a)


def fill_poly(px, pts, rgb, a=255):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = max(0, int(min(xs))), min(W - 1, int(max(xs)))
    miny, maxy = max(0, int(min(ys))), min(H - 1, int(max(ys)))
    n = len(pts)
    for y in range(miny, maxy + 1):
        inter = []
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 <= y < y2) or (y2 <= y < y1):
                if y2 != y1:
                    inter.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        inter.sort()
        for i in range(0, len(inter), 2):
            if i + 1 >= len(inter):
                break
            x0, x1 = int(inter[i]), int(inter[i + 1])
            for x in range(max(0, x0), min(W, x1 + 1)):
                setp(px, x, y, rgb, a)


def line(px, x0, y0, x1, y1, rgb, width=3, a=255):
    steps = max(1, int(math.hypot(x1 - x0, y1 - y0)))
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        fill_circle(px, x, y, width, rgb, a)


def main():
    px = bytearray(W * H * 4)
    for y in range(H):
        t = y / (H - 1)
        col = mix((8, 10, 16), (18, 14, 10), min(1, t * 1.15))
        if t < 0.28:
            col = mix((6, 8, 14), (42, 28, 14), t / 0.28)
        for x in range(W):
            setp(px, x, y, col, 255)

    # tunnel glow
    for y in range(H):
        for x in range(W):
            dx = (x - W * 0.5) / (W * 0.22)
            dy = (y - H * 0.22) / (H * 0.18)
            d = dx * dx + dy * dy
            if d < 1.6:
                glow = max(0.0, 1.0 - d / 1.6)
                setp(px, x, y, (255, 176, 72), int(70 * glow))

    # rock silhouettes
    fill_poly(px, [(0, 420), (90, 300), (180, 360), (140, 720), (0, 720)], (28, 32, 38), 230)
    fill_poly(px, [(1100, 380), (1200, 260), (1280, 340), (1280, 720), (1040, 720)], (32, 36, 42), 230)
    fill_poly(px, [(0, 560), (220, 500), (260, 720), (0, 720)], (22, 24, 30), 220)
    fill_poly(px, [(980, 540), (1180, 470), (1280, 560), (1280, 720), (940, 720)], (24, 26, 32), 220)

    # timber frames
    line(px, 210, 720, 470, 150, (122, 78, 38), 7, 200)
    line(px, 1070, 720, 810, 150, (122, 78, 38), 7, 200)
    line(px, 430, 150, 850, 150, (138, 90, 44), 6, 190)
    line(px, 160, 520, 1120, 520, (110, 70, 34), 5, 120)

    # lamps
    fill_circle(px, 430, 168, 10, (255, 206, 96), 255)
    fill_circle(px, 850, 168, 10, (255, 206, 96), 255)
    fill_circle(px, 430, 168, 26, (255, 180, 70), 50)
    fill_circle(px, 850, 168, 26, (255, 180, 70), 50)

    # rails converging
    vp = (W * 0.5, H * 0.20)
    near = [(W * 0.22, H * 0.92), (W * 0.50, H * 0.94), (W * 0.78, H * 0.92)]
    colors = [(201, 162, 74), (240, 211, 106), (201, 162, 74)]
    widths = [5, 6, 5]
    for i, n in enumerate(near):
        line(px, vp[0], vp[1], n[0], n[1], colors[i], widths[i], 230)
    for i in range(8):
        t = 0.22 + i * 0.09
        y = int(vp[1] + (H * 0.92 - vp[1]) * t)
        x0 = int(vp[0] + (near[0][0] - vp[0]) * t)
        x1 = int(vp[0] + (near[2][0] - vp[0]) * t)
        line(px, x0 - 8, y, x1 + 8, y, (90, 62, 32), 3, 140)

    # minecart
    cx, cy = W * 0.5, H * 0.78
    fill_poly(
        px,
        [
            (cx - 110, cy - 10),
            (cx - 78, cy - 78),
            (cx + 78, cy - 78),
            (cx + 110, cy - 10),
            (cx + 88, cy + 42),
            (cx - 88, cy + 42),
        ],
        (196, 84, 42),
        255,
    )
    fill_rect(px, int(cx - 58), int(cy - 62), int(cx + 58), int(cy - 30), (43, 26, 18), 255)
    fill_circle(px, cx, cy - 102, 12, (246, 193, 77), 255)
    fill_circle(px, cx, cy - 102, 28, (255, 196, 80), 60)
    fill_circle(px, cx - 48, cy + 50, 22, (42, 47, 56), 255)
    fill_circle(px, cx + 48, cy + 50, 22, (42, 47, 56), 255)
    fill_circle(px, cx - 48, cy + 50, 22, (215, 221, 230), 0)
    line(px, cx - 48, cy + 50, cx - 48, cy + 50, (215, 221, 230), 3, 200)
    line(px, cx + 48, cy + 50, cx + 48, cy + 50, (215, 221, 230), 3, 200)

    out = Path("/workspace/app/assets/minecart-switch-card.png")
    write_png(out, px)
    print("wrote", out, out.stat().st_size)


if __name__ == "__main__":
    main()
