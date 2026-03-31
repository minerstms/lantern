# Locker — surface / panel map

**Purpose:** Single **tab → panel → vocabulary** reference for **`locker.html`** (assembled by **`apps/lantern-app/build-locker.cjs`** — see **`docs/build-locker-slices.md`**).  
**Normative rules:** **`docs/ui/SURFACE_SECTION_CONTRACT.md`** (Locker §4–7) · **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10–12.  
**Plan:** **`docs/PHASE-SP3-LOCKER-SURFACE-PILOT.md`** (executed doc-first). **SP4 (executed):** **`docs/PHASE-SP4-LOCKER-SURFACE-IMPLEMENTATION.md`** — panel-root **`<!-- -->`** comments in **`build-locker.cjs`** + **`locker.html`** regen. **SP5 (executed):** **`docs/PHASE-SP5-LOCKER-SURFACE-PILOT.md`** — **`data-locker-surface="overview|items|store"`** on each **`#lockerPanel*`** (template + regen). **SP6 (executed):** **`docs/PHASE-SP6-LOCKER-SURFACE-VISIBLE-PILOT.md`** — **`box-shadow: inset 0 3px 0 0 var(--accent)`** on **`.wrap.lanternContent [data-locker-surface]:not([hidden])`** (**`lockerTabCss`** only).

**Core idea:** Locker is **one route** with **three parallel class families** — do **not** merge **`.lockerSection*`** into **`.section*`** in a quick patch.

---

## 1. Page shell + tabs

| Piece | Classes / markup | Role |
|-------|------------------|------|
| Column | **`.wrap.lanternContent`** | Shared page column |
| Title block | **`.lockerTitle`**, **`.lockerSubtitle`** | Heading above tabs |
| Tab list | **`.lockerTabs`**, **`role="tablist"`** | Overview / Items / Store |
| Tab buttons | **`.lockerTabBtn`**, **`role="tab"`**, **`data-locker-tab`**, **`#lockerTabOverview`**, **`#lockerTabItems`**, **`#lockerTabStore`** | Hash routes **`#overview`**, **`#items`**, **`#store`** |

**Script owner (tab visibility):** Inline **`lockerItemsScript`** in **`build-locker.cjs`** — **do not** change IDs/ARIA without updating that script.

---

## 2. Tabpanels (three roots)

| Tab | Panel `#id` | **`data-locker-surface`** | Class | ARIA |
|-----|-------------|----------------------------|-------|------|
| Overview | **`lockerPanelOverview`** | **`overview`** | **`lockerPanel`** | **`role="tabpanel"`**, **`aria-labelledby="lockerTabOverview"`** |
| Items | **`lockerPanelItems`** | **`items`** | **`lockerPanel`** | **`role="tabpanel"`**, **`aria-labelledby="lockerTabItems"`**, **`hidden`** when not active |
| Store | **`lockerPanelStore`** | **`store`** | **`lockerPanel`** | **`role="tabpanel"`**, **`aria-labelledby="lockerTabStore"`**, **`hidden`** when not active |

**Primitive:** **`.lockerPanel`** is the **Locker tabpanel** pattern (audit §3.1). **Not** a global app wrapper outside Locker. **`data-locker-surface`** (Phase-SP5) is the **stable, queryable** surface id on each panel root — **`overview` \| `items` \| `store`**. **Phase-SP6:** the **visible** (non-`hidden`) panel gets **`box-shadow: inset 0 3px 0 0 var(--accent)`** via **`lockerTabCss`**.

---

## 3. Overview (`#lockerPanelOverview`) — profile **`.section*`** vocabulary

**Source body:** Spliced from **`locker-sources/index.full.html`** via **`overviewMain`** in **`build-locker.cjs`** — **line-indexed**; **do not** insert lines above the slice without updating **`ix.slice`** ranges.

| Pattern | Typical use | CSS home |
|---------|-------------|----------|
| **`.section`** + **`.sectionHd`** + **`.sectionBd`** | Major modules (My Creations, etc.) | **`lantern-profile-page.css`** |
| **`.profileHero`**, **`.yourWinsSection`**, **`.contentTabs`**, … | Identity, rails, achievements | **`lantern-profile-page.css`** |
| **`.lanternScroller`** | Horizontal **production** card rails | **`lantern-cards.css`** + §11 |

**Not used here for main vertical marketing rows:** **`.lockerSection*`** — that family is **Items** and **Store** (see §4–5).

---

## 4. Items (`#lockerPanelItems`) — **`.lockerSection*`** + **`.lockerCard`**

| Piece | Role |
|-------|------|
| **`#lockerSectionsEl`** | **Empty host**; **filled by JS** (`renderLocker` in **`build-locker.cjs`** `lockerItemsScript`) |
| **`.lockerSection`** (created in JS) + **`.lockerSectionHd`** | One **cosmetics category** block |
| **`.lanternScroller`** | Horizontal **rail** for **`.lockerCard`** tiles |
| **`.lockerCard`** | **Cosmetic** tile — **not** **`LanternCards`** / **`.exploreCard`** |

**Style:** **`lockerTabCss`** in **`build-locker.cjs`** includes **`#lockerPanelItems .lanternScroller`** gap/padding; **`lantern-rails.css`** also relates to **`.lockerSection*`** patterns.

---

## 5. Store (`#lockerPanelStore`) — **`.storePanelRoot`** + **`.lockerSection*`** + generic **`.card`**

| Piece | Role |
|-------|------|
| **`.storePanelRoot`** | Wrapper for Store fragment from **`locker-sources/store.full.html`** |
| **`.lockerSection`**, **`.lockerSectionHd`**, **`.lockerSectionSub`** | Featured / marketing rows + **`.lanternScroller`** |
| **`.card`**, **`.cardHd`**, **`.cardBd`** | Wallet, leaderboard **shell**, info panels — **generic** cards; **not** production **`.exploreCard`** |
| **Nested** **`.lockerSection`** | **Exception** (e.g. leaderboard quick rail inside a **`.cardBd`**) — same class family, **context-scoped** |

**CSS:** **`lantern-store-panel.css`**, **`lantern-rails.css`** as applicable.

---

## 6. Modals (out of tab surface)

| Pattern | Role |
|---------|------|
| **`profileStudioSection`**, **`profileStudioSectionH`** | **Edit Profile** modal only — contract §7 |
| **`storePurchaseOverlay`**, crop / test-student overlays | Overlays — **not** tabpanels |

---

## 7. Quick reference — “which vocabulary do I use?”

| You are editing… | Use |
|------------------|-----|
| **Locker → Overview** profile modules | **`.section`** + **`.sectionHd`** + **`.sectionBd`** (and profile classes) |
| **Locker → Items** cosmetics rows | **`.lockerSection*`** + **`.lanternScroller`** + **`.lockerCard`** (JS-built) |
| **Locker → Store** marketing rows | **`.lockerSection*`** + **`.lanternScroller`**; wallet/leaderboard **`.card`** |
| **Horizontal rails / cards** | **`.lanternScroller`** + **`LanternCards`** / **`.exploreCard`** — §10–11 |

---

## 8. Build pipeline (read before editing HTML)

- **`apps/lantern-app/build-locker.cjs`** assembles **`locker.html`** from **`verifyBlock`**, **`overviewMain`** (`ix.slice` from **`index.full.html`**), **`modals`**, **`storeMain`** (from **`store.full.html`**), **`lockerTabCss`**, **`lockerItemsScript`**, template.
- **Do not** change **`index.full.html`** / **`store.full.html`** **without** checking **`docs/build-locker-slices.md`** and **`ix.slice` / `st.slice`** math.

---

*Locker surface map — v1.0 — documentation-only (Phase-SP3).*
