# Follow-up: Explore / shell console noise

**Type:** Lantern home (`explore.html`) + shared app shell (ticker, daily hunt, activity, APIs)  
**Related:** **Not** blockers for the **Latest Posts → Explore dataset** slice (merged **2026-03-21**; see **`docs/CHANGELOG_LOCKED.md`**). Track and fix independently.

## Summary

On **`explore.html`** (and other `page-has-ticker` / shared-header pages), Playwright and DevTools can show:

| Symptom | Notes |
|--------|--------|
| **`pageerror`:** `HUNT_ZONES is not defined` | **`lantern-api.js`** references **`HUNT_ZONES`** in daily-hunt-style logic (~1071) without a guaranteed global definition on every page load order. Overlaps **Locker** shell noise; see **`docs/follow-ups/LOCKER_HUNT_ZONES_CONSOLE_NOISE.md`**. |
| **`pageerror`:** `getEventLabel is not defined` | **`explore.html`** calls **`getEventLabel(evt)`** when rendering school activity (~723); **no** `getEventLabel` definition found under **`apps/lantern-app/`** — likely missing helper or wrong include order. |
| **Console `error`:** resource **400** / **404** | Failed **`fetch`** (media, feature flags, activity, or optional endpoints). Triage per Network tab URL; may be benign optional assets or env-specific. |

These do **not** invalidate the Latest Posts dataset path: **`buildExploreDataset`** + **`applyLatestPostsFromExploreDataset`** + **`[explore] latest from dataset …`** log in the happy path.

## QA evidence

- Observed during **Explore** headless QA (Playwright) while validating Latest Posts dataset vs legacy fallback.
- **Latest Posts dataset checks** (dataset log, no legacy feed log, rail cards, dedupe) **passed**; console noise **persisted** and is **orthogonal** to that slice.

## Scope of fix (when picked up)

1. **`HUNT_ZONES`:** Single definition shared across pages that run daily-hunt code, or **guard** before use; align with Locker follow-up where root cause is shared.
2. **`getEventLabel`:** Implement or import a real helper on **`explore.html`**, or remove/replace the call with an inline label mapper consistent with activity event shapes from **`/api/...`**.
3. **400/404:** Map each failing URL to caller; fix missing Worker routes, wrong keys, or downgrade optional requests so failures are silent **only** where product allows.

## Explicit non-goals

- Do **not** reopen the **Latest Posts dataset** merge (refresh wiring, `applyLatestPostsFromExploreDataset`, legacy fallback policy) under this ticket unless investigation proves a **direct** causal link (unlikely).
- Do not blanket-suppress console errors; prefer **root cause** fixes.

## See also

- **`docs/follow-ups/LOCKER_HUNT_ZONES_CONSOLE_NOISE.md`** — same **`HUNT_ZONES`** symptom on Locker QA.
