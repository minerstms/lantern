# Surface / Panel system — audit (**plan only**)

**Status:** Documentation and inventory only — **no implementation** in this document.  
**Purpose:** Map how “surfaces” (page shells, content blocks, modals) are named and styled today, where **`section`** diverges in meaning, what counts as a **brand primitive** vs **page-local invention**, and a candidate **first bounded fix** with **QA gates**.  
**Related:** Rail work for Locker is **complete** — see **`docs/RAIL_UNIFICATION_PROGRAM.md`** §10.7–10.8.

---

## 1. Current surface / panel systems by page

| Page / entry | Primary shell | Major content blocks | Modal / overlay pattern |
|--------------|---------------|----------------------|-------------------------|
| **`explore.html`** | **`.wrap.lanternContent.explorePageWrap`** | **`.section`** + **`.sectionHd`** (no **`.sectionBd`** on all blocks — mixed: rails + sub-lanes **`.sectionSubLane`**) | Overlays as needed (page-local) |
| **`games.html`** | **`.wrap.lanternContent.gamesPageWrap`** | **`.gamesPageShell`** wrapping **`<section class="gamesRailSection">`** (semantic `<section>`, not **`.section`**) | — |
| **`missions.html`** | **`.wrap.lanternContent.missionsPageWrap`** | **`.section`** + **`.sectionHd`** + **`.sectionBd`**; placeholders **`.sectionPlaceholder`** | — |
| **`locker.html`** | **`.wrap.lanternContent`** | **Tabpanels:** **`#lockerPanelOverview`**, **`#lockerPanelItems`**, **`#lockerPanelStore`** (**`.lockerPanel`**). Overview: **`.section`** / **`.sectionHd`** / **`.sectionBd`** (profile). Store: **`.lockerSection`** / **`.lockerSectionHd`** / **`.lockerSectionSub`** + **`.storePanelRoot`**. Items: **`.lockerSection`** (JS) | **Beta**, **Edit Profile** (**`.profileStudioModal`**), **avatar crop**, **store purchase** — from **`build-locker.cjs`** slices |
| **`teacher.html`** | **`.teacherPageShell`** (inside **`.wrap`**) | Cards / tables (page-specific) | Teacher-local |
| **`contribute.html`** | **`.containerStudio3Panel`**, **`.studioCol*`** | **`.studioSidePanel`**, **`.studioPanel--support`**, rails | Studio open state on **`<body>`** |
| **`verify.html`** | Verify layout | Config / state UI | — |
| **`display.html`** / **`news.html`** (if present) | Own wraps | Mix of **`.card`** and page CSS | Audit when those pages change |

**Stylesheet clusters (cross-cutting):**

| File | Typical role |
|------|----------------|
| **`lantern-header.css`** | Global tokens, app chrome |
| **`lantern-cards.css`** | **`.exploreCard`**, **`.lanternScroller`**, production card contract |
| **`lantern-profile-page.css`** | Profile / locker overview visual system, **`.section*`** overlaps |
| **`lantern-store-panel.css`** | **`#lockerPanelStore`**, **`.storeRewardCard*`** |
| **`lantern-rails.css`** | **`.lockerSection*`**, **`.lockerCard`**, legacy **`.contentScroller*`** (Studio + shared leftovers) |

---

## 2. Where **`section`** means different things

| Pattern | Where | Meaning |
|---------|--------|---------|
| **`.section` + `.sectionHd` + `.sectionBd`** | **Missions**, **Locker Overview** (from **`index.full`**), parts of **profile** CSS | “Major vertical block with titled header and padded body” |
| **`.section` + `.sectionHd` only** (no **Bd**) | **Explore** | “Lane header + content siblings” — rails and **`.sectionSubLane`** sit **beside** header, not inside a single **Bd** wrapper |
| **`<section class="gamesRailSection">`** | **Games** | Semantic HTML **+** page-specific class — **not** the same as **`.section`** |
| **`.lockerSection`** | **Store** (static + leaderboard inner), **Items** (JS) | Store/marketing rhythm + **accent** header color; overlaps conceptually with **`.section`** but **different class name** and partial stylesheet split (**`lantern-rails.css`** vs profile) |
| **`profileStudioSection`** | **Edit Profile** modal | Form **`<section>`** with **`.profileStudioSectionH`** — third parallel vocabulary for “grouped settings” |
| **`section` (string)** | **verify.html** JS | Data field / label text — **not** a CSS class |

**Risk:** Engineers assume one **`section`** mental model; **Explore** vs **Missions** vs **Locker Store** use **incompatible DOM/CSS** for the same English word.

---

## 3. Brand primitives vs page-local inventions

### 3.1 Strong / documented primitives

| Primitive | Authority | Notes |
|-----------|-----------|--------|
| **`.wrap.lanternContent`** | Multiple pages | Canonical content column |
| **`.lanternScroller`** | **`lantern-cards.css`** + header tokens | Horizontal **production** card rails (see **`CARD_SYSTEM.md`**, rail program) |
| **`.exploreCard*`** / **`LanternCards`** | **`lantern-cards.js`** + **`lantern-cards.css`** | Single production card system |
| **`.lockerPanel`** + tab **ARIA** | **`locker.html`** / **`build-locker.cjs`** | Locker’s **tabpanel** pattern — app-specific but stable |

### 3.2 Shared but duplicated / fragmented

| Pattern | Issue |
|---------|--------|
| **`.section` / `.sectionHd` / `.sectionBd`** | Defined in **missions** inline, **explore** inline, **`index.full` / profile** — same names, **subtle layout differences** (e.g. **Bd** omission on Explore) |
| **`.lockerSection*`** | Lives in **`lantern-rails.css`** and duplicated conceptually with **`.section*`** on Locker Overview |
| **`.card` + `.cardHd` + `.cardBd`** | Generic “panel card” used in Store standalone HTML, leaderboard, testing — **not** the same as **`.exploreCard`** |

### 3.3 Page-local inventions (not global primitives)

| Pattern | Page |
|---------|------|
| **`.gamesPageShell`**, **`.gamesRailSection`** | Games |
| **`.explorePageWrap`**, **`.sectionSubLane`** | Explore |
| **`.teacherPageShell`** | Teacher |
| **`.containerStudio3Panel`**, **`.studioSidePanel`** | Contribute / Studio |
| **`.storePanelRoot`** | Locker Store tab |

**Conclusion:** There is **no single documented “surface primitive”** beyond **`.wrap.lanternContent`** and the **card / scroller** contracts. **Sections** and **panels** are **polyglot**.

---

## 4. First bounded implementation slice — **Phase-SP1** (locked)

**Supersedes** the earlier “doc + pilot” sketch below.

**Active plan:** **`docs/PHASE-SP1-SURFACE-PANEL.md`** — **documentation + `LANTERN_SYSTEM_CONTEXT.md` linkage only** (create **`docs/ui/SURFACE_SECTION_CONTRACT.md`**). **No** HTML/CSS/JS in SP1.

**Follow-up (separate approval):** Optional **SP2** single-page DOM/CSS pilot — **not** part of SP1.

---

### 4.1 Prior recommendation (retained for context — subsumed by Phase-SP1)

**Goal:** Reduce confusion **without** a big-bang redesign.

**Original sketch:** Section vocabulary doc + optional pilot. **Phase-SP1** executes the **doc** half only; pilot moves to **SP2+**.

**Defer:** Merging **`.lockerSection`** into **`.section`** across Store + Items + **`lantern-rails.css`**. **Defer:** Studio panel renames.

**Why doc first:** Same discipline as the rail program — **contract before refactors**.

---

## 5. QA gates (for any future surface/panel implementation)

| # | Gate |
|---|------|
| 1 | **Visual parity** — screenshots or computed styles for affected blocks unchanged unless intentionally improved |
| 2 | **No regression** on **Explore**, **Missions**, **Locker** (all three tabs), **Games** |
| 3 | **Accessibility** — heading order, **`role="tabpanel"`**, modal labels unchanged |
| 4 | **CSS specificity** — no accidental override of **`lantern-cards.css`** card shell |
| 5 | **Console** — clean on smoke navigation |
| 6 | **Mobile** — single-column layouts still respect **22–36px** / touch targets (project norms) |

---

## 6. Running program — future phases (keep on roadmap)

### 6.1 Surface / Panel program (this audit)

- Next step: **approve** doc-only contract + optional **pilot** scope in **`PROJECT_PLAN`** or **`AGENTS.md`** re-entry when ready.

### 6.2 **Heavy Reseed / Pressure Test** phase (retain in plan)

**Intent:** Stress **data lifecycle**, **verify** reset/reseed, **D1** consistency, and **demo reliability** under repeated seed/clear cycles — **not** UI surface work.

**Pointers (existing material):**

- **`docs/archive/LANTERN-CONTENT-LIFECYCLE-AUDIT.md`** — lifecycle and **reseed/reset** strategy notes  
- **`docs/archive/lantern-verify-system.md`** — **`/api/verify/reset`**, password, **`reset` vs `reseed`**

**Suggested phase goals (when scheduled):**

- Scripted or checklist-driven **reseed** → smoke **Explore / Missions / Locker / Games**  
- Verify **FERPA** and **teacher ownership** invariants after reseed  
- **Performance / error** budget: no unbounded client retries; worker errors surfaced sanely  

**Dependency:** Surface/panel work is **orthogonal** — can run **before or after** Heavy Reseed; avoid coupling them in one PR.

---

## 7. Document control

| Version | Note |
|---------|------|
| 1.0 | Initial audit; plan only; Locker L-Rail program marked complete in rail doc |
| 1.1 | §4 points to **`docs/PHASE-SP1-SURFACE-PANEL.md`** as first implementation slice |
| 1.2 | **`docs/ui/LOCKER_SURFACE_MAP.md`** — Locker tab/panel vocabulary (Phase-SP3 doc-first) |
| 1.3 | **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`** — **`data-locker-surface`** on **`#lockerPanel*`** (**executed**) |
| 1.4 | **`docs/PHASE-SP7-MOTION-SYSTEM.md`** — Lantern-wide **motion** plan (cards / rails / surfaces) |

---

*Cross-link: **`docs/RAIL_UNIFICATION_PROGRAM.md`** §10.8 · **`docs/PHASE-SP1-SURFACE-PANEL.md`** · **`docs/ui/LOCKER_SURFACE_MAP.md`** · **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`** · **`docs/PHASE-SP4-LOCKER-SURFACE-IMPLEMENTATION.md`** · **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`** (**`data-locker-surface`** — executed) · **`docs/PHASE-SP6-LOCKER-SURFACE-VISIBLE-PILOT.md`** (**inset** active panel — executed) · **`docs/PHASE-SP7-MOTION-SYSTEM.md`** (planned motion).*
