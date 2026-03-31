# TMS Nuggets Sandbox App

Training sandbox with fictional data. **Never** accesses production D1 or production Worker.

## Build (copy shared packages)

Before deploy, run:

```bash
node scripts/copy-shared-to-sandbox.js
```

This copies `packages/*` into `apps/sandbox-app/shared/packages/` so the sandbox can load them.

## Deploy

Deploy `apps/sandbox-app` as a separate Cloudflare Pages project (e.g. `mtss-sandbox.pages.dev`).

- **Build command:** `node scripts/copy-shared-to-sandbox.js` (or run manually before deploy)
- **Build output:** `./` (this folder)
- **Root directory:** `apps/sandbox-app`

## Safety

- Sandbox config has NO production API URLs
- Sandbox provider throws if on production host
- Uses helper-api for feedback only (same as helper app)

