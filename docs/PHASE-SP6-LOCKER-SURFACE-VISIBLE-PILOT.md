# Phase-SP6 — Locker surface: **first visible** styling pilot

**Status:** **Executed** — **`lockerTabCss`** in **`build-locker.cjs`**: **`.wrap.lanternContent [data-locker-surface]:not([hidden])`** `{ box-shadow: inset 0 3px 0 0 var(--accent); }` — **`locker.html`** regenerated. **No** `border-top`. **No** slice/body/ID/ARIA changes.  
**Depends on:** **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`** (**executed** — **`data-locker-surface`** on **`#lockerPanel*`**) · **`docs/ui/LOCKER_SURFACE_MAP.md`** · **`docs/ui/SURFACE_SECTION_CONTRACT.md`** · **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12 · **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`**.  
**Orthogonal:** **Heavy Reseed / Pressure Test** — do **not** bundle.

---

## 0. Goal

Define the **first bounded, user-visible** Locker surface improvement that **uses** **`data-locker-surface`** as the **only** structural hook — **without** touching **slice bodies**, **without** reopening **rails**, and **without** changing **card** shells or **Studio**.

**SP5 gave:** queryable **`data-locker-surface="overview|items|store"`** on each tabpanel root.  
**SP6 applies:** **scoped presentation** so the **active** Locker surface reads clearly at a glance.

---

## 1. Single highest-leverage visible improvement (recommended)

**Problem:** Tabs change **content**, but the **tabpanel** chrome is **visually flat** — students may not **feel** a strong “mode” boundary between **Overview** (profile **`.section*`**), **Items** (cosmetics **`.lockerSection*`**), and **Store** (**`.storePanelRoot`** + **`.card`**).

**SP6 fix (recommended — pick one implementation detail at execution time):**

**A (default): Active-surface accent stripe (inset, no layout shift)**  
Add **one** rule in **`lockerTabCss`** (the inline **`<style>`** block assembled in **`build-locker.cjs`**):

- **Selector:** **`.wrap.lanternContent [data-locker-surface]:not([hidden])`**
- **Effect:** **`box-shadow: inset 0 3px 0 0`** (or **`4px`**) using **`var(--accent)`** or a **documented** token from **`lantern-header.css`** — **inset** avoids changing **outer** dimensions vs a real **`border-top`** on some layouts.
- **Rationale:** Only the **visible** tabpanel matches **`:not([hidden])`** — same behavior as today’s tab script; **no** JS changes.

**B (alternate if A clips content):** **`border-top`** **`3px solid`** **`var(--accent)`** on the same selector — **verify** **padding** on first child does not **double** with existing **`.lockerPanel`** margin.

**Out of scope for SP6:** Per-surface **different** colors (**`[data-locker-surface="store"]`** only) — **defer** — SP6 should stay **one** rule, **three** surfaces, **same** accent treatment for **simplicity** and **QA**.

---

## 2. Why this is safe **now** (post-SP5)

| Without SP5 | With SP5 |
|-------------|----------|
| Styling “active panel” required **`:not([hidden])`** + **`#lockerPanel*`** ID list — **brittle** if IDs ever split | **Same** **`:not([hidden])`** + **`[data-locker-surface]`** — **semantic** hook aligned with **LOCKER_SURFACE_MAP** |
| Risk of styling **wrong** nested **`[hidden]`** nodes | Selector targets **only** **tabpanel roots** that **SP5** marked — **one** element per visible tab |

**Still safe because:** **No** new **classes** on inner profile/store markup; **no** **`index.full`** / **`store.full`** edits; **no** **`.lanternScroller`** / **`.exploreCard`** selectors — **tabpanel shell only**.

---

## 3. Exact files involved (when SP6 runs)

| Action | Path |
|--------|------|
| **Edit** | **`apps/lantern-app/build-locker.cjs`** — **`lockerTabCss`** template string **only** (add **1–3** declaration blocks for the SP6 rule + **optional** comment inside the string) |
| **Regenerate** | **`node build-locker.cjs`** → **`apps/lantern-app/locker.html`** |
| **Optional** | **`docs/ui/LOCKER_SURFACE_MAP.md`** — **§2** footnote: “SP6: active panel **accent** (CSS via **`[data-locker-surface]:not([hidden])`**)” |
| **Optional** | **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12 — **one bullet** |
| **Optional** | **`docs/CHANGELOG_LOCKED.md`** — **one line** |

**Do not edit for SP6:** **`locker-sources/index.full.html`** · **`locker-sources/store.full.html`** · **`ix.slice` / `st.slice`** · **`lockerItemsScript`** · **`lantern-profile-app.js`** · **`lantern-store-app.js`** · **`lantern-cards.css`** · **`lantern-rails.css`** · **`lantern-profile-page.css`** · **`lantern-store-panel.css`** (unless a **regression** forces a **one-line** exception — **default: no**).

---

## 4. Exact selectors / semantics

| Selector / token | Meaning |
|------------------|---------|
| **`.wrap.lanternContent [data-locker-surface]:not([hidden])`** | The **one** **visible** Locker tabpanel (Overview default; Items/Store when selected) |
| **`[data-locker-surface="overview"]`**, **`items`**, **`store`** | **Not** required in SP6 if **one** rule covers all — **defer** per-surface palettes |
| **`hidden`** | **HTML boolean** — **unchanged** by SP6; **script** still toggles visibility |

**Semantics:** SP6 is **presentation of “which surface is active”** — **not** a second source of truth for tab state (still **`hidden`** + **ARIA**).

---

## 5. What must **not** be touched (SP6 hard exclusions)

| Excluded | Reason |
|----------|--------|
| **Studio** | Product lock |
| **§10–11** — **`.lanternScroller`**, **`.exploreCard`**, rail **tokens** | Rail + card constitution |
| **Slice bodies** | **build-locker** fragility |
| **New** **`data-help`** on tabpanels | **`lantern-help.js`** **cursor** behavior |
| **Items** equip / **Store** purchase **logic** | **Not** styling pilot |
| **Changing** tabpanel **IDs** / **ARIA** | Breaks **`lockerItemsScript`** |

---

## 6. QA gates

| # | Gate |
|---|------|
| 1 | **Only** **`lockerTabCss`** (and regen **`locker.html`**) changed in app — **no** other **`apps/lantern-app`** files **unless** doc optional paths. |
| 2 | **Overview**, **Items**, **Store** — each shows **accent** when **active**; **no** stripe on **hidden** panels. |
| 3 | **Mobile** narrow width — **no** horizontal overflow introduced; **touch** targets on **`.lockerTabBtn`** **unchanged**. |
| 4 | **Rails** — **My Creations** / **Store** rails **scroll** and **card** faces **unchanged** (spot-check). |
| 5 | **Console** — **no** new errors. |
| 6 | **Accessibility** — **tab** order and **ARIA** **unchanged**; **contrast** of accent stripe **acceptable** on **dark** background (project norms). |

---

## 7. Merge criteria

**Merge when:**

- All **§6** gates pass + **before/after** screenshot or short **Loom** note for **three** tabs.
- PR description: **selector** + **token** used; **no** slice / card / rail / store-logic edits.
- **SP7+** (e.g. **per-surface** colors, **extract** CSS file) **not** bundled.

**Do not merge if:**

- Rules **leak** into **`.lanternScroller`** children or **`.profileHero`** (too deep — **scope** to **tabpanel** root **only**).
- **Worker** / **reseed** / **Explore** changes slipped in.

---

## 8. Relationship to SP5

| Phase | Delivered |
|-------|-----------|
| **SP5** | **`data-locker-surface`** — **machine-readable** anchor |
| **SP6** | **Visible** chrome **using** that anchor — **first** **CSS** surface pilot **scoped** to **tabpanels** |

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| **`docs/ui/LOCKER_SURFACE_MAP.md`** | Tabpanel + **`data-locker-surface`** |
| **`docs/build-locker-slices.md`** | **No** slice edits in SP6 |

---

*Phase-SP6 — v1.0 — executed — first visible Locker surface using **`data-locker-surface`**.
