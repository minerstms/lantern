# Game card asset optimization (#177)

Feature branch only. Same artwork, same games, smaller files.

## Display vs source

| Surface | CSS max | Aspect |
|---------|---------|--------|
| Games library / leaderboard cards | 280×158 (`--lantern-card-width`) | 16:9, `object-fit: cover` |
| Pregame hero | container 720px; image `max-height: min(52vh, 420px)` | `object-fit: contain` |

Largest useful source ≈ 720×2 = 1440px wide (2× pregame). Current sources were already 1672×941 (or 1536×1024 for SRP). **Dimensions kept.** The waste was uncompressed RGB PNG, not pixel count.

Source-to-display ratio on the 280px card: **1672 / 280 ≈ 6.0×**.

## Per-game decisions

All nine live cards: RGB (no alpha) → **FORMAT CONVERT** to WebP q88 at original pixels. No upscale. No redesign.

SRP Safety stays **3:2** (1536×1024). It is already cropped by 16:9 `object-fit: cover` on the card face.

## BEFORE / AFTER

| GAME | OLD FILE | NEW FILE | OLD DIM | NEW DIM | OLD BYTES | NEW BYTES | SAVINGS % | FORMAT |
|------|----------|----------|---------|---------|-----------|-----------|-----------|--------|
| Avatar Match | assets/avatar-match-card.png | assets/avatar-match-card.webp | 1672×941 | 1672×941 | 2,187,478 | 259,922 | 88.1 | PNG→WebP |
| Lantern Live Trivia | assets/lantern-trivia-card.png | assets/lantern-trivia-card.webp | 1672×941 | 1672×941 | 1,913,458 | 168,808 | 91.2 | PNG→WebP |
| Handbook Trivia | assets/handbook-triva-card.png | assets/handbook-triva-card.webp | 1672×941 | 1672×941 | 2,077,930 | 216,350 | 89.6 | PNG→WebP |
| Local History Trivia | assets/history-trivia-card.png | assets/history-trivia-card.webp | 1672×941 | 1672×941 | 2,418,726 | 286,018 | 88.2 | PNG→WebP |
| SRP Safety Challenge | assets/srp-safety-trivia-card.png | assets/srp-safety-trivia-card.webp | 1536×1024 | 1536×1024 | 2,143,319 | 135,236 | 93.7 | PNG→WebP |
| Reaction Tap | assets/reaction-tap-card.png | assets/reaction-tap-card.webp | 1672×941 | 1672×941 | 2,008,476 | 231,194 | 88.5 | PNG→WebP |
| Nugget Click Rush | assets/nugget-click-rush-card.png | assets/nugget-click-rush-card.webp | 1672×941 | 1672×941 | 2,219,145 | 246,480 | 88.9 | PNG→WebP |
| Memory Match | assets/memory-match-card.png | assets/memory-match-card.webp | 1672×941 | 1672×941 | 1,909,347 | 186,766 | 90.2 | PNG→WebP |
| Nugget Hunt | assets/nugget-hunt-card.png | assets/nugget-hunt-card.webp | 1672×941 | 1672×941 | 2,461,027 | 302,328 | 87.7 | PNG→WebP |

Duplicates: each file is stored in both `app/assets/` (Pages) and `assets/` (repo mirror). Bytes above are one copy.

## Totals (unique live game-card artwork)

| | |
|--|--|
| Count | 9 |
| Before | 19,338,906 bytes (18.45 MiB) |
| After | 2,033,102 bytes (1.94 MiB) |
| Saved | 17,305,804 bytes (16.50 MiB) |
| Saved % | 89.5% |
| Largest before | nugget-hunt-card.png 2,461,027 |
| Largest after | nugget-hunt-card.webp 302,328 |
| Average before | 2,148,767 |
| Average after | 225,900 |
| Median before | 2,143,319 |
| Median after | 231,194 |

## Intentionally not changed

Mission / other card art (`mission-card.png`, `shout-out-card.png`, `srp-safety.png` mission cover, daily-check-in, etc.) is unused by the Games catalog. Reported only. Not deleted.

## Cache

Filenames changed (`.png` → `.webp`), so browsers fetch new URLs. `app/_headers` also revalidates `/assets/*-card.webp` and `/assets/*-card.png` (same no-cache pattern as HTML/JS/CSS). No global cache redesign.

## Budget

`worker/scripts/game-card-assets-177-test.mjs` fails if any live game-card file exceeds **400 KB**. Largest optimized card is 302 KB. 400 KB leaves room without allowing 2 MB PNGs to return.

## Visual review

Side-by-side 360×200 crops (before left / after right): `docs/game-card-opt-177-previews/*-crop.jpg`.
