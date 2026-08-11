#!/usr/bin/env python3
"""Prompt #155 — install canonical Lantern block-T favicon into Pages deploy root."""
from __future__ import annotations

import re
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "favicon.png"
APP_PNG = ROOT / "app" / "assets" / "favicon.png"
APP_ICO = ROOT / "app" / "favicon.ico"

FAVICON_BLOCK = (
    '  <link rel="icon" href="/favicon.ico" sizes="any">\n'
    '  <link rel="icon" type="image/png" href="/assets/favicon.png?v=2">\n'
    '  <link rel="apple-touch-icon" href="/assets/favicon.png?v=2">\n'
)


def write_assets() -> None:
    img = Image.open(SRC).convert("RGBA")
    print(f"source: {SRC} size={img.size}")
    APP_PNG.parent.mkdir(parents=True, exist_ok=True)
    img.save(APP_PNG, format="PNG", optimize=True)
    print(f"wrote {APP_PNG} bytes={APP_PNG.stat().st_size}")

    sizes = [(16, 16), (32, 32), (48, 48)]
    # Pillow writes a genuine multi-resolution ICO container.
    img.save(APP_ICO, format="ICO", sizes=sizes)
    print(f"wrote {APP_ICO} bytes={APP_ICO.stat().st_size}")

    data = APP_ICO.read_bytes()
    if data[0:4] != b"\x00\x00\x01\x00":
        raise SystemExit("ERROR: output is not a genuine ICO")
    count = struct.unpack_from("<H", data, 4)[0]
    entries = []
    offs = 6
    for _ in range(count):
        w, h, _c, _r, planes, bpp, size, offset = struct.unpack_from("<BBBBHHII", data, offs)
        ww = 256 if w == 0 else w
        hh = 256 if h == 0 else h
        entries.append((ww, hh, bpp, size, offset))
        offs += 16
    print(f"ICO images={count} entries={[(e[0], e[1], e[2]) for e in entries]}")
    have = {(e[0], e[1]) for e in entries}
    if not {(16, 16), (32, 32), (48, 48)}.issubset(have):
        raise SystemExit(f"ERROR: missing expected ICO sizes, have {have}")


def inject_html() -> None:
    html_files = sorted((ROOT / "app").glob("*.html"))
    locker_src = ROOT / "app" / "locker-sources"
    if locker_src.is_dir():
        html_files.extend(sorted(locker_src.glob("*.html")))

    updated = []
    skipped = []
    for path in html_files:
        text = path.read_text(encoding="utf-8")
        if "/assets/favicon.png?v=2" in text and 'href="/favicon.ico"' in text:
            skipped.append(path.relative_to(ROOT).as_posix())
            continue

        # Strip any prior icon / apple-touch declarations before re-inserting.
        text = re.sub(
            r"^\s*<link[^>]+rel=[\"'](?:shortcut )?icon[\"'][^>]*>\s*\n?",
            "",
            text,
            flags=re.I | re.M,
        )
        text = re.sub(
            r"^\s*<link[^>]+rel=[\"']apple-touch-icon[\"'][^>]*>\s*\n?",
            "",
            text,
            flags=re.I | re.M,
        )

        m = re.search(r'(<meta\s+charset=["\'][^"\']+["\']\s*/?>)\s*\n', text, flags=re.I)
        if m:
            insert_at = m.end()
            text = text[:insert_at] + FAVICON_BLOCK + text[insert_at:]
        else:
            m2 = re.search(r"(<head[^>]*>)\s*\n", text, flags=re.I)
            if not m2:
                raise SystemExit(f"ERROR: no <head> in {path}")
            insert_at = m2.end()
            text = text[:insert_at] + FAVICON_BLOCK + text[insert_at:]

        path.write_text(text, encoding="utf-8", newline="\n")
        updated.append(path.relative_to(ROOT).as_posix())

    print(f"UPDATED {len(updated)}")
    for u in updated:
        print(" ", u)
    print(f"SKIPPED {len(skipped)}")
    for s in skipped:
        print(" ", s)


if __name__ == "__main__":
    write_assets()
    inject_html()
    print("OK")
