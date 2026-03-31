# Contribute / Design Studio — alignment prompt (canonical)

**Purpose:** Default instruction block for work on **`apps/lantern-app/contribute.html`** (Create / Design Studio). Use this alongside **`docs/LANTERN_SYSTEM_CONTEXT.md`** §10 (cards) and **`docs/ui/CARD_SYSTEM.md`**.

**Scope:** Layout alignment, rails, previews, and field zones — **not** a license to replace architecture or duplicate systems.

---

## Global rules (summary)

- **One** production card system: **`LanternCards`** + **`lantern-cards.css`**.
- **Canonical horizontal rails:** **`.wrap.lanternContent .lanternScroller`** (see **`apps/lantern-app/css/lantern-cards.css`** + **`lantern-header.css`** rail tokens).
- **No** Contribute-only card shells, **no** parallel rail systems, **no** hand-built production `.exploreCard` HTML on the page.
- Preserve the **3-panel** studio shell unless the product explicitly changes it.

---

## IMPORTANT CORRECTION — MISSIONS

For the **mission** create flow, it is **acceptable** for the **left panel** to **scroll** because there may be **many missions** to complete.

However:

- The **mission cards** on the left **MUST** be **real Lantern cards** (renderer + shared stylesheet — e.g. **`buildMissionSpotlightRailElement`** / same markup structure as elsewhere).
- The **mission scroller** **MUST** be a **real Lantern rail / thumbscroller** (same **`.lanternScroller`** contract as Explore and the rest of the app).
- **DO NOT** create or keep a **Contribute-only mission card style**.
- **DO NOT** create or keep a **Contribute-only rail style**.
- **DO NOT** approximate Lantern styling.

You must **locate and reuse** the canonical Lantern:

- **Rail container** (`.lanternScroller` under `.wrap.lanternContent` where applicable)
- **Scroller / thumbscroll behavior** (shared tokens and overflow — no one-off carousel chrome)
- **Card sizing / proportions** (from **`lantern-cards.css`** — e.g. `.exploreCard--size-rail` / `.medium`)
- **Card renderer / markup structure** (**`lantern-cards.js`**)

Mission **content** may be unique, but the **visual system** must be **identical** to Lantern elsewhere in the app.

### Success criteria (missions)

- **Scrolling** in the left panel is **allowed** when the mission list is long.
- **Cards** and **rail** are **unmistakably** the real Lantern style.
- **No** custom mission-carousel look remains.

---

## Related references

- **`docs/ui/CARD_SYSTEM.md`** — card system contract  
- **`docs/ui/CARD_RENDER_PATHS.md`** — renderer entry points including Contribute previews  
- **`apps/lantern-app/css/lantern-cards.css`** — `.lanternScroller`, `.exploreCard` rail sizes  
