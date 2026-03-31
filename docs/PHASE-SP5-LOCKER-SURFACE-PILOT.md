# Phase-SP5 — Locker surface: **first real DOM contract**

**Status:** **Executed** — **`data-locker-surface="overview|items|store"`** on each **`#lockerPanel*`** in **`build-locker.cjs`** template; **`locker.html`** regenerated. **No** **`data-locker-vocab`**. **No** slice / CSS / logic edits.  
**Build on:** **`docs/ui/LOCKER_SURFACE_MAP.md`** · **`docs/ui/SURFACE_SECTION_CONTRACT.md`** · **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`** · **`docs/PHASE-SP4-LOCKER-SURFACE-IMPLEMENTATION.md`** (executed — panel **comments** only) · **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12.  
**Orthogonal:** **Heavy Reseed / Pressure Test** — do **not** bundle.

---

## 0. Goal

Define the **first bounded Locker surface change with real system value** after SP4: move from **human-readable** panel comments to a **machine-readable** **surface contract on the tabpanels themselves** — **without** renaming classes, **without** touching **`index.full.html`** / **`store.full.html`** **bodies**, and **without** **`ix.slice` / `st.slice`** **range** edits.

**SP4 gave:** `<!-- -->` anchors at panel roots.  
**SP5 adds:** **Stable `data-*` attributes** on the **three** **`#lockerPanel*`** roots so **tests**, **lint**, **future scoped CSS**, and **agents** can target **`[data-locker-surface="…"]`** without inferring vocabulary from **inner** class soup.

---

## 1. Single highest-leverage inconsistency to change first

**Inconsistency:** **`#lockerPanelOverview`**, **`#lockerPanelItems`**, **`#lockerPanelStore`** are **only** distinguishable by **`id`** string and **inner** markup. The **documented** split (**profile `.section*`** vs **`.lockerSection*`** vs **Store + `.card`**) is **not** reflected as a **first-class DOM signal** on the **tabpanel** element.

**SP5 fix (recommended):** Add **one** additive attribute per tabpanel in the **`build-locker.cjs`** **HTML template** (same zone as SP4 — **not** inside **`${overviewMain}`** / **`${storeMain}`**):

| Panel `#id` | Proposed attribute | Value (stable enum) |
|-------------|--------------------|----------------------|
| **`lockerPanelOverview`** | **`data-locker-surface`** | **`overview`** |
| **`lockerPanelItems`** | **`data-locker-surface`** | **`items`** |
| **`lockerPanelStore`** | **`data-locker-surface`** | **`store`** |

**Optional second attribute (same PR only if reviewers want vocabulary explicit):**

| Panel | **`data-locker-vocab`** | Meaning |
|-------|-------------------------|---------|
| Overview | **`profile`** | **`.section*`** + profile CSS (per **`LOCKER_SURFACE_MAP.md`** §3) |
| Items | **`lockerSection`** | **`.lockerSection*`** + **`.lockerCard`** (§4) |
| Store | **`lockerSection`** | **`.lockerSection*`** + **`.card`** + **`.storePanelRoot`** (§5) |

**Default SP5:** **`data-locker-surface` only** — **smallest** change; **`data-locker-vocab`** is **optional** to avoid attribute sprawl.

**Out of scope for SP5:** Renaming **`.lockerSection*`** → **`.section*`**, CSS consolidation, **`.card`** → **`.exploreCard`**, **any** **`lockerItemsScript`** behavior change.

---

## 2. Why this is safe enough for the first “real” implementation

| Risk | Why SP5 is contained |
|------|----------------------|
| **Tab switching** | **`lockerItemsScript`** uses **`getElementById('lockerPanelOverview')`** etc. — **IDs unchanged** |
| **ARIA** | **`role`**, **`aria-labelledby`**, **`hidden`** — **unchanged** |
| **CSS cascade** | **No** new classes; **`[data-locker-surface]`** is **inert** until a stylesheet **opts in** — **default:** **no** new rules in SP5 |
| **Slice fragility** | **Template-only** — **no** **`overviewMain`** / **`storeMain`** **content** edits |
| **Cards / rails** | **No** touch **`lantern-cards.css`**, **`.lanternScroller`** rules, or card renderer |
| **Compared to class renames** | **Additive** attributes — **reversible** by removal |

**Compared to SP4:** SP4 is **documentation in DOM**; SP5 is **queryable structure** — **real** value for automation and **long-lived** contracts.

---

## 3. Exact files involved (when SP5 runs)

| Action | Path |
|--------|------|
| **Edit** | **`apps/lantern-app/build-locker.cjs`** — **HTML template** only: add **`data-locker-surface`** (and optional **`data-locker-vocab`**) to the **three** **`div#lockerPanel…`** opening tags |
| **Regenerate** | **`node build-locker.cjs`** → **`apps/lantern-app/locker.html`** |
| **Edit** | **`docs/ui/LOCKER_SURFACE_MAP.md`** — §2 table: **new column** “`data-locker-surface`” (or footnote) |
| **Optional** | **`docs/ui/SURFACE_SECTION_CONTRACT.md`** §6 (`.lockerPanel`) — **one sentence** that tabpanels **may** carry **`data-locker-surface`** (Phase-SP5) |
| **Optional** | **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12 — **one bullet** under Locker surface vocabulary |
| **Optional** | **`docs/CHANGELOG_LOCKED.md`** — one-line **merged** note |

**Do not edit for SP5:** **`locker-sources/index.full.html`** · **`locker-sources/store.full.html`** · **`ix.slice` / `st.slice` numbers** · **`lockerItemsScript`** inner code (unless a **bug** forces a read — **default no edits**) · **`lantern-profile-app.js`** · **`lantern-store-app.js`** · **`lantern-cards.css`** · **`lantern-rails.css`** · **`lantern-profile-page.css`** · **`lantern-store-panel.css`**.

---

## 4. Exact classes / semantics involved

| Concept | SP5 treatment |
|---------|----------------|
| **`.lockerPanel`** | **Unchanged** — still the tabpanel class |
| **`#lockerPanelOverview`**, **`#lockerPanelItems`**, **`#lockerPanelStore`** | **Same IDs** — **add** **`data-locker-surface`** only |
| **Inner vocabulary** (`.section*`, `.lockerSection*`, `.card`) | **Unchanged** — **not** edited in SP5 |
| **Semantics of `data-locker-surface`** | **Stable enum** matching tab: **`overview` \| `items` \| `store`** — aligns with **`data-locker-tab`** on buttons and **hash** routes |

**Do not** use **`data-help`** on tabpanels for this — **`lantern-help.js`** binds **`[data-help]`** — **avoid** accidental **cursor: help** on whole panels unless product wants it (**out of scope**).

---

## 5. What must **not** be touched (SP5 hard exclusions)

| Excluded | Reason |
|----------|--------|
| **`contribute.html`** / **Studio** | Product lock |
| **Card system** | Constitutional |
| **Rail program** | Closed — **no** **`lanternScroller`** / selector churn |
| **`index.full` / `store.full`** **bodies** | **Slice** / marker fragility |
| **Changing** **`ix.slice`** **indices** | **Not** SP5 |
| **Removing** or **renaming** tabpanel **IDs** | Breaks **`lockerItemsScript`** |
| **Store purchase**, equip, wallet **logic** | **Not** surface enum |

---

## 6. QA gates

| # | Gate |
|---|------|
| 1 | **Diff:** **`build-locker.cjs`** — **only** additive **`data-*`** on **three** tabpanel **`div`s** + optional **doc** edits; **`locker.html`** — **only** those attributes added vs pre-SP5 output. |
| 2 | **DOM:** Each **`#lockerPanel*`** has **`data-locker-surface`** with correct value. |
| 3 | **Behavior:** **Tabs** + **hash** (`#overview`, `#items`, `#store`) — **no** regression; **no** new console errors. |
| 4 | **Visual:** **Pixel** parity — attributes **do not** affect layout. |
| 5 | **Accessibility:** **`role="tabpanel"`** / **`aria-labelledby`** / **`hidden`** **unchanged**. |

---

## 7. Merge criteria

**Merge when:**

- All **§6** gates pass.
- PR description states **no** slice-body edits, **no** card/rail/CSS/JS logic changes (except **optional** doc bullets).
- **SP6+** (e.g. **CSS** that **uses** `[data-locker-surface]`) **not** bundled — **separate** task.

**Do not merge if:**

- **`overviewMain`** or **`storeMain`** were edited to inject attributes (wrong layer — **forbidden**).
- **Worker**, **reseed**, or **unrelated** pages bundled.

---

## 8. Relationship to prior phases

| Phase | Delivered |
|-------|-----------|
| **SP3** | **`LOCKER_SURFACE_MAP.md`** + system-context links |
| **SP4** | Panel-boundary **`<!-- -->`** comments (template + **`locker.html`**) |
| **SP5** | **`data-locker-surface`** on **tabpanels** — **machine-readable** surface enum |

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| **`docs/build-locker-slices.md`** | **No** slice edits in SP5 |
| **`docs/ui/LOCKER_SURFACE_MAP.md`** | Vocabulary authority — **update** for **`data-locker-surface`** |
| **`docs/PHASE-SP6-LOCKER-SURFACE-VISIBLE-PILOT.md`** | **Next (plan):** first **visible** CSS on **`[data-locker-surface]:not([hidden])`** |

---

*Phase-SP5 — v1.0 — executed — first real Locker surface DOM contract.*
