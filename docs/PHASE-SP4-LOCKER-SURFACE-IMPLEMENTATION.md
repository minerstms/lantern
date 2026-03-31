# Phase-SP4 — Locker surface **implementation** pilot

**Status:** **Executed** — **`build-locker.cjs`** template: **three** panel-root **`<!-- -->`** comments; **`locker.html`** regenerated. **No** `ix.slice` / source-body edits.  
**Build on:** **`docs/ui/LOCKER_SURFACE_MAP.md`** (SP3) · **`docs/ui/SURFACE_SECTION_CONTRACT.md`** · **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** · **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`** (executed doc-first) · **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12.  
**Orthogonal:** **Heavy Reseed / Pressure Test** — do **not** bundle (audit §6.2).

---

## 0. Goal

Define the **first bounded Locker surface/panel implementation slice** after SP3: **minimal, reversible, zero-behavior-change** alignment between **shipped HTML** and the **documented** three-vocabulary model — **without** renaming classes, **without** touching **`index.full.html`** / **`store.full.html`** **bodies**, and **without** changing **`ix.slice` / `st.slice`** **ranges**.

---

## 1. Single highest-leverage inconsistency to fix first

**Inconsistency:** After SP3, the **map** and **contract** explain Locker (**`.section*`** on Overview vs **`.lockerSection*`** on Items/Store vs **`.lockerPanel`** tabpanels), but **`locker.html`** still carries **almost no** **in-file** signposts at **tab / tabpanel** boundaries. Engineers **grep** classes or open **`index.full.html`** and risk **slice** mistakes.

**SP4 fix (recommended):** Add **HTML comments** **only** in the **`build-locker.cjs`** **assembled template** — immediately **around** the **existing** `${overviewMain}`, **`#lockerPanelItems`** block, and **`#lockerPanelStore`** / **`storePanelRoot`** wrapper — **mirroring** SP2 (Explore) discipline: **grammar documentation in DOM**, **no** new classes, **no** ID changes.

**What this does *not* try to do:** Unify **`.lockerSection*`** with **`.section*`** (audit §4.1 / contract — **deferred**). **Not** a CSS or JS refactor.

---

## 2. Why this is safer than broader Locker cleanup

| Broader cleanup (out of scope) | Phase-SP4 (this slice) |
|--------------------------------|-------------------------|
| Renaming **`.lockerSection`** → **`.section`** across Store/Items + **`lantern-rails.css`** | **No** class renames — **comments only** |
| Editing **`overviewMain`** in **`index.full.html`** (requires **`ix.slice`** rebasing) | **No** slice **body** edits — **forbidden** unless a **separate** build maintenance task |
| Consolidating **`lockerTabCss`** vs **`lantern-rails.css`** | **No** stylesheet moves |
| Touching **`renderLocker`** / equip / **`lantern-store-app.js`** | **No** **`lockerItemsScript`** logic edits |
| Rail selector changes | **Rail program closed** — **no** reopen |

**Risk surface:** **One** file’s **string template** + **regenerated** **`locker.html`** — **no** computed-style changes if comments are **only** `<!-- ... -->`.

---

## 3. Exact files involved (when SP4 runs)

| Action | Path |
|--------|------|
| **Edit** | **`apps/lantern-app/build-locker.cjs`** — **HTML template** portion only (the `` `...` `` string that emits **`lockerTabs`**, **`lockerPanelOverview`**, **`lockerPanelItems`**, **`lockerPanelStore`**) |
| **Regenerate** | Run **`node build-locker.cjs`** from **`apps/lantern-app/`** → updates **`apps/lantern-app/locker.html`** |
| **Optional** | **`docs/ui/LOCKER_SURFACE_MAP.md`** — one **“SP4”** note under §8 that **tabpanel comments** now exist in **generated** output |
| **Optional** | **`docs/CHANGELOG_LOCKED.md`** — one-line **merged** note |

**Do not edit for SP4:** **`locker-sources/index.full.html`** (except **never** in SP4 per §5) · **`locker-sources/store.full.html`** · **`ix.slice` / `st.slice` numeric ranges** · **`lockerItemsScript`** inner logic (except **no** edits at all) · **`lantern-profile-app.js`** · **`lantern-store-app.js`** · **`lantern-cards.css`** · **`lantern-rails.css`** · **`lantern-profile-page.css`** · **`lantern-store-panel.css`**.

---

## 4. Exact classes / semantics involved (reference only — **no** renames)

Comments should **name** these **existing** patterns (per **`LOCKER_SURFACE_MAP.md`**):

| Surface | Classes / `#id`s to cite in comments |
|---------|--------------------------------------|
| Shell | **`.wrap.lanternContent`**, **`.lockerTitle`**, **`.lockerSubtitle`**, **`.lockerTabs`**, **`.lockerTabBtn`** |
| Tabpanels | **`#lockerPanelOverview`**, **`#lockerPanelItems`**, **`#lockerPanelStore`**, **`.lockerPanel`**, **`role="tabpanel"`** |
| Overview body (spliced) | **`.section*`** / profile vocabulary — **content** from **`${overviewMain}`** — **do not** duplicate long markup in comments |
| Items | **`#lockerSectionsEl`**, **`.lockerSection*`** (JS-built) |
| Store | **`.storePanelRoot`**, **`.lockerSection*`**, generic **`.card`** |

**Semantics:** Comments **must** state **three parallel vocabularies** and **point** to **`docs/ui/LOCKER_SURFACE_MAP.md`** (short path in comment text).

---

## 5. What must **not** be touched (SP4 hard exclusions)

| Excluded | Reason |
|----------|--------|
| **`contribute.html`** / **Studio** | Product lock |
| **`lantern-cards.js`**, structural **`lantern-cards.css`**, rail **tokens** | Card + rail constitution |
| **`index.full.html`** / **`store.full.html`** **content** inside **`overviewMain`** / **`storeMain`** slices | **Slice** line-index / marker fragility (**`docs/build-locker-slices.md`**) |
| **Changing** **`ix.slice(1392, 1617)`** (or any **`ix.slice`**) **or** **`storeMain`** marker logic | **Not** SP4 — **build maintenance** task |
| **IDs**, **`aria-labelledby`**, **`hidden`** on tabpanels | Breaks **`lockerItemsScript`** tab switching |
| **Store purchase**, wallet, equip **behavior** | **Not** surface grammar |
| **Modal** markup (**Edit Profile**, overlays) | Out of **tab surface** scope |

---

## 6. QA gates

| # | Gate |
|---|------|
| 1 | **Diff review:** **`build-locker.cjs`** changes are **only** comment insertions in the **template** string — **no** slice math, **no** script logic edits. |
| 2 | **Regenerated `locker.html`** is **only** comment deltas vs prior output (plus deterministic newline if any). |
| 3 | **Locker smoke:** **`#overview` / `#items` / `#store`** — tabs switch, **no** new console errors. |
| 4 | **Visual parity** — **no** intended layout/paint change (comments invisible in UI). |
| 5 | **Accessibility:** tab roles/labels **unchanged** (spot-check DOM). |

---

## 7. Merge criteria

**Merge when:**

- All **§6** gates pass.
- PR description lists **files touched** and states **no** `index.full` / `store.full` / slice / card / rail / profile-store logic edits.
- **SP5+** (if any) **not** bundled (e.g. **no** CSS consolidation in same PR).

**Do not merge if:**

- **`overviewMain`** was edited by inserting comments **inside** the slice **without** updating **`ix.slice`** (would **truncate** or **shift** Overview body).
- **Worker**, **reseed**, or **unrelated** pages slipped in.

---

## 8. Relationship to SP3

| Phase | Delivered |
|-------|-----------|
| **SP3** | **`LOCKER_SURFACE_MAP.md`** + system-context / contract **links** — **no** app output change |
| **SP4** | **Optional SP3 stretch** — **template comments** + **`locker.html`** regen — **first** **DOM-visible** Locker grammar hint |

**Next (plan):** **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`** — **`data-locker-surface`** on tabpanels (**machine-readable** contract).

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| **`docs/build-locker-slices.md`** | **Slice** rules — SP4 **must not** violate |
| **`docs/ui/LOCKER_SURFACE_MAP.md`** | Vocabulary authority |
| **`docs/ui/SURFACE_SECTION_CONTRACT.md`** | Locker §4–7 |

---

*Phase-SP4 — v1.0 — plan only — Locker surface implementation pilot.*
