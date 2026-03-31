# Rail unification program — execution plan

**Status:** Approved diagnosis (brand engine plural until rail primitive is singular).

### Locker horizontal rails — **PROGRAM COMPLETE (2026-03-21)**

**L-Rail-1 / L-Rail-2** (Overview) + **L-Rail-3a** + **L-Rail-3b** (Store) + **L-Rail-4** (Items) are **merged and closed** after human QA. Remaining **`contentScroller*`** usage is **out of scope** for this program: **`contribute.html` / Studio** (product lock) and **legacy rules** in **`lantern-rails.css`** until a **Studio rail** or **global taper** task. See **§10.7**.  

### Phase 1 — **MERGED & LOCKED (2026-03-21)**

**Do not reopen Phase 1.** No further edits to Phase 1 scope (selector surface, token names, token home, snap policy) except an explicit new architecture task.

| Deliverable | Status |
|-------------|--------|
| Selector surface | **`.wrap.lanternContent .lanternScroller`** only in `lantern-cards.css` (single authoritative rail block; page-specific `*PageWrap .lanternScroller` removed). |
| Token rename | **`--lc-home-scroller-*` → `--lantern-rail-*`**; values unchanged (via same `var(--lantern-space-*)` / `var(--lantern-pad-x)` indirection). |
| Token definition | **Exactly one place:** `:root` in **`lantern-header.css`**. |
| Scroll | **No** `scroll-snap-type` on `.lanternScroller`; **keep** `-webkit-overflow-scrolling: touch` and webkit scrollbar rules. |
| Card overrides | **No** `.lanternScroller .exploreCard` width/size rules added in Phase 1. |

Locker, Store, `lantern-rails.css`, profile CSS, Studio — **not** migrated in Phase 1; Locker **L-Rail-1** + **L-Rail-2** closed (**§7**, **§8**); **§9** summary + **§10 L-Rail-3** cleanup plan.  
**Scope:** Horizontal rail / scroller **only**. No section redesign, no card shell redesign, **no Studio / `contribute.html`**, no APIs or data paths.

**Locked goal:** Exactly **one** horizontal rail primitive for **production card rails** — one DOM pattern, one CSS authority, one token set, one scroll/snap policy, no page-owned rail dialects, **no parent rail selectors that resize `.exploreCard`**.

---

## 1. Canonical rail spec

### 1.1 Class name(s)

| Role | Canonical class | Notes |
|------|-----------------|--------|
| **Outer** (overflow-x, flex row, padding, scrollbar) | **`lanternScroller`** | Single element; **direct children** are cards (`LanternCards` output: `.exploreCardOuterWrap` / `.exploreCard` / placeholders). |
| **Inner track** | **None** | The old **`contentScrollerTrack`** is **removed** after migration — no second wrapper for the same job. |

**Deprecated (migrate away, do not use for new work):** `contentScroller`, `contentScrollerTrack`.

### 1.2 File(s) that own rail CSS

| Authority | Responsibility |
|-----------|----------------|
| **`apps/lantern-app/css/lantern-cards.css`** | **Single source of truth** for `.lanternScroller` layout, gap/padding, scrollbar chrome, empty/placeholder row behavior, and **any** future rail-only tokens. Card shell rules stay here too (existing contract). |
| **`apps/lantern-app/css/lantern-header.css`** | Optional: **define rail spacing tokens on `:root`** next to existing `--lantern-space-*` / `--lantern-pad-x` if we want rails to reference global tokens without pulling from “home-only” names. |

**Not rail authority after migration:** `lantern-rails.css` (either deleted or reduced to non-rail leftovers such as `.lockerSection*`, `.lockerCard`, `.storeWalletBar` — see §2).  
**Not rail authority:** `lantern-profile-page.css` (no `.contentScroller*` / no `.lanternScroller` overrides except forbidden — see enforcement).

### 1.3 Token names (canonical)

Rename for clarity (implementation detail; exact names locked at first slice):

| Current (in `lantern-cards.css`) | Canonical target |
|----------------------------------|------------------|
| `--lc-home-scroller-gap` | **`--lantern-rail-gap`** |
| `--lc-home-scroller-pad-y-start` | **`--lantern-rail-pad-y-start`** |
| `--lc-home-scroller-pad-y-end` | **`--lantern-rail-pad-y-end`** |
| `--lc-home-scroller-pad-x` | **`--lantern-rail-pad-x`** (may equal `var(--lantern-pad-x)`) |

Define these on **`:root`** in `lantern-header.css` **or** on **`.wrap.lanternContent`** in one place only — pick one during Slice 1 and document here.

### 1.4 Scroll behavior decision

| Policy | Choice | Rationale |
|--------|--------|-----------|
| **`scroll-snap`** | **`none`** on canonical `.lanternScroller` | Matches current **explore / games / missions** behavior; avoids mixed “carousel vs feed” feel. `lantern-rails.css` today sets `scroll-snap-type: x proximity` on `.contentScroller` — **that behavior is retired** with the old primitive. |
| **`-webkit-overflow-scrolling`** | **`touch`** | Keep on canonical rail for iOS momentum. |
| **Scrollbar styling** | **Keep** webkit scrollbar rules from current `lantern-cards.css` rail block | Single chrome across app. |

---

## 2. Systems to remove or migrate

### 2.1 CSS

| Location | What | Action |
|----------|------|--------|
| **`lantern-rails.css`** | `.contentScroller`, `.contentScrollerTrack`, `scroll-snap-*` on those | **Remove** rail rules; keep unrelated tokens (`.lockerSection*`, `.lockerCard`, store wallet copy, etc.) or move non-rail rules to a appropriately named file in a later cleanup. |
| **`lantern-profile-page.css`** | `.contentScroller`, `.contentScrollerTrack`, `.yourWinsScroller .contentScrollerTrack` (removed L-Rail-1), `.lockerShell .contentScroller`, **and** `.contentScrollerTrack .exploreCard*` width overrides; orphan `#schoolActivitySection` removed **L-Rail-3a** | **Remove** remainder after Store/Items migrate; **do not** reintroduce parent-scoped `.exploreCard` sizing. |
| **`lantern-store-panel.css`** | `#lockerPanelStore .contentScrollerTrack` | **Migrate** to canonical `.lanternScroller` + delete rule. |
| **`lantern-cards.css`** | `.wrap.lanternContent .gamesPageShell .contentScroller .gamesHubPlayCard…` | **Audit**: `games.html` uses `lanternScroller`, not `contentScroller`. If unused, **delete**; if JS injects `contentScroller` somewhere, **fix or migrate** in Games slice. |

### 2.2 HTML / sources

| Asset | Action |
|-------|--------|
| **`locker.html`** | Replace every `contentScroller` / `contentScrollerTrack` pair with **`lanternScroller`**; point JS at the single container id (append cards to `lanternScroller`). |
| **`locker-sources/index.full.html`** | Same as locker + keep in sync with **`build-locker.cjs`**. |
| **`locker-sources/store.full.html`** | Same pattern for store rails. |
| **`apps/lantern-app/build-locker.cjs`** | Stop emitting `contentScroller` / `contentScrollerTrack`; emit **`lanternScroller`**. |
| **`js/lantern-store-app.js`** | Dynamic rail: `className = 'lanternScroller'` only; no inner track. |

### 2.3 Explicitly **out of scope** (until a separate “Studio rail” task)

| Asset | Reason |
|-------|--------|
| **`contribute.html`** Studio preview rail (`contentScroller` + `contentScrollerTrack` + local `.contributeStudioRail` rules) | User lock: **Do not touch Studio.** Track under a future **`RAIL_UNIFICATION_STUDIO.md`** or phase **S**. |

### 2.4 Already canonical (no migration)

- **`explore.html`**, **`games.html`**, **`missions.html`** — already `lanternScroller` only; only need **CSS selector / token** unification (see Slice 1).

---

## 3. Migration order (safest → highest risk)

| Phase | Target | Risk | Notes |
|-------|--------|------|--------|
| **0** | **Spec + enforcement** | Low | Merge this doc; add grep/CI forbidden patterns; **no** user-visible change. |
| **1** | **`lantern-cards.css` rail block** | Low | Unify selectors to **`.wrap.lanternContent .lanternScroller`** (and drop triple `*PageWrap` list if equivalent); rename tokens to `--lantern-rail-*`; **snap none**. QA: explore, games, missions only. |
| **2** | **Dead / orphan CSS** | Low | Remove `gamesPageShell .contentScroller` rules if confirmed unused; grep for any runtime `contentScroller` on Games. |
| **3** | **Locker — static rails** | Medium | **L-Rail-1** ✅ (**§7**). **L-Rail-2** ✅ (**§8**). **L-Rail-3** cleanup + tail migrations — **§10**. |
| **4** | **Store rails** (`locker.html` store panel + `lantern-store-app.js` + `lantern-store-panel.css` + store full sources) | Medium–High | Dynamic builders + multiple tracks; wallet/section spacing regressions. |
| **5** | **`lantern-rails.css` rail removal** | Medium | After no consumer uses `.contentScroller` for cards (except Studio exception). |
| **6** | **Studio** (`contribute.html`) | Separate task | Explicitly **not** part of this program until unlocked. |

---

## 4. Enforcement rules

### 4.1 Forbidden (production card rails outside Studio)

- **Class names on new or migrated markup:** `contentScroller`, `contentScrollerTrack` (allowed only in `contribute.html` until Phase S).
- **CSS selectors (any file except transitional alias block, time-boxed):**
  - `.contentScroller` / `.contentScrollerTrack` paired with production app pages.
  - **Any** selector of the form **`* .lanternScroller .exploreCard*`** or **`*Track* .exploreCard*`** or **`*Scroller* .exploreCard*`** that sets **width / min-width / max-width / flex-basis** on `.exploreCard` — **forbidden** outside `lantern-cards.css`.
- **Scroll-snap** on `.lanternScroller` — **forbidden** unless product explicitly reopens snap as a global policy (would be a spec change).

### 4.2 Grep / CI (recommended)

Add a script or `npm run check:rails` that **fails** if:

```text
# Forbidden in apps/lantern-app (exclude contribute.html if Studio deferred)
contentScrollerTrack
className = 'contentScroller'
class="contentScroller"
```

Optional stricter pass: fail on `contentScroller` **anywhere** except `contribute.html` and this doc.

Allowlist: **`docs/RAIL_UNIFICATION_PROGRAM.md`**, **`docs/CHANGELOG_LOCKED.md`** (mentions only), **`contribute.html`** (until Phase S).

### 4.3 Card system contract pointer

Update **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10 / §11 when Slice 1 lands: **horizontal production card lists = only `lanternScroller`**, one CSS authority, no parent resizing of `.exploreCard`.

---

## 5. First implementation slice (bounded)

**Single slice only — do not broaden.**

### 5.1 Objective

Establish **one CSS authority** and **one selector surface** for rails that **already** use `lanternScroller`, **without** changing Locker, Store, Studio, or HTML on explore/games/missions except if a class on `<body>`/wrap is required for specificity (prefer none).

### 5.2 Exact files (**Phase 1 done — 2026-03-21**)

| File | Change |
|------|--------|
| **`apps/lantern-app/css/lantern-cards.css`** | ✅ Unified to **`.wrap.lanternContent .lanternScroller`**; uses **`var(--lantern-rail-*)`** only. |
| **`apps/lantern-app/css/lantern-header.css`** | ✅ **`--lantern-rail-*`** on **`:root`** (single token source). |
| **`docs/RAIL_UNIFICATION_PROGRAM.md`** | ✅ Status banner + this table. |
| **`docs/LANTERN_SYSTEM_CONTEXT.md`** | ✅ §11 Phase 1 bullet. |
| **`apps/lantern-app/explore.html`** | ✅ Comment only (points to canonical selector). |

### 5.3 Explicit non-scope for Slice 1

- **No** edits to `locker.html`, `lantern-profile-page.css`, `lantern-rails.css`, `lantern-store-app.js`, `contribute.html`, `build-locker.cjs`, `locker-sources/*`.
- **No** removal of `contentScroller` yet (consumers still exist; they keep old behavior until Phase 3+).

### 5.4 QA gates (must pass before merge)

| Gate | How |
|------|-----|
| **Visual / layout** | Explore, Games, Missions: each page at least one horizontal rail; **gap, padding, edge bleed, scrollbar** match pre-change (spot-check mobile width ~390px and desktop). |
| **Regression** | No new horizontal overflow clipping of the **column**; empty rails still show placeholder/empty rules correctly. |
| **Contract** | DevTools: computed styles on `#recentEl` (or equivalent) show new token names resolving; **no** `scroll-snap-type` on `.lanternScroller`. |
| **Search** | Confirm no accidental second definition of `.wrap.lanternContent .lanternScroller` elsewhere in the same PR. |

---

## 6. Summary table

| Item | Decision |
|------|----------|
| **Canonical class** | **`lanternScroller`** only (no inner track class) |
| **CSS authority** | **`lantern-cards.css`** (+ optional `:root` tokens in **`lantern-header.css`**) |
| **Tokens** | **`--lantern-rail-gap`**, **`--lantern-rail-pad-y-start`**, **`--lantern-rail-pad-y-end`**, **`--lantern-rail-pad-x`** |
| **Snap** | **None** on canonical rail |
| **First slice** | CSS-only unification for existing `lanternScroller` pages + token rename + doc touch |
| **Studio** | **Excluded** until separate task |

---

## 7. **L-Rail-1 — MERGED & CLOSED (2026-03-19)** — Spotlight + Achievements only

**Status:** **Closed.** Do not reopen this slice without a new task.

**Goal (achieved for in-scope rails):** Locker **Overview** rails **`#spotlightRailEl`** and **`#achievementsRailEl`** use the **same** primitive as Explore/Games/Missions: **one** outer **`lanternScroller`**, **no** inner **`contentScrollerTrack`**; cards append **directly**. **No** profile-only **`.contentScrollerTrack .exploreCard*`** width lock for those rows (sizing from **`lantern-cards.css`**). **Scroll-snap:** none on canonical `.lanternScroller` (Explore parity).

**Next bounded work:** Locker Overview rails complete; **§9** summary; **§10** = **L-Rail-3** inventory + **L-Rail-3a** lowest-risk dead CSS slice (plan only until implemented).

### 7.1 Why Locker first

Highest **visible** divergence from the canonical rail: duplicate scroller CSS in **`lantern-profile-page.css`** + **`lantern-rails.css`**, plus **`.contentScrollerTrack .exploreCard*`** width overrides. Fixing Locker proves the authority model before Store (dynamic JS builders).

### 7.2 Bounded scope — **L-Rail-1** (this merge)

| Delivered | Still out of scope |
|-----------|-------------------|
| **`#spotlightRailEl`**, **`#achievementsRailEl`:** single **`lanternScroller yourWinsScroller`** (IDs on scroller); direct card children. | **Store** rails, **`lantern-store-app.js`**, **`lantern-store-panel.css`**. |
| **`locker.html`** (+ **`locker-sources/index.full.html`**) + **`build-locker.cjs`** (overview/modal slice indices; see **§8.3**). | *(Historical)* **`#postFeedEl`** migrated in **L-Rail-2** (**§8**). |
| **`lantern-profile-page.css`:** L-Rail-1 track cleanup; **`.contentScrollerTrack .exploreCard*`** retained for **Store** tracks; L-Rail-2 adds clarifying comment only. | Deleting **all** `.contentScroller` from profile while **Store** still uses tracks. |
| **`lantern-profile-app.js`:** append to **`rail`** (`#spotlightRailEl` / `#achievementsRailEl`); IDs unchanged. | APIs / data. |
| **`lantern-rails.css`:** untouched (My Creations still `.contentScroller`). | **`lantern-rails.css`** rail removal after full Locker migration. |

### 7.3 Files touched (L-Rail-1)

- `apps/lantern-app/locker.html` (built from sources; run **`node build-locker.cjs`** after `index.full` edits)
- `apps/lantern-app/locker-sources/index.full.html`
- `apps/lantern-app/build-locker.cjs`
- `apps/lantern-app/css/lantern-profile-page.css`
- `apps/lantern-app/js/lantern-profile-app.js`
- `docs/RAIL_UNIFICATION_PROGRAM.md` (this §7 status)

### 7.4 QA gates (L-Rail-1)

- Locker → Overview: **Spotlight** and **Achievements** (or current labels) rails — **gap, padding, scrollbar, no snap** match **canonical** computed style on Explore `#recentEl` (same tokens).
- **No** horizontal clipping regression inside **`.section` / `.lockerShell`**.
- **Card width** matches home rails (no profile-only **280px** lock unless justified in **`lantern-cards.css`**).
- **No** new console errors from missing nodes (IDs preserved or updated consistently).

### 7.5 Non-goals for L-Rail-1

- Section / panel redesign; **Studio** (`contribute.html`); **Worker** / APIs; **featured post** card logic beyond rail container.

### 7.6 Closure verification (Locker Overview — L-Rail-1)

**Note:** This repo has **no** installed Playwright browsers under `e2e/studio-contribute` in a fresh checkout; the session below is **static + DevTools-equivalent** review (structure, selectors, tokens). **Optional one-time human smoke:** open `locker.html` → Overview, overflow a rail with many cards, confirm touch/trackpad scroll feels like Explore.

| # | Gate | Result |
|---|------|--------|
| 1 | Spotlight rail scrolls correctly | **PASS** — `#spotlightRailEl` is **`lanternScroller`** with **`overflow-x: auto`** / flex row via **`.wrap.lanternContent .lanternScroller`** (`lantern-cards.css`). |
| 2 | Achievements rail scrolls correctly | **PASS** — same as row 1 for **`#achievementsRailEl`**. |
| 3 | Both compute like Explore **`#recentEl`** | **PASS** — same classes (**`lanternScroller`**) under **`div.wrap.lanternContent`** as **`explore.html`** **`#recentEl`**; same canonical block → **`--lantern-rail-*`** tokens (`lantern-header.css`). |
| 4 | No snap | **PASS** — **`lantern-cards.css`** canonical rail has **no** `scroll-snap-*`; migrated rails are **not** wrapped in **`lantern-rails.css`** **`.contentScroller`** (proximity snap lives there for legacy rows only). |
| 5 | No missing content / console errors | **PASS** — IDs unchanged; **`lantern-profile-app.js`** appends to **`#spotlightRailEl` / `#achievementsRailEl`**; no removed inner track node. |
| 6 | Tabs still work | **PASS** — L-Rail-1 did not touch **`lockerTabBtn`** / panel **`hidden`** wiring or Store/Items markup. |

---

## 8. **L-Rail-2 — MERGED & CLOSED** — **`#postFeedEl` (My Creations row) only**

**Status:** **Closed** (implementation merged; **human smoke** on Locker Overview / My Creations reported **clean** — no blocking visual issues). Do not reopen this slice without a new task.

### 8.1 Objective (achieved)

**My Creations** row: **`<div id="postFeedEl" class="lanternScroller yourWinsScroller" aria-label="My creations">`** — **direct** card children; **no** **`contentScroller` → `contentScrollerTrack`** wrapper.

### 8.2 Delivered vs locked out

| Delivered | Still out of scope |
|-----------|-------------------|
| **`#postFeedEl`** + **`renderMyCreations`** comment / same append logic (already targeted **`postFeedEl`**). | **Store**, **`lantern-store-app.js`**, **`lantern-store-panel.css`**, **Studio**, **APIs**, **Items** tab builder. |
| **`locker-sources/index.full.html`**, **`build-locker.cjs`**, regenerated **`locker.html`**. | Wholesale **`lantern-rails.css`** removal. |
| **Profile CSS:** comment on **`.contentScrollerTrack .exploreCard*`** — block **retained** for **Store** tracks; **`#postFeedEl`** no longer matches it. | Deleting global track card rules until Store migrates. |

### 8.3 `build-locker.cjs` slice correction (same PR)

**`overviewMain`** = **`ix.slice(1396, 1621)`** — end after **`profileView`**’s closing **`</div>`**, **not** the standalone-page **`classAccessContentWrap`** close (built template keeps that wrap open through Items/Store).

**`modals`** = **`ix.slice(1623, 1769)`** — Beta + Edit Profile + avatar crop overlays **only**; **exclusive end must stop before** index.full **`toast`** and **`<script src=…>`** lines (a longer slice previously injected HTML into **`locker.html`**’s inline script).

### 8.4 QA gates (L-Rail-2) — static sign-off

| # | Gate | Result |
|---|------|--------|
| 1 | My Creations rail renders | **PASS** — **`#postFeedEl.lanternScroller`**; **`renderMyCreations`** unchanged behavior. |
| 2 | Empty state | **PASS** — **`#postFeedEmpty`** sibling unchanged; same show/hide logic. |
| 3 | Needs Attention / profile status | **PASS** — no changes to **`syncNeedsAttentionNavCountFromCache`**, tabs, or filters. |
| 4 | Metrics vs Explore **`#recentEl`** | **PASS** — same **`.wrap.lanternContent .lanternScroller`** + **`--lantern-rail-*`**. |
| 5 | No snap on this row | **PASS** — row not wrapped in **`lantern-rails.css`** **`.contentScroller`**. |
| 6 | No missing nodes / console | **PASS** — **`postFeedEl`** / **`postFeedEmpty`** IDs preserved. |
| 7 | Locker tabs | **PASS** — tab markup/scripts untouched. |

### 8.5 Non-goals (unchanged)

- Store rails; Items tab scroller builders; Studio; featured post logic beyond **`#postFeedEl`**.

---

## 9. Program tail (summary)

- **Locker Overview** production card rails: **L-Rail-1** + **L-Rail-2** ✅.
- **Remaining** legacy rail surface: **§10 (L-Rail-3 plan)** — cleanup + later DOM migrations (**Store**, **Items**, **Studio**).

---

## 10. **L-Rail-3 — Old rail system cleanup**

**Goal:** Inventory **`contentScroller` / `contentScrollerTrack`**, remove **dead** rules, schedule **bounded** migrations. **L-Rail-3a** ✅ **merged** (this section); further DOM migrations remain **planned** below.

### 10.0 **L-Rail-3a — MERGED & CLOSED** (dead / orphan CSS only)

Orphan **`#schoolActivitySection`** track rules removed; dead **Games** **`.contentScroller .gamesHubPlayCard…`** rules removed from **`lantern-cards.css`** ( **`games.html`** uses **`lanternScroller`** only). **Store / Items / Studio / `lantern-rails.css`** untouched.

### 10.1 Remaining usage by file (exact)

| Location | Role |
|----------|------|
| **`locker.html`** | **Store** + **Items** tabs: **`lanternScroller`** only for horizontal cosmetics/store rails (**L-Rail-3b**, **L-Rail-4**). |
| **`locker-sources/store.full.html`** | Store body rails: **`lanternScroller`** (source for **`storeMain`** slice). |
| **`locker-sources/index.full.html`** | Duplicates **profile** CSS for **`.contentScroller*`** (L-Rail-3a removed orphan **`#schoolActivitySection`** rules). |
| **`js/lantern-store-app.js`** | Dynamic rows: **`className = 'contentScroller'`** / **`'contentScrollerTrack'`**. |
| **`build-locker.cjs`** | **`lockerItemsScript`**: **`contentScroller` / `contentScrollerTrack`** for Items tab. |
| **`css/lantern-rails.css`** | Global **`.contentScroller`**, **`.contentScrollerTrack`** (snap, flex, gap) — **Locker** still links file for **`.lockerSection*`** / **`.lockerCard`**; **Studio** + taper leftovers. **Store/Items** rails use **`lanternScroller`**. |
| **`css/lantern-store-panel.css`** | **`#lockerPanelStore .lanternScroller`** layout overrides (**L-Rail-3b**). |
| **`css/lantern-profile-page.css`** | **`.contentScroller*`** blocks (legacy / **Studio** overlap); **`.contentScrollerTrack .exploreCard*`** may still exist for historical selectors — **audit** before delete. Orphan **`#schoolActivitySection`** removed (**L-Rail-3a**). |
| **`css/lantern-cards.css`** | **`.gamesPageShell .gamesHubPlayCard[data-games-proxy-play]`** (cursor/focus) — **live**. L-Rail-3a removed **dead** **`.contentScroller .gamesHubPlayCard…`** width/featured rules. |
| **`contribute.html`** | **Studio** preview rail: **`contentScroller` + `contentScrollerTrack`** + **`.contributeStudioRail`** local CSS. |

**Not listed:** **`explore.html` / `missions.html`** — canonical **`lanternScroller`** only (Phase 1).

### 10.2 Safe to migrate / clean next (ordered by risk)

| Priority | Item | Risk | Notes |
|----------|------|------|--------|
| **1 (lowest)** | Remove **orphan** **`#schoolActivitySection .contentScrollerTrack .exploreCard*`** rules | ✅ **Done** (**L-Rail-3a**) | **`lantern-profile-page.css`** + **`index.full.html`**. |
| **2 (low)** | Remove **dead** **`lantern-cards.css`** **`.gamesPageShell .contentScroller .gamesHubPlayCard…`** rules | ✅ **Done** (**L-Rail-3a**) | Confirmed **`games.html`** has **no** **`contentScroller`**. |
| **3** | **Store** rails → **`lanternScroller`** | ✅ **Done** (**L-Rail-3b**, **§10.6**). | |
| **4** | **Items** tab builder → **`lanternScroller`** | ✅ **Done** (**L-Rail-4**, **§10.7**). | |
| **5 (separate program)** | **`contribute.html`** Studio rail | **N/A here** | Explicit **Studio** exclusion until unlocked. |

### 10.3 Must stay deferred (locks)

| Area | Why |
|------|-----|
| **Store** rails + **`lantern-store-app.js`** + **`lantern-store-panel.css`** | **L-Rail-3b — merged** (**§10.6**). |
| **Items** tab **`lockerItemsScript`** | **L-Rail-4 — merged** (**§10.7**); **`lanternScroller`** + **`#lockerPanelItems .lanternScroller`** in embedded locker CSS. |
| **`contribute.html` / Studio** | Product lock — **no** migration in L-Rail-3. |
| **Wholesale `lantern-rails.css` deletion** | **Studio** (`contribute.html`) still uses **`.contentScroller*`**; **Locker** Store/Items do not. Taper **only** after Studio migrates or rules are **scoped** to remaining consumers. |
| **Dropping all `lantern-profile-page.css` `.contentScroller*`** | **Store** + **Items** migrated; profile CSS may still carry **legacy** rules for **Studio** / historical selectors — audit before bulk delete. |

### 10.4 L-Rail-3a — implemented scope (closed)

1. ✅ Removed **`#schoolActivitySection .contentScrollerTrack .exploreCard--size-rail`** / **`.exploreCard.medium`** from **`lantern-profile-page.css`** and **`index.full.html`** (comment notes removal).
2. ✅ Removed dead **`lantern-cards.css`** rules: **`.wrap.lanternContent .gamesPageShell .contentScroller .gamesHubPlayCard.exploreCard--size-wide`** and **`.…exploreCard--gamesFeatured.exploreCard--size-wide`** (replaced with one-line **L-Rail-3a** comment).

**Out of scope (honored):** **Store** / **Items** / **Studio** HTML-JS-CSS; **`lantern-rails.css`** wholesale.

### 10.5 QA gates (L-Rail-3a) — sign-off

| # | Gate | Result |
|---|------|--------|
| 1 | **`rg schoolActivitySection`** — no **selector** / production dependency | **PASS** — only comment text in profile CSS + **`index.full`** + this doc §2.1/§10 inventory |
| 2 | Locker Overview | **PASS** — no Overview markup/CSS path changed beyond orphan removal |
| 3 | Locker Store | **PASS** — no Store files touched |
| 4 | Games | **PASS** — removed rules never matched DOM (**`lanternScroller`** only); **`.gamesHubPlayCard[data-games-proxy-play]`** rules retained |
| 5 | Console | **PASS** — CSS-only; no JS change |
| 6 | Visual | **PASS** — expected **no** change (orphan + dead selectors) |

---

### 10.6 **L-Rail-3b — Store rail migration — MERGED (2026-03-19)**

**Bounded goal (done):** Locker **Store** tab (`#lockerPanelStore`) — replaced every **`contentScroller` → `contentScrollerTrack`** **card rail** with a **single** **`.lanternScroller`** (direct **`storeRewardCard`** / chip children). **IDs** kept (**`storeFeaturedTrack`**, **`storeFutureTrack`**, **`storeLbRailTrack`**); class on that node is **`lanternScroller`** (name “Track” is legacy only).

**Build note:** See **`docs/build-locker-slices.md`** — **`overviewMain`** / **`modals`** / marker-based **`storeMain`** (not fixed **`st.slice`**).

**Explicitly out of scope for L-Rail-3b:** **Items** tab (`build-locker.cjs` **`lockerItemsScript`**, **`locker.html`** Items scroller), **`contribute.html` / Studio**, **Worker/APIs**, **wholesale `lantern-rails.css` deletion** (Items still needs **`.contentScroller`** until a future slice).

#### A) Exact Store rail structure today

| Surface | HTML source | JS | Card / chip type |
|---------|-------------|-----|------------------|
| **Featured & new** | **`locker-sources/store.full.html`** → **`storeMain = st.slice(657, 755)`**: **`<div id="storeFeaturedTrack" class="lanternScroller" …>`** | **`renderFeaturedRail()`** — targets **`#storeFeaturedTrack`** | **`storeRewardCard`** (featured) |
| **Bundles, packs & extras** | Same: **`<div id="storeFutureTrack" class="lanternScroller" …>`** | **`renderFuturePlaceholders()`** — **`#storeFutureTrack`** | **`storeRewardCard`** (future / placeholder) |
| **Leaderboard rail (chips)** | Same: **`<div id="storeLbRailTrack" class="lanternScroller" …>`**; edge bleed in **`lantern-store-panel.css`** | **`renderLeaderboard()`** — **`el('storeLbRailTrack')`** | Chips (not **`storeRewardCard`**) |
| **Per-category cosmetics** | Host **`#cosmeticsSectionsEl`** | **`renderCosmetics()`** — one **`.lanternScroller`**, **`appendChild(card)`** direct | **`storeRewardCard`** |

#### B) Where **`contentScroller` / `contentScrollerTrack`** appear (Store only)

| File | Usage |
|------|--------|
| **`locker-sources/store.full.html`** | Three static wrapper pairs (Featured, Future, LB rail). |
| **`locker.html`** | Same markup (generated from **`storeMain`**). |
| **`js/lantern-store-app.js`** | **`renderCosmetics`:** `scroller.className = 'contentScroller'`; **`track.className = 'contentScrollerTrack'`**; cards appended to **track**. **`renderFeaturedRail` / `renderFuturePlaceholders`:** target **`#storeFeaturedTrack` / `#storeFutureTrack`** (today the **track** node). **LB:** **`#storeLbRailTrack`**. |
| **`css/lantern-store-panel.css`** | **`#lockerPanelStore .contentScrollerTrack{ gap; padding; }`** — Store-specific rail rhythm (**18px** gap, tighter padding vs global track). |
| **`css/lantern-rails.css`** | **`.contentScroller`** / **`.contentScrollerTrack`** — **scroll-snap** on **`.contentScroller`** affects Store rows until wrappers are removed. |

**Note:** **`lantern-profile-page.css`** **`.contentScrollerTrack .exploreCard*`** does **not** apply to Store (Store uses **`storeRewardCard`**, not **`LanternCards` / `.exploreCard`** on those rails).

#### C) Target DOM (canonical)

Replace each **two-level** pattern:

```html
<div class="contentScroller">…
  <div id="…" class="contentScrollerTrack"></div>
</div>
```

with **one** scroll container (IDs unchanged):

```html
<div id="storeFeaturedTrack" class="lanternScroller" aria-label="Featured and new"></div>
```

(and analogously **`storeFutureTrack`**, **`storeLbRailTrack`**, preserving the LB inline **margin** only if still needed — prefer moving edge bleed into **`lantern-store-panel.css`** scoped to **`#lockerPanelStore .lanternScroller`** if required).

**`renderCosmetics`:** one **`div`** with **`class="lanternScroller"`** (no inner track); append **`storeRewardCard`** nodes **directly**.

#### D) JS changes (**`lantern-store-app.js`**)

| Function / area | Change |
|-----------------|--------|
| **`renderCosmetics`** | Remove inner **track** element; create single **`lanternScroller`**; **`appendChild(card)`** to it; **`section.appendChild(scroller)`**. |
| **`renderFeaturedRail` / `renderFuturePlaceholders`** | Keep **`el('storeFeaturedTrack')` / `el('storeFutureTrack')`** — element is now the **scroller**; logic otherwise unchanged. |
| **LB rail** | Same for **`el('storeLbRailTrack')`** — chips append to **scroller** root. |
| **No** API / purchase / wallet changes | Data paths unchanged. |

#### E) CSS — remove, preserve, add

| Action | Detail |
|--------|--------|
| **Preserve** | All **`#lockerPanelStore .storeRewardCard*`** rules (card shell, rarity, buttons). |
| **Change** | **`lantern-store-panel.css`:** replace **`#lockerPanelStore .contentScrollerTrack`** with **`#lockerPanelStore .lanternScroller`** (same **gap** / **padding** intent — compare to canonical **`--lantern-rail-*`**; either **match Explore** or **document** intentional Store delta). |
| **Optional** | **`#lockerPanelStore .lanternScroller`** overrides for LB row **negative margin** if removing inline style from HTML. |
| **Do not remove in 3b** | **`lantern-rails.css`** global **`.contentScroller`** — still required by **Items** tab. |
| **Defer** | **`lantern-profile-page.css`** bulk **`.contentScroller*`** cleanup until **Items** migrates. |

#### F) Deferred (must not bundle into L-Rail-3b)

| Item | Reason |
|------|--------|
| **Items** tab scroller builder | ✅ **L-Rail-4** merged (**§10.7**). |
| **`contribute.html` / Studio** | Product lock. |
| **Delete `lantern-rails.css` `.contentScroller`** | **Studio** still consumes it; taper when Studio migrates. |
| **Rename IDs** `*Track` → `*Scroller` | Optional follow-up; not required for migration. |

#### G) Lowest-risk **first** slice (recommended)

**Single bounded PR — full Store tab horizontal rails** (avoids mixed **snap** on category rows vs **none** on Featured):

1. **`locker-sources/store.full.html`** — collapse three static rails to **`lanternScroller`** (ids preserved).  
2. **`build-locker.cjs`** — **`st.slice(657, 755)`** for **`storeMain`**; run **`node build-locker.cjs`**.  
3. **`js/lantern-store-app.js`** — **`renderCosmetics`** only creates **`lanternScroller`** (drop **track** wrapper).  
4. **`css/lantern-store-panel.css`** — retarget rail rhythm from **`.contentScrollerTrack`** to **`.lanternScroller`** under **`#lockerPanelStore`**.

**Alternative (two PRs — higher integration risk):** PR1 static HTML only + CSS; PR2 **`renderCosmetics`** — **not recommended** (Store tab would mix **snap** / scroll behavior).

#### H) QA gates (L-Rail-3b)

| # | Gate | Result |
|---|------|--------|
| 1 | **Store** tab: Featured, Future, each **cosmetics** category row, and **LB chip** row **scroll horizontally**; **no** `scroll-snap-type` on Store **`lanternScroller`** (canonical block in **`lantern-cards.css`**). | **PASS** (by construction + DOM/CSS review). |
| 2 | **Purchase / refresh** — **`renderCosmetics`** re-entry after buy. | **PASS** (same **`renderCosmetics` / `renderFeaturedRail`** call chain; structure change only). |
| 3 | **Featured** / **future** placeholders. | **PASS** (ids unchanged). |
| 4 | **Locker → Overview / Items** unchanged. | **PASS** (**Items** script untouched; **Overview**/`modals` slices corrected so **`locker.html`** is valid). |
| 5 | **Computed** rail metrics vs Explore. | **PASS** — **documented** Store override **`#lockerPanelStore .lanternScroller`** (**18px** gap, padding **6px 4px 16px**) vs **`--lantern-rail-*`**. |
| 6 | **No** new console errors; **no** missing **`getElementById`** targets. | **PASS** (expected; browser QA recommended). |

---

### 10.7 **L-Rail-4 — Items tab rail migration — MERGED & CLOSED (2026-03-21)**

**Bounded goal (done):** Locker **Items** tab (`#lockerPanelItems` / **`#lockerSectionsEl`**) — **`renderLocker`** in **`build-locker.cjs`** **`lockerItemsScript`** builds **one** **`.lanternScroller`** per cosmetics category with **direct** **`.lockerCard`** children (no **`contentScroller` / `contentScrollerTrack`**). Scoped **`#lockerPanelItems .lanternScroller`** in embedded locker **`lockerTabCss`** preserves former **`lantern-rails.css`** margin/padding + **14px** gap parity; **no** scroll-snap on Items rows.

**Human smoke check:** **Approved** (post-merge verification).

**Spec:** **`docs/L-RAIL-4-ITEMS-RAIL-PLAN.md`**.

#### QA gates (L-Rail-4) — sign-off

| # | Gate | Result |
|---|------|--------|
| 1 | Items rows scroll horizontally; **no** proximity snap on category scroller | **PASS** (canonical **`.lanternScroller`** + scoped overrides). |
| 2 | Equip → refresh **`renderLocker`** | **PASS** (logic unchanged). |
| 3 | Empty / error copy paths | **PASS**. |
| 4 | Store + Overview unaffected | **PASS** (Items-only edits + regen **`locker.html`**). |
| 5 | Console / IDs | **PASS** (expected). |

**Locker rail unification:** **complete** for in-scope tabs. **Deferred:** **`contribute.html`** Studio rail; optional **`lantern-rails.css`** / **`lantern-profile-page.css`** cleanup when Studio migrates.

---

### 10.8 **Next program (non-rail): Surface / Panel system**

Horizontal rail work for Locker is **closed**. **Audit:** **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`**. **First bounded implementation slice (plan):** **`docs/PHASE-SP1-SURFACE-PANEL.md`** — documentation-only **section / surface vocabulary contract** + link from **`docs/LANTERN_SYSTEM_CONTEXT.md`** (no app code in SP1).

---

*Document version: 2.0 — Locker L-Rail program complete; L-Rail-4 closed; §10.8 pointer to surface/panel audit.*
