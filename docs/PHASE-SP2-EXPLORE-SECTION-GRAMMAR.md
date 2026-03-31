# Phase-SP2 — Surface pilot: **Explore section grammar**

**Status:** **Executed (2026-03-19)** — **`explore.html`** only: **HTML comments** documenting section grammar; **no** new classes, **no** ID/attribute/inline-style changes, **no** CSS file edits (zero intended visual delta).  
**Depends on:** **`docs/ui/SURFACE_SECTION_CONTRACT.md`** (normative) · **`docs/PHASE-SP1-SURFACE-PANEL.md`** (contract landed).  
**Out of scope:** **Studio**, **rails program** (no reopen), **card system**, **Locker/Missions/Games** pages in this phase.

**Next (plan):** **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`** — Locker tab vocabulary / bounded pilot.

---

## 0. Goal

**Apply** the surface section contract to **one** real page first: **`explore.html`** (Lantern home).  
**“Grammar”** means: **named, repeatable structure** for vertical blocks (`.section` family + sub-lanes) so the page **matches** the contract and future edits don’t copy the wrong pattern from Missions or Locker.

This is **not** a visual redesign. **Not** a class rename across the app. **Not** adding `.sectionBd` on Explore (contract says that is **optional / usually omitted** here).

---

## 1. Exact Explore surface / section structure **today**

**Page shell**

| Layer | Markup / class |
|-------|----------------|
| Column | **`<div class="wrap lanternContent explorePageWrap">`** (after header / gate wrappers) |

**Vertical rows (each is one “lane” in the contract)**

| `#id` | `.sectionHd` title | Body pattern |
|-------|---------------------|--------------|
| **`bestSection`** | Announcements | **`sectionHd` → `#bestEl.lanternScroller`** |
| **`youCanDoSection`** | Missions & Actions | **`sectionHd` → two inner blocks:** `#missionSpotlightSection` (`.sectionSubLane` “Missions” + `#missionSpotlightEl.lanternScroller`), `#pollsSection` (`.sectionSubLane` “Polls” + `#pollsEl.lanternScroller`) |
| **`schoolSmartsSection`** | Mini Games | **`sectionHd` → `#schoolSmartsEl.lanternScroller`** |
| **`recentSection`** | Latest Posts | **`sectionHd` → `#recentEl.lanternScroller`** |
| **`happeningSection`** | School News | **`sectionHd` → `#happeningNewsBlock`** (Articles + scroller + load more) and **`#happeningActivityBlock`** (Activity + scroller) |
| **`gamesMoreSection`** | Game Scores | **`sectionHd` →** CTA link to **`games.html`** (no horizontal rail in this row) |

**Contract-relevant facts**

- **No** **`.sectionBd`** anywhere on Explore (correct per contract).
- **`.sectionSub`**: defined in Explore inline CSS; **not** heavily used in the static skeleton shown above (sub-lanes use **`.sectionSubLane`** / **`sectionSubLane--spaced`**).
- **Rails:** children use **`lanternScroller`** (§11); card internals stay **`LanternCards`** (§10).
- **Section spacing / typography:** much of it lives in **inline `<style>`** in **`explore.html`** (e.g. `.explorePageWrap > .section + .section`, `.sectionHd`, `.sectionSubLane`).

**Above-the-fold / gate**

- **`#classAccessBannerEl`**, **`#classAccessGateWrap`**, **`#classAccessContentWrap`**, **`#dailyHuntNuggetEl`** wrap or sit beside feed content — **not** “section grammar” rows; SP2 should **not** refactor class access or hunt UI unless a defect is found in review.

---

## 2. How it maps to **`SURFACE_SECTION_CONTRACT.md`**

| Contract rule | Explore today |
|---------------|----------------|
| **`.wrap.lanternContent`** page column | **`wrap lanternContent explorePageWrap`** |
| **`.section`** = major vertical block | One **`.section`** per main lane |
| **`.sectionHd`** = title row | Present for each lane |
| **`.sectionBd`** usually **omitted** on Explore | **Omitted** ✓ |
| **`.sectionSubLane`** = sub-label under a section | Used under Missions & Actions, School News |
| **Rails inside block** | **`lanternScroller`** siblings under Hd or under SubLane |
| **Games page uses `gamesRailSection`** | Explore does **not** use **`<section class="gamesRailSection">`** — correct (Games is **`games.html`**) |
| **Cards / rails** | Still §10 / §11 — unchanged by SP2 |

**Gap (why a pilot still helps):** The **contract** is documented, but **Explore** still carries **page-local** IDs and inline CSS. “Apply grammar” means making **structure + styling hooks** **obvious and stable** so engineers don’t “fix” Explore by copying **Missions’** `.sectionBd` pattern by accident.

---

## 3. What **should change** in SP2 (bounded — pick at execution; **one** PR)

**Allowed** (choose **only** what is needed; **smallest** change that satisfies QA):

1. **Documentation in the page** — Short HTML comment block (or one adjacent doc section) listing **section id → contract role** (Announcements, Missions & Actions, …) so the file self-describes **Explore-only** rules.
2. **Optional scoping class** — Add **one** Explore-only class on each **`.section`** (e.g. **`exploreSection`**) **in addition to** **`.section`**, for clearer selectors **without** renaming `.section` globally. Any new CSS must stay **Explore-scoped** (e.g. `.explorePageWrap .exploreSection`).
3. **Inner “lane” consistency** — Where a sub-lane is **`.sectionSubLane` + `.lanternScroller`**, ensure the **same wrapper pattern** (e.g. a small shared class on the wrapper `div` **if** it reduces duplication) — **only** if IDs used by **`explore.html` inline JS** stay stable (see §7).
4. **CSS hygiene (Explore-only)** — Move **section-row** rules from inline `<style>` to a **dedicated Explore stylesheet** *or* keep inline but **group and comment** — **only** if the PR stays one page + one optional new CSS file; **no** edits to **`lantern-cards.css`** rail primitives.

**Default if scope pressure appears:** Stop at **(1)** + minimal **(2)**; defer CSS file split to a **future** slice.

---

## 4. What **must remain untouched** (SP2 hard exclusions)

| Area | Reason |
|------|--------|
| **`contribute.html`** / **Studio** | Product lock |
| **`lantern-cards.js`**, structural **`lantern-cards.css`** for **`.exploreCard`** / rail band | Card + rail constitution |
| **§11 rail behavior** | No new selectors on **`.lanternScroller`** outside Explore-owned scope; no `contentScroller` revival |
| **`lantern-nav.js`** | Unless a separate nav task — not part of SP2 |
| **`locker.html`**, **`missions.html`**, **`games.html`** | Out of pilot scope |
| **`lantern-worker/`**, APIs | Not a surface pilot |
| **Class access / gate / daily hunt** behavior | Unless broken, no refactor |
| **Renaming** production **IDs** consumed by **`explore.html`** scripts | Breaks JS unless every reference updated in the same PR with full QA |

---

## 5. Why **Explore** is safer than **Locker** / **Missions** for the first implementation

| Factor | Explore | Locker / Missions |
|--------|---------|-------------------|
| **Contract fit** | Contract **already describes** Explore’s “no Bd” pattern | Missions **expects** **`.sectionBd`** — different grammar; easier to break |
| **Build / assembly** | Single static **`explore.html`** | Locker has **build-locker.cjs** / **`index.full`** slices — higher blast radius |
| **Stylesheet sprawl** | Mostly **one file** + shared cards | Profile + store + rails overlap |
| **Blast radius** | One primary URL (home) | Many tabs and modals |

---

## 6. Exact files **likely** involved (when SP2 runs)

| File | Role |
|------|------|
| **`apps/lantern-app/explore.html`** | Markup + inline section CSS + inline JS — **primary** |
| **`apps/lantern-app/css/lantern-cards.css`** | **Read-only** reference — **do not** change rail/card primitives for SP2 |
| **`apps/lantern-app/js/lantern-media.js`**, **`lantern-card-ui.js`**, **`lantern-explore-dataset.js`** | **Avoid**; touch **only** if a selector change **requires** it — default **no** |
| **`docs/ui/SURFACE_SECTION_CONTRACT.md`** | **Optional** one-line “SP2 aligned Explore” note after merge — not required for pilot |

**Rule:** Prefer **zero** JS changes. If JS must change, **grep** all `#bestSection`, `#recentEl`, etc., and list every change in the PR description.

---

## 7. QA gates

| # | Gate |
|---|------|
| 1 | **Visual parity** — Desktop + at least one narrow breakpoint: lane titles, spacing between sections, rails scroll, no clipped cards vs **pre-SP2** baseline (screenshots or side-by-side). |
| 2 | **Contract check** — Explore still uses **`.section` + `.sectionHd`** without introducing **`.sectionBd`** as the default lane pattern. |
| 3 | **Rails** — No new **non-**`lanternScroller` horizontal feed strip on Explore; **`.wrap.lanternContent .lanternScroller`** path unchanged in spirit (§11). |
| 4 | **Cards** — All production cards still from **`LanternCards`**; no new hand-built card shells. |
| 5 | **JS** — No console errors; **`render`**, **`load more`**, poll overlay, class access gate still work. |
| 6 | **Scope** — PR touches **only** approved files (Explore + optional Explore-only CSS). |

---

## 8. Merge criteria

**Merge when:**

- All **§7** gates pass.
- PR description lists **before/after** section grammar (IDs + classes) and states **no** card/rail/worker/studio changes.
- Reviewer confirms **Locker/Missions/Games** were not edited.

**Do not merge if:**

- **`.sectionBd`** is added Explore-wide “for consistency” with Missions (violates contract intent for Explore).
- **Rail** or **card** primitives were modified to “make room” for section cleanup.
- **Heavy** CSS moves without visual proof (regression risk).

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| **`docs/ui/SURFACE_SECTION_CONTRACT.md`** | Explore vs Missions vs Locker vocabulary |
| **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** | Historical inventory |
| **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10–11 | Cards + rails authority |

---

*Phase-SP2 — v1.0 — plan only — Explore section grammar pilot.*
