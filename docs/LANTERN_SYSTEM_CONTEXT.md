# Lantern — System context (authoritative)

This file is the **single merged contract** for architecture, product guardrails, data rules, card system, verify/class access, and missions visibility. It replaces scattered `docs/*.md` sources (now under `docs/archive/`).

**Canonical doc set (read these four only for day-to-day work):**

| Doc | Purpose |
|-----|---------|
| `docs/LANTERN_SYSTEM_CONTEXT.md` | This file — architecture, FERPA, DB governance, schema/status pointers, cards, verify, class access, missions |
| `docs/ACTIVE_BUILD_PLAN.md` | Ordered roadmap and current re-entry point |
| `docs/CHANGELOG_LOCKED.md` | Locked decisions and notable changes |
| `docs/CURSOR_RUN_PROMPT.md` | Cursor / agent run discipline |

**Auth + Class Access baseline:** `docs/LANTERN_AUTH_BASELINE.md`

**Agent entry:** Root `AGENTS.md` stays a short pointer + minimal non-negotiables for Cursor.

**Beta stress seed (ops, not a fifth canonical doc):** **`docs/PHASE-CONTENT-RESEED-BETA.md`** — localStorage **`LANTERN_DATA.seedDemoWorld()`** targets (posts / missions / catalog), tonight checklist, tomorrow AM human-check. Use when loading demo/stress data via Locker **Testing → Seed sample content**.

**Explore scroller audit (ops):** **`docs/EXPLORE_SCROLLER_VIABILITY_AUDIT.md`** — which Explore rails justify horizontal scrollers; local vs API behavior (e.g. Polls lane hidden without **`LANTERN_AVATAR_API`**).

---

## 1. Stack and layers

| Layer | Location / tech |
|-------|------------------|
| Frontend | `apps/lantern-app/` |
| Backend | Cloudflare Worker (`lantern-worker/`) |
| Database | D1 |
| Media | R2 |

**Worker is the only production API layer for Lantern.** The separate `worker/` tree (e.g. MTSS) is not Lantern; do not mix routes/schema without an explicit integration design.

**Live URLs (reference):** Frontend Pages deployment; Worker API host set via `window.LANTERN_AVATAR_API` (e.g. `lantern-api` worker). See `docs/archive/DEPLOY-URLS.md` if needed.

---

## 2. Single source of truth (API mode)

When API mode is enabled:

- **Worker + D1** is the single source of truth for moderation and durable student content.
- Moderation-facing UI must **never** read moderation data from **localStorage**.

**localStorage is allowed only for:** UI preferences, draft content, explicit fallback when API mode is disabled.

Data flow: **Browser → Worker → D1/R2 → JSON → UI.** Not: localStorage → dashboard for moderation.

---

## 3. Core principles (non-negotiable)

- **DEAD SIMPLE** over clever; teacher workflows target **under ~5 seconds** where practical.
- **Single source of truth** — no parallel pipelines or shadow tables for the same concept.
- **No hidden systems** — visibility enforced in Worker queries, not CSS hiding.
- **FERPA-safe by design** — fictional character identity in student-facing layer; no unnecessary cross-student exposure.
- **UI consistency** — shared card and rail patterns only (see §10–11).
- **Extend before inventing** — prefer the smallest change that fits existing architecture.

**Before implementing, ask:** Does this duplicate a system? Introduce a second truth? Break the card system? Violate FERPA? If yes → stop and redesign.

---

## 4. Identity (canonical)

- **`character_name`** is the **canonical** student-scoped identity for API filters and joins (missions, polls, wallets, avatars, class access, verify binding, etc.).
- Do **not** mix `character_name` with display-only fields (`name`, `display_name`, …) for the same pipeline. Legacy display-name queries are debt to remove, not copy.

---

## 5. FERPA and teacher scope

- No **cross-teacher moderation**: Teacher A must not approve/reject/return missions owned by Teacher B. Worker must enforce **`teacher_id`** (or equivalent ownership) on mission moderation actions.
- No **cross-student private data** exposure unless explicitly designed and Worker-enforced.
- **Students:** emoji-style reactions only; **only teachers** type comments on student posts (product rule).
- **Queue visibility:** assigned / suggested / unassigned within allowed scope only; do not expose all student content globally by default.

---

## 6. Teacher approvals UX (summary)

- **My Classroom** (left): teacher-owned mission submissions and classroom review — primary action surface.
- **Schoolwide queue** (right): shared items (avatars, news, poll contributions, etc.). Mission submissions from **My Classroom** must **not** appear here as a competing review surface.
- **Full review before approve:** teachers can open full content (not thumbnail-only moderation).

---

## 7. Verify / simulation

- **`verify.html`** is a **simulation cockpit**, not authentication.
- **No** user accounts, login sessions, or JWT for verify. Reset uses Worker secret **`LANTERN_VERIFY_RESET_PASSWORD`**.
- State table: **`lantern_verify_state`** (D1). Endpoints: `/api/verify/config`, `/api/verify/state` (GET/PUT), `/api/verify/reset` (POST, password).

---

## 8. Class access (gate)

- Class access is a **gate**, not full auth. Teachers generate a class code; students get temporary access.
- **Event-driven:** `lantern-class-access-resolved` with **`detail.tokenValid === true`** before gated pages load protected feeds (e.g. Lantern home / explore page).
- Empty feed when the gate never fires or token is invalid is a **gate issue**, not assumed backend absence.
- Debug logging: `window.LANTERN_DEBUG_CLASS_ACCESS = true` (see `js/class-access.js`).

---

## 9. Missions and visibility (pipeline)

- Submissions live in **one table:** `lantern_mission_submissions`. **Accepted** (`status = 'accepted'`) is the public/approved state for feed merge. No separate publish table.
- **Locker → Overview / My Creations:** `GET /api/missions/submissions/character?character_name=...`
- **Lantern home feed (`explore.html`):** merges script/API posts with `GET /api/missions/submissions/approved` (and related UI). **Curated “featured” rails** that are **posts-only** must not silently assume missions unless explicitly extended.
- **Image missions:** `submission_type === 'image_url'` may store URL in `submission_content`; Worker may normalize **`image_url`** on responses. Frontend uses `url` / `image_url` for previews.

**Naming note:** The **route/file** may remain `explore.html`; **product language** is **Lantern** / home feed. Older docs saying “Explore” for the main feed refer to the same surface unless stated otherwise.

---

## 10. Card system (constitutional)

**There is exactly ONE production card system.** Violations must be removed, not worked around.

- **Renderer:** `apps/lantern-app/js/lantern-cards.js` (`window.LanternCards`). Every production card (rail or opened) MUST be produced via `LanternCards` (e.g. `createFeedPostCard`, `buildNewsRailCardHtml`, `buildNewsOpenedCardHtml`, `createPollRailCard`, `buildMissionSpotlightRailElement`, `buildIconRailCardHtml`, `buildActivityPulseCardHtml`, `buildMissionDraftCardHtml`).
- **No hand-built production card HTML** on pages for production content. No structural card-shell CSS outside **`apps/lantern-app/css/lantern-cards.css`**. Layout wrappers/grids on pages are OK; card internals are not.
- **No inline geometry/typography** in renderer output or `lantern-media.js` explore/card output — use shared classes. Inline allowed only for non-CSS dynamic values (`src`, `href`, `data-*`, etc.).
- **Badges** (type, curation, author) only from **`lantern-cards.js`** + shared CSS.
- **Standard feed cards (`createFeedPostCard`):** **Type/category** = **`.exploreCardTypeBadge`** on the **media** (top-right, absolute). **Curation** (pick/featured) = **`.lanternBadge.exploreCardCurationBadge`** on the **media** (top-left, absolute). **Title row** is **title-only** — no inline curation; no duplicate **`.exploreTypeIcon`** when a type badge overlay exists.
- **Type badge content:** **`TYPE_BADGES`** uses **one format only** — **emoji + short label** (e.g. `📷 Image`, `🛠 Create`) for every rail-capable type; no icon-only type chips on standard cards.
- **Modes:** **rail** (preview) and **opened** (detail/modal) only; same underlying model/truth.
- **No parallel vocabulary** (e.g. `.lanternCard` as a second production shell). Production uses **`.exploreCard`** family.
- **Composite “card-like” panels** that function as content objects are forbidden unless they are real cards from `LanternCards`.
- **Size tokens (canonical):** rail cards use **`exploreCard--size-rail`** (default width band), **`exploreCard--size-wide`**, or **`exploreCard--size-compact`**. **`hero` / `medium` / `compact`** remain **temporary CSS/JS aliases** mapped to those three bands — not the long-term primary naming model.
- **Lantern home (`explore.html`) — single rail + scroller:** All horizontal rows (**Announcements, Missions & Actions, Mini Games, Latest Posts, School News, …**) use the same **`exploreCard--size-rail` / `.medium`** band and the same **`.explorePageWrap .lanternScroller`** gap/padding/edge rules from **`lantern-cards.css`**. No row-specific card width, media min-height overrides, or scroller spacing on that page. **Do not** use `hero` on home rails for “featured” sizing — content/badges carry distinction.
- **Latest Posts data path (merged 2026-03-21, closed slice):** Primary fill uses **`LANTERN_EXPLORE_DATASET.buildExploreDataset()`** → **`applyLatestPostsFromExploreDataset`** (posts + approved mission submissions from the dataset, chronological sort, then existing **`renderAll`** / **`LanternCards`**). Legacy merge is **fallback only**. **Do not reopen** this slice without a new task. Residual DevTools noise (e.g. **`HUNT_ZONES`**, **`getEventLabel`**, stray 400/404) is tracked in **`docs/follow-ups/EXPLORE_SHELL_CONSOLE_NOISE.md`** and is **not** a blocker for that migration.
- **Activity / pulse:** same rail band as other home cards; **`exploreCard--activityPulse`** only adjusts title rhythm; icon-vs-photo is **content**, not a second shell.
- **Verify QA:** horizontal rail stress rows use **`LanternCards`** output only (including the former `railStressScrollerCard` stub, now `buildLinkCardHtml` + shared shell). Not a second production card system.
- **Exception — Contribute studio mock scroller (`#studioMockScroller`):** narrower card band for the **editor preview strip** only (not the home feed); defined in **`lantern-cards.css`** + **`contribute.html`** layout CSS.
- **Break-glass:** one-off non-`LanternCards` surfaces require a documented exception in this section (justification + review date). Default: no exceptions.

**Violations include:** interactive buttons on rail face; full body text on rail face; more than one metadata row on rail face; second production card HTML path; structural card CSS on pages; inline layout/typography in renderer/media; parallel card shell.

**Detail overlay:** `apps/lantern-app/js/lantern-card-ui.js` consumes renderer output; modal chrome may live in shared CSS.

---

## 11. Rails / horizontal scrollers

- **Rail primitive now unified under `.lanternScroller` (Phase 1 complete, 2026-03-21).** **Merged & locked** — do not reopen Phase 1; see **`docs/CHANGELOG_LOCKED.md`** (Merged slices). Locker **L-Rail-1** + **L-Rail-2** (**`#postFeedEl`**) **closed** (human smoke clean) — **`docs/RAIL_UNIFICATION_PROGRAM.md`** **§7–§8**. **L-Rail-3a** dead/orphan CSS **merged** — same doc **§10.0**. **Next:** Store/Items rails + **`lantern-rails.css`** taper (**§10.2**).
- **One** horizontal rail/scroller paradigm for Lantern app pages (shared scroller + track patterns).
- No duplicate carousel/discovery containers with a different DOM/CSS contract for the same job. Rail content still uses the **card system** (§10).
- **Phase 1 (rail authority):** Production card rails use CSS owned only by **`lantern-cards.css`**, selector **`.wrap.lanternContent .lanternScroller`**. Spacing uses **`:root`** tokens **`--lantern-rail-gap`**, **`--lantern-rail-pad-y-start`**, **`--lantern-rail-pad-y-end`**, **`--lantern-rail-pad-x`** defined in **`lantern-header.css`** (single source). **Scroll-snap: off** on this rail. Locker Overview **L-Rail-1** + **L-Rail-2** complete; **Store** / **Items** legacy **`contentScroller`** + **`lantern-rails.css`** **later**; see **`docs/RAIL_UNIFICATION_PROGRAM.md`**.
- **Lantern home (`explore.html`):** Every horizontal row uses **`lanternScroller`** only, under **`sectionHd` / `sectionSub`** (and optional **`sectionSubLane`** sub-labels). No tinted `railHead`/`railBody` wrappers, no `exploreGrid` rail, and no parallel `activityStreamList` strip on that page.
- **Locker → Store horizontal rails:** **`#lockerPanelStore .lanternScroller`** uses the same **`--lantern-rail-*`** spacing tokens as other production rails (see **`lantern-header.css`** + **`lantern-cards.css`**). **`storeRewardCard`** remains the Store collectible shell (not a second feed-card renderer); it still sits on the unified scroller track.

### 11.1 Vertical content blocks (sections)

Student pages name “a titled vertical chunk” in **more than one way** (`.section`, `.lockerSection*`, `<section class="gamesRailSection">`, Edit Profile `profileStudioSection*`). Mixing patterns across pages causes **silent layout bugs**.

- **Normative vocabulary (definitions, DO / DO NOT, real pages):** **`docs/ui/SURFACE_SECTION_CONTRACT.md`**
- **Full inventory:** **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`**

This is **not** the card contract (§10) or the rail contract (§11 bullets above). It sits **between** the page column and those systems.

### 11.2 Motion (planned — Phase-SP7)

- **Normative motion language** (hover, press, focus, transitions, rail feel; **no** per-page special cases): **`docs/PHASE-SP7-MOTION-SYSTEM.md`**. **Implementation** is a **separate** approved slice — this section is **pointer only** until tokens land in **`lantern-header.css`** / **`lantern-cards.css`**.

### 11.3 Opened-card surface, fullscreen media, and exceptions

- **Rails / thumbscroll:** Single JS path (**`lantern-scroller.js`**) + single production CSS (**`.wrap.lanternContent .lanternScroller`** in **`lantern-cards.css`**). See §11 above.
- **Opened news/creation surface (student):** **`apps/lantern-app/js/lantern-card-ui.js`** — `LanternCardUI.openNews` / `openCreation` → **`#lanternCardDetailOverlay`**; **`fillNewsDetailModal`** / **`fillCreationDetailModal`**; embedded previews use the same modal DOM with **`lanternCardDetailModal--embedded`**. Full audit + known parallel surfaces: **`docs/ui/LANTERN_RAIL_OPEN_FULLSCREEN_SYSTEM.md`**.
- **Fullscreen media (after opened post):** Only **`openMediaFullscreen`** + **`wireOpenedPostMediaInteractions`** in **`lantern-card-ui.js`**; detail markup from **`LanternMedia.renderMedia(..., { variant: 'detail' })`**.
- **Explore interactive poll** uses **`LanternCardUI.openPoll`** → **`#lanternCardDetailOverlay`** (`fillPollDetailModal`), same opened-card and fullscreen media path as news/creation.

---

## 12. Locker (student) — Overview, Items, Store

- **Locker** (`locker.html`) is the unified **native** student destination: **Overview** (identity, recognition, **My Creations**, wallet), **Items** (equip cosmetics), **Store** (spend nuggets). No separate top-level Profile or Store routes in nav; legacy URLs redirect into Locker where applicable.
- **Overview** is **personal**: identity, recognition, **my** work. No new parallel storage or localStorage moderation reads when API mode is on.
- **My Creations** is the canonical aggregation surface on **Locker → Overview**; tabs/filters are **filters only**, not new sources of truth.
- **Student Store** product name is **Store** (tab inside Locker). Do not use “School Store” in user-facing copy.

### Locker surface vocabulary (SP3)

Locker is **one route** with **three parallel naming systems**: **Overview** uses **profile** **`.section`** / **`.sectionHd`** / **`.sectionBd`** (see **`docs/ui/SURFACE_SECTION_CONTRACT.md`** §2); **Items** and **Store** use **`.lockerPanel`** tabpanels and the **`.lockerSection*`** family (plus **`.storePanelRoot`** and generic **`.card`** on Store) — **not** the same as **`.section`** on Overview. **Tab → panel → class map:** **`docs/ui/LOCKER_SURFACE_MAP.md`**. **Build / slices:** **`docs/build-locker-slices.md`**. **Phase record:** **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`**.

- **Tabpanel surface id (SP5):** Each **`#lockerPanel*`** root has **`data-locker-surface="overview"`** \| **`items`** \| **`store`** — queryable, **additive**; **IDs** and **ARIA** unchanged. **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`**.
- **Active tabpanel cue (SP6):** Visible **inset** accent on the **non-**`hidden` panel — **`box-shadow: inset 0 3px 0 0 var(--accent)`** on **`.wrap.lanternContent [data-locker-surface]:not([hidden])`** in **`lockerTabCss`**. **`docs/PHASE-SP6-LOCKER-SURFACE-VISIBLE-PILOT.md`**.

### Teacher — Rewards Panel

- **Rewards Panel** is the **teacher-facing** name for reward control on **`teacher.html`** (grant/manage nuggets via **Approvals**, **Create Mission** rewards, etc.). It is **not** the student Store. Teachers do not use Locker → Store as their tool surface.

### App bar (interactive shell + attention bell)

- **Interactive shell** (shared `lantern-nav.js`): All normal student/teacher app pages that mount `#lanternAppBarRoot` use the same **interactive** header — **Lantern** (home → `explore.html`), **Locker**, **Create**, **Play**, **Menu**, optional center **context** label (e.g. Locker shows the student display name when applicable), **search**, **attention bell** (only when something needs attention), **avatar** menu, **Help**. Same spacing, sticky navy bar, and right-cluster layout.
- **Chevron menu (`#lanternMenuDropdown`):** **NAVIGATION** — Locker, Create, Play, Missions; **STAFF** — Display, Teacher, Verify. **Lantern** remains the primary **Explore** entry; **Create** remains **`contribute.html`**. Redundant **FEED & POSTS** duplicate links were removed (**Phase-SP1.5** — **`docs/PHASE-SP1.5-NAV-DROPDOWN.md`**).
- **Exception — display / projection:** `display.html` uses a **minimal** bar only (Lantern + Menu + context + Help). No search, bell, or avatar strip (projection-friendly).
- **Attention bell:** **Hidden** when the returned / “needs attention” count is **0**. When **> 0**, show the bell with a **subtle wiggle**; **click** goes to **`locker.html#profileNeedsAttention`** (Locker → Overview → My Creations → **Needs Attention** tab). Legacy **`index.html`** may redirect to Locker first. **No** notification dropdown. Count on pages other than Locker → Overview comes from the **same three Worker reads** Locker uses (`/api/polls/contributions`, `/api/missions/submissions/character`, `/api/news/mine`) with `status === 'returned'` (plus Locker dispatches `lantern-needs-attention-count` after My Creations render so the bar matches the canonical list).

---

## 13. Database governance (mandatory)

**Operational rules (summary of former `LANTERN_DB_RULES.md`):**

1. **Migrations:** Root `migrations/` is **legacy/historical only** for Lantern. **All new** Lantern migrations **only** in **`lantern-worker/migrations/`**.
2. **Commands:** Run Wrangler/D1 from **`lantern-worker/`** with correct `wrangler.toml` bindings.
3. **Remote is truth:** Verify production schema with `PRAGMA table_info(table_name)` on **`--remote`** before treating missing data as a UI bug. Local D1 alone is not proof of production.
4. **Field usage:** No field in code unless it exists in **remote D1** and is documented in the **schema contract file** (see §14).
5. **Schema change checklist:** Migration file + update schema contract doc + update status doc if enums change + Worker read/write paths + frontend expectations. Emergency `ALTER` allowed; follow with migration file + doc updates.
6. **Status fields:** Only values from **§15 Appendix A** (or table-specific lists there). No synonyms or ad-hoc strings.
7. **Drift signals:** `no such table/column`, empty API with known rows → verify remote schema first.

Example:

```bash
cd lantern-worker
npx wrangler d1 execute lantern-db --remote --command "PRAGMA table_info(lantern_poll_contributions);"
```

---

## 14. Schema contract file (per-table columns)

The **verbatim** per-table column contract (purposes, columns, read/write notes) is kept in a **single frozen file** in the archive (update it in the **same PR** as schema/migration changes):

**→ `docs/archive/LANTERN_SCHEMA.md`**

Rules:

- **Remote D1** remains the ultimate truth for what exists today; the file can lag — if in doubt, **PRAGMA** wins.
- **`lantern_news`** table does **not** exist; news lives in **`lantern_news_submissions`**.
- Some tables (e.g. class access) may be described in **`docs/archive/PROJECT_PLAN.md`** / worker code before the archive schema doc is extended — **do not invent column names**; verify remotely.

---

## 15. Appendix A — Status values (canonical)

No synonyms or alternate spellings. **Update this appendix first** before adding new stored status strings in code.

### lantern_avatar_submissions.status
- `pending`
- `approved`
- `rejected`

### lantern_news_submissions.status
- `pending`
- `approved`
- `returned`
- `rejected`

### lantern_approvals.status
- `pending`
- `approved`
- `returned`
- `rejected`

### lantern_mission_submissions.status
- `pending`
- `accepted`
- `returned`
- `rejected`

### lantern_poll_contributions.status
- `pending`
- `approved`
- `returned`
- `rejected`

### lantern_bug_reports.status
- `approved`

### Non-status fields (do not treat as status)
- `lantern_test_students.mode`: currently `test` only.
- `lantern_news_submissions.author_type`: e.g. `student`, `teacher`, `staff`, `admin` — actor classification, not moderation status.
- `lantern_missions.submission_type`: mission submission kind (e.g. `text`, `poll`, `bug_report`), not moderation status.

---

## 16. Failure mode

If a change conflicts with this document: **do not proceed silently.** Warn that the request violates **Lantern system context**, then stop or propose a compliant alternative.

---

## 17. Archived copies

Older standalone files (`lantern-architecture.md`, `ARCHITECTURE_CONTRACT.md`, `CARD_SYSTEM.md`, `class-access.md`, `missions.md`, `lantern-verify-system.md`, `LANTERN_DB_RULES.md`, `LANTERN_STATUS_VALUES.md`, audits, plans, etc.) live under **`docs/archive/`** for history. **Do not treat them as current unless cross-checking this file.**
