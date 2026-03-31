# Phase-SP1.5 — Navigation vocabulary cleanup (**merged**)

**Status:** **Executed** — chevron dropdown markup only (`apps/lantern-app/js/lantern-nav.js`).  
**Parent program:** Surface / Panel adjacent UX cleanup (does **not** change **`docs/ui/SURFACE_SECTION_CONTRACT.md`**).

---

## Goal

Remove redundant **FEED & POSTS** block from the navigation dropdown.

---

## Scope (what changed)

- **File:** **`apps/lantern-app/js/lantern-nav.js`** — `buildLanternNavDropdownHtml()` only.
- **Removed:**
  - Group label **FEED & POSTS**
  - Link **Lantern (Explore)** → `explore.html` (duplicate of bar home link)
  - Link **New post — Design Studio** → `contribute.html?type=post`

---

## Hard exclusions (honored)

- No routing, router, or server changes.
- No Create / Contribute flow or Studio logic changes.
- No **`explore.html`** or other page edits.
- No other nav structure renames or reordering beyond **deleting** the one section.

---

## Entry points after change

| Need | Where |
|------|--------|
| **Home / feed (Explore)** | **Lantern** word link in bar → `explore.html` |
| **Create** | **Create** in chevron → `contribute.html` |

**STAFF** block unchanged: Display, Teacher, Verify.

---

## QA checklist

1. Chevron menu opens/closes; two sections: **NAVIGATION**, **STAFF**.
2. No broken `href`s among remaining links.
3. **Lantern** → `explore.html`.
4. **Create** → `contribute.html`.
5. No new console errors from nav init.

---

## Merge criteria (for history)

- Single-file PR; no bundled surface/CSS/card/rail/worker work.
- Manual smoke passes QA above.

---

*Phase-SP1.5 — v1.0 — nav dropdown removal only.*
