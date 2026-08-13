# Tower — Game Provenance and Commercial Clearance Audit

**Status (Prompt #134):** Donor-facing presentation removed from shipping runtime. Public working title **Lantern Stack**. Internal game id remains `tower`. Isolated branch only — not on `origin/main`, not production-deployed.
**Audit date:** 2026-08-13 (#127 inventory). **Reskin date:** 2026-08-13 (#134).
**Auditor lane:** RED/YELLOW — commercial reskin around approved MIT mechanics.
**Prompt #132 note:** Engineering listed the game on Play on the isolated integration branch. #134 replaces donor chrome with Lantern-owned presentation. Do not treat this file as legal advice or as trademark clearance.

Canonical notices for redistribution: [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
Required upstream license texts also remain in [`LICENSE`](./LICENSE) and [`donor/LICENSE`](./donor/LICENSE). Do not remove those files.

---

## 1. Donor repository

| Field | Value |
|-------|--------|
| Public repository | https://github.com/iamkun/tower_game |
| Alternate / historical clone URL in `package.json` | https://github.com/bmqb/tower_game |
| Upstream commit vendored | `c6fa84afe179b661fa71cf7cc8788d0c47ca2875` |
| Upstream commit date | 2025-08-29 (author: Michael LoCascio / Gitmsl; message: “chore: Update README.md (#25)”) |
| Upstream commit contents | README grammar only. Game code, assets, and `LICENSE` are unchanged from parent `353c0df90c0c1b604a952d7f5e7ff2eb35f8826d`. |
| Lantern adoption | 2026-08-13, commit `4ad14fafbfacb41ff623c77b0885ffd6a6c2f622` (“Prototype Tower donor game in Lantern lab”) on branch `cursor/tower-donor-lab-4f8f` |
| Follow-up lab hardening | 2026-08-13, commit `ae0abd395e5487194068d704aafb00db43cb37cb` |
| Recorded pin | [`DONOR-REVISION.txt`](./DONOR-REVISION.txt) |
| Demo host (not used by Lantern) | https://iamkun.github.io/tower_game/ |
| GitHub license badge | MIT |
| `LICENSE` file | MIT — `Copyright (c) 2018 BMQB, Inc` |
| `package.json` `"license"` field | `"ISC"` (**inconsistent** with `LICENSE`; see §3.1) |
| `package.json` author | empty |
| Runtime title | “Tower Building” |
| Splash title art | Chinese copy **来啊盖楼啊** (“come on, build a tower”) |
| README inspiration line | “Tower Bloxx Deluxe Skyscraper” (documentation only; not used in runtime UI) |

Independent blob verification: every vendored donor file that exists in both trees matches the Git blob SHA of upstream `c6fa84afe179b661fa71cf7cc8788d0c47ca2875`, except the intentionally edited `donor/index.html` (Google Analytics removed; wenxue `@font-face` removed).

---

## 2. Where Tower lives in Lantern

Tower is **not** on `origin/main` as of this audit. It exists on:

- Branch: `cursor/tower-donor-lab-4f8f`
- Draft PR: “Prototype Tower donor game in Lantern lab” (head `cursor/tower-donor-lab-4f8f` → `main`)
- This clearance packet is documentation only and must not be used as a reason to merge Tower into `main`.

### 2.1 Files currently proposed for Lantern

**Donor snapshot (byte-identical to upstream except `donor/index.html`):**

- `app/games/tower/donor/LICENSE`
- `app/games/tower/donor/README.md`
- `app/games/tower/donor/README.zh-CN.md`
- `app/games/tower/donor/package.json`
- `app/games/tower/donor/.babelrc`
- `app/games/tower/donor/.gitignore`
- `app/games/tower/donor/index.js` (Express dev server; Lantern does not run it)
- `app/games/tower/donor/index.html` (modified; see §2.3)
- `app/games/tower/donor/src/*.js` (11 source modules; unmodified)
- `app/games/tower/donor/dist/main.js` (webpack production bundle; unmodified vs upstream)
- `app/games/tower/donor/assets/*` (see asset table; wenxue fonts omitted)

**Lantern wrapper / lab (original to Lantern, not from the donor):**

- `app/games/tower/index.html` — hosted playable document (`<base href="./donor/">`)
- `app/games/tower/lantern-adapter.js` — iframe → parent gameplay events only
- `app/game-lab/tower.html` — unlinked lab shell, preview-only, results not saved
- `app/js/lantern-game-bridge.js` — parent bridge (identity, leaderboard, economy stay on Lantern)
- `app/js/lantern-pilot-auth.js` — one-line route map addition: `/game-lab/tower`
- `worker/scripts/tower-lab-bridge-test.mjs` — lab bridge tests
- `app/games/tower/LICENSE`, `NOTICES.md`, `DONOR-REVISION.txt`, this file, `THIRD_PARTY_NOTICES.md`

### 2.2 Omitted from upstream (intentionally not incorporated)

| Upstream path | Why omitted | Still in Lantern? |
|---------------|-------------|-------------------|
| `assets/wenxue.eot` / `.woff` / `.ttf` / `.svg` | No copyright, author, or license metadata. SVG `<metadata>` empty; `<font-face font-family>` garbled; `font id="fonteditor"` (FontEditor export). | **No.** Do not add. |
| `package-lock.json` | npm lockfile / build-time dependency graph; not needed to serve the vendored snapshot. | **No.** |
| Google Analytics (`googletagmanager.com/gtag/js?id=G-YCWZ8ZDCH2`) | Third-party tracking. Removed from vendored HTML and never added to Lantern’s hosted `index.html`. | **No.** Do not restore. |
| README remote images (`o2qq673j2.qnssl.com`, GitHub user-content GIFs/QR) | Documentation-only; not loaded by the game. | Not vendored as files. |

### 2.3 Lantern modifications to donor material

| Item | Change |
|------|--------|
| `donor/index.html` | Removed `gtag` / Google Analytics. Removed `@font-face{font-family:wenxue;...}`. Class `.font-wenxue` now uses `Arial, Helvetica, sans-serif`. |
| `app/games/tower/index.html` | New hosted document. Same visual CSS as donor, Arial fallback, no WeChat `WeixinJSBridge` gate, no invite / WeChat-share overlay, no Analytics. Loads `lantern-adapter.js`. |
| Canvas HUD font | `donor/src/utils.js` still defaults `drawYellowString` to `fontName = 'wenxue'`. Because the webfont is not loaded, the browser falls back (typically Arial / Helvetica). **Do not restore wenxue.** |
| Audio | Game code still requests `./assets/*.mp3` only. Sibling `.ogg` files are present but unused by `src/index.js`. |
| Branding files still on disk | `main-index-logo.png` and `main-loading-logo.png` (贝米钱包 / BMQB.COM) are **not referenced** by current HTML, but they remain in `donor/assets/`. |
| Lab behavior | Preview mode hardcoded; scores are not POSTed. Nugget writes remain disabled in the bridge. |

---

## 3. Code / dependency license inventory

Lantern clearance preference: MIT, BSD-2/3, ISC, Apache-2.0, CC0 assets, or Lantern-original.

**Do not assume `dist/main.js` is covered solely by the parent MIT file.** It is a webpack bundle of Tower source **plus** `cooljs`. Zepto is a separate file.

### 3.1 Tower game source

| Field | Finding |
|-------|---------|
| Files | `donor/src/*.js`, `donor/index.js`, `donor/index.html` (HTML/CSS/JS), webpack output `donor/dist/main.js` (Tower portion) |
| Origin | https://github.com/iamkun/tower_game @ `c6fa84afe179b661fa71cf7cc8788d0c47ca2875` |
| Copyright owner (from LICENSE) | BMQB, Inc (2018) |
| Public author of the GitHub repo | `iamkun` (also author of `cooljs` and Day.js). `package.json` author field is empty. |
| License | **MIT** (`LICENSE`). GitHub classifies the repo as MIT. |
| Conflicting SPDX | `package.json` `"license": "ISC"` — typical leftover from `npm init`. **The `LICENSE` file is the grant used here.** This audit does not change either file. |
| Commercial use | Permitted (MIT). |
| Modification | Permitted. |
| Redistribution | Permitted, including sublicense and sale. |
| Attribution / notice | MIT requires the copyright notice and permission notice in all copies or substantial portions. |
| Copyleft | None. |
| Source disclosure | Not required. |
| Must ship license text | **Yes**, with any commercial distribution of the code. See `THIRD_PARTY_NOTICES.md`. |
| Commercial status | **GREEN** for the JavaScript game logic, subject to keeping notices. |
| Action | **KEEP** (code). |

BMQB branding in artwork is a **trademark** issue separate from the MIT copyright grant on the software. See §5 and §6.

### 3.2 cooljs (canvas engine)

| Field | Finding |
|-------|---------|
| Component | `cooljs` — HTML5 canvas engine (`Engine`, `Instance`) |
| Where | Imported by `donor/src/index.js`, `animateFuncs.js`, `flight.js`; **bundled inside** `donor/dist/main.js`. Not present as a standalone file. |
| Origin | https://github.com/iamkun/cooljs and https://www.npmjs.com/package/cooljs |
| Declared version | `package.json` dependency `"cooljs": "^1.0.2"`. npm 1.0.2 published 2018-03-20. The checked-in `dist/main.js` is a prebuilt upstream artifact; the exact resolved cooljs patch inside the bundle is not separately version-stamped. |
| Author | `iamkun` (`package.json` / npm) |
| License | **ISC** (SPDX on npm and in GitHub `package.json`) |
| LICENSE file | **None** in the GitHub repo or in the npm 1.0.2 tarball. |
| Copyright line | **Not stated** in a LICENSE file. Do not invent one. Author is identified as `iamkun`. |
| Commercial use | Permitted (ISC). |
| Modification | Permitted. |
| Redistribution | Permitted, with or without fee. |
| Attribution / notice | ISC requires the copyright notice **and** permission notice in all copies. Because no copyright line exists upstream, retain the ISC permission notice and identify the work as cooljs by iamkun. |
| Copyleft / source disclosure | None. |
| Must ship license text | **Recommended / treated as required** for a commercial distribution that includes `dist/main.js`. |
| Commercial status | **GREEN** (permissive), with a documentation gap (no LICENSE file). |
| Action | **KEEP** (engine code). |

### 3.3 Zepto v1.1.6

| Field | Finding |
|-------|---------|
| File | `donor/assets/zepto-1.1.6.min.js` |
| Header in file | `/* Zepto v1.1.6 - zepto event ajax form ie - zeptojs.com/license */` |
| Origin | https://github.com/madrobby/zepto (v1.1.6, 2014-12-12); license page https://zeptojs.com/license/ |
| Copyright (from official license page) | Copyright (c) 2010-2014 Thomas Fuchs, http://zeptojs.com |
| License | **MIT** |
| Blob match | Identical to upstream Tower commit. |
| Commercial use / modification / redistribution | Permitted (MIT). |
| Attribution / notice | MIT notice must be included. The minified header points at the license URL; a commercial distribution should still ship the MIT text. |
| Copyleft / source disclosure | None. |
| Must ship license text | **Yes.** |
| Commercial status | **GREEN** |
| Action | **KEEP** |

### 3.4 Webpack / Babel residue in `dist/main.js`

| Field | Finding |
|-------|---------|
| File | `donor/dist/main.js` (24,958 bytes; webpack IIFE bootstrap; **no** `license`, `copyright`, `cooljs`, or `webpack` strings) |
| Contents | Tower `src/` + cooljs, minified. No Zepto (Zepto is loaded separately). |
| Build tools | `webpack` ^4, `babel-loader`, `@babel/preset-env` are **devDependencies**. They are not shipped as source. A small webpack runtime is inherent in the bundle. Webpack is MIT-licensed. |
| Provenance risk | The bundle is not a pure MIT-only artifact. cooljs ISC applies to the engine portion. |
| Action | **KEEP** the current prebuilt bundle for the lab. Before a commercial rebuild, generate `dist/main.js` from the vendored `src/` plus a pinned cooljs version and keep notices. |

### 3.5 Lantern-original code

`lantern-adapter.js`, `lantern-game-bridge.js`, `game-lab/tower.html`, and `tower-lab-bridge-test.mjs` are Lantern-authored. They are not donor MIT works. No third-party license obligation was identified in those files beyond ordinary Lantern project licensing.

---

## 4. Asset provenance inventory

**Rule used:** An MIT GitHub repository does **not** prove the owner created or held rights in every binary. Assets are classified independently.

PNG files generally have **no** `tEXt` / `iTXt` copyright chunks. `favicon.png` contains Adobe ImageReady / XMP metadata only. Audio files were processed in Adobe Audition CC 2018 (Macintosh, `+08:00`) on 2018-01-24 through 2018-01-31.

### 4.1 Color key

- **GREEN** — commercial provenance/permission clear enough to retain.
- **YELLOW** — likely usable for a closed lab, but provenance/license documentation is incomplete for a commercial product.
- **RED** — unknown, restrictive, trademark-derived, third-party copyleft, or otherwise unsuitable for a future commercial Lantern product as-is.

### 4.2 Visual assets

| Item | Type | Source | License (evidence) | Color | Commercial status | Action |
|------|------|--------|--------------------|-------|-------------------|--------|
| `background.png` | PNG 750×1050 night city + orange house | Donor assets; no author metadata | None separate from repo MIT. Ownership of the illustration is **unproven**. | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `block.png` | PNG floor sprite, red brick, arched windows | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `block-perfect.png` | PNG orange “perfect” floor | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `block-rope.png` | PNG floor + rope attachment | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `hook.png` | PNG crane cable + hazard-stripe block + hook | Donor | Unproven; crane motif is the Tower Bloxx genre cue | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `rope.png` | PNG rope | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `c1.png`–`c3.png`, `c6.png`–`c8.png` | PNG clouds | Donor | Unproven generic clouds | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `c4.png`, `c5.png` | PNG asteroid / rock clouds | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `f1.png` | PNG bird silhouettes | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `f2.png`, `f3.png` | PNG hot-air balloons | Donor | Unproven; stock-icon look | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `f4.png`, `f5.png` | PNG twin-prop plane (identical blobs) | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `f6.png` | PNG cartoon rocket | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `f7.png` | PNG flight sprite | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `heart.png` | PNG HP heart | Donor | Unproven generic UI | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `score.png` | PNG “SCORE” HUD plate | Donor | Unproven; rasterized Latin UI type | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `tutorial.png` | PNG “Click!” | Donor | Unproven; rasterized type | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `tutorial-arrow.png` | PNG arrow | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-bg.png` | PNG brick pattern (CSS body background) | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-loading.gif` | GIF 500×500 loading animation, brick tower in a circle | Donor | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-index-title.png` | PNG splash title **来啊盖楼啊** hanging from a crane | Donor branding | Unproven art; **donor title / visual identity** | RED | Unsuitable as Lantern product identity | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-index-start.png` | PNG “START” button | Donor UI | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-modal-over.png` | PNG “GAME OVER / score” | Donor UI | Unproven; rasterized type | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-modal-again-b.png` | PNG “REPLAY” button | Donor UI | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-modal-bg.png` | PNG modal panel | Donor UI | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-modal-invite-b.png` | PNG “SHARE” / megaphone | Donor WeChat-era UI | Unproven. Used by `donor/index.html`; **not** used by Lantern hosted `index.html`. | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** (or leave unused until removed in a later pass) |
| `main-share-icon.png` | PNG “SHARE YOUR SCORE” | Donor WeChat share overlay | Unproven. Not used by Lantern hosted `index.html`. | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `favicon.png` | PNG 582×582 circular building icon | Donor; Adobe ImageReady | Unproven | YELLOW | Incomplete | **REPLACE BEFORE PRODUCT RELEASE** |
| `main-index-logo.png` | PNG **贝米钱包** + **BMQB.COM** wallet logo | BMQB / 贝米钱包 branding | Trademark / third-party brand. **Not** a Lantern mark. Unused by current HTML but **still in the tree**. | RED | Unsuitable | **REMOVE** before any public or commercial release (do not wire it up; later pass should delete the file) |
| `main-loading-logo.png` | PNG **贝米钱包** / **BMQB.COM** | Same | Same | RED | Unsuitable | **REMOVE** before any public or commercial release |
| `wenxue.eot/.woff/.ttf/.svg` | Webfont | Upstream only; FontEditor export; empty metadata | **No license** | RED | Unsuitable | Already omitted. **KEEP omitted.** |

No JPG, SVG game art, or spritesheet atlas is used. Decorative “flights” are individual PNGs, not a packed spritesheet.

### 4.3 Audio assets

| Item | Type | Source | License (evidence) | Color | Commercial status | Action |
|------|------|--------|--------------------|-------|-------------------|--------|
| `bgm.mp3` | BGM, ~169s, ID3: artist **Matthew Pablo**, title **Caketown**, date 2012 | Third-party music, not BMQB-original. Matches the well-known OpenGameArt track. | OpenGameArt listing **CC-BY-SA 3.0** (https://opengameart.org/content/caketown-cuteplayful ; license URL http://creativecommons.org/licenses/by-sa/3.0/). Donor ships it **without attribution**. | RED | Copyleft / ShareAlike; Lantern standard treats CC-BY-SA as generally unsuitable unless explicitly approved. Even CC-BY would require attribution that is currently missing. | **REPLACE BEFORE PRODUCT RELEASE** |
| `bgm.ogg` | Vorbis sibling of BGM | Same recording lineage (libsndfile / libVorbis) | Same as `bgm.mp3` if it is the same composition | RED | Unused by current JS (`addAudio` loads `.mp3` only) but still in the tree | **REPLACE BEFORE PRODUCT RELEASE** |
| `drop.mp3` / `drop.ogg` | SFX ~0.6–0.9s | Donor; ID3 genre “Blues”; no artist/title; Audition 2018 | Unknown | RED | Unclear / no-license as a standalone work | **REPLACE BEFORE PRODUCT RELEASE** |
| `drop-perfect.mp3` / `.ogg` | SFX | Same | Unknown. `drop-perfect.ogg` encoder string is older (`libVorbis I 20040629` / 1.1.0 RC1) than the other Oggs (1.3.5). | RED | Unknown | **REPLACE BEFORE PRODUCT RELEASE** |
| `game-over.mp3` / `.ogg` | SFX ~3.3s | Same | Unknown | RED | Unknown | **REPLACE BEFORE PRODUCT RELEASE** |
| `rotate.mp3` / `.ogg` | SFX ~1.2s | Same | Unknown | RED | Unknown | **REPLACE BEFORE PRODUCT RELEASE** |

**Caketown is the single strongest asset finding in this audit.** It independently disproves the idea that “everything in the MIT repo is MIT-licensed original work.”

### 4.4 Fonts

| Item | Status |
|------|--------|
| wenxue webfont | Omitted. Do not restore. |
| CSS / HTML | Arial / Helvetica / “Helvetica Neue” — system fonts. **GREEN** for lab and product if no proprietary webfont is added. |
| Canvas `drawYellowString` | Still requests family `wenxue`; falls back without the files. Before product release, change the default font name in source to a cleared family (that is a later code change; not done in this audit). |
| Rasterized type in PNGs | START / REPLAY / SHARE / GAME OVER / SCORE / Click! / 来啊盖楼啊 — type baked into bitmaps. Replacing those PNGs also removes the unidentified display faces. |

---

## 5. Keep / replace / investigate matrix (product team)

| ITEM | TYPE | SOURCE | LICENSE | COMMERCIAL STATUS | ACTION |
|------|------|--------|---------|-------------------|--------|
| Tower JS (`src/`, game logic, scoring math) | Code | iamkun/tower_game @ c6fa84af | MIT (BMQB, Inc 2018) | GREEN | **KEEP** |
| cooljs engine (inside `dist/main.js`) | Code | iamkun/cooljs, npm ISC | ISC | GREEN | **KEEP** |
| Zepto 1.1.6 | Code | madrobby/zepto | MIT (Thomas Fuchs 2010–2014) | GREEN | **KEEP** |
| `dist/main.js` as a whole | Built bundle | Tower + cooljs | MIT + ISC | GREEN if notices ship | **KEEP** (rebuild later from pinned sources) |
| Lantern adapter / bridge / lab page / tests | Code | Lantern | Lantern | GREEN | **KEEP** |
| MIT `LICENSE` files | Notice | Upstream | MIT | Required | **KEEP** (do not delete) |
| Donor README “Tower Bloxx…” line | Docs | Upstream | n/a | Inspiration claim only | **KEEP** in the vendor tree for provenance; **do not** surface that name in product UI |
| Title art `main-index-title.png` | Branding | Donor | Unproven | RED | **REPLACE BEFORE PRODUCT RELEASE** |
| BMQB / 贝米钱包 logos | Trademark | BMQB | Trademark | RED | **REMOVE** before public/commercial release |
| Remaining gameplay PNG/GIF | Art | Donor | Unproven | YELLOW | **REPLACE BEFORE PRODUCT RELEASE** |
| UI buttons / modal / favicon / score plate | Art | Donor | Unproven | YELLOW | **REPLACE BEFORE PRODUCT RELEASE** |
| BGM Caketown | Music | Matthew Pablo | CC-BY-SA 3.0 | RED | **REPLACE BEFORE PRODUCT RELEASE** |
| Drop / rotate / game-over SFX | Audio | Unknown | Unknown | RED | **REPLACE BEFORE PRODUCT RELEASE** |
| wenxue font | Font | Unknown / FontEditor | None | RED | **REMOVE** (already omitted) |
| Google Analytics | Tracking | Google | n/a | Do not ship | **REMOVE** (already omitted) |
| Product name “Tower” / “Tower Building” | Name | Donor English title; also a common word | Not a registered-mark search | YELLOW | **INVESTIGATE BEFORE RELEASE**; prefer an original Lantern name |
| “Tower Bloxx” / “Skyscraper” / Digital Chocolate | Foreign mark | README inspiration | Third-party trademark | RED if used | **REMOVE** from any runtime, store listing, or marketing |

---

## 6. Tower Bloxx / trademark / trade-dress review

**Evidence, not a legal conclusion.**

### 6.1 What the donor actually says

English README:

> a tower building game based on ES6 and Canvas (Tower Bloxx Deluxe Skyscraper)

Chinese README repeats the same English parenthetical. No source file, filename, comment, or runtime string contains “Bloxx”, “Digital Chocolate”, “Sumea”, or “City Bloxx”.

### 6.2 Runtime branding

- Document title: “Tower Building”
- Splash: Chinese **来啊盖楼啊**, crane-hook composition
- Buttons: START / REPLAY / SHARE / GAME OVER
- Unused files: 贝米钱包 / BMQB.COM logos
- Lab shell: “Tower Lab” with MIT attribution to BMQB, Inc

The donor does **not** use the Tower Bloxx name in the playable UI.

### 6.3 Mechanics

Swinging crane, drop-on-tap, stack floors, 3 HP, success vs perfect scoring, and a rising skyline are the well-known Tower Bloxx / City Bloxx loop (Digital Chocolate Helsinki / Sumea, 2005; Deluxe 2008). **Game mechanics are not copyrightable in the abstract** in U.S. doctrine, but a close visual/audio presentation can still create trademark or trade-dress risk. This audit does not treat mechanics-alone as a blocker to keeping the MIT engine.

### 6.4 Visual similarity (observational)

Donor art is flat casual-mobile illustration: orange/red brick, arched cyan windows, night skyline, cartoon crane with yellow/black hazard stripes, hearts, clouds, balloons, planes, rocket. That is the **same genre costume** as Tower Bloxx, not a finding that any specific Digital Chocolate sprite was copied. No filename or metadata says “bloxx”. Side-by-side pixel matching against commercial Tower Bloxx assets was **not** performed (those assets are not in this repository). Residual risk remains because:

- the donor **advertises** the commercial title as the reference;
- the crane + stacking + hearts + “perfect” presentation is the recognizable loop;
- a future Lantern store listing that looks like Tower Bloxx would be an unnecessary risk.

### 6.5 Audio

BGM is **not** from Tower Bloxx; it is Matthew Pablo’s **Caketown** (2012), a cute/playful cake-decorating track, CC-BY-SA 3.0, currently unattributed. SFX have no composer tags.

### 6.6 Practical mitigation

1. Do not use “Tower Bloxx”, “Bloxx”, “Skyscraper” (as a title), or Digital Chocolate marks in UI, Play catalog, missions, or marketing.
2. Replace splash, UI chrome, blocks, crane, HUD, and audio with Lantern-original (or CC0 / commercially licensed) work that is not a look-alike kit.
3. Give the shipped game an original Lantern name.
4. Keep the MIT/ISC/MIT code path if desired.
5. Do not ship BMQB / 贝米钱包 logos.

This would **materially reduce** branding and trade-dress risk. It does not create a warranty that no rights-holder will object.

---

## 7. Recommended commercial end state

Assessed strategy:

**KEEP**

- Permissively licensed game engine / mechanics / JS (Tower MIT + cooljs ISC + Zepto MIT), with notices.

**REPLACE**

- Donor branding, title treatment, visual identity, unproven art, unproven SFX, Caketown BGM, unidentified fonts, BMQB marks.

**CREATE**

- Original Lantern game name, Lantern-owned artwork, Lantern-owned or CC0/commercially licensed audio, original UI shell.

**Verdict:** Yes, this strategy materially reduces the dominant risks (third-party music copyleft, unproven binaries, donor/BMQB marks, Tower Bloxx look-alike presentation). The remaining code-license risk is low if MIT/ISC/Zepto notices ship.

---

## 8. Unresolved concerns

1. **Asset authorship.** Except Caketown, no illustrator, photographer, or SFX designer is identified. BMQB/iamkun may have commissioned original art; that is not documented in the repo.
2. **Caketown identity.** ID3 tags plus the public OGA listing are strong, but this audit did not byte-compare `bgm.mp3` to the OGA download (the donor file is a 16 kbps / 8 kHz Audition transcode, not the 4.3 MB OGA master). Treat it as the same composition.
3. **CC-BY-SA ShareAlike scope.** Whether embedding SA music in a larger MIT game “infects” the game is a legal question. Lantern’s written standard already treats CC-BY-SA as generally unsuitable. Replace the track.
4. **cooljs** has no LICENSE file and no copyright year.
5. **`package.json` ISC vs `LICENSE` MIT** on the Tower repo.
6. **BMQB, Inc** as a legal person: splash logos identify 贝米钱包 / BMQB.COM. Public reporting describes 贝米钱包 as a PRC P2P platform later subject to criminal proceedings. That does not void the MIT grant, but it is a reason not to display those marks and not to expect a practical licensor contact.
7. **Trademark clearance** of the English word “Tower” as a game title was not performed.
8. **No pixel-level comparison** to commercial Tower Bloxx sprite sheets.
9. **Canvas still requests `wenxue`.** Harmless while files are absent; fix in a later non-audit change.
10. **Orphan BMQB logos** remain on disk. This audit does not delete them.

---

## 9. Commercial-release checklist

Do **not** treat the current lab snapshot as shippable product art.

- [ ] Keep `LICENSE`, `donor/LICENSE`, and `THIRD_PARTY_NOTICES.md` in any distribution that includes Tower code.
- [ ] Keep Zepto MIT and cooljs ISC notices.
- [ ] Replace **all** donor PNG/GIF visible in gameplay and UI with Lantern-original or CC0/commercially licensed art.
- [ ] Replace BGM (do not ship Caketown unless counsel approves CC-BY-SA and attribution is added).
- [ ] Replace all SFX.
- [ ] Delete or never ship `main-index-logo.png` and `main-loading-logo.png`.
- [ ] Do not restore wenxue fonts.
- [ ] Do not restore Google Analytics.
- [ ] Do not use “Tower Bloxx” (or confusingly similar branding) in product UI or listings.
- [ ] Choose an original Lantern game name; wrap the canvas game in Lantern UI.
- [ ] Point canvas text at a cleared font family (stop requesting `wenxue`).
- [ ] Rebuild `dist/main.js` from pinned `src/` + pinned cooljs when convenient; keep notices.
- [ ] Counsel review of trademark/trade-dress residual risk after the art/audio swap.
- [ ] Only then consider Play catalog / commercial distribution.

**Lab use:** acceptable as an unlinked preview with current notices, provided Caketown is not presented as Lantern-original music and BMQB logos stay unused.

---

## 10. GO / NO-GO (audit conclusion)

| Question | Answer |
|----------|--------|
| Is the underlying Tower **code** a reasonable foundation for a future commercial Lantern product? | **YES**, with MIT/ISC/Zepto notices retained. Permissive, modifiable, no GPL/AGPL. |
| Are current **assets** reasonable to ship commercially? | **NO.** |
| Overall lab prototype | **YELLOW** (code green; assets mixed; BGM red). |
| Overall commercial-as-is | **RED**. |
| What MUST be replaced or resolved before commercial release? | Donor title/branding; BMQB marks; all unproven art; Caketown BGM; unproven SFX; wenxue (keep omitted); Tower Bloxx naming; original Lantern name/UI; counsel pass on residual look-alike risk. |

Biggest risks, in order:

1. Unattributed **CC-BY-SA** BGM (Caketown / Matthew Pablo).
2. Shipping **unproven** art/SFX as if they were MIT-original.
3. **BMQB / 贝米钱包** trademarks in the asset tree.
4. **Tower Bloxx** inspiration + crane-stacking presentation if Lantern ships the donor look.
5. Missing cooljs LICENSE file (manageable with ISC notice).

---

## 11. Prompt #134 commercial reskin (2026-08-13)

This section records what changed after the #127 inventory. Historical tables above describe the **pre-reskin** snapshot.

### 11.1 What was kept (code / notices)

- Tower MIT gameplay (`donor/src/`, `donor/dist/main.js`) — mechanics unchanged.
- cooljs ISC (bundled in `dist/main.js`).
- Zepto MIT (`donor/assets/zepto-1.1.6.min.js`).
- Lantern Game Bridge / paid-start / leaderboard / economy paths.
- `LICENSE`, `donor/LICENSE`, this file, `THIRD_PARTY_NOTICES.md`.
- Internal catalog id `tower`.

### 11.2 Donor visible assets removed from shipping runtime

Deleted from `donor/assets/` (no longer present on disk):

- BMQB / 贝米钱包 logos: `main-index-logo.png`, `main-loading-logo.png`
- Donor title / start / loading / share / favicon / unused rope: `main-index-title.png`, `main-index-start.png`, `main-loading.gif`, `main-bg.png`, `main-share-icon.png`, `favicon.png`, `rope.png`
- Donor modal chrome: `main-modal-bg.png`, `main-modal-over.png`, `main-modal-again-b.png`, `main-modal-invite-b.png`, `main-modal-close.png` (if present)
- Caketown BGM: `bgm.mp3`, `bgm.ogg`
- Donor SFX: `drop.mp3/.ogg`, `drop-perfect.mp3/.ogg`, `rotate.mp3/.ogg`, `game-over.mp3/.ogg`
- Temporary Play card: `app/assets/tower-card.png`, `assets/tower-card.png`

`donor/index.html` is no longer a playable donor splash. It is a short provenance stub pointing at LICENSE and the Lantern Stack player.

### 11.3 Original Lantern replacements

- Working public title: **Lantern Stack** (not a trademark-clearance claim).
- Visual concept: nighttime school-tech arcade — navy sky, glowing windows, geometric floors, Lantern blue/gold accents. Generated in-repo by `lantern-art/generate-assets.py` (PNG from original primitives; no donor tracing).
- Engine filenames retained (`background.png`, `block.png`, `hook.png`, `c1–c8`, `f1–f7`, HUD sprites) so `dist/main.js` paths still resolve; **file contents are Lantern-owned replacements**.
- UI chrome: CSS in `app/games/tower/index.html` (loading, landing, result). Parent Play shell still owns paid Start / result / Play Again.
- Audio: original Web Audio API tones in `lantern-stack-audio.js` (drop, perfect, rotate, game-over). **No BGM.** Hosted game sets `soundOn: false` so cooljs does not fetch MP3s.
- Canvas HUD font default changed from `wenxue` to `Arial` in `donor/src/utils.js` and `donor/dist/main.js`.
- Play card: `assets/lantern-stack-card.png` (same generator). A later custom illustration may replace this raster.

### 11.4 Runtime third-party remaining

| Item | Role | License | Shipping? |
|------|------|---------|-----------|
| Tower JS mechanics | Gameplay | MIT (BMQB, Inc 2018) | Yes — notices retained |
| cooljs | Canvas engine inside `dist/main.js` | ISC | Yes — notice retained |
| Zepto 1.1.6 | DOM helper | MIT | Yes — notice retained |
| Donor PNG/GIF/MP3/OGG | Art/audio | Unproven / Caketown CC-BY-SA | **No — removed** |
| wenxue webfont | Font | None | **No — never shipped; code no longer requests it** |
| Google Analytics | Tracking | n/a | **No** |
| Caketown | BGM | CC-BY-SA 3.0 | **No — removed; notice section marked removed** |

### 11.5 Remaining before main merge (non-code)

- Human selection of a final public name (alternatives listed in the #134 report).
- Optional later custom Play-card illustration (current card is original geometric raster).
- Counsel review of residual stacking-genre look-alike risk (Lantern art is distinct; mechanics are the same genre).
- Do not restore donor art, Caketown, wenxue, Analytics, or BMQB marks.

