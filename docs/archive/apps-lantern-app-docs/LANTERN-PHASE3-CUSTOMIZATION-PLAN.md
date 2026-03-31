# TMS Lantern — Phase 3: Customization System Plan

## A. Exact files to edit

| File | Scope |
|------|-------|
| `apps/lantern-app/js/lantern-data.js` | Add `PROFILES` to LS_KEYS |
| `apps/lantern-app/js/lantern-api.js` | Add `getProfile`, `saveProfile`, `getProfileForCharacter` |
| `apps/lantern-app/index.html` | Edit Profile modal, Edit Profile button, render customization, featured post |

## B. Exact data model additions

| Key | Shape |
|-----|-------|
| `LANTERN_PROFILES` | `{ [character_name: string]: Profile }` |

**Profile:**
```js
{
  display_name?: string,   // optional
  bio?: string,           // optional
  avatar?: string,         // emoji or '' for default
  frame?: string,          // 'none' | 'gold' | 'blue' | 'green' | 'purple'
  theme?: string,         // 'default' | 'warm' | 'cool' | 'violet'
  featured_post_id?: string
}
```

## C. Default options

**Avatars:** 🌟 ⭐ ✨ 🎯 🚀 🎨 📚 🔥 💡 🌈 (10 options; use character default if empty)

**Frames:** none, gold, blue, green, purple

**Themes:** default, warm, cool, violet

## D. What stays untouched

- Character picker, adoption flow
- Teacher approval flow (submitForApproval)
- Store redirect
- Post CRUD, post feed, content tabs, New Post modal
- Activity feed, recognition
- Missions, achievements placeholders
- Testing controls
- All existing LANTERN_* keys

## E. Implementation order

1. lantern-data.js — Add PROFILES key
2. lantern-api.js — Add profile get/save
3. index.html — Add Edit Profile modal, button, wire, render profile + featured post

## F. Watch-outs

- Do not break postsWired / testingWired
- featured_post_id: validate post exists and belongs to character
- Profile customization is per-character (keyed by character_name)
- Frame/theme: apply via CSS classes on profileHero (e.g. .frame-gold, .theme-warm)
- featured_post: render above feed if set; if post deleted, show nothing
