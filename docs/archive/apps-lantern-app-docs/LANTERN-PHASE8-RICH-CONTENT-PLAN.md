# TMS Lantern Phase 8 — Rich Content + Showcase Upgrade — Plan

## STEP A — PLAN

### A. Exact Lantern files to edit

| File | Changes |
|------|---------|
| `apps/lantern-app/index.html` | Richer post previews by type (image, link, video, webapp, project), featured showcase improvements, feed/grid view toggle, better empty states |

### B. Any new files to create

None. All changes are edits to index.html.

### C. What remains untouched

- `js/lantern-api.js` — no changes
- `js/lantern-data.js` — no changes
- `store.html`, `teacher.html`, `games.html` — no changes
- Profile customization, reactions, recognition, missions, games, store, teacher approvals
- localStorage architecture
- Post create/update/delete/pin logic

### D. Implementation order

1. **index.html** — Add CSS for richer post types, featured showcase, grid view, empty states
2. **index.html** — Add feed/grid toggle UI
3. **index.html** — Refactor renderPosts to build type-specific content blocks (link cards, launch buttons, etc.)
4. **index.html** — Refactor renderFeaturedPost for stronger presentation
5. **index.html** — Improve empty state messages

### E. Watch-outs / edge cases

- **Image preview:** Use existing img + onerror. No external fetchers. Keep dead simple.
- **Video posts:** No actual video embed. Use video-style card (play icon, dark overlay) that links to URL. Mock-friendly.
- **Link cards:** Show title, caption, URL. "Open" button opens in new tab. Same as current link behavior, better styling.
- **Web app / project:** "Launch" or "Open" button — same href, styled as primary CTA.
- **Grid view:** Only apply to image posts when in grid mode. Other types stay in list. Simple CSS flex/grid toggle.
- **Featured post:** Reuse same render logic as feed cards but with featuredPostCard wrapper. Add type-specific treatment.
- **Empty states:** Per-tab messages. "All" vs "Image" vs "Link" etc. each get contextual text.

---

## Test Checklist (Phase 8)

- [ ] **Each post type rendering with stronger visual distinction:** Image (large preview), link (card + Open), video (play-style card), webapp (Launch button), project (featured card)
- [ ] **Featured content rendering correctly:** Featured post shows prominently with type-appropriate treatment
- [ ] **Launch/open behavior:** Web app and link posts open URL in new tab when Launch/Open clicked
- [ ] **Empty states appearing correctly:** Contextual messages for All, Image, Link, Video, Web App, Project
- [ ] **Current profile/feed logic still working:** Posting, reactions, pin, delete, customization, missions, etc.
- [ ] **Feed/grid toggle:** When image posts exist, toggle appears; grid view shows images in grid, other types full-width
