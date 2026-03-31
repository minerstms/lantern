# L-Rail-4 — Items tab rail migration

**Status:** **MERGED & CLOSED (2026-03-19)** — `renderLocker` in `build-locker.cjs` / `locker.html` uses **`.lanternScroller`**; scoped **`#lockerPanelItems .lanternScroller`** in embedded locker CSS. **Human smoke check:** **approved (2026-03-21).** *(Below: original plan / reference.)*  
**Goal:** Convert Locker **Items** tab horizontal cosmetics rows from **`contentScroller` + `contentScrollerTrack`** to canonical **`.lanternScroller`** (single scroll container, direct **`.lockerCard`** children).

**Explicit constraints for this plan:** **Do not** modify **Store**, **Overview**, or the **card system contract** (`LanternCards` / production explore card rules). **Do not** remove legacy **`.contentScroller*`** rules from **`lantern-rails.css`** globally in this slice (other pages still use them until a later program).

---

## 1. CURRENT STATE

### 1.1 Where Items rails are defined

| Layer | Location | Notes |
|-------|-----------|--------|
| **DOM builder** | **`apps/lantern-app/build-locker.cjs`** — template string **`lockerItemsScript`** | Function **`renderLocker(characterName, ownership)`** creates per-category **`lockerSection`**, then **`div.contentScroller`** → **`div.contentScrollerTrack`**, appends **`.lockerCard`** nodes to the **track**, **`section.appendChild(scroller)`**. |
| **Generated output** | **`apps/lantern-app/locker.html`** | Same script inlined at end of body via **`${lockerItemsScript}`** — **must be regenerated** after any edit to the template in **`build-locker.cjs`** (`node build-locker.cjs` from `apps/lantern-app`). |
| **Static shell** | **`build-locker.cjs`** HTML template | **`#lockerPanelItems`** contains **`#lockerSectionsEl`** only (empty host); **no** static rail markup. |
| **Behavior** | **`initItemsTab`**, **`loadAdopted`**, **`callStoreBootstrap`**, **`callGetCosmeticOwnership`**, **`callEquipCosmetic`** | Unchanged by rail migration except DOM structure produced by **`renderLocker`**. |

### 1.2 Exact files involved

| File | Role |
|------|------|
| **`apps/lantern-app/build-locker.cjs`** | **Source of truth** for Items tab JS (`lockerItemsScript`). |
| **`apps/lantern-app/locker.html`** | Built artifact — duplicate of embedded script. |
| **`apps/lantern-app/css/lantern-rails.css`** | **`.contentScroller`** (incl. **`scroll-snap-type: x proximity`**), **`.contentScrollerTrack`** (flex row, gap), **`.lockerCard`** (incl. **`scroll-snap-align: start`**), **`.lockerSection*`** rhythm. |
| **`apps/lantern-app/css/lantern-cards.css`** | **`.wrap.lanternContent .lanternScroller`** — canonical rail (overflow, flex, **`--lantern-rail-*`**, **no** scroll-snap). Locker already links this stylesheet. |
| **`apps/lantern-app/css/lantern-store-panel.css`** | **No** Items-specific selectors today; **do not** use for Items in L-Rail-4 (Store-only contract). |

### 1.3 How DOM is built (static vs JS)

- **100% JS-built** inside **`#lockerSectionsEl`**: **`container.innerHTML = ''`**, then for each category with items, **`document.createElement`** for **`section`**, **`scroller`**, **`track`**, **`card`**.  
- **No** static **`contentScroller`** markup for Items in HTML sources.

---

## 2. TARGET STATE

### 2.1 Desired DOM (canonical)

Replace the two-level pattern:

```html
<div class="lockerSection">
  <div class="lockerSectionHd">…</div>
  <div class="contentScroller">
    <div class="contentScrollerTrack">
      <!-- .lockerCard × N -->
    </div>
  </div>
</div>
```

with:

```html
<div class="lockerSection">
  <div class="lockerSectionHd">…</div>
  <div class="lanternScroller" aria-label="…"><!-- optional: category label --></div>
  <!-- direct .lockerCard children of .lanternScroller -->
</div>
```

- **Single** scroll container per category row: **`.lanternScroller`**.  
- **Direct** **`.lockerCard`** children (same card markup and equip handlers as today).  
- **Optional** **`aria-label`** per row (e.g. derived from category label) for parity with other rails — product decision, not required for migration.

### 2.2 JS changes (**`renderLocker` only**, in **`lockerItemsScript`**)

| Change | Detail |
|--------|--------|
| Remove **`track`** | Do not create **`contentScrollerTrack`**. |
| Rename **`scroller`** | **`scroller.className = 'lanternScroller'`** (not **`contentScroller`**). |
| Append cards | **`scroller.appendChild(card)`** (not **`track.appendChild`**). |
| **`section.appendChild`** | **`section.appendChild(scroller)`** only (no **`scroller.appendChild(track)`**). |

### 2.3 What stays the same

- **`CATEGORY_ORDER`**, **`CATEGORY_LABELS`**, merge rules for **effect/decoration**, **Avatars** dedupe.  
- **`lockerCard`** structure, **`btnEquip`** wiring, **`callEquipCosmetic`** → **`renderLocker`** refresh.  
- **`initItemsTab`** body/effect attribute sync from equipped state.  
- **Empty states** (**`lockerEmpty`**, “pick student”, “could not load”).  
- **Tab wiring** (**`showLockerTab`**, **`wireLockerTabs`**, hash).  
- **No** changes to **`lantern-store-app.js`**, **`store.full.html`**, **`index.full.html`** overview slices, or **`LanternCards`**.

---

## 3. CSS IMPACT

### 3.1 What applies now

- **`lantern-rails.css`**: **`.contentScroller`** supplies horizontal scroll + **proximity snap**; **`.contentScrollerTrack`** supplies **flex** + **gap**; **`.lockerCard`** uses **`scroll-snap-align: start`**.  
- **`lantern-cards.css`**: **`.wrap.lanternContent .lanternScroller`** applies to any **`.lanternScroller`** under locker’s **`.wrap.lanternContent`** (Items panel is inside that wrap).

### 3.2 What must change (Items scope)

| Approach | Detail |
|----------|--------|
| **Preferred** | Add **`#lockerPanelItems .lanternScroller`** (or **`#lockerSectionsEl .lanternScroller`**) overrides for **gap / padding** if canonical **`--lantern-rail-*`** does not match current **14px** track gap and **contentScroller** padding/negative margin behavior — **document** intentional delta vs Explore (same pattern as Store L-Rail-3b). |
| **Snap** | After Items uses **`.lanternScroller`**, **proximity snap** from **`.contentScroller`** no longer applies to Items rows. Canonical rail has **no** **`scroll-snap-type`** → aligns with **Explore / Store** policy. **`.lockerCard { scroll-snap-align }`** becomes a no-op without a snap container; optional cleanup can be a **follow-up** scoped rule (not global card contract change) if product wants to remove dead properties. |

### 3.3 What must NOT be touched yet (per constraints)

- **Do not** delete **`.contentScroller` / `.contentScrollerTrack`** from **`lantern-rails.css`** in this slice — **`contribute.html`** Studio rail and any other consumers still depend on them.  
- **Do not** change **`lantern-store-panel.css`** for Items.  
- **Do not** refactor **`lockerTabCss`** **`.lockerCard`** block in **`build-locker.cjs`** unless required for layout parity (minimize diff).  
- **Do not** change **`index.full.html`** embedded **`.contentScroller*`** rules for profile/explore legacy unless a separate rail program task owns that.

---

## 4. DEPENDENCIES / RISKS

| Area | Risk / dependency |
|------|-------------------|
| **Build pipeline** | Edits only in **`build-locker.cjs`** **`lockerItemsScript`** are invisible in **`locker.html`** until **`node build-locker.cjs`** — see **`docs/build-locker-slices.md`**. |
| **Store / Overview** | Items panel is isolated under **`#lockerPanelItems`**; no shared IDs with Store rails. **Risk:** accidental edit to shared **`lockerSection`** / global CSS with too-broad selectors — **scope new rules under `#lockerPanelItems`**. |
| **Profile / index.full** | No dependency on Items script; Overview uses **`lanternScroller`** rails already (L-Rail-2). |
| **APIs** | **`storeBootstrap`**, **`getCosmeticOwnership`**, **`equipCosmetic`** unchanged. |
| **Visual parity** | Negative horizontal margin on **`.contentScroller`** (**`margin: 0 calc(-1 * var(--lantern-pad-x))`**) may differ from default **`.lanternScroller`** padding — verify edge bleed on narrow viewports. |
| **Games / other** | **`lantern-rails.css`** remains loaded on **`locker.html`** for section rhythm + legacy classes; global deletion of **`.contentScroller`** would break **Contribute** until migrated separately. |

---

## 5. LOWEST-RISK SLICE (smallest safe PR)

**Single PR — Items tab only:**

1. **`build-locker.cjs`** — In **`lockerItemsScript`**, update **`renderLocker`** to one **`.lanternScroller`** per category and **direct** **`.lockerCard`** children (per §2).  
2. **`apps/lantern-app/css/lantern-rails.css`** **OR** a dedicated small override file linked only if needed — **prefer** adding **`#lockerPanelItems .lanternScroller`** rules next to existing locker concerns, **without** removing **`.contentScroller`** rules.  
3. Run **`node build-locker.cjs`** and commit **`locker.html`**.  
4. **Optional doc touch:** **`docs/RAIL_UNIFICATION_PROGRAM.md`** — add **§10.7 L-Rail-4** summary + link to this file when implemented.

**Not recommended for lowest risk:** splitting “JS only” and “CSS only” across releases if intermediate state leaves Items on **`.lanternScroller`** without scoped padding/gap (layout regression risk).

---

## 6. QA GATES (L-Rail-4)

| # | Gate |
|---|------|
| 1 | **Items** tab: each category row with cosmetics **scrolls horizontally**; **no** **`scroll-snap-type`** behavior on those rows (smooth free scroll like Explore canonical rail). |
| 2 | **Equip** flow: tap **Equip** → success → **`renderLocker`** re-run → cards and states correct. |
| 3 | **Empty / error** paths: no student, bootstrap failure, no cosmetics — messaging unchanged and no missing nodes. |
| 4 | **Console:** no errors; **no** duplicate ID issues. |
| 5 | **Visual:** no major regression vs pre-migration (card size, gap, edge bleed) — document intentional deltas if **`.lanternScroller`** metrics differ from old track. |
| 6 | **Store tab** and **Overview tab** unchanged (smoke test + quick DOM/CSS check). |
| 7 | **Built HTML:** **`locker.html`** regenerated and diff-reviewed for **Items** script block only (no accidental slice/template changes). |

---

## 7. Explicitly out of scope (L-Rail-4)

| Item | Reason |
|------|--------|
| **Store** tab | Constraint + already **L-Rail-3b**. |
| **Overview** tab | Constraint. |
| **`contribute.html` / Studio** rail | Product / separate slice; still uses **`.contentScroller`**. |
| **Wholesale removal of `lantern-rails.css` `.contentScroller*`** | Other consumers; program-level cleanup after all migrate. |
| **`LanternCards` / explore card shell** | Items use **`.lockerCard`**, not production card renderer — constraint. |

---

*Document: L-Rail-4 Items rail plan — plan only, v1.0.*
