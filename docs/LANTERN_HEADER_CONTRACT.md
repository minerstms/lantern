# Lantern Header + Activity Ticker Contract

**Canonical.** Prompt #256. Any future Lantern header or ticker change MUST preserve this contract or update this document intentionally in the same change. Tests in `worker/scripts/header-ticker-contract-256-test.mjs` enforce the invariants below.

This is the source of truth for the global header. Do not fix ticker/header defects screenshot-by-screenshot.

Related (do not override this file):

- `docs/NAVIGATION_CONTRACT.md` — nav labels and capabilities
- `docs/ui/LANTERN_TOP_CHROME.md` — page mount / height tokens
- `worker/marquee-ticker-contract.js` — copy/icons/destinations (eligibility unchanged)

Shared renderers:

- Row 1: `app/js/lantern-ticker.js` + `app/css/lantern-ticker.css`
- Row 2: `app/js/lantern-nav.js` + `app/css/lantern-header.css`

---

## 1. Two distinct header rows

The global header (`#lanternHeader`) has two conceptual rows. Do not merge their responsibilities.

| Row | Mount | Purpose |
|---|---|---|
| 1 | `#lanternTicker` | Compact recent Lantern activity |
| 2 | `#lanternAppBarRoot` | Global navigation / identity / search / filters / school-pride framing |

Invariants:

1. The ticker must never push app-bar controls around.
2. The app bar must never inject activity sentences.
3. Ticker remains one line. App bar remains one 52px row on the shared shell.
4. Display/Hallway TV (`body.page-marquee-only`) may hide the app-bar row; it must not merge ticker copy into nav.

---

## 2. Canonical app-bar shell

Preserve the established layout. Do not redesign navigation here.

**LEFT:** Small Town (`lanternHeaderBrand--town`)

**CENTER / FUNCTIONAL:**

- Lantern dropdown (`#lanternHomeLink` + chevron menu)
- Signed-in display name (`#lanternAppBarContext`)
- Search Lantern (`#lanternExploreSearch`)
- Filters / page-specific controls where appropriate (Explore Filters, Marquee Feed)

**RIGHT:** Big Pride (`lanternHeaderBrand--pride`)

Invariants:

5. Small Town and Big Pride remain exact copy (no punctuation).
6. One shared app-bar renderer (`lantern-nav.js`). No per-page second header.
7. Capability rules stay in `docs/NAVIGATION_CONTRACT.md` (#251 / #253 / #255). Teacher Dashboard must not return.
8. Media Library remains a canonical NAVIGATION item.

---

## 3. Canonical ticker item anatomy

Every activity ticker item MUST render through one canonical item component (`.lanternTickerItem`).

Required anatomy:

`[TYPE ICON] [AUTHOR AVATAR] [TEXT]`

Text anatomy: `Type: Subject — Author`

Example: `📊 [avatar] Poll: What is your favorite sport? — Mr. Begano`

Required structural children (class names are the test surface):

```
.lanternTickerItem
  .lanternTickerItemIcon
  .lanternTickerAvatar
    img.lanternTickerItemAvatar
  .lanternTickerItemCopy
    .lanternTickerItemType
    .lanternTickerItemColon
    .lanternTickerItemSubject
    .lanternTickerItemDash
    .lanternTickerItemAuthor
```

Invariants:

9. Do not construct the visible line as one interpolated text string.
10. Icon slot, avatar slot, and copy slot are all present on every item.
11. Type / colon / subject / dash / author are separate elements when those parts exist.
12. One type, one subject, one author. No duplicate author. No narrative sentences.

Forbidden copy (unless a future event has a contract-approved exception):

- `created` / `reached` / `posted by` / `completed by`
- `got a shout-out from`
- `A student created`

Recognition normalizes to **Shout-Out**.

---

## 4. Spacing is CSS, not strings

Spacing MUST be produced by layout/CSS (`display: flex` / `inline-flex`, `align-items: center`, `gap`, or equivalent).

Do not rely on:

- leading/trailing spaces in strings
- `&nbsp;`
- concatenated text nodes used as spacers
- punctuation plus manually inserted whitespace
- event-specific spacing hacks

Required visual separation:

| Adjacent pair | Rule |
|---|---|
| ICON ↔ AVATAR | compact `gap` on `.lanternTickerItem` |
| AVATAR ↔ TYPE | same item `gap` |
| TYPE: ↔ SUBJECT | copy-slot CSS (gap / margin), not a string space |
| SUBJECT ↔ — ↔ AUTHOR | copy-slot CSS, not `' — '` string padding |
| ITEM ↔ NEXT ITEM | `--lantern-ticker-item-gap` plus a subtle separator |

Invariants:

13. `.lanternTickerItem` is `inline-flex` / `flex` with `align-items: center` and `gap`.
14. `.lanternTickerItemCopy` is `inline-flex` with CSS-controlled piece spacing.
15. `.lanternTickerCopy` and `.lanternTickerTrack` share `--lantern-ticker-item-gap` so the cloned-loop boundary cannot concatenate.
16. Automated tests inspect markup/classes. They must not depend on literal string spaces between pieces.

Contract failures:

- `Mr. Radlereached`
- `Radle🏆`
- `Challenge📊`
- `AuthorPoll:`
- neighboring items appearing as one phrase

---

## 5. Avatar slot is required

Every ticker event renders an avatar slot. Only two acceptable states:

- **A.** eligible approved avatar
- **B.** canonical neutral Lantern silhouette

There is no third state: blank, missing, broken image, zero-width, or omitted element.

Invariants:

17. System / seeded / no-actor events still render the silhouette.
18. Fallback geometry matches the real avatar (same width/height/circle).
19. `onerror` must swap to the silhouette. It must never `display: none` the slot.
20. CSS must not collapse empty/`src`-less avatar images to zero.
21. No `id` on per-event avatars (duplicate IDs break the cloned track).

---

## 6. Canonical avatar resolution

Preserve #252 privacy rules.

Resolve: durable event author identity → eligible canonical active avatar → render.

If no eligible avatar → silhouette.

Invariants:

22. Do not guess identity from display text. `public_display_name = "Mr. Radle"` without a durable actor key MUST NOT resolve to `rick.radle`.
23. Pending, rejected, and restricted avatars never render.
24. Do not read snapshot `avatar_image` / raw R2 / `author_avatar_url` for ticker paint.
25. `author_avatar_key` / `actor_id` are the only lookup keys.

---

## 7. Avatar visual geometry

Ticker avatar uses the existing Lantern author-avatar size token.

Invariants:

26. Circular (`border-radius: 50%`)
27. Fixed width/height: `var(--lantern-content-author-avatar-size, 28px)`
28. `flex: 0 0 auto` (never shrink to zero)
29. `object-fit: cover`
30. Vertically centered with the item
31. Never stretched; never changes ticker row height
32. No event type gets a different avatar size

---

## 8. Icon contract

One icon slot per item. Fixed non-shrinking slot so emoji width cannot destroy spacing.

| Public type | Icon |
|---|---|
| Poll | 📊 |
| Mission | 🎯 |
| Leaderboard | 🏆 |
| Shout-Out | 📣 |
| Post | 📰 |
| Photo | 📸 |
| Good News | ⭐ |

Invariants:

33. Recognition uses the Shout-Out icon.
34. Icon slot is `flex: 0 0 auto` with a fixed box.
35. Decorative type icons are `aria-hidden`.

---

## 9. Subject length and wrapping

The ticker scrolls horizontally. Do not aggressively truncate useful subjects.

Invariants:

36. `.lanternTickerItem` and copy use `white-space: nowrap`
37. Source titles normalize unexpected whitespace/newlines to single spaces
38. Embedded line breaks must not increase header height
39. Pathological values are sanitized; useful titles are not hard-clipped to a short character cap

---

## 10. Ticker track and clones

Preserve current scrolling mechanics: continuous horizontal motion, hover pause, configured px/sec speed, repeated-stream behavior.

Invariants:

40. The repeated copy uses the same item component and the same resolved avatar markup.
41. Avatar resolution happens before cloning, or hydration uses `querySelectorAll` / data attributes against every copy.
42. The clone exists only for animation and is `aria-hidden` so screen readers do not hear the stream twice.
43. Avatar `alt=""` — visible copy already names the author.
44. Loop-boundary gap equals in-stream item gap. No spacing jump. No concatenated author→next-icon.

---

## 11. Responsive

45. Desktop: two compact header rows.
46. Chromebook/laptop: app-bar controls remain usable.
47. Phone/narrow: follow established hide/wrap rules (brands hide at 1100px; search collapses). Do not increase header height to solve ticker spacing.
48. Ticker stays one line. Icon/avatar must not shrink to zero to preserve text.

---

## 12. Authority

These invariants are the header/ticker source of truth. Screenshot review is acceptance evidence, not the contract.
