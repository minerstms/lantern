# Tower / Stack Lab — GAME_PROVENANCE

**Internal game id:** `tower`
**Working title:** Stack Lab (development only; not the final public name)
**Adoption date:** 2026-08-13 (Lantern platform integration); 2026-08-13 (commercial presentation reskin)
**This file records facts, not a legal opinion or trademark clearance.**

Cloudflare Pages serves the static `app/` tree. Unused files under `app/` are still publicly retrievable after deploy. Donor media is therefore **not** retained here.

---

## 1. Upstream donor (code only)

| Field | Value |
|---|---|
| Repository | https://github.com/iamkun/tower_game |
| Exact commit | `c6fa84afe179b661fa71cf7cc8788d0c47ca2875` (2018-07-12) |
| GitHub archive | https://github.com/iamkun/tower_game/archive/c6fa84afe179b661fa71cf7cc8788d0c47ca2875.zip |
| Upstream LICENSE | MIT (`Copyright (c) 2018 BMQB, Inc`) |
| package.json license field | ISC (inconsistent with LICENSE file; LICENSE is the grant) |
| Upstream author | iamkun |
| README inspiration note | “inspired by `Tower Bloxx Deluxe Skyscraper` from `Ketchapp`” — documentation only; not used as product branding |

Donor **source code** is retained under `donor/src/` and the bundled engine under `donor/dist/main.js`.

Donor **media is not retained** in the shipping tree. Provenance of removed media is recorded by **filename + SHA-256** (computed from this repo at integration commit `7566e5a45e9c44e63bf67720e6e76d4e81ba8f8f`, which still contained the vendored donor files). Do not restore those files into `app/`.

---

## 2. Donor media removed from the shipping tree (2026-08-13)

All hashes below are SHA-256 of the bytes that were deleted from `app/games/tower/donor/assets/`.

### 2.1 Branding / title / chrome

| File | SHA-256 | Reason removed |
|---|---|---|
| main-index-logo.png | `4c14d90f0d362b9cd69caafd13935b416372c8a7143868642582980408379270` | BMQB / 贝米钱包 logo — not Lantern branding |
| main-loading-logo.png | `a22f4e66390461ea940d6378a8be3bf07dc8e6d9052cb2e6bf9f61a78c252a2b` | BMQB loading logo |
| main-index-title.png | `eceaf269d40ca4dbea2ad314e45d50800f3e5e839aa5995b20c60da5b5cfcce9` | Donor Chinese title artwork |
| main-index-start.png | `53ef18e7dff38b57c018497576b2b4cc93fac676aca0125d673401cd798c374a` | Donor START bitmap |
| main-bg.png | `c55f8efbdbc7f035833711587c8b52f3ff9fe6115d495ae4429af5365de2ff35` | Donor score plate / HUD chrome |
| main-modal-over.png | `f44d18faa6fc4543cc312ddb5c4a455e58ac63252afeb3502ea4869568551ecf` | Donor Game Over chrome |
| main-modal-again-b.png | `0ee7cc333044b05be2235a46e9a8a7da978947741d4e6708273402aecd7a8eb6` | Donor replay bitmap |
| main-modal-invite-b.png | `f8697fb88dc9869bfb364a599e1d37a41a7ea34c94cc09e7f2f9aee459e3890b` | Donor share / invite UI |
| main-modal-bg.png | `75efe71f044caba2b0d4d277fb84cd6a3723b6d07ff8009964906d80158082d2` | Donor modal background |
| main-share-icon.png | `689651f94b3c9a7485e871acce547cbcf997baf2b29891ba9546a07f59108c93` | Donor share icon |
| main-loading.gif | `df5e62b6217159f4af9e3246b12b41143be1dbac8ebdcbdc9afcf8e09c657244` | Donor loading animation |
| favicon.png | `a2cbf84bcd38957e583dd4f7fced8305c1e2d82760304edcac99a96bcdc98db7` | Donor favicon |

### 2.2 Audio

| File | SHA-256 | Known facts | Reason removed |
|---|---|---|---|
| bgm.mp3 | `71c4afb439fdfc66d939a16959e059223e404e59bdd431b1ec15a072751ad87f` | ID3: Matthew Pablo / **Caketown** (2012); OpenGameArt **CC-BY-SA 3.0**; donor shipped **without attribution** | Share-alike + missing attribution; not approved for product |
| bgm.ogg | `d8ad4cf11158efdb68720258b8fe49d06bb42667c580a73010d3bfa0600e84d7` | Same Caketown track, OGG container | Same |
| drop.mp3 | `df1fcf83304fc4afac4a641a63ac6c3f7208c587fba9c3ad17bdf2ae3eb9a041` | Unknown composer/license | Unclear provenance |
| drop.ogg | `dbbdab0a4fb3d4b84022528631737e5f72668a2a759e86fb5427b28127d5a336` | Unknown | Unclear provenance |
| drop-perfect.mp3 | `0063a834df5762c920cfe02fa404ab888873614052e2cd3948729ae9ae4c87e4` | Unknown | Unclear provenance |
| drop-perfect.ogg | `3d635d48e4b74d67c2d87eca3e9591420960611a94e718b0148405ac792f0fca` | Unknown | Unclear provenance |
| rotate.mp3 | `f1724e1fbaf61df2e9df425d0158b649fd640f723d176c069c2eba56ebf03e1e` | Unknown | Unclear provenance |
| rotate.ogg | `edf1e48eb7ebec8ddf1a129a75401de96f4ea77c4af95043d207d24dcf155665` | Unknown | Unclear provenance |
| game-over.mp3 | `c3c7ab3c934d0616664c4f89cef988e952df88ce790f2679cfae66137334236e` | Unknown | Unclear provenance |
| game-over.ogg | `5ae4adc0c694be0cc21446c59aa8b96934fbf5a25085d01436e5f09829624504` | Unknown | Unclear provenance |

### 2.3 Gameplay art (unclear provenance)

| File | SHA-256 |
|---|---|
| background.png | `9e86b1bdb3978443deb2e385eae13fb72160df9973048fddf8053eb74d7b0b6c` |
| hook.png | `d6ca55bb4d7c59f6fff0c2d0ddf630b33bfe1c437041f7b51069fe8f04c6ccce` |
| block.png | `c309200d8633d175401c28bb30e6de1d0e090e51300962d565bd3a14ce727cbb` |
| block-perfect.png | `5c06aeea16df18a424b3eaa1bb13df1d30357e91e27d48662894dd3687b9451b` |
| block-rope.png | `c44944a8763368784b4f5b8d0fa0ce2e7e50478e343bc5111b884a6d4e41da2a` |
| rope.png | `03b1760d472342aefbc0388227168faac8c148ad8b209402efeeff3d2f73200e` |
| heart.png | `3b61018def7541d6ba6db75edd8508587f71b8399fe6857f02deed11c1e5103e` |
| score.png | `9ae31b79432a80ce36822759de56450f52074bf26b8789e2ef20cd1fcf4032e8` |
| tutorial.png | `0849d4bab60d9be8944e63b83622af5875603761dadafa84afb75c963e608379` |
| tutorial-arrow.png | `80c79c9cae6b34558b302d22d3d3a0c24468bf7875d5a507eb60a622af7e73aa` |
| c1.png | `b5eb007cc03107f731bd865d26e34587bf725043e4944d98e25cbc0f5d4f366a` |
| c2.png | `57a0ab5220e51ad01ba8be2bceef4d61ae733573aee182c1621821d4d79589d4` |
| c3.png | `1ea6021cb8af0e337e80f141f28430cbbe237a0e495e9a1e53c7db59d69b5d0b` |
| c4.png | `bb2f173e6d75130b69db462c0fefdd3eef6200511ae36f962b0653d8b36fc50c` |
| c5.png | `b5d100229c0c05cd99feeb5c9fc8ac37728bf149165ca48b4bb08f2f3adcd83d` |
| c6.png | `ed730b613663e0d7dbd7359e495f36911cc04e9075c88d07c28ff602f125a787` |
| c7.png | `638ba62d1b4884cfb4da2f36626e00cae75e611d947170fe15b87e5b6a3d9c36` |
| c8.png | `a5b8444f8097c73e58f860ad7d2339566cbc3cc7962754f2d28b54ca3ad53fdc` |
| f1.png | `49d58c3924f95e650b6ea9b88d87484229047afa31c535731484fb64e2b3392f` |
| f2.png | `9a919a0f30dd4ad62393a1ffe4fe939a3234932c2619472103c5a161bd6e7466` |
| f3.png | `9c667dfe2b556a0d7a87f49ae2bfa7c73798d2a8db6d916c8c16a87b7da1fa28` |
| f4.png | `474993936daabb1a0543a4127b77662a83634725ba5dfefde75016563fc1d13e` |
| f5.png | `474993936daabb1a0543a4127b77662a83634725ba5dfefde75016563fc1d13e` |
| f6.png | `8e7bf767c26fb51480b89494401b9d422588b1e735993c047df2d4123b2e6145` |
| f7.png | `e0d7630161ef5c56c3ffeda63ea0faf5264b710dd1ab708eac201fcbe829f156` |

`2-2.gif` was listed in some upstream inventories. It was **not** present in the vendored snapshot at integration commit `7566e5a` and is not in the shipping tree.

### 2.4 Font

wenxue.ttf / .woff / .eot / .svg were **never vendored**. Engine default font is now `Arial, Helvetica, sans-serif`. No `@font-face`. No font file under `app/games/tower/`.

### 2.5 Analytics

Donor `index.html` (deleted from shipping tree) loaded Google Analytics `UA-80834434-1`. Remaining donor JS has no GA loader. Hosted `index.html` does not load analytics.

### 2.6 Relocated permitted code (not media)

| File | SHA-256 | Notes |
|---|---|---|
| zepto-1.1.6.min.js | `45a775773d8784f7ba019aa68e2af4e4a8a7e29dbbff5fbfb0252530239f75c8` | MIT code; now shipped at `vendor/zepto-1.1.6.min.js` (same bytes) |

---

## 3. Lantern-owned replacements (this reskin)

| Slot | Replacement | Provenance |
|---|---|---|
| All engine image keys | `lantern-sprites.js` — canvas-generated data URLs | Original Lantern code in this repo |
| Audio | `lantern-sfx.js` — Web Audio oscillators | Original Lantern code; **no BGM** |
| Play card | `app/assets/tower-card.png` | Original Lantern PNG (navy stacked floors, 1200×675) |
| Host chrome | Lantern Game Player (`towerGameResult`, paid Start) + lab CSS Begin | Lantern |
| Font | Arial / Helvetica / sans-serif | System |
| Favicon | `/assets/favicon.png` (Lantern site favicon) | Existing Lantern asset |

Visual concept: nighttime skyline / school-tech arcade — dark navy, stars, glowing windows, Lantern blue `#5aa7ff`. Not a recolor or trace of donor sprites.

---

## 4. Remaining third-party **runtime CODE** (cleared with notices)

| Component | License | Location |
|---|---|---|
| Tower gameplay engine | MIT, Copyright (c) 2018 BMQB, Inc | `donor/src/`, `donor/dist/main.js` |
| cooljs (bundled inside dist) | ISC, iamkun | no separate LICENSE file upstream |
| Zepto 1.1.6 | MIT, Thomas Fuchs 2010–2014 | `vendor/zepto-1.1.6.min.js` |

Lantern files: `index.html`, `lantern-adapter.js`, `lantern-sprites.js`, `lantern-sfx.js`.

---

## 5. Remaining third-party **runtime MEDIA**

**None.** No donor PNG/GIF/MP3/OGG/ICO/TTF ships under `app/games/tower/`.

The only `.mp3` under the Pages `app/` root is `app/assets/cha_ching.mp3` (existing Lantern store SFX, unrelated to Tower).

---

## 6. Lantern modifications (code)

- Same-origin iframe + `lantern-adapter.js` (paid-start gated; parent posts leaderboard; 10 floors = qualifying win).
- `pathGenerator` redirected to `window.LanternTowerAssets.url` (Lantern sprites).
- Default canvas font: Arial stack (no wenxue).
- `soundOn: false`; `playAudio` replaced by Web Audio; donor `addAudio` resource registration removed.
- Donor title/start/replay/share/game-over DOM removed from hosted `index.html`.
- Donor `index.html` and entire `donor/assets/` directory removed from shipping tree.
- Zepto served from `vendor/` (same MIT file, new path).
- Google Analytics omitted.

---

## 7. What this file does not claim

- No trademark clearance for any public name.
- No claim that donor **art/audio** is licensed for product use (it was removed).
- No claim that remaining MIT/ISC **code** licenses were independently re-audited beyond the texts in `LICENSE` / Zepto header / cooljs header.
