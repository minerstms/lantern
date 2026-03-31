# Lantern — Top chrome (ticker + app bar)

**Scope:** Fixed header stack only (`#lanternHeader`). Does not cover cards, rails, or page body layout.

**Source of truth for layout tokens:** `apps/lantern-app/css/lantern-header.css`  
**Source of truth for app bar UI:** `apps/lantern-app/js/lantern-nav.js` (injected styles + `#lanternAppBarRoot` HTML)

---

## Phase 1 — Audit (student-facing + related shells)

Legend: **T** = ticker present, **H** = header height token, **Std** = matches canonical shell.

| Page | Ticker | Header height (CSS token) | Dropdown | Search | Avatar / help | Matches standard? |
|------|--------|---------------------------|----------|--------|---------------|-------------------|
| explore.html | Yes | `--lantern-header-h-ticker` (100px) | `lantern-nav.js` | Yes | Yes | Yes — reference |
| games.html | Yes | ticker + bar | same | same | same | Yes |
| missions.html | Yes | ticker + bar | same | same | same | Yes |
| contribute.html | Yes | ticker + bar | same | same | same | Yes |
| school-survival.html | Yes | ticker + bar | same | same | same | Yes |
| grades.html | Yes | ticker + bar | same | same | same | Yes |
| thanks.html | Yes | ticker + bar | same | same | same | Yes |
| verify.html | Yes | ticker + bar | same | same | same | Yes |
| locker.html | Yes | `--lantern-header-h-ticker` | `lantern-nav.js` | Yes | Yes | Yes |
| news.html | Yes | `--lantern-header-h-ticker` | same | same | same | Yes (stub) |
| display.html | Yes | ticker + bar | same | same | same | Yes — projector UI, same shell |
| teacher.html | Yes | ticker + bar | same | same | same | Yes — staff |
| staff.html | Yes | ticker + bar | same | same | same | Yes — staff |

**No app chrome (excluded):**

| Page | Reason |
|------|--------|
| index.html | Redirect stub only; no shell |
| store.html | Separate / legacy surface; no `#lanternHeader` |
| class-code.html | Standalone flow; no shared shell |
| locker-sources/store.full.html | Embed / fragment; may hide header in embed mode |

---

## Phase 2 — Canonical standard

### Ticker presence

- Any page that mounts **`#lanternAppBarRoot`** and loads **`lantern-nav.js`** for the full app bar MUST also:
  - Link **`css/lantern-ticker.css`** (before `lantern-header.css`, matching `explore.html`).
  - Include **`#lanternTicker`** as the **first** child of **`#lanternHeader`**, then **`#lanternAppBarRoot`**.
  - Load **`js/lantern-ticker.js`** after **`lantern-nav.js`** (same relative order as `explore.html`).
  - Set **`body` class `page-has-ticker`** so `.lanternContent` uses `padding-top: calc(var(--lantern-header-h-ticker) + var(--lantern-space-below-header))`.

### Header height

- **App bar row:** fixed **52px** inside `.lanternAppBarInner` (`lantern-nav.js`): `height` / `min-height` / `max-height: 52px`.
- **Global offset:** `--lantern-header-h: 52px` (bar only); `--lantern-header-h-ticker: 100px` (ticker strip + bar), defined in `lantern-header.css`.

### Vertical padding

- Below fixed chrome: **`--lantern-space-below-header`** (24px) on `.lanternContent`.

### Dropdown / search / avatar

- **Single implementation:** `lantern-nav.js` only (brand + chevron, search, bell, avatar dropdown, help slot). No per-page overrides for these controls.

---

## Phase 3 — Minimum safe fix (applied)

- **locker.html** (via `build-locker.cjs`): add ticker stack, `page-has-ticker`, stylesheet + script to match `explore.html`.
- **news.html**: same alignment (stub page, but uses `lantern-nav.js`).

No new nav system, no redesign — HTML shell + assets only.
