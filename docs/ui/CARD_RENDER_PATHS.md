# Lantern — Card render paths & canonical surfaces

**Contract:** One production card system — `LanternCards` in `apps/lantern-app/js/lantern-cards.js` + `lantern-cards.css`. See `docs/archive/CARD_SYSTEM.md` for rail/opened rules.

**Horizontal rail thumbscroll (shared):** `lantern-scroller.js` upgrades hosts to `.lanternScroller`. Scrollbar **thickness** (grab area) is `--lantern-rail-scrollbar-size` in `lantern-header.css`, applied in `lantern-cards.css` under `.wrap.lanternContent .lanternScroller::-webkit-scrollbar{ height: … }`. Not the same as vertical panels in `lantern-store-panel.css` (`.scrollArea` / `.studentDropdown`).

**Opened surface + fullscreen (audit):** `docs/ui/LANTERN_RAIL_OPEN_FULLSCREEN_SYSTEM.md` — single canonical paths vs documented exceptions (e.g. Explore poll overlay).

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

## STEP 2 — Canonical structure (feed / news / poll / mission rail)

**Shared anatomy (rail cards with author or system identity):**

1. **`.exploreCardVisual`** — image/thumbnail + type badge (where applicable).  
2. **`.exploreCardHd` / `.exploreCardHd--preview`** — title.  
3. **`.exploreCardIdentity` / `.exploreCardIdentity--rail`** — **author avatar (image only)** + author label.  
4. **Optional `.lcRailRow--body`** — **`.exploreCaption.exploreCaption--railPreview`** for description/body preview (2-line clamp). **Not** mixed with date/meta.  
5. **`.exploreCardMetaOneLine`** — subordinate single-line metadata (date, category, card_meta, poll detail, etc.) only.  
6. **Type badge** — `TYPE_BADGES` in media area or title row per CARD_SYSTEM.

**Avatar rule (enforced in `lantern-cards.js`):**

- `buildExploreAuthorAvatarHtml(p)` resolves: `avatar_url` | `author_avatar_url` | `custom_avatar` → else **`getDefaultAvatarImageUrl()`** (`default/default_avatar.png` via Worker media) → else **inline SVG** (never blank, never emoji-as-avatar).

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
