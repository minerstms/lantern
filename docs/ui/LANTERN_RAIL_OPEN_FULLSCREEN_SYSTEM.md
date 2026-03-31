# Lantern — One rail system, one opened surface, one fullscreen media (audit)

**Purpose:** Single reference for **what is unified today**, **what is intentionally parallel**, and **what would need a follow-up slice** to merge. Complements `docs/LANTERN_SYSTEM_CONTEXT.md` §10–§11 and `docs/ui/CARD_RENDER_PATHS.md`.

**Behavioral reference for “opened post”:** Explore → news / Latest Posts → `LanternCardUI.openNews` → `#lanternCardDetailOverlay` (announcements and feed items that use the same path).

---

## 1. Horizontal rail / thumbscroll — unified

| Layer | Source of truth |
|--------|-----------------|
| JS class + markers | `apps/lantern-app/js/lantern-scroller.js` — `LanternScroller.mountStudentScroller`, `[data-lantern-rail-host]` upgrade |
| CSS | `apps/lantern-app/css/lantern-cards.css` — `.wrap.lanternContent .lanternScroller` + scrollbar token `--lantern-rail-scrollbar-size` from `lantern-header.css` |
| Enforcement | `apps/lantern-app/js/lantern-canonical-enforce.js` — `.lanternScroller` + `data-lantern-rail` / `data-lantern-thumbscroll` / `data-lantern-brand` |

**Used by:** Explore, Missions, Games, Locker (Overview rails, Store rails, Items dynamic rails), Verify stress rows, Contribute mission/stream rails — all hosts upgraded to the same class/DOM contract.

**Documented exceptions (not a second rail engine):**

- **Contribute studio mock strip** (`#studioMockScroller`): narrower **card** band only; still LanternCards + shared tokens where applicable. See `docs/LANTERN_SYSTEM_CONTEXT.md` §10.
- **Vertical** scroll areas (e.g. Store panel `.scrollArea`, dropdowns in `lantern-store-panel.css`): **not** the horizontal rail system; different axis and selectors.

---

## 2. Opened-card / preview surface — mostly unified

| Path | Entry | Shell |
|------|--------|--------|
| News / feed post (Explore, etc.) | `LanternCardUI.openNews` | `#lanternCardDetailOverlay` + `fillNewsDetailModal` |
| Creation post | `LanternCardUI.openCreation` | Same overlay + `fillCreationDetailModal` |
| Contribute / embedded preview | `mountNewsDetailInto`, `mountCreationDetailInto` | Same **DOM contract** (`.lanternCardDetailModal--embedded`), no full-viewport shell |
| Text-only (e.g. Locker spotlight placeholder) | `LanternCardUI.openTextDetail` | Same `#lanternCardDetailOverlay`, simplified rows |
| Poll **preview** (Contribute) | `mountPollOpenedInto` | `.pollModal.lanternSurface` **inside a container** — not the global overlay |
| Poll **interactive** (Explore) | `LanternCardUI.openPoll` | Same **`#lanternCardDetailOverlay`** + `fillPollDetailModal` + `wireOpenedPostMediaInteractions` (poll image uses detail media markup for fullscreen) |

**Canonical implementation file:** `apps/lantern-app/js/lantern-card-ui.js` (`window.LanternCardUI`).

---

## 3. Fullscreen media (second step after opened post) — unified

| Concern | Source of truth |
|---------|----------------|
| Overlay DOM + Escape order | `apps/lantern-app/js/lantern-card-ui.js` — `openMediaFullscreen`, `closeMediaFullscreen`, `wireOpenedPostMediaInteractions` |
| CSS | `apps/lantern-app/css/lantern-cards.css` — `.lanternMediaFullscreenOverlay`, `.lanternMediaFullscreenClose`, etc. |
| Thumbnail HTML in opened post | `apps/lantern-app/js/lantern-media.js` — `renderMedia(..., { variant: 'detail' })` |

**Rule:** Student-facing “tap media → fullscreen” for opened news/creations/polls goes **only** through `wireOpenedPostMediaInteractions` → `openMediaFullscreen`. No second fullscreen stack for that flow.

**Outside this stack:** Teacher review / other pages may show large media differently; that is **not** the student Explore opened-post path.

---

## 4. Card click → open (interaction)

- **LanternCards** wires activatable cards to caller **`onActivate`** or default navigation; Explore binds **`LanternCardUI.openNews` / `openCreation`** for feed and news.
- **Poll cards** on Explore call **`LanternCardUI.openPoll(poll.id, { characterName })`** (same overlay stack as news/creation).

---

## 5. Follow-up

1. **Teacher / moderation** previews: align on `fillNewsDetailModal` / same media helpers where not already.
2. Keep **one doc** (this file) updated when a parallel surface is removed or merged.

---

## 6. Accessibility

Shared rail thumb thickness: **`--lantern-rail-scrollbar-size`** in `lantern-header.css`, applied to `.wrap.lanternContent .lanternScroller` in `lantern-cards.css`. Do not duplicate per-page scrollbar hacks for production rails.
