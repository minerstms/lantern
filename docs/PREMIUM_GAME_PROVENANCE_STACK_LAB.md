# Stack Lab — asset provenance

**Game:** Stack Lab  
**Internal id:** `tower`  
**Public title:** Stack Lab  
**Shipping path:** `app/games/tower/` plus card `app/assets/tower-card.png`  
**Detailed record:** `app/games/tower/GAME_PROVENANCE.md`

This file is the Premium Games audit pointer. The game-lab record remains the hash-level inventory.

---

## Shipping inventory

| Asset / file | Source | License / ownership | Transformed? | Shipping path |
|---|---|---|---|---|
| Play card | Original Lantern PNG (navy stacked floors, 1200×675) | Lantern-owned | Original | `app/assets/tower-card.png` |
| Gameplay sprites | Canvas-generated data URLs | Original Lantern code | Recreated; donor PNGs removed | `app/games/tower/lantern-sprites.js` |
| SFX | Web Audio oscillators | Original Lantern code | Recreated; donor MP3/OGG removed | `app/games/tower/lantern-sfx.js` |
| Host / adapter | Lantern | Lantern-owned | Original | `app/games/tower/index.html`, `lantern-adapter.js`, `app/js/lantern-game-bridge.js` |
| Gameplay engine | iamkun/tower_game `c6fa84afe179b661fa71cf7cc8788d0c47ca2875` | MIT, Copyright 2018 BMQB, Inc | Code retained; donor media removed | `app/games/tower/donor/src/`, `donor/dist/main.js` |
| Zepto 1.1.6 | Thomas Fuchs | MIT | Relocated, same bytes | `app/games/tower/vendor/zepto-1.1.6.min.js` |
| Font | System Arial / Helvetica / sans-serif | System | Donor wenxue never vendored | none |
| BGM | none | — | Donor Caketown MP3/OGG removed | none |

---

## Not in shipping runtime

- No `app/games/tower/donor/assets/`
- No donor logos, title screens, or branded sprites
- No donor MP3/OGG
- No Google Analytics
- No hotlinked external game assets

Notices: `app/games/tower/LICENSE`, `THIRD_PARTY_NOTICES.md`, `NOTICES.md`.
