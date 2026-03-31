# Phase-SP3 — Locker surface / panel pilot

**Status:** **Executed (documentation-first)** — **`docs/ui/LOCKER_SURFACE_MAP.md`** created; **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12 pointer added; **`docs/ui/SURFACE_SECTION_CONTRACT.md`** cross-link added; **no** `build-locker.cjs` template edits in this execution (optional comments deferred).  
**Depends on:** **`docs/ui/SURFACE_SECTION_CONTRACT.md`** · **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** · **`docs/PHASE-SP1-SURFACE-PANEL.md`** · **`docs/PHASE-SP2-EXPLORE-SECTION-GRAMMAR.md`**.  
**Orthogonal:** **Heavy Reseed / Pressure Test** — do **not** bundle (see audit §6.2).

---

## 0. Goal

Define the **first bounded** Locker surface/panel **implementation** slice: make Locker’s **vocabulary and tab structure** **clear and navigable** for engineers **without** merging `.lockerSection` into `.section`, **without** rail or card work, and **without** Store purchase / Items equip **logic** changes.

---

## 1. Current Locker surface / panel vocabulary

### 1.1 Tab chrome + tabpanels (whole page)

| Element | Role |
|---------|------|
| **`.lockerTabs`** + **`role="tablist"`** | Three tabs: Overview, Items, Store |
| **`.lockerTabBtn`** + **`role="tab"`** + **`data-locker-tab`** | Tab buttons; hash routes **`#overview` / `#items` / `#store`** |
| **`#lockerPanelOverview`**, **`#lockerPanelItems`**, **`#lockerPanelStore`** | Each **`class="lockerPanel"`** **`role="tabpanel"`** — **switched** by inline script in **`build-locker.cjs`** (`lockerItemsScript`) |

**Related header/body:** **`lockerTitle`**, **`lockerSubtitle`** — page title block above tabs (inline styles in **`build-locker.cjs`** `lockerTabCss` + template).

### 1.2 Overview tab (`#lockerPanelOverview`)

| Pattern | Where it appears | Meaning |
|---------|------------------|---------|
| **`.section`** + **`.sectionHd`** + **`.sectionBd`** | Profile / My Creations / rails host (from **`locker-sources/index.full.html`** slice → **`overviewMain`**) | Same **“header + padded body”** idiom as **Missions** / contract §2 |
| **`.profileHero`**, **`.yourWinsSection`**, **`.contentTabs`**, etc. | Overview | **Profile** vocabulary (**`lantern-profile-page.css`**) — **not** **`.lockerSection`** |
| **`.lanternScroller`** | Featured / My Creations / other rails | **§11** — **do not** reopen rail program |

### 1.3 Items tab (`#lockerPanelItems`)

| Pattern | Role |
|---------|------|
| **`#lockerSectionsEl`** | **Empty host** — **filled by JS** in **`build-locker.cjs`** `lockerItemsScript` |
| **`.lockerSection`** (created in JS) + **`.lockerSectionHd`** + **`.lanternScroller`** + **`.lockerCard`** | One **cosmetics category** row per group; **not** **`.section`** |

### 1.4 Store tab (`#lockerPanelStore`)

| Pattern | Role |
|---------|------|
| **`.storePanelRoot`** | Store body wrapper (from **`store.full.html`** fragment) |
| **`.lockerSection`** + **`.lockerSectionHd`** + **`.lockerSectionSub`** + **`.lanternScroller`** | Marketing-style **Featured & new**, **Bundles…** rows |
| **`.card`** + **`.cardHd`** + **`.cardBd`** | Wallet, leaderboard shell, info cards — **generic** cards; **not** **`.exploreCard`** production cards |
| **Nested** **`.lockerSection`** (e.g. inside leaderboard **`.cardBd`**) | **Exception** layout for leaderboard rail — **same class family**, scoped by context |

### 1.5 Modals / overlays (Locker)

| Pattern | Role |
|---------|------|
| **`profileStudioModal`**, **`profileStudioSection`**, **`profileStudioSectionH`** | **Edit Profile** — **modal-only** third vocabulary (contract §7) |
| **`storePurchaseOverlay`**, crop overlays, test student modal | **Not** tab surface — SP3 **does not** refactor modals |

---

## 2. Brand primitives vs page-local inventions

### 2.1 Strong / documented (treat as **primitives**)

| Primitive | Authority |
|-----------|-----------|
| **`.wrap.lanternContent`** | System column (**`docs/LANTERN_SYSTEM_CONTEXT.md`**, contract) |
| **`.lockerPanel`** + tab **ARIA** | **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** §3.1 — Locker **tabpanel** pattern |
| **`.lanternScroller`** + **`.exploreCard`** / **`LanternCards`** | §10–11 — **unchanged** by SP3 |

### 2.2 Shared but **not** merged with Overview `.section` (keep distinct in docs)

| Pattern | Notes |
|---------|--------|
| **`.lockerSection`**, **`.lockerSectionHd`**, **`.lockerSectionSub`** | **Items** + **Store**; also **`lantern-rails.css`** — **accent** headers; **do not** rename to **`.section`** in SP3 |

### 2.3 Page-local / profile (not global “Locker section” primitives)

| Pattern | Notes |
|---------|--------|
| **`.storePanelRoot`**, **`.storeWalletBar`**, **`.titleRow`** | **Store** tab — **`lantern-store-panel.css`** |
| **`.profileHero`**, **`.statsCard`**, **`.yourWinsSection`**, … | **Overview** profile — **`lantern-profile-page.css`** |
| **`.lockerCard`** | **Items** cosmetic tile — **not** **`LanternCards`** product card |

**Conclusion:** Locker is **three surfaces in one route**: **Overview (profile `.section*`)**, **Items (JS `.lockerSection*`)**, **Store (static `.lockerSection*` + `.card` + `.storePanelRoot`)**. SP3 **documents** this split; it **does not** unify class names.

---

## 3. Single safest high-leverage Locker surface fix (recommended)

**Problem:** Engineers open **`locker.html`** or **`index.full.html`** and **cannot see** the **three-vocabulary** map in one place; **`build-locker.cjs`** line slices make **blind edits** to **`index.full.html`** dangerous.

**Recommended SP3 fix (lowest risk):**

1. **Add **`docs/ui/LOCKER_SURFACE_MAP.md`** (or equivalent name under **`docs/ui/`**) — **one** table: **Tab → panel `#id` → class families → primary CSS/JS owner → link to contract sections.**  
2. **Add a short pointer** in **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12 (Locker) to **`LOCKER_SURFACE_MAP.md`** and **`SURFACE_SECTION_CONTRACT.md`**.

**Optional same-PR stretch (only if reviewers want visible HTML hints):**  
Insert **HTML comments** **only** in the **`build-locker.cjs`** **template** (the string that wraps **`overviewMain`**, **`lockerPanelItems`**, **`storeMain`** — **not** inside **`ix.slice`** ranges), **then** run **`node build-locker.cjs`** to regenerate **`locker.html`**. **Zero** change to **`index.full.html`** line counts **if** comments are **only** in the template around existing `${overviewMain}` / panel wrappers.

**Do not** add comments **inside** **`overviewMain`** without **updating** **`ix.slice(1392, 1617)`** end index — **forbidden** for SP3 unless a **separate** build-slice maintenance task.

---

## 4. Exact files involved (when SP3 runs)

| Action | Path |
|--------|------|
| **Create** | **`docs/ui/LOCKER_SURFACE_MAP.md`** — tab / panel / vocabulary map (§1–2 distilled) |
| **Edit** | **`docs/LANTERN_SYSTEM_CONTEXT.md`** §12 — link to map + one sentence on three vocabularies |
| **Optional** | **`apps/lantern-app/build-locker.cjs`** — template comments **only** (no slice index edits) |
| **Optional** | **`apps/lantern-app/locker.html`** — **regenerated** output after optional build change |

**Read-only reference (SP3):** **`locker-sources/index.full.html`**, **`locker-sources/store.full.html`**, **`lantern-profile-page.css`**, **`lantern-store-panel.css`**, **`lantern-rails.css`** — **no** edits required for **doc-only** SP3.

---

## 5. What must **not** be touched (SP3 hard exclusions)

| Excluded | Reason |
|----------|--------|
| **`contribute.html`** / **Studio** | Product lock |
| **`lantern-cards.js`**, structural **`lantern-cards.css`**, **rail token** changes | Card + rail program closed |
| **`index.full.html`** / **`store.full.html`** **body** edits **without** **`build-locker.cjs`** slice audit | Line-index **fragility** |
| **`lantern-profile-app.js`**, **`lantern-store-app.js`**, **`lockerItemsScript`** **logic** (equip, store bootstrap, tab switching) | **Not** “surface grammar” |
| **Store purchase**, **wallet API**, **cosmetic** data paths | **Not** SP3 |
| **Renaming** **`#lockerPanel*`** **IDs** or **ARIA** wiring | Breaks tabs / JS |

---

## 6. QA gates

| # | Gate |
|---|------|
| 1 | **`LOCKER_SURFACE_MAP.md`** matches **`SURFACE_SECTION_CONTRACT.md`** and **audit** §1–3 (no invented class names). |
| 2 | **`LANTERN_SYSTEM_CONTEXT.md`** links work; **no** contradiction with §10–11. |
| 3 | If **optional** build template comments + rebuild: **Locker** smoke — **three tabs**, **hash** navigation, **Overview** profile loads, **Items** cosmetics render, **Store** loads **without** new console errors. |
| 4 | **Visual parity** — doc-only SP3: **no** UI change. Build optional path: **no** intended layout delta (comments only). |

---

## 7. Merge criteria

**Merge when:**

- Scope is **only** §3 **recommended** + §4 files (**doc-only** path) **or** doc + **optional** template comments + **regenerated** **`locker.html`** with QA §6.3–6.4.
- **No** bundled rail refactors, **no** card changes, **no** Store/Items **logic** edits, **no** **`index.full`** slice edits without slice math update.

**Do not merge if:**

- **`ix.slice`** indices changed **without** verification **or** **Worker** / **reseed** work slipped in.
- **Studio** or **missions.html** / **explore.html** changes bundled “while we’re here.”

---

## 8. Why this stays **one** bounded pilot

- **Does not** attempt **`.lockerSection` → `.section`** unification (deferred in **`PHASE-SP1`** / audit §4.1).  
- **Does not** reopen **rails** or **redesign** **cards**.  
- **Matches** **SP2** discipline: **clarity first**; **HTML** changes **optional** and **build-template-only** if at all.

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** | Inventory |
| **`docs/ui/SURFACE_SECTION_CONTRACT.md`** | Locker §4–6 |
| **`docs/build-locker-slices.md`** (if present) | Build pipeline rules |
| **`docs/PHASE-SP4-LOCKER-SURFACE-IMPLEMENTATION.md`** | **Executed** — **template-only** HTML comments + regen **`locker.html`** |
| **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`** | **`data-locker-surface`** on **`#lockerPanel*`** (**executed**) |

---

*Phase-SP3 — v1.0 — plan only — Locker surface / panel pilot.*
