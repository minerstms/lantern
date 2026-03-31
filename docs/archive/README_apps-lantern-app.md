# TMS Lantern

Beta environment for testing the TMS Nuggets engagement loop using fictional character identities.

## Purpose

- Users adopt fictional student-style characters
- Characters earn nuggets from missions and teacher approvals
- Users spend nuggets in the store (physical items + profile cosmetics)
- Teacher page: approve submissions, curate posts (spotlight, feature, praise)
- No production data, no Worker, no D1

## Local Run

1. Serve `apps/lantern-app` as static files (no build required)
2. Examples:
   - **Python:** `cd apps/lantern-app && python -m http.server 8080`
   - **Node:** `npx serve apps/lantern-app -p 8080`
   - **VS Code:** Live Server extension, open `index.html`
3. Open `http://localhost:8080` (or your port)
4. Adopt a character on the profile page to start

## Deploy

1. **Cloudflare Pages:** Create a Pages project with root = `apps/lantern-app`, build output = `./`
2. No build step required
3. No Worker or D1

## Structure

```
apps/lantern-app/
├── index.html      # Profile: adopt, balance, posts, missions, achievements, testing
├── store.html      # Store: physical items + cosmetics, redeem nuggets
├── games.html      # Games: 1 nugget per play
├── teacher.html    # Teacher: pending approvals, browse & curate posts
├── js/
│   ├── lantern-data.js   # Defaults, LS keys, ensure/reset/seed
│   └── lantern-api.js    # Mock API (localStorage only)
├── sfx.js          # Sound effects
├── assets/         # Audio (cha_ching.mp3)
└── docs/           # Phase plans, LANTERN-DATA.md
```

## Data

When running without a Worker, all data is stored in `localStorage` with keys prefixed `LANTERN_`. No network calls.

When using the Lantern Worker (e.g. `LANTERN_AVATAR_API` set), news and wallet data come from the API (D1). To make the app feel populated for demos, run the one-time demo seed against **lantern-db** (see repo root `SYSTEM_ARCHITECTURE.md` → Demo seed).

See [docs/LANTERN-DATA.md](docs/LANTERN-DATA.md) for full key structures.

## Test Flow

1. **Profile:** Adopt character → add nuggets (Testing Controls) → claim missions → create posts
2. **Store:** Redeem physical items; buy cosmetics; equip in Edit Profile
3. **Games:** Play (1 nugget each); first game unlocks achievement
4. **Teacher:** Open teacher page → approve pending submissions; browse & curate posts
5. **Reset:** Testing Controls → Reset All (clears everything, reloads)
6. **Seed Demo:** Testing Controls → Seed Demo (adds sample posts/activity if sparse)

## Testing Controls (Profile page)

- Add 1 / 5 / 10 nuggets
- Custom nugget add
- Reset wallet (clears activity and purchases for character)
- Clear purchases
- Seed Demo (add sample content)
- Reset All (clear all data, reload)
- Switch character
