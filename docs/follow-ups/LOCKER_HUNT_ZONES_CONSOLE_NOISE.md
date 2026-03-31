# Follow-up: Locker `HUNT_ZONES` console noise

**Type:** Locker shell / ticker or daily-hunt stack  
**Related:** **Not** introduced by the **Locker Featured Post → LanternCards** slice (2026-03-19). Track and fix independently. **Same `HUNT_ZONES` symptom** can appear on **Lantern home** (`explore.html`); see **`docs/follow-ups/EXPLORE_SHELL_CONSOLE_NOISE.md`**.

## Summary

On **`locker.html`** (full Locker page with ticker and related scripts), Playwright and DevTools can record repeated:

- **`pageerror`:** `HUNT_ZONES is not defined`

This is **ambient** to the Locker app shell (scripts that reference `HUNT_ZONES` before it is defined, or a missing shared init). It is **unrelated** to Featured Post rendering, `featured_post_id`, or `LanternCards` for the showcase block.

## QA evidence

- Observed during automated Locker QA (`e2e/studio-contribute/locker-featured-post-qa.mjs`) while validating Featured Post behavior.
- **Featured Post slice checks** (visible/hidden, media variants, `noNavigate`, save/reload, tab smoke) **passed**; failures were not tied to Featured Post code paths.
- **`console.error`** from the browser console API was **empty** in that run; the noise appears as **uncaught `pageerror`** / ReferenceError-style exceptions.

## Scope of fix (when picked up)

1. Locate **first** script use of `HUNT_ZONES` on Locker (and any shared header/ticker bundle).
2. Ensure **single definition** or **guard** before use (e.g. `typeof HUNT_ZONES !== 'undefined'` or load order fix).
3. Verify **no regression** to daily nugget / hunt UX on Locker and other `page-has-ticker` pages.

## Explicit non-goals

- Do not change **Featured Post** / `renderFeaturedPost` / `profileFeaturedPostToCardModel` unless investigation proves a direct causal link (unlikely).
- Do not mask errors globally; fix **root cause** for `HUNT_ZONES` on Locker.
