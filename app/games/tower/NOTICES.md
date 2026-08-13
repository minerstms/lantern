# Tower Building Game — Lantern vendor notices

This directory vendors a bounded copy of the MIT-licensed Tower Building Game
for an **experimental, unlinked Lantern lab prototype**.

Canonical provenance and keep/replace decisions: [`GAME_PROVENANCE.md`](./GAME_PROVENANCE.md).
Required third-party license texts: [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
Do not delete [`LICENSE`](./LICENSE) or [`donor/LICENSE`](./donor/LICENSE).

**This lab is not product-cleared for production merge.** See
[`COMMERCIAL_MERGE_GATE.md`](./COMMERCIAL_MERGE_GATE.md).

## Donor

- Repository: https://github.com/iamkun/tower_game
- Commit: `c6fa84afe179b661fa71cf7cc8788d0c47ca2875`
- License (code): MIT — Copyright (c) 2018 BMQB, Inc
- Required notice: see `LICENSE` and `donor/LICENSE`

The MIT license requires that the copyright notice and permission notice be
included in all copies or substantial portions of the Software. Both files are
preserved here.

## Third-party JavaScript

| Component | Where | License | Notes |
|-----------|--------|---------|-------|
| cooljs (canvas engine) | bundled inside `donor/dist/main.js` | ISC (https://www.npmjs.com/package/cooljs) | Compatible with MIT. Author: iamkun. |
| Zepto v1.1.6 | `donor/assets/zepto-1.1.6.min.js` | MIT (https://zeptojs.com/license) | Header in the file points at the Zepto license. |

## Artwork, audio, and other assets

Do **not** treat PNG, GIF, MP3, or OGG files under `donor/assets/` as MIT-cleared
product art. Commercial clearance found Caketown BGM (CC-BY-SA 3.0), unknown
SFX provenance, BMQB / 贝米钱包 logos, and unproven illustration. Inventory:
[`asset-slots.json`](./asset-slots.json).

The hosted game loads canvas media from `assets/` (runtime overlay). Donor
gameplay sprites there are **temporary placeholders**. HTML chrome is
Lantern CSS. Runtime audio files are silent. Original Caketown / SFX / BMQB
files remain only under `donor/assets/` for provenance and must not ship.

The donor README describes the game as “Tower Bloxx Deluxe Skyscraper”
inspired. That name must not appear in Lantern product UI. It is kept only
in the vendor README for provenance.

## Fonts — excluded

The donor bundled a `wenxue` webfont (`wenxue.eot` / `.woff` / `.ttf` / `.svg`)
with **no copyright, author, or license metadata** (SVG metadata empty;
family name garbled; produced via FontEditor). Per Lantern donor-audit rules,
those font files were **not incorporated**.

Lantern’s hosted copy uses system / Arial fonts. Canvas HUD default font
name is Arial (not wenxue).

## Deliberately not vendored / not loaded

- Google Analytics (`googletagmanager.com` / `gtag`) — removed from the
  vendored `donor/index.html` and omitted from Lantern’s hosted `index.html`.
- `package-lock.json` and the Express dev server (`donor/index.js` is kept
  only as donor source; Lantern does not run it).
- External demo images hosted on qnssl / GitHub user content (README only).
- BMQB / 贝米钱包 logos are not referenced by hosted `index.html` and are
  not copied into the runtime overlay.

## How Lantern serves this game

The playable document is `app/games/tower/index.html`, loaded in a
**same-origin iframe** from the unlinked lab page `/game-lab/tower.html`.
Engine code loads from `./donor/dist/main.js`. Canvas paths resolve to
`./assets/` (overlay). The game is not loaded from `iamkun.github.io` or
any other website.
