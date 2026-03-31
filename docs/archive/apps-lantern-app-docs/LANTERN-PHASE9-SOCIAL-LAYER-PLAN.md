# TMS Lantern Phase 9 — Social Layer Lite — Plan

## STEP A — PLAN

### A. Exact Lantern files to edit

| File | Changes |
|------|---------|
| `apps/lantern-app/js/lantern-data.js` | Add `POST_COMMENTS` to LS_KEYS |
| `apps/lantern-app/js/lantern-api.js` | Add getCommentsForPost, addComment, getDiscoveryFeed (recent posts from all chars + spotlighted), getSpotlightedCharacters; runner methods |
| `apps/lantern-app/index.html` | Reactions refinement (more visible/satisfying), comments UI on posts, Featured Creations / discovery section |

### B. Any new files to create

None. All changes in existing files. Discovery as a section on profile (no explore.html).

### C. localStorage / data model additions

**New key:**
- `LANTERN_POST_COMMENTS` — `[{ post_id, character_name, text, created_at }]`

**Discovery logic:**
- Use existing `getPosts()` — all posts from all characters
- Sort by created_at desc, take recent N (e.g. 12)
- `getSpotlightedCharacters()` — scan activity for note_text containing 'Spotlight', return set of character names
- Discovery feed = recent posts, with spotlighted characters' posts marked

### D. Implementation order

1. **lantern-data.js** — Add POST_COMMENTS key
2. **lantern-api.js** — Add getCommentsForPost, addComment, getSpotlightedCharacters, getDiscoveryFeed, runner methods
3. **index.html** — Reactions refinement CSS, comments UI (expand/collapse, add comment form, render comments), Featured Creations section, wire discovery

### E. Watch-outs / edge cases

- **Comments:** Simple array. No nesting. character_name from current adopted character when adding. Display: avatar (from chars), name, text, time.
- **Discovery:** All posts in LS are from Lantern characters. No cross-app data. "Featured Creations" = recent posts from all characters. Spotlighted = posts from chars who have Spotlight in activity.
- **Reactions refinement:** Visual only — slightly larger buttons, subtle animation on toggle, maybe show count. Keep local-only.
- **Do not break:** Profile, posts, reactions, recognition, missions, games, store, teacher approvals.

---

## Test Checklist (Phase 9)

- [ ] **Reactions still working:** Like, Favorite, Fire toggle; state persists; refined styling feels more satisfying
- [ ] **Comments creating/rendering correctly:** Add comment on post; comment appears with character name; persists after refresh
- [ ] **Discovery/highlight area showing content:** Featured Creations section shows recent posts from all characters
- [ ] **Spotlighted content appearing distinctly:** Posts from spotlighted characters have visual emphasis in discovery
- [ ] **Current Lantern features still functioning:** Posting, customization, missions, games, store, teacher approvals, achievements
