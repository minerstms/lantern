# Tower Building Game — Lantern vendor notices

**Superseded for commercial-clearance work.** The 2026-08-13 independent
audit lives in:

- [`GAME_PROVENANCE.md`](./GAME_PROVENANCE.md) — donor pin, code/asset inventory, keep/replace matrix
- [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) — notices required or recommended by licenses of material actually present

This file is retained so earlier lab notes are not deleted. It is **not**
complete: it treated donor PNG/MP3/OGG as covered by the repo MIT license.
That assumption is **not** reliable. In particular, `donor/assets/bgm.mp3`
**was** tagged as Matthew Pablo’s “Caketown” (CC-BY-SA 3.0 on OpenGameArt).
Prompt #134 **removed** Caketown and donor SFX from the shipping tree.
Lantern Stack uses original synthesized Web Audio instead, with no BGM.

Do not remove `LICENSE` or `donor/LICENSE`.

---

This directory vendors a bounded copy of the MIT-licensed Tower Building Game
for an **experimental, unlinked Lantern lab prototype**.

## Donor

- Repository: https://github.com/iamkun/tower_game
- Commit: `c6fa84afe179b661fa71cf7cc8788d0c47ca2875`
- License: MIT — Copyright (c) 2018 BMQB, Inc
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

Prompt #134 replaced donor PNG gameplay sprites with original Lantern Stack
art generated in-repo. Donor UI chrome, BMQB logos, Caketown BGM, and donor
SFX were **removed** from `donor/assets/`. Remaining runtime files there are
Lantern-owned PNGs plus Zepto.

The donor README describes the game as “Tower Bloxx Deluxe Skyscraper”
inspired. This is documentation-only provenance. The shipping player does
not use that name.

## Fonts — excluded

The donor bundled a `wenxue` webfont (`wenxue.eot` / `.woff` / `.ttf` / `.svg`)
with **no copyright, author, or license metadata** (SVG metadata empty;
family name garbled; produced via FontEditor). Per Lantern donor-audit rules,
those font files were **not incorporated**.

Lantern’s hosted copy uses system / Arial fonts instead. Canvas HUD text in
the donor already used Arial for floor/score drawing.

## Deliberately not vendored / not loaded

- Google Analytics (`googletagmanager.com` / `gtag`) — removed from the
  vendored `donor/index.html` and omitted from Lantern’s hosted `index.html`.
- `package-lock.json` and the Express dev server (`donor/index.js` is kept
  only as donor source; Lantern does not run it).
- External demo images hosted on qnssl / GitHub user content (README only).

## How Lantern serves this game

The playable document is `app/games/tower/index.html`, loaded in a
**same-origin iframe** from the unlinked lab page `/game-lab/tower.html`.
Asset paths resolve under `./donor/` via `<base href="./donor/">`.
The game is not loaded from `iamkun.github.io` or any other website.
