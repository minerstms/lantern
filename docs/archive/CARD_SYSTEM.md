# Lantern Card System — CONTRACT

This document is the **constitutional contract** for the Lantern card system. It is not guidance. It is law.

---

## There is exactly ONE production card system

Lantern has **one** production card system. There are no alternate card systems. There are no legacy card shells that may be used for production content. Any UI that displays a "card" (rail preview or opened detail) to the user MUST use this system.

---

## All production cards MUST be rendered by lantern-cards.js

- **Renderer:** `apps/lantern-app/js/lantern-cards.js` (`window.LanternCards`).
- Every production card (rail or opened) MUST be produced by calling the appropriate function on `LanternCards` (e.g. `createFeedPostCard`, `buildNewsRailCardHtml`, `buildNewsOpenedCardHtml`, `createPollRailCard`, `buildMissionSpotlightRailElement`, `buildIconRailCardHtml`, `buildActivityPulseCardHtml`, `buildMissionDraftCardHtml`).
- No other module may output production card HTML.

---

## No page may emit hand-built production card HTML

- Pages MUST NOT concatenate or build card shell HTML (e.g. `<div class="exploreCard">...</div>`) by hand for production content.
- The only valid way to get production card markup is to call `LanternCards` and use the returned element or HTML string.
- Exception: see **Break-glass protocol** below.

---

## No page may define structural card-shell CSS

- Structural CSS for the card shell (`.exploreCard`, `.exploreCard--rail`, `.exploreCard--opened`, `.exploreCardVisual`, `.exploreCardHd`, `.exploreCardIdentity`, `.exploreCardMetaOneLine`, `.exploreCardTypeBadge`, `.lanternBadge`, avatar sizes, base spacing and radius for cards) MUST live only in the **shared card stylesheet**: `apps/lantern-app/css/lantern-cards.css`.
- Pages MAY define layout-only CSS (grids, rails, scrollers, containers, page-specific wrappers). They MUST NOT redefine card structure, card dimensions, or card internals.

---

## No inline geometry styles are allowed in renderer output

- The card renderer (`lantern-cards.js`) and any module that produces markup consumed inside cards (e.g. `lantern-media.js` for media blocks) MUST NOT emit inline `style="..."` for geometry or typography.
- Forbidden inline styles include: `width`, `min-width`, `max-width`, `height`, `min-height`, `max-height`, `font-size`, layout spacing (e.g. `margin`, `padding` for layout).
- All such presentation MUST be achieved via classes defined in the shared card stylesheet (or other shared CSS). Inline styles are permitted only for dynamic values that cannot be expressed in CSS (e.g. `src`, `href`, `poster`, `data-*`).

---

## Badge system is centralized and fixed

- All badge HTML (type badge, curation badge, and where applicable author badge) MUST be created inside `lantern-cards.js`.
- No page may emit badge markup for production cards.
- All badge CSS MUST live in the shared card stylesheet.
- Allowed badge types:
  - **Type badge** — visual corner badge (e.g. 📷, 📊) on the card visual. Rendered by the card renderer.
  - **Curation badge** — title-row badge (e.g. 🏆 Pick, 🌟 Featured). Rendered by the card renderer.
  - **Author badge** — optional; if present, it is formalized in the renderer and styled in the shared stylesheet. No other badge types are allowed.

---

## Only two modes exist: rail and opened

- **Rail** — preview strip/list card. Structure: media area, optional type badge, title, one metadata line. No long body, no reaction buttons, no voting controls on the face.
- **Opened** — full detail shell (extended copy, identity rows, etc.). Used inside modals and studio previews only, not as a face card in feeds.

Any other mode is forbidden. The renderer throws if given an invalid mode.

---

## Composite content panels are forbidden

Composite content panels that visually function as cards are forbidden. A section may contain heading/helper/layout only. Growth happens by adding cards, not by inventing new card-like containers. If it looks like a content object (a playable item, a content unit, a learning surface, a “card” of anything), it MUST be rendered as a legal Lantern card through `apps/lantern-app/js/lantern-cards.js`.

---

## Break-glass protocol for exceptions

- The only way to introduce a one-off card-like surface that is not produced by `LanternCards` is:
  1. Document it in this file under a **Break-glass exceptions** section with a short justification and an expiration or review date.
  2. Ensure it does not become a parallel production system (e.g. demo-only, internal tool only).
- Absent a documented break-glass exception, the rules above apply with no exceptions.

---

## Violations

A violation occurs if:

- A card contains interactive buttons on the face (rail).
- A card contains full content text on the face (rail).
- A card contains more than one metadata row on the face (rail).
- A page builds production card HTML outside the shared renderer.
- A page defines structural card-shell CSS.
- The renderer or media module emits inline geometry/typography styles.
- A second production card vocabulary (e.g. `.lanternCard` as a parallel shell) is used for production.

Violations MUST be removed, not worked around.

---

## Canonical references

- **Renderer:** `apps/lantern-app/js/lantern-cards.js`
- **Shared card CSS:** `apps/lantern-app/css/lantern-cards.css`
- **Detail modal (opened) UI:** `apps/lantern-app/js/lantern-card-ui.js` (consumes renderer output; overlay/modal structure may be in shared CSS)
