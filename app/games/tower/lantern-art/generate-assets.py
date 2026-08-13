#!/usr/bin/env python3
"""Generate original Lantern Stack raster assets (no donor tracing).

Nighttime school-tech arcade: navy sky, glowing windows, geometric floors.
Run from repo: python3 app/games/tower/lantern-art/generate-assets.py
"""
from __future__ import annotations

import os
import struct
import zlib
from pathlib import Path

NAVY = (11, 18, 32)
NAVY2 = (15, 27, 51)
INK = (234, 240, 255)
BLUE = (90, 167, 255)
BLUE_DK = (40, 90, 170)
GOLD = (255, 204, 102)
GOLD_DK = (200, 140, 40)
TEAL = (56, 208, 124)
MUTED = (120, 140, 180)
SLATE = (45, 58, 88)
WINDOW = (180, 220, 255)

ROOT = Path(__file__).resolve().parent
ENGINE_ASSETS = ROOT.parent / "donor" / "assets"
CARD_APP = ROOT.parents[2] / "assets" / "lantern-stack-card.png"
CARD_ROOT = ROOT.parents[3] / "assets" / "lantern-stack-card.png"


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def encode_png(w: int, h: int, pixels: bytearray) -> bytes:
    raw = bytearray()
    stride = w * 3
    for y in range(h):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])
    comp = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")


class Canvas:
    def __init__(self, w: int, h: int, fill=NAVY):
        self.w = w
        self.h = h
        self.px = bytearray(fill * (w * h) if isinstance(fill, bytes) else [])
        if not self.px:
            self.px = bytearray()
            r, g, b = fill
            for _ in range(w * h):
                self.px.extend((r, g, b))

    def _i(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return (y * self.w + x) * 3
        return None

    def set(self, x, y, rgb):
        i = self._i(int(x), int(y))
        if i is None:
            return
        self.px[i : i + 3] = bytes(rgb)

    def blend(self, x, y, rgb, a):
        i = self._i(int(x), int(y))
        if i is None:
            return
        a = max(0.0, min(1.0, a))
        r = int(self.px[i] * (1 - a) + rgb[0] * a)
        g = int(self.px[i + 1] * (1 - a) + rgb[1] * a)
        b = int(self.px[i + 2] * (1 - a) + rgb[2] * a)
        self.px[i : i + 3] = bytes((r, g, b))

    def fill_rect(self, x, y, w, h, rgb, a=1.0):
        x0, y0 = int(x), int(y)
        x1, y1 = int(x + w), int(y + h)
        for yy in range(max(0, y0), min(self.h, y1)):
            for xx in range(max(0, x0), min(self.w, x1)):
                if a >= 1:
                    self.set(xx, yy, rgb)
                else:
                    self.blend(xx, yy, rgb, a)

    def fill_circle(self, cx, cy, r, rgb, a=1.0):
        r = int(r)
        cx, cy = int(cx), int(cy)
        r2 = r * r
        for yy in range(max(0, cy - r), min(self.h, cy + r + 1)):
            dy = yy - cy
            for xx in range(max(0, cx - r), min(self.w, cx + r + 1)):
                dx = xx - cx
                if dx * dx + dy * dy <= r2:
                    if a >= 1:
                        self.set(xx, yy, rgb)
                    else:
                        self.blend(xx, yy, rgb, a)

    def fill_ellipse(self, cx, cy, rx, ry, rgb, a=1.0):
        cx, cy, rx, ry = int(cx), int(cy), max(1, int(rx)), max(1, int(ry))
        for yy in range(max(0, cy - ry), min(self.h, cy + ry + 1)):
            dy = (yy - cy) / ry
            for xx in range(max(0, cx - rx), min(self.w, cx + rx + 1)):
                dx = (xx - cx) / rx
                if dx * dx + dy * dy <= 1:
                    if a >= 1:
                        self.set(xx, yy, rgb)
                    else:
                        self.blend(xx, yy, rgb, a)

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encode_png(self.w, self.h, self.px))


# 5x7 caps for TAP / PTS / STACK labels
FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}


def draw_text(c: Canvas, text: str, x: int, y: int, scale: int, rgb, gap=1):
    cx = x
    for ch in text.upper():
        glyph = FONT.get(ch, FONT[" "])
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == "1":
                    c.fill_rect(cx + gx * scale, y + gy * scale, scale, scale, rgb)
        cx += (5 + gap) * scale


def make_background() -> Canvas:
    c = Canvas(750, 1050, NAVY)
    # stars
    for i in range(90):
        x = (i * 73 + 19) % 750
        y = (i * 47 + 11) % 520
        c.fill_circle(x, y, 1 if i % 3 else 2, INK, 0.55 if i % 2 else 0.9)
    # distant skyline
    bases = [
        (0, 620, 90, 430),
        (80, 540, 110, 510),
        (180, 580, 70, 470),
        (240, 500, 130, 550),
        (360, 560, 95, 490),
        (450, 480, 120, 570),
        (560, 530, 100, 520),
        (650, 600, 100, 450),
    ]
    for i, (x, y, w, h) in enumerate(bases):
        col = SLATE if i % 2 == 0 else NAVY2
        c.fill_rect(x, y, w, h, col)
        # windows
        for wy in range(y + 16, y + h - 20, 22):
            for wx in range(x + 10, x + w - 10, 16):
                if ((wx + wy + i) % 5) != 0:
                    c.fill_rect(wx, wy, 8, 12, WINDOW if (wx + wy) % 7 else GOLD, 0.85)
    # ground band
    c.fill_rect(0, 980, 750, 70, (8, 12, 22))
    c.fill_rect(0, 972, 750, 8, BLUE_DK)
    return c


def make_block(perfect=False) -> Canvas:
    c = Canvas(256, 180, (0, 0, 0))
    # transparent-ish navy by filling navy then drawing (engine has no alpha; use navy)
    c = Canvas(256, 180, NAVY)
    body = GOLD if perfect else BLUE
    edge = GOLD_DK if perfect else BLUE_DK
    c.fill_rect(8, 18, 240, 150, edge)
    c.fill_rect(14, 24, 228, 138, body)
    c.fill_rect(14, 24, 228, 18, INK if perfect else (140, 190, 255))
    for row in range(3):
        for col in range(5):
            c.fill_rect(28 + col * 42, 52 + row * 34, 26, 22, WINDOW if perfect else (20, 40, 80))
            if perfect:
                c.fill_rect(32 + col * 42, 56 + row * 34, 18, 14, GOLD)
    return c


def make_block_rope() -> Canvas:
    c = Canvas(256, 240, NAVY)
    # cable
    c.fill_rect(124, 0, 8, 70, BLUE)
    c.fill_rect(118, 62, 20, 12, GOLD)
    blk = make_block(False)
    # blit block lower
    for y in range(180):
        for x in range(256):
            si = (y * 256 + x) * 3
            c.set(x, y + 60, (blk.px[si], blk.px[si + 1], blk.px[si + 2]))
    return c


def make_hook() -> Canvas:
    c = Canvas(64, 512, NAVY)
    c.fill_rect(28, 0, 8, 430, BLUE)
    c.fill_rect(20, 420, 24, 18, GOLD)
    # chevron hook
    for i in range(28):
        c.fill_rect(18 + i // 2, 438 + i, 28 - i, 3, GOLD)
    return c


def make_cloud(kind: int) -> Canvas:
    c = Canvas(256, 256, NAVY)
    if kind <= 3:
        c.fill_ellipse(128, 140, 90, 40, MUTED, 0.95)
        c.fill_ellipse(90, 120, 50, 36, INK, 0.35)
        c.fill_ellipse(160, 118, 55, 38, INK, 0.3)
        c.fill_ellipse(128, 110, 48, 34, MUTED)
    else:
        # distant geometric "lanterns" / crystals, not donor rocks
        col = BLUE_DK if kind % 2 else SLATE
        c.fill_rect(88, 88, 80, 80, col)
        c.fill_rect(108, 68, 40, 40, BLUE)
        c.fill_rect(108, 148, 40, 40, BLUE)
        c.fill_circle(128, 128, 18, WINDOW, 0.9)
    return c


def make_flight(n: int) -> Canvas:
    c = Canvas(128, 128, NAVY)
    # distinct geometric motifs — chevrons, diamonds, rings (not donor planes/balloons)
    if n == 1:
        c.fill_rect(20, 60, 88, 8, INK)
        c.fill_rect(84, 44, 8, 40, INK)
        c.fill_rect(96, 52, 16, 24, BLUE)
    elif n == 2:
        c.fill_circle(64, 64, 28, BLUE, 0.9)
        c.fill_circle(64, 64, 14, NAVY)
    elif n == 3:
        for i in range(6):
            c.fill_rect(30 + i * 12, 50, 8, 28, GOLD if i % 2 else BLUE)
    elif n == 4:
        c.fill_rect(40, 20, 48, 88, SLATE)
        c.fill_rect(52, 32, 24, 20, WINDOW)
    elif n == 5:
        c.fill_ellipse(64, 64, 40, 16, MUTED)
        c.fill_rect(60, 48, 8, 32, GOLD)
    elif n == 6:
        c.fill_rect(24, 56, 80, 16, TEAL)
        c.fill_rect(88, 40, 16, 48, TEAL)
    else:
        c.fill_circle(64, 48, 16, GOLD)
        c.fill_rect(60, 64, 8, 36, BLUE)
    return c


def make_tutorial() -> Canvas:
    c = Canvas(280, 96, NAVY)
    c.fill_rect(8, 8, 264, 80, NAVY2)
    c.fill_rect(8, 8, 264, 6, BLUE)
    draw_text(c, "TAP", 78, 28, 6, GOLD, gap=2)
    return c


def make_arrow() -> Canvas:
    c = Canvas(64, 64, NAVY)
    for i in range(22):
        c.fill_rect(20, 8 + i, 24, 2, GOLD)
    for i in range(18):
        c.fill_rect(12 + i, 30 + i, 40 - 2 * i, 3, GOLD)
    return c


def make_heart() -> Canvas:
    """Life pip — rounded lantern diamond, not a cartoon heart."""
    c = Canvas(64, 64, NAVY)
    c.fill_circle(32, 32, 22, BLUE)
    c.fill_circle(32, 32, 12, WINDOW)
    c.fill_rect(30, 18, 4, 28, NAVY)
    c.fill_rect(18, 30, 28, 4, NAVY)
    return c


def make_score() -> Canvas:
    c = Canvas(280, 72, NAVY)
    c.fill_rect(4, 8, 272, 56, NAVY2)
    c.fill_rect(4, 8, 8, 56, GOLD)
    draw_text(c, "PTS", 88, 20, 5, GOLD, gap=2)
    return c


def make_card() -> Canvas:
    c = Canvas(1672, 941, NAVY)
    # stars
    for i in range(140):
        x = (i * 97 + 13) % 1672
        y = (i * 53 + 7) % 500
        c.fill_circle(x, y, 1 + (i % 2), INK, 0.4 + (i % 3) * 0.2)
    # stacked floors
    floors = [
        (520, 720, 632, 90),
        (560, 620, 552, 90),
        (610, 520, 452, 90),
        (670, 420, 332, 90),
        (730, 320, 212, 90),
    ]
    for i, (x, y, w, h) in enumerate(floors):
        body = BLUE if i % 2 == 0 else BLUE_DK
        c.fill_rect(x, y, w, h, body)
        c.fill_rect(x, y, w, 12, GOLD)
        for wx in range(x + 24, x + w - 24, 48):
            c.fill_rect(wx, y + 28, 22, 36, WINDOW)
    # cable + hook
    c.fill_rect(828, 40, 16, 280, BLUE)
    c.fill_rect(800, 300, 72, 28, GOLD)
    draw_text(c, "LANTERN", 560, 120, 10, INK, gap=2)
    draw_text(c, "STACK", 640, 210, 10, GOLD, gap=2)
    return c


def main():
    ENGINE_ASSETS.mkdir(parents=True, exist_ok=True)
    mapping = {
        "background.png": make_background(),
        "block.png": make_block(False),
        "block-perfect.png": make_block(True),
        "block-rope.png": make_block_rope(),
        "hook.png": make_hook(),
        "tutorial.png": make_tutorial(),
        "tutorial-arrow.png": make_arrow(),
        "heart.png": make_heart(),
        "score.png": make_score(),
    }
    for i in range(1, 9):
        mapping[f"c{i}.png"] = make_cloud(i)
    for i in range(1, 8):
        mapping[f"f{i}.png"] = make_flight(i)
    for name, canvas in mapping.items():
        dest = ENGINE_ASSETS / name
        canvas.save(dest)
        print("wrote", dest)
    card = make_card()
    for dest in (CARD_APP, CARD_ROOT, ROOT / "lantern-stack-card.png"):
        if dest:
            dest.parent.mkdir(parents=True, exist_ok=True)
            card.save(dest)
            print("wrote", dest)


if __name__ == "__main__":
    main()
