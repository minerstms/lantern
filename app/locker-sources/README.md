# Locker build sources

`index.full.html` and `store.full.html` are **snapshots of the old monolithic pages** (from git history when needed). They exist only so `build-locker.cjs` can splice HTML fragments into native `locker.html`.

**Do not use these URLs in the app.** User-facing entry points are:

- `index.html` → redirects to `locker.html` (hash preserved)
- `store.html` → redirects to `locker.html#store`

After changing Overview or Store markup, update the snapshots (or switch the builder to maintained fragment files) and run:

```bash
node build-locker.cjs
```

from `apps/lantern-app/`.
