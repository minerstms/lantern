# TMS Lantern Phase 7 — Visual Polish + Family Parity + Social Feel — Plan

## STEP A — PLAN

### A. Exact Lantern files to edit

| File | Changes |
|------|---------|
| `apps/lantern-app/js/lantern-data.js` | Add `POST_REACTIONS` to LS_KEYS |
| `apps/lantern-app/js/lantern-api.js` | Add getPostReactions, togglePostReaction, runner methods |
| `apps/lantern-app/index.html` | Profile hero polish, section hierarchy, post cards by type, reactions UI, spotlight banner, achievements polish, recognition summary polish, tabs styling, empty states, nav consistency |
| `apps/lantern-app/store.html` | Unify top nav (height, font, radius) with shared family look |
| `apps/lantern-app/teacher.html` | Unify top nav with shared family look |
| `apps/lantern-app/games.html` | Unify top nav with shared family look |

### B. Any new files to create

None. All changes are edits to existing files.

### C. What should remain untouched

- `js/lantern-api.js` — core logic for posts, missions, achievements, store, teacher approvals (only add reaction helpers)
- `js/lantern-data.js` — only add one LS key
- Post create/update/delete/pin logic
- Mission completion logic
- Achievement unlock logic
- Store redeem logic
- Teacher approval logic
- Games play logic
- localStorage architecture
- Any non-Lantern files (public/, backend/, etc.)

### D. Implementation order

1. **lantern-data.js** — Add POST_REACTIONS key
2. **lantern-api.js** — Add getPostReactions, togglePostReaction, runner methods
3. **index.html** — Profile hero, sections, post cards by type, reactions, spotlight, achievements, recognition, tabs, empty states, nav
4. **store.html** — Nav consistency
5. **teacher.html** — Nav consistency
6. **games.html** — Nav consistency

### E. Watch-outs / edge cases

- **Reactions:** Local/mock only. Key format: `{ [post_id]: { [character_name]: { like, favorite, fire } } }`. Toggle on click. No real social graph.
- **Post type styling:** image/link/video/webapp/project — each gets distinct card treatment. Image: larger preview, link: card with icon, etc.
- **Nav consistency:** Use same topRowBtn height (56px), font-size (22px), border-radius (14px) across all pages. Index uses 56px; store/teacher use 84px/92px — unify to 56px for family parity.
- **Spotlight banner:** When character has spotlight, add subtle banner above or near hero. Don't overbuild.
- **Empty states:** Post feed empty, achievements all locked, recognition empty — friendly helper text.
- **Do not break:** Customization (frame/theme), posting, missions, games, store, teacher approvals.

### F. Gaps this phase closes

| Original vision gap | Phase 7 closure |
|--------------------|-----------------|
| "Instagram-style creative home page" | Stronger profile hierarchy, identity-first layout, showcase post cards |
| "Belongs to TMS Nuggets family" | Unified nav, buttons, cards, colors, typography across all Lantern pages |
| "Visually polished" | Profile hero polish, section spacing, post type distinction, spotlight treatment |
| "Intuitive and fun" | Lightweight reactions, better empty states, clearer hierarchy |
| "Showcase-oriented" | Post cards by type, featured content prominence, achievements presentation |
| "I want to use this" vs "functional prototype" | Social feel (reactions), celebratory recognition, cleaner UI |

---

## Test Checklist (Phase 7)

- [ ] **Profile header rendering correctly:** Avatar, name, bio, wallet, spotlight badge display with improved hierarchy
- [ ] **Reaction buttons working:** Like, Favorite, Fire toggle on posts; state persists after refresh
- [ ] **Spotlight styling appearing correctly:** Spotlight badge on avatar; spotlight entries in feed distinct; recognition summary celebratory
- [ ] **Post types displaying with improved visual distinction:** Image, link, video, webapp, project each have distinct card styling
- [ ] **Nav consistency across pages:** Profile, Store, Games, Teacher all have same nav button style and layout
- [ ] **Current features still functioning:** Posting, customization, missions, games, store, teacher approvals, achievements all work after polish pass

---

## Implementation Notes

- **Reactions:** Stored in `LANTERN_POST_REACTIONS` as `{ [post_id]: { [character_name]: { like, favorite, fire } } }`. Toggle on click.
- **Post type classes:** `.postCard.type-image`, `.type-link`, `.type-video`, `.type-webapp`, `.type-project` for distinct styling.
- **Nav family parity:** All four pages use height: 56px, font-size: 22px, border-radius: 14px, gap: 10px for topRow.
