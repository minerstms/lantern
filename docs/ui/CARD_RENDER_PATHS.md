# Lantern — Card render paths & canonical surfaces

**Contract v2 (2026-08): ONE COMPACT PRODUCTION CARD FACE.**

- **Renderer:** `app/js/lantern-cards.js` (`LanternCards`, `CARD_CONTRACT_VERSION = '2'`).
- **Compositor:** `buildCanonicalCardFaceHtml(model)` — all compact faces flow through one 280px × 16:9 landscape shell (`.exploreCard.lanternCanonicalCard`).
- **Feed adapter:** `app/js/lantern-feed-card.js` (`LANTERN_FEED_CARD.buildCard`) normalizes feed items and delegates to `LanternCards` — **no production `.feedCard` shell**.
- **Styles:** `app/css/lantern-cards.css` (`--lantern-card-width`, `--lantern-card-aspect-ratio`).
- **Enforcer:** `app/js/lantern-canonical-enforce.js` — rejects v1 row grammar, `.feedCard` roots, and non-16:9 faces.
- **Detail surfaces:** reactions, teacher comments, full body — `feedDetailOverlay` / `.lanternDetailSurface` (not compact card faces).

**Horizontal rail thumbscroll (shared):** `lantern-scroller.js` upgrades hosts to `.lanternScroller`. Fixed-width v2 cards in rails and grids.

**Opened surface + fullscreen (audit):** `docs/ui/LANTERN_RAIL_OPEN_FULLSCREEN_SYSTEM.md`

---

## Legacy note (v1 — removed from production render path)

Prior 420px portrait rail + 128px media strip + `.exploreCardRailStack` / `.lcRailRow` grammar is **not** the active compact-face path. Archived reference: `docs/archive/CARD_SYSTEM.md`.

---

## STEP 1 — Card render paths (inventory)

| Path | Entry API | Used for |
|------|-----------|----------|
| `createFeedPostCard` | `LanternCards.createFeedPostCard` | Explore “New” rail, Locker/profile rails, verify stress tests |
| `buildFeedPostParts` | internal | `CARD_MODE.RAIL` vs `CARD_MODE.OPENED` body HTML |
| `buildNewsRailCardHtml` | `LanternCards.buildNewsRailCardHtml` | Explore happening news rail, contribute studio rail |
| `buildNewsOpenedCardHtml` | `LanternCards.buildNewsOpenedCardHtml` | Contribute preview, teacher moderation preview |
| `buildPollRailCardHtml` / `createPollRailCard` | same | Explore polls rail, contribute poll rail |
| `buildPollDraftOpenedPreviewHtml` | same | Contribute **poll modal preview** (modal layout, not `.exploreCard` rail) |
| `buildMissionSpotlightRailElement` | same | Explore mission spotlight rail |
| `buildMissionDraftCardHtml` | same | Teacher moderation mission body, contribute mission preview |
| `buildIconRailCardHtml` | same | Profile/icon rails (emoji visual — **non-identity** game/surface type) |
| `buildGameHubRailCardHtml` / `buildWeeklyPaceLinkCardHtml` / `buildGamesLeaderboardSummaryCardHtml` | same | **Games** hub — icon/game visuals, not author identity |
| `buildLinkCardHtml` | same | Game highlight links on Explore |
| `buildActivityPulseCardHtml` | same | Activity pulse rail |
| `LanternMedia.renderMedia` + `buildGuaranteedExploreImageHtml` | internal | Thumbnail / media area for posts & news |

**Inline / non-LanternCards (by design or legacy):**

- `explore.html` — `buildLinkCardHtml` inner HTML for weekly pace (still wrapped by `LanternCards.buildLinkCardHtml`).
- `games.html` — passes trusted `bodyHtml` into `buildGameHubRailCardHtml` only inside the canonical shell.

---

## STEP 2 — Canonical v2 compact face structure

**Shared anatomy (all compact production faces via `buildCanonicalCardFaceHtml`):**

1. **`.exploreCard.lanternCanonicalCard[data-lantern-card-surface="face"]`** — 280px × 16:9 shell; `data-lantern-card-contract-version="2"`.
2. **`.lanternCanonicalCardFrame`** — absolute fill; image or fallback only (no normal-flow body below).
3. **`.lanternCanonicalCardImage`** — `object-fit: cover`, `loading="lazy"`, `decoding="async"`, one-time `onerror` → type SVG → universal SVG.
4. **`.lanternCanonicalCardOverlay`** — bottom gradient + caption block.
5. **`.lanternCanonicalCardTitle`** — 2-line clamp.
6. **`.lanternCanonicalCardMeta`** — author/source + date/status (single line).
7. **`.lanternCanonicalCardBadgeLayer`** — optional type/state badges.

**Detail surfaces (not compact faces):** `.lanternDetailSurface`, `#feedDetailOverlay`, `.exploreCardVisual` in opened/moderation views — full body, reactions, teacher comments live here only.

---

## STEP 3 — Variants removed / unified

- **Feed post rail:** no longer author-only meta line without avatar; identity row always includes image avatar.  
- **Feed post opened:** emoji avatar removed; same `buildExploreAuthorAvatarHtml` pipeline.  
- **News rail / opened:** 📰 emoji removed from identity; image avatar + optional `authorAvatarUrl` from callers.  
- **Poll / mission spotlight rails:** identity row + default or author avatar when `author_name` present.

**Intentionally separate (not “feed identity” cards):**

- **Games hub / icon rails** — `buildIconRailCardHtml`, `buildGameHubRailCardHtml`: **icon or image** in visual area; not student identity. Do not force author avatar here (would be wrong UX).  
- **Poll modal preview** — `buildPollDraftOpenedPreviewHtml`: modal markup for studio; not a rail card.

---

## STEP 4 — Avatar pipeline

- **Explore** — `enrichFeedAvatarsThenRenderAll` sets `custom_avatar` from `LanternAvatar.getCanonicalAvatar` (unchanged).  
- **`resolvePrimaryAvatarUrl`** also reads `avatar_url` / `author_avatar_url` when API adds them.  
- **Contribute / teacher** — pass `authorAvatarUrl` into `buildNewsOpenedCardHtml` when known (`custom_avatar` from adopted character or moderation row).

---

## Files touched (this pass)

- `apps/lantern-app/js/lantern-cards.js` — avatar helpers, rail/opened/news/poll/mission/mission-draft updates.  
- `apps/lantern-app/css/lantern-cards.css` — `.exploreCardIdentity--rail` sizing.  
- `apps/lantern-app/contribute.html` — `authorAvatarUrl` for news/profile opened previews.  
- `apps/lantern-app/teacher.html` — `authorAvatarUrl` for moderation news preview.  
- `docs/ui/CARD_RENDER_PATHS.md` — this document.
