# Lantern — Changelog (locked decisions & milestones)

Human- and agent-facing **decision log**. Not a substitute for git history; use for **policy** and **“why we don’t do X”**. Technical detail often lives in **`docs/LANTERN_SYSTEM_CONTEXT.md`** and archived audits.

---

## Doc consolidation — 2026-03-19

- **2026-03-19 — Phase CONTENT-RESEED-BETA (demo stress seed):** **`docs/PHASE-CONTENT-RESEED-BETA.md`** — plan + AM checklist; **`apps/lantern-app/js/lantern-data.js`** — **`seedDemoWorld()`** expanded to **~60** demo posts, **20** teacher missions (incl. **tm1–tm20**), **20** nugget **catalog** rows ( **`DEFAULT_CATALOG`** ), full seed also **writes** **`LANTERN_CATALOG`** so the store list refreshes on **Seed sample content**. **`lantern-api.js`** — **`getApprovedPosts`** feed cap **30 → 60** so Explore can show the seeded post volume. Fictional / FERPA-safe copy only. **No** Worker/D1 bulk load, **no** layout/card changes.

- **2026-03-19 — Phase-SP3 (Locker surface map — documentation-first):** **`docs/ui/LOCKER_SURFACE_MAP.md`** — tab → **`#lockerPanel*`** → **`.section*`** vs **`.lockerSection*`** vs **`.storePanelRoot`** / **`.card`**; **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12 pointer; **`SURFACE_SECTION_CONTRACT.md`** + **`SURFACE_PANEL_SYSTEM_AUDIT.md`** cross-links; **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`** marked executed. **No** app build, `ix.slice`, or source-body edits.
- **2026-03-19 — Phase-SP5 (Locker `data-locker-surface`):** **`build-locker.cjs`** template — **`data-locker-surface="overview|items|store"`** on each **`#lockerPanel*`**; **`locker.html`** regenerated. **No** `ix.slice` / **`index.full`** / **`store.full`** / CSS / card / rail / profile-store logic changes. Docs: **`LOCKER_SURFACE_MAP.md`**, **`SURFACE_SECTION_CONTRACT.md`** §6, **`LANTERN_SYSTEM_CONTEXT.md`** §12.
- **2026-03-19 — Phase-SP6 (Locker active panel cue):** **`lockerTabCss`** — **`box-shadow: inset 0 3px 0 0 var(--accent)`** on **`.wrap.lanternContent [data-locker-surface]:not([hidden])`**; **`locker.html`** regenerated. **No** `border-top`, **no** slice bodies, **no** per-panel colors.
- **Collapsed** scattered Markdown into **four** authoritative docs under `docs/`:
  - `LANTERN_SYSTEM_CONTEXT.md`
  - `ACTIVE_BUILD_PLAN.md`
  - `CHANGELOG_LOCKED.md` (this file)
  - `CURSOR_RUN_PROMPT.md`
- **Moved** prior `docs/*.md`, root `*.md` plans, `.cursor/*.md`, `apps/lantern-app/docs/*.md`, and related READMEs into **`docs/archive/`** (see tree / git status). **Do not** resurrect stale top-level docs without updating the authoritative four.
- **AGENTS.md** trimmed to point at `LANTERN_SYSTEM_CONTEXT.md` (Cursor still loads root guardrails).

---

## Locked architecture decisions

- **Single API layer:** Lantern production API in **`lantern-worker/`**; do not conflate with other Worker trees.
- **Single source of truth:** Worker + D1 when API mode on; localStorage not moderation truth.
- **One card system:** `LanternCards` + `lantern-cards.css` only for production cards (see system context §10).
- **Missions visibility:** Query-based on `lantern_mission_submissions`; **`accepted`** for approved/public merge; no shadow publish table.
- **Verify:** Simulation only; state in **`lantern_verify_state`**; reset password secret on Worker.
- **Migrations:** New SQL only under **`lantern-worker/migrations/`**; root `migrations/` legacy for Lantern.
- **Schema/status:** Remote PRAGMA + **`docs/archive/LANTERN_SCHEMA.md`** + Appendix A in system context for statuses.

---

## Product / UX locks (recent)

- **Lantern** = primary home feed branding; **`explore.html`** may remain the route/file.
- **News desk** (`news.html`) remains the workflow surface for submit / resubmit / My Articles; demoted in nav copy in favor of Contribute + “Submit or edit news.”
- **Featured / Announcements** rail: official **teacher/staff/admin** approved news + **`teacher_pick` / `teacher_featured`** only — not general student news in that rail.

---

## Merged slices (implementation)

- **2026-03-19 — Locker Featured Post → LanternCards:** Locker Overview **featured post** showcase is rendered via **`LanternCards.createFeedPostCard`** (`lantern-profile-app.js` + `lantern-profile-page.css`). Same data path as before: **`featured_post_id`** + profile save/load; **`noNavigate`** preserved. **Closed;** do not reopen the main slice without a new task. **Follow-ups:** `docs/follow-ups/LOCKER_HUNT_ZONES_CONSOLE_NOISE.md`, `docs/follow-ups/LOCKER_FEATURED_POST_HIDE_REPORT_OPTIONAL.md`.
- **2026-03-21 — Lantern home Latest Posts → Explore dataset:** **`explore.html`** Latest Posts rail is filled from **`LANTERN_EXPLORE_DATASET.buildExploreDataset()`** (normalized **`post`** + **`mission_submission`** only, deduped in the dataset builder, chronological merge, then existing **`LanternCards`** / **`renderAll`** path). **`createRunSafe()`** in **`lantern-explore-dataset.js`** must return a **runner** via **`global.LANTERN_API.createRun()`** (not the function reference). Legacy **`loadLatestPostsLegacyMergeThenRender`** remains **fallback only** (reject / `applyLatestPostsFromExploreDataset` false). **QA:** dataset log present, legacy log absent in happy path; render, ordering, dedupe passed. **Closed;** do not reopen this slice without a new task. **Follow-up (not blocking this migration):** `docs/follow-ups/EXPLORE_SHELL_CONSOLE_NOISE.md`.
- **2026-03-21 — Rail unification Phase 1 (CSS authority):** Canonical production horizontal rail is **`.wrap.lanternContent .lanternScroller`** in **`lantern-cards.css`** only; spacing tokens **`--lantern-rail-*`** on **`:root`** in **`lantern-header.css`** only. **Scroll-snap off** on that rail; no new parent-scoped **`.exploreCard`** sizing. Explore / Games / Missions consume the unified rule; Locker / Store / **`lantern-rails.css`** / profile / Studio **not** migrated in Phase 1. **Closed;** **do not reopen Phase 1** (no re-splitting selectors or tokens without a new architectural task). **Next:** Locker rail DOM migration — **`docs/RAIL_UNIFICATION_PROGRAM.md`** §7 → superseded by L-Rail-1 / L-Rail-2 entries below.
- **2026-03-19 — Rail unification L-Rail-1 (Locker Overview, bounded):** **`#spotlightRailEl`** and **`#achievementsRailEl`** migrated to canonical **`lanternScroller`** (direct card children); profile CSS track overrides for those rows removed; **`lantern-profile-app.js`** append targets updated; **`locker.html`** / **`locker-sources/index.full.html`** / **`build-locker.cjs`** kept in sync. **Store**, **`#postFeedEl`**, Studio, APIs — **out of scope**. **Closed;** verification record **`docs/RAIL_UNIFICATION_PROGRAM.md`** §7.6. **Next:** **L-Rail-2** (**`#postFeedEl`** only) — same doc **§8** (now closed).
- **2026-03-19 — Rail unification L-Rail-3a (dead/orphan CSS only):** Removed orphan **`#schoolActivitySection .contentScrollerTrack .exploreCard--size-rail`** / **`.medium`** from **`lantern-profile-page.css`** and **`locker-sources/index.full.html`** (no matching node in app). Removed dead **`lantern-cards.css`** **`gamesPageShell .contentScroller .gamesHubPlayCard…`** rules (**`games.html`** uses **`lanternScroller`** only). **Store / Items / Studio / `lantern-rails.css`** untouched. **Closed;** **`docs/RAIL_UNIFICATION_PROGRAM.md`** §10.0 / §10.4.
- **2026-03-19 — Rail unification L-Rail-2 (Locker Overview, bounded):** **`#postFeedEl`** migrated from **`contentScroller` → `contentScrollerTrack`** to single **`lanternScroller`** (direct card children); **`renderMyCreations`** documents canonical target; global **`.contentScrollerTrack .exploreCard*`** in **`lantern-profile-page.css`** retained for **Store** tracks (comment clarifies). **`build-locker.cjs`:** **`overviewMain`** = **`ix.slice(1396, 1621)`**; **`modals`** = **`ix.slice(1623, 1769)`** (overlays only — do not include **`toast`** / script lines from **`index.full`**). **Closed** after human smoke (Locker Overview / My Creations). **Next plan only:** **`docs/RAIL_UNIFICATION_PROGRAM.md`** **§10 L-Rail-3** (cleanup + deferred Store/Items/Studio).
- **2026-03-19 — Phase-SP1.5 (nav dropdown — removal only):** Removed redundant **FEED & POSTS** section from chevron menu in **`lantern-nav.js`** (duplicate **Lantern (Explore)** + **New post — Design Studio**). **Lantern** bar link → **`explore.html`**; **Create** → **`contribute.html`** unchanged. **Closed;** record **`docs/PHASE-SP1.5-NAV-DROPDOWN.md`**.

---

## Deploy / ops notes

- **Pages** project root for student app: **`apps/lantern-app`** (see archived `LANTERN-ISOLATION-PLAN.md`, `deploy-trigger.md`).
- **README deploy-trigger snippet** (historical): preserved as **`docs/archive/README_deploy_trigger_snippet.md`**.

---

## Conflicts resolved by consolidation

| Topic | Older docs said | Authoritative resolution |
|-------|------------------|---------------------------|
| Main feed name | “Explore” everywhere | **Lantern** = product home; **explore.html** = implementation route unless migrated later. |
| Schema location | `docs/LANTERN_SCHEMA.md` | **Verbatim contract** in **`docs/archive/LANTERN_SCHEMA.md`**; rules + status appendix in **system context**. |
| Card contract | `docs/ui/CARD_SYSTEM.md` | Merged into **system context §10**; archived file kept for diff history. |
| Hard rules | `docs/system/ARCHITECTURE_CONTRACT.md` vs `AGENTS.md` | Merged into **system context** + short **AGENTS.md** pointer. |
| Roadmap | `PROJECT_PLAN.md` vs `lantern-development-phases.md` | **ACTIVE_BUILD_PLAN.md**; duplicates archived. |
| Polls / Phase 3 | “Implement Polls” vs polls already in codebase | Treat roadmap as **product completeness/polish**, not greenfield — verify code before re‑implementing. |

---

## How to add entries

1. Short **date** + **title**.
2. **Decision** (what we lock).
3. **Scope** (what we explicitly do not do).
4. If it changes schema or status enums: update **`docs/LANTERN_SYSTEM_CONTEXT.md`** Appendix A and **`docs/archive/LANTERN_SCHEMA.md`** in the same change.
