# Surface sections — vocabulary contract

**What this is:** A short rule book for **vertical blocks** on student pages (big titled chunks of the screen).  
**What this is not:** It does **not** replace the **card** rules or the **horizontal rail** rules. Those live in **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10 and §11.

**Who should read this:** Anyone editing **`explore.html`**, **`missions.html`**, **`locker.html`**, or **`games.html`** layout.

**Related docs:** **`docs/SURFACE_PANEL_SYSTEM_AUDIT.md`** (full inventory) · **`docs/PHASE-SP1-SURFACE-PANEL.md`** (how this file got approved) · **`docs/ui/LOCKER_SURFACE_MAP.md`** (Locker tab → panel → vocabulary).

---

## Mental model — what problem this solves

**The problem:** The English word **“section”** shows up in many places, but the **HTML/CSS names are not all the same**. If you copy markup from one page and paste it on another, you can get **weird spacing, wrong padding, or styles that never apply** — with **no loud error** in the console.

**This contract’s job:** Tell you **which class set goes with which page**, in **plain language**, so you pick the **right pattern the first time**.

**Picture three layers (bottom to top):**

1. **Page column** — the main tall column for the app (`wrap` + `lanternContent`).  
2. **Vertical block** — “here is a titled chunk” (this document).  
3. **Inside the chunk** — sideways scrolling rails and cards (§10–11), or forms, or lists.

If you mix up layer 2 between pages, layer 3 still “looks like it works” — that is why mistakes are easy.

---

## Non-goals — what we are **not** trying to unify here

This document **does not**:

- **Rename** classes across the app in one big sweep.  
- **Merge** `.lockerSection` and `.section` into one name. (That would be a **future**, separate phase.)  
- **Replace** **`LanternCards`** or **`.exploreCard`** rules. Cards stay §10.  
- **Change** horizontal rail rules (**`.lanternScroller`**, spacing tokens). Rails stay §11.  
- **Cover Contribute / Studio** layout (`contribute.html`). Studio has its own panels and columns — for **rails, cards, and missions** alignment rules, see **`docs/CONTRIBUTE_STUDIO_PROMPT.md`** (missions left panel may scroll; cards and scroller must use canonical Lantern rail + renderer).  
- **Authorize** hand-built “fake” production cards. Still use **`lantern-cards.js`** for production cards.  
- **Bring back** `contentScroller` for new work outside documented legacy (mostly Studio leftovers).

---

## 1. Page column: `.wrap` + `.lanternContent`

### Definition

**The main content column** on many Lantern pages: a wrapper with classes **`wrap`** and **`lanternContent`** (often plus a page tag like **`explorePageWrap`** or **`missionsPageWrap`**). Think: “the white/tall area under the navy app bar.”

### DO

- Use this pattern on **Lantern home** (`explore.html`), **Missions** (`missions.html`), **Locker** (`locker.html`), **Games** (`games.html`) as the **outer shell** for the scrolling page body.  
- Put **sections**, **locker tab panels**, and **games sections** **inside** this column — not instead of it.

### DO NOT

- Do **not** invent a **second** “main column” wrapper for the same page without a documented reason.  
- Do **not** assume **Teacher** (`teacher.html`) uses the exact same wrapper name — that page uses **`teacherPageShell`** inside a wrap; check the file.

---

## 2. Student vertical block: `.section`, `.sectionHd`, `.sectionBd`

### Definition

**`.section`** = one **major vertical block** (a titled area).  
**`.sectionHd`** = the **title row** (heading + optional actions).  
**`.sectionBd`** = a **padded inner wrapper** around the **body** under that title.

Together, **`.sectionHd` + `.sectionBd`** means: “title on top, content in a boxed body below.”

### DO — **Missions** (`missions.html`)

- Use **`.section`** with **`.sectionHd`** and **`.sectionBd`** when you want the **standard** “header + padded body” look.  
- Put mission lists, placeholders, and mission UI **inside** **`.sectionBd`** when that matches existing rows on the page.

**Example situation:** “Assignments” or another mission area with a title bar and content below → **section + Hd + Bd**.

### DO — **Locker → Overview** (`locker.html`, Overview tab)

- Use **`.section`**, **`.sectionHd`**, and **`.sectionBd`** for **profile-style modules** (identity, recognition, My Creations, etc.) where the page already uses that **header + body** pattern.

**Example situation:** “My Creations” block with a heading and the creations list inside a padded area → **Bd** is expected.

### DO — **Lantern home** (`explore.html`)

- Use **`.section`** and **`.sectionHd`** for each **big horizontal lane** (Announcements, Latest Posts, School News, etc.).  
- **Often skip** **`.sectionBd`** here: the **rail** (**`.lanternScroller`**) and labels like **`.sectionSubLane`** can sit as **siblings** right under the header, not wrapped in **Bd**.

**Example situation:** A lane title “Latest Posts” and directly under it a sideways-scrolling rail → **no Bd wrapper** is normal on this page.

### DO NOT

- Do **not** copy **Explore**’s “no **Bd**” pattern onto **Missions** and expect the same spacing — **Missions** usually **needs** **`.sectionBd`** for the standard look.  
- Do **not** use **`.section`** for **Games** rail groupings — Games uses **`gamesRailSection`** (see §5).  
- Do **not** use **`.section`** for **Locker Store** or **Locker Items** marketing rows — those use **`.lockerSection*`** (see §4).

---

## 3. Explore sub-label: `.sectionSubLane`

### Definition

A **smaller line of text** under a lane title on **Lantern home** — like a subtitle for one horizontal row.

### DO

- Use on **`explore.html`** under a **`.section`** / **`.sectionHd`** when the design needs a **second label** under the main lane title.

**Example situation:** Main title “School News” and a smaller line explaining the row → **sectionSubLane**.

### DO NOT

- Do **not** treat this as a **card** or a **rail** — it is **only** a text label.  
- Do **not** assume **Missions** or **Games** use this class for the same job; if you need a subtitle elsewhere, **match that page’s existing pattern** first.

---

## 4. Locker Store / Items rows: `.lockerSection`, `.lockerSectionHd`, `.lockerSectionSub`

### Definition

A **different class family** for **Store** and **Items** tabs inside **Locker**: **accent** headers and category-style rows, often wired with **`lantern-rails.css`**. These are **not** spelled **`.section`** even though they feel like “sections” in English.

### DO

- Use **`.lockerSection`** / **`.lockerSectionHd`** / **`.lockerSectionSub`** for content inside **`#lockerPanelStore`** and **`#lockerPanelItems`** when you are **matching existing** Store/Items rows (including JS-built rows on Items).

**Example situation:** Store tab: a row with a bright header and rewards under it → **lockerSection** family.

### DO NOT

- Do **not** “help” by renaming these to **`.section`** in a quick patch — you will fight **CSS specificity** and **shared rail styles**.  
- Do **not** confuse this with **Locker → Overview** profile blocks — Overview uses **`.section*`** for many modules (see §2).

---

## 5. Games page rail groups: `gamesRailSection`

### Definition

On **`games.html`**, each **vertical stack** that holds a **title + horizontal game rail** is wrapped as **`<section class="gamesRailSection">`**. It is a real **`<section>`** tag with a **page-specific class**, **not** **`.section`**.

### DO

- Add or adjust **Games** rows using **`<section class="gamesRailSection">`** (inside **`gamesPageShell`** / the page column), same as existing structure on **`games.html`**.

**Example situation:** “Popular” games row with a heading and a sideways list of game cards → **gamesRailSection**.

### DO NOT

- Do **not** switch Games rows to **`.section`** “for consistency” — **Games** is intentionally **not** using that vocabulary.  
- Do **not** confuse **`gamesRailSection`** with **`.lanternScroller`** — the **section** is the **vertical** chunk; the **scroller** is the **horizontal** strip inside it (§11).

---

## 6. Locker tab panels: `.lockerPanel`

### Definition

The **big panes** switched by Locker tabs — **Overview**, **Items**, **Store**. Markup uses **`id`** values like **`lockerPanelOverview`** and class **`lockerPanel`** on the tabpanel container. Shipped **`locker.html`** also sets **`data-locker-surface="overview"`** \| **`items`** \| **`store`** on each **`#lockerPanel*`** root (Phase-SP5) for **stable, queryable** surface identity — **no** replacement for **`id`** or **ARIA**.

### DO

- Keep **tab** + **tabpanel** wiring consistent with **`locker.html`** / build output when you add content **inside** a tab’s panel.  
- Put **Overview** blocks (`.section*`), **Items** rows (`.lockerSection*`), or **Store** content **inside** the correct **`#lockerPanel…`** root.

### DO NOT

- Do **not** move **tabpanel** IDs or roles without checking **accessibility** (ARIA) and **JS** that shows/hides panels.  
- Do **not** use **`.lockerPanel`** on random divs outside the Locker tab system — it is **Locker chrome**, not a general page wrapper.

---

## 7. Edit Profile modal only: `profileStudioSection`, `profileStudioSectionH`

### Definition

Inside the **Edit Profile** modal on **Locker**, form chunks use classes like **`profileStudioSection`** with headers **`profileStudioSectionH`**. This is a **third** “section-like” word in the codebase — **modal-only**.

### DO

- Use these names **only** for **Edit Profile** modal form groups, consistent with **`locker.html`** / built slices.

**Example situation:** “Avatar” or “Display name” grouped fields in the profile editor → **profileStudioSection**.

### DO NOT

- Do **not** reuse **`profileStudioSection`** on **Explore**, **Missions**, or **Games** regular page layout — students never see that pattern there.  
- Do **not** confuse this with **Contribute / Studio** — that’s a **different** product surface (`contribute.html`).

---

## Quick reference table

| You are editing… | Vertical “chunk” pattern | Notes |
|------------------|--------------------------|--------|
| **explore.html** | `.section` + `.sectionHd` (often **no** `.sectionBd`) | Rails sit under header; see §2 |
| **missions.html** | `.section` + `.sectionHd` + `.sectionBd` | Standard header + padded body |
| **locker.html → Overview** | `.section` + `.sectionHd` + `.sectionBd` | Profile modules |
| **locker.html → Store / Items** | `.lockerSection*` | Not `.section` |
| **games.html** | `<section class="gamesRailSection">` | Not `.section` |
| **Edit Profile modal** | `profileStudioSection*` | Modal only |

---

## Cards and rails (reminder)

- **Production cards:** Built only through **`LanternCards`** / **`.exploreCard`** — **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10.  
- **Horizontal rails:** **`.lanternScroller`** and shared tokens — **`docs/LANTERN_SYSTEM_CONTEXT.md`** §11.

This contract sits **between** the page column and those systems: **titles and vertical grouping first**, then cards and rails inside.

---

*Surface section contract — v1.0 — readable vocabulary for vertical blocks.*
