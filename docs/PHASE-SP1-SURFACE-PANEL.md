# Phase-SP1 — Surface / Panel program (**bounded first slice**)

**Status:** **Plan only** — execute as a single PR when approved.  
**Program:** Surface / Panel system (successor focus after **Locker rail unification** — **closed**; see **`docs/RAIL_UNIFICATION_PROGRAM.md`** §10.7–10.8).  
**Not in scope for SP1:** **Heavy Reseed / Pressure Test** (orthogonal; see **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** §6.2).

---

## 0. Slice summary

| Field | Value |
|-------|--------|
| **Name** | **Phase-SP1 — Section / surface vocabulary contract** |
| **Type** | **Documentation + system-context linkage only** |
| **Out of scope** | HTML/CSS/JS/DOM changes on any app page; **Studio**; **rails**; **card renderer**; **Worker/API** |

---

## 1. Smallest high-leverage problem to fix first

**Problem:** The same word **“section”** maps to **incompatible DOM/CSS patterns** across the app (**`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** §2). Engineers copy patterns across **Explore**, **Missions**, and **Locker** and introduce **silent layout or specificity bugs** because there is **no single authoritative vocabulary document** for **vertical** content blocks (distinct from **§10–11** card + rail contracts in **`docs/LANTERN_SYSTEM_CONTEXT.md`**).

**SP1 fix:** Add a **short, normative contract** that names each pattern, where it is allowed, and what **not** to conflate — then **link it from `LANTERN_SYSTEM_CONTEXT.md`** so it sits beside the card and rail rules with equal discoverability.

**Leverage:** Stops new drift at the **cheapest** layer (clarity) before any **SP2+** DOM/CSS pilot.

---

## 2. Why this slice is safer than broader surface unification

| Risk | Broad unification (deferred) | Phase-SP1 (this slice) |
|------|------------------------------|-------------------------|
| Visual regression | Renaming **`.section`** → **`.exploreSection`**, merging **`.lockerSection`** into **`.section`**, wrapping **Explore** in **`.sectionBd`**, etc. | **None** — no computed-style changes |
| CSS specificity wars | Touching **`lantern-profile-page.css`**, **`lantern-rails.css`**, page inline blocks | **None** |
| Locker **build-locker** / Overview slices | Any Locker HTML change | **None** |
| Card system | Accidental overlap with **`.exploreCard`** | **Explicit non-scope** |
| Rails | Reopening **`.lanternScroller`** / **`contentScroller`** | **Explicit non-scope** |
| Studio | Contribute layout churn | **Explicit non-scope** |
| Reseed / pressure test | Data lifecycle coupling | **Forbidden** in same PR |

SP1 matches the **rail program discipline**: **lock the contract first**, then consider **small, gated** follow-up slices (**SP2+**), not a **big-bang** surface redesign.

---

## 3. Exact files involved (when SP1 is executed)

| Action | Path |
|--------|------|
| **Create** | **`docs/ui/SURFACE_SECTION_CONTRACT.md`** — normative vocabulary (body per §4) |
| **Edit** | **`docs/LANTERN_SYSTEM_CONTEXT.md`** — add a **short subsection** after **§11 (Rails)** introducing vertical-block vocabulary and linking **`SURFACE_SECTION_CONTRACT.md`** + **`SURFACE_PANEL_SYSTEM_AUDIT.md`**; optionally **one-line accuracy** update to §11 if it still implies Store/Items rails are “later” (**doc-only hygiene**, not new rail work) |
| **Edit** | **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** — point **§4** to this file: “First implementation slice = **Phase-SP1**” |
| **Edit** | **`docs/RAIL_UNIFICATION_PROGRAM.md`** §10.8 — link **`PHASE-SP1-SURFACE-PANEL.md`** as active Surface program step |

**Do not create or edit** under **`apps/lantern-app/`** for SP1.

---

## 4. Exact classes / semantics the contract must capture

The new **`docs/ui/SURFACE_SECTION_CONTRACT.md`** must **define** (table or bullet form):

| Class / pattern | Semantics | Primary surfaces |
|-----------------|-----------|------------------|
| **`.section`** | Vertical content block on **student** pages | **Explore** (home), **Missions**, **Locker → Overview** (profile host) |
| **`.sectionHd`** | Block title row | Same |
| **`.sectionBd`** | Padded body **wrapper** | **Missions**, **Locker Overview** profile modules — **required** there for the “header + body” idiom |
| **Explore-specific** | **`.section`** may omit **`.sectionBd`** where rails / sub-lanes are **direct siblings** of the header pattern documented on Explore | **`explore.html`** only — **do not** assume this shape on Missions |
| **`.sectionSubLane`** | Sub-heading / lane label under a **`.section`** on Explore | **`explore.html`** |
| **`<section class="gamesRailSection">`** | **Games** vertical grouping — **not** **`.section`** | **`games.html`** |
| **`.lockerSection`**, **`.lockerSectionHd`**, **`.lockerSectionSub`** | Locker **Store** + **Items** marketing/category rows (**accent** headers, shared with **`lantern-rails.css`**) — **not** the same file stack as profile **`.section`** | **`#lockerPanelStore`**, **`#lockerPanelItems`** (JS-built rows) |
| **`.lockerPanel`** | Locker **tabpanel** chrome | **`locker.html`** |
| **`profileStudioSection`**, **`profileStudioSectionH`** | **Edit Profile** modal form grouping only | Modal in **`locker.html`** / **`index.full`** source |
| **`.wrap.lanternContent`** | Canonical **page column** shell | Multiple pages |

**Explicit SP1 statements (required in contract):**

- **Games** does **not** use **`.section`** for rail groups — use **`gamesRailSection`**.
- **Production cards** remain **§10** (**`LanternCards`** / **`.exploreCard`**) — this contract does **not** authorize hand-built card shells.
- **Horizontal scroll** remains **§11** (**`.lanternScroller`**) — **no** revival of **`contentScroller`** for new work outside documented legacy (**Studio**).

---

## 5. What must NOT be touched (SP1 hard exclusions)

| Excluded | Reason |
|----------|--------|
| **`contribute.html`** / **Studio** | Product lock |
| **Any** **`contentScroller` / `contentScrollerTrack` / `.lanternScroller`** rule or markup change | Rail program **closed** — no reopen |
| **`lantern-cards.js`**, structural **`lantern-cards.css`** for **`.exploreCard`** | Card system constitutional |
| **`build-locker.cjs`** slices, **`locker-sources/*.full.html`** except **future** non-SP1 tasks | Assembly fragility |
| **`lantern-worker/`**, APIs, **verify** reset/reseed scripts | **Heavy Reseed / Pressure Test** is a **separate** phase |
| **Explore / Missions / Locker / Games / Teacher** page **HTML/CSS/JS** | SP1 is **docs-only** |

---

## 6. QA gates (SP1)

| # | Gate |
|---|------|
| 1 | **`docs/ui/SURFACE_SECTION_CONTRACT.md`** exists and is **internally consistent** with **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** §1–3 |
| 2 | **`docs/LANTERN_SYSTEM_CONTEXT.md`** links the contract and does **not** contradict **§10 (cards)** or **§11 (rails)** |
| 3 | **No broken relative links** from edited docs to **`docs/ui/SURFACE_SECTION_CONTRACT.md`** |
| 4 | **Grep:** SP1 PR contains **no** changes under **`apps/lantern-app/`** (verify in CI or pre-merge checklist) |
| 5 | **Peer review:** one maintainer confirms **Studio / rails / cards** exclusions respected |
| 6 | **CHANGELOG** or **`docs/CHANGELOG_LOCKED.md`**: optional one-line “Phase-SP1 contract landed” entry |

---

## 7. Merge recommendation criteria

**Merge when:**

- All **§6 QA gates** pass.
- The contract explicitly documents **Explore vs Missions** **`.sectionBd`** difference and **Games** **`gamesRailSection`** exception (prevents the highest-frequency mistake).
- **SP2** (if any) is **not** bundled — no sneak DOM/CSS edits.

**Do not merge if:**

- Any **app** or **stylesheet** file slipped in without a **new approved phase** (e.g. **SP2 — Explore pilot**).
- **Reseed**, **verify** destructive flows, or **Worker** changes appear in the same PR.

---

## 8. After SP1 (explicitly out of scope here)

- **SP2+ (separate approval):** optional **single-page DOM/CSS pilot** (e.g. Explore-only class rename or **`.sectionBd`** alignment) with full **visual + a11y** QA from **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** §5.
- **`.lockerSection` → `.section` unification** — **not** proposed until contract has lived and pain points are re-triaged.

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** | Inventory + risks |
| **`docs/RAIL_UNIFICATION_PROGRAM.md`** §10.8 | Rail program handoff to Surface program |
| **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10–11 | Card + rail authority (unchanged by SP1 except link-out) |
| **`docs/PHASE-SP1.5-NAV-DROPDOWN.md`** | Adjacent **merged** slice: chevron nav duplicate **FEED & POSTS** removal (not surface contract work) |
| **`docs/PHASE-SP2-EXPLORE-SECTION-GRAMMAR.md`** | **Explore** section grammar pilot (**executed** — see file) |
| **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`** | **Locker** surface pilot (**executed** doc-first — **`docs/ui/LOCKER_SURFACE_MAP.md`**) |
| **`docs/PHASE-SP4-LOCKER-SURFACE-IMPLEMENTATION.md`** | Locker — **template** HTML comments + **`locker.html`** regen (**executed**) |
| **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`** | Locker **`data-locker-surface`** on **`#lockerPanel*`** (**executed**) |
| **`docs/PHASE-SP6-LOCKER-SURFACE-VISIBLE-PILOT.md`** | Locker **inset accent** on active panel (**executed**) |
| **`docs/PHASE-SP7-MOTION-SYSTEM.md`** | **Lantern-wide motion** (plan only — cards, rails, surfaces) |

---

*Phase-SP1 plan — v1.0 — documentation-only first slice.*
