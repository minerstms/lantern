# Class Access System

## Purpose

- **Gate access to Explore** (and any page that uses the same pattern: gate wrapper + content wrapper).
- Ensures protected content does not run its main loaders until access is resolved in a known way.

## How it works

- **Event-driven:** when bootstrap finishes, the page dispatches a single custom event:

  **`lantern-class-access-resolved`**

- **Payload (`event.detail`):** the code passes **`state`** and **`tokenValid`** — not a separate teacher id/name payload.

```js
// From app/js/class-access.js — dispatch shape
{ detail: { state: state, tokenValid: !!(state && state.tokenValid) } }
```

- **`state`** is the JSON body returned from **`GET /api/class-access/state`** (when `LANTERN_AVATAR_API` is set), or `null` in the “no API base” path. Typical fields include `ok`, `mode`, `accessState`, `tokenValid`, and sometimes `expires_at` or simulation fields — see the Worker handler for `/api/class-access/state`.
- **`tokenValid`** is a boolean the UI uses directly; listeners typically require `e.detail.tokenValid === true` before calling `refresh()` or `init()`.

## Critical Behavior

- **Explore does not meaningfully load until access is resolved with a valid token** when the gate is shown: `explore.html` listens for `lantern-class-access-resolved` and only runs **`refresh()`** when **`tokenValid`** is true. The main content lives in **`#classAccessContentWrap`**, which stays hidden until `class-access.js` shows it after a successful check (or bypass).

## Debug Mode

Set before **`class-access.js`** runs (or ensure it is set early enough):

```js
window.LANTERN_DEBUG_CLASS_ACCESS = true;
```

This bypasses the gate, shows content, and dispatches the event with **`tokenValid: true`** (see `app/js/class-access.js`).

## Failure Mode

If **Explore looks empty or never fills in** after a hard refresh:

- **Class access may not have resolved with `tokenValid: true`** (gate still logically blocking, or `refresh` never ran).
- That is **often not** “bad mission data” — check the class-access flow and the event before assuming D1 or submissions are wrong.

## Developer Rule

**Do not bypass class access by accident** when editing Explore (for example by calling feed loaders unconditionally on DOM ready without waiting for **`lantern-class-access-resolved`** with **`tokenValid`**). Keep the same event contract so locked users do not see content that should stay behind the gate.
