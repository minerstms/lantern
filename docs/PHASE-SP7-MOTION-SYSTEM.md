# Phase-SP7 — Motion system (Lantern-wide) (**plan only**)

**Status:** **Plan only** — **no CSS/JS implementation** in this document.  
**Purpose:** Define a **single** motion language for **hover**, **press**, **focus**, **transitions**, and **rail scroll feel**, aligned with the **card** system (§10), **rail** system (**`.lanternScroller`**, §11), and **surface** anchors (**`data-locker-surface`**, Locker).  
**Reference surfaces (for future QA, not special-case rules):** **`explore.html`**, **`locker.html`**.

**Related:** **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10–11 (including **§11.2** pointer) · **`docs/ui/SURFACE_SECTION_CONTRACT.md`** · **`docs/ui/LOCKER_SURFACE_MAP.md`** · **`docs/PHASE-SP6-LOCKER-SURFACE-VISIBLE-PILOT.md`** (visible surface chrome — orthogonal unless motion touches same selectors).

---

## 0. Constraints (non-negotiable for SP7)

| Constraint | Meaning |
|------------|---------|
| **No implementation in SP7 doc** | This file is **policy + tokens** only. |
| **No redesign** | Motion **refines** feedback; it does **not** change layout grids, card sizes, or information hierarchy. |
| **No per-page special cases** | Rules use **shared selectors** (e.g. **`.exploreCard`**, **`.wrap.lanternContent .lanternScroller`**, **`[data-locker-surface]`**) — **not** `#exploreOnly` / `#lockerOnly**` **motion** variants. **Explore** and **Locker** are **where we validate**, not **exceptions** in the contract. |
| **Card / rail constitution** | **`LanternCards`** + **`lantern-cards.css`** for production cards; **`.lanternScroller`** + tokens for rails — **unchanged** architecturally. |

---

## 1. Motion principles

| Principle | Definition |
|-----------|------------|
| **Fast** | Interactions should feel **immediate** for school contexts (short attention, noisy rooms). **Micro** feedback **≤ 150ms** perceived; avoid **long** choreographed sequences on **primary** navigation. |
| **Soft** | **Ease-out**-biased curves — **no** harsh linear snaps on **hover/focus** for large UI. **Small** position/shadow changes beat **large** bounces. |
| **Light weight** | Motion signals **state** (hover, pressed, focused), **not** entertainment. **Subtle** **`transform`** / **`opacity`** / **`box-shadow`** — **no** dramatic **scale** on whole pages. |
| **One intent** | Each interaction has **one** clear feedback path (e.g. card **lift** + shadow — **not** lift + rotate + color + sound unless product adds sound later). |
| **Respect `prefers-reduced-motion`** | When motion is implemented, **reduce or disable** non-essential **animation** for **`prefers-reduced-motion: reduce`** (see §7). |
| **Rails ≠ carousel** | Horizontal lists are **scroll regions**, not **auto-rotating** marketing carousels — **no** SP7 mandate for **auto-advance** or **scroll-jacking**. |

---

## 2. Standard durations + easing (token targets)

**These are targets for a future implementation phase** — **normalize** existing scattered values (e.g. **`lantern-cards.css`** today uses **`.15s` / `.2s`** + **`ease`** in places).

| Token (suggested name) | Duration | Use |
|------------------------|----------|-----|
| **`--lantern-motion-instant`** | **`0ms`** or **`0.01s`** | **Reduced-motion** fallbacks; **no** animation. |
| **`--lantern-motion-fast`** | **`100ms`** | **Press** / **active** state, **micro** opacity. |
| **`--lantern-motion-base`** | **`150ms`** | **Hover** / **focus** on **cards**, **buttons**, **tab** chrome. |
| **`--lantern-motion-slow`** | **`200ms`** | **Shadow** / **larger** surface changes only — **sparingly**. |

**Easing (default curve family):**

| Token | Curve | Use |
|-------|-------|-----|
| **`--lantern-ease-out`** | **`cubic-bezier(0.33, 1, 0.68, 1)`** or **`ease-out`** | **Entering** hover/focus (decelerate in). |
| **`--lantern-ease-in`** | **`cubic-bezier(0.32, 0, 0.67, 0)`** or **`ease-in`** | **Leaving** hover — **optional**; keep **short**. |
| **`--lantern-ease-standard`** | **`ease`** | **Only** where **legacy** parity is required — **prefer** **ease-out** for interactive surfaces. |

**Rule:** **Do not** introduce **per-page** duration tables — **one** set of tokens in **`:root`** (likely **`lantern-header.css`**) when implemented.

---

## 3. Card motion rules (production **`.exploreCard`** / **`LanternCards`**)

**Authority:** **`lantern-cards.css`** + renderer — **no** motion rules on **pages** for production card shells.

| Interaction | Rule |
|-------------|------|
| **Hover (rail / list)** | **Subtle** **`translateY`** (**`-1px`** to **`-2px`**) and/or **shadow** deepen — **duration** **`--lantern-motion-base`**; **ease-out**. **No** **scale > 1.02** on **rail** cards (readability). |
| **Press / active** | **`transform: scale(0.98)`** or **`translateY(1px)`** — **`--lantern-motion-fast`**; **release** returns with **`--lantern-motion-base`**. |
| **Focus-visible** | **Visible** **outline** or **ring** (tokenized) — **not** removed for “clean look”; **WCAG** contrast preserved. **No** **outline: none** without replacement. |
| **Open / detail transition** | **Modal** / **overlay** entry: **opacity** + **transform** — use **`--lantern-motion-slow`** **max** for **panel** chrome; **card** content **follows** **`lantern-card-ui.js`** patterns — **do not** fork **second** animation path. |
| **Badges / media** | **Badges** **do not** **pulse** on every hover — **static** unless **explicit** “live” product feature. |

**Do not:** Animate **width** / **min-height** of **`.exploreCard`** shells for **hover** (causes **layout thrash** in **rails**).

---

## 4. Rail motion rules (**`.lanternScroller`**)

**Authority:** **`lantern-cards.css`** for **`.wrap.lanternContent .lanternScroller`**; **scroll-snap** stays **off** (§11).

| Topic | Rule |
|-------|------|
| **Native scroll** | **Prefer** **browser** momentum — **no** SP7 requirement for **custom** momentum JS on **production** rails. |
| **Scroll-behavior** | **`smooth`** for **programmatic** `scrollIntoView` **only** if **accessibility** reviewed — **default** **instant** for **tab** / **hash** jumps unless **separate** UX task. **No** **global** **`html { scroll-behavior: smooth }`** without review (vestibular issues). |
| **Rail container** | **No** **animated** **background** **pan** on **`.lanternScroller`** — **distracting** in classrooms. |
| **Edge fade / masks** | **Optional** future — **not** SP7 **must**; if added, **same** tokens as §2. |

**Locker / Store rails** that use **`.lanternScroller`** **inherit** the **same** rules — **no** **Locker-only** rail **physics**.

---

## 5. Surface / panel motion rules

**Anchors:** **`data-locker-surface`** on **`#lockerPanel*`** (SP5); **`.section`** / **`.lockerPanel`** vocabulary per **`SURFACE_SECTION_CONTRACT.md`**.

| Surface | Rule |
|---------|------|
| **Tab buttons** (**`.lockerTabBtn`**) | **Hover** / **focus** — **background** / **border** **transition** with **`--lantern-motion-base`** — **no** **bounce** keyframes. **`aria-selected="true"`** state change is **instant** **or** **150ms** **max** — **no** **500ms** **crossfade** in SP7 **implementation** unless **explicit** follow-up. |
| **Tabpanel visibility** | **`hidden`** toggle remains **primary** — SP7 **does not** **require** **height** **animation** on **tab** **switch** (risky with **dynamic** **content**). |
| **Active panel chrome** (e.g. SP6 **accent**) | If **present**, **transition** **border** / **box-shadow** with **`--lantern-motion-base`** — **same** **tokens** as cards. |
| **Explore** **`.sectionHd`** / **`.sectionSubLane`** | **No** **mandatory** **motion** — **static** **typography**; **optional** **subtle** **color** on **focus** **within** **links** only. |
| **Generic** **`.btn`**, **`.card`** (non-**exploreCard**) | **Inherit** **same** **press/hover** **durations** as §2 — **when** touched, **centralize** — **not** **one-off** **per** **Locker** **Store** **card**. |

---

## 6. What must **not** be touched (SP7 scope boundaries)

| Excluded | Reason |
|----------|--------|
| **`contribute.html`** / **Studio** | Out of **Lantern app** motion **parity** scope for **SP7** plan; **exception** **§10** **studio mock scroller** remains **documented** separately. |
| **Card** **HTML** **structure** / **`LanternCards`** **API** | **Constitutional** |
| **Rail** **selector** **ownership** (**`lantern-cards.css`**) | **Closed** — **no** **reopen** **for** **motion** **alone** |
| **Scroll-snap** **on** **production** **rails** | **Violates** **§11** **unless** **new** **architectural** **task** |
| **Per-page** **motion** **sheets** | **Violates** **“no** **special** **cases”** |
| **Worker**, **API**, **data** | **Not** **motion** |

**Implementation phase (future)** will **edit** **allowed** **files** only — **typically** **`lantern-header.css`** (**tokens**), **`lantern-cards.css`** (**cards/rails**), **`lantern-profile-page.css`** / **`locker`** **tab** **CSS** **only** **if** **scoped** **to** **shared** **classes** — **listed** **in** **execution** **PR**, **not** **here**.

---

## 7. QA gates (when motion is implemented)

| # | Gate |
|---|------|
| 1 | **Explore** + **Locker** — **hover/press/focus** on **cards** **and** **tabs** — **no** **layout** **shift** **> 2px** **unexpected** **in** **rails**. |
| 2 | **`prefers-reduced-motion: reduce`** — **no** **essential** **content** **hidden**; **animations** **reduced** **or** **off**. |
| 3 | **Keyboard** — **focus** **visible** **on** **cards** **and** **tabs**. |
| 4 | **Performance** — **no** **jank** **on** **mid** **tier** **mobile** **(spot** **check). |
| 5 | **Console** — **clean** **on** **smoke** **navigation**. |

---

## 8. Merge criteria (future implementation PR)

**Merge when:**

- **Tokens** live in **one** **declared** **home** (**`:root`** contract).  
- **Card** + **rail** **motion** **only** **in** **authorized** **stylesheets** — **not** **inline** **on** **pages** **for** **production** **cards**.  
- **No** **new** **per-page** **exceptions** **without** **updating** **this** **doc** **+** **§10/11** **review**.

**Do not merge if:**

- **Studio** **or** **verify** **one-off** **animations** **bundled** **as** **“part** **of** **SP7”** **without** **scope** **review**.  
- **Rail** **program** **selectors** **reopened** **for** **motion** **hacks**.

---

## 9. Cross-links

| Doc | Role |
|-----|------|
| **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10–11 | Card + rail **authority** |
| **`docs/ui/SURFACE_SECTION_CONTRACT.md`** | Vertical **blocks** |
| **`docs/ui/LOCKER_SURFACE_MAP.md`** | **`data-locker-surface`** |
| **`docs/RAIL_UNIFICATION_PROGRAM.md`** | Rail **program** **closed** |

---

*Phase-SP7 — v1.0 — plan only — Lantern-wide motion system.*
