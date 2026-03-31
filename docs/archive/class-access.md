# Lantern — Class Access / Gate System

**This document locks in the current working class access system. Do not change behavior without updating this doc.**

---

## Overview

Class access is **required** for Explore and other protected features. It is a **gate**, not full authentication: no student accounts, no permanent login. Teachers generate a class code; students enter it for temporary access.

---

## Event-driven behavior

The system is **event-driven**:

- **Event name:** `lantern-class-access-resolved`
- **When:** Fired by the class-access bootstrap (in `js/class-access.js`) after resolving access (Worker state API or no-api fallback).
- **Who listens:** Explore and other gated pages run their main data load (e.g. `refresh()`) only when this event fires with `tokenValid === true`.

### Event payload

Listeners receive `event.detail` with at least:

| Field          | Type    | Description |
|----------------|---------|-------------|
| `tokenValid`   | boolean | If `true`, access is granted; pages may load protected data. |
| `state`        | object  | Full state from Worker (when API is used). May include `teacherId`, `teacherName`, and other fields when returned by the API. |

Conceptual payload shape:

```json
{
  "tokenValid": true,
  "teacherId": "string",
  "teacherName": "string"
}
```

In code, the event is dispatched with `detail: { state, tokenValid }`. When the Worker returns session/teacher info, `state` (or the resolved session) may expose `teacherId` and `teacherName`; consumers that need them should read from `detail.state` or the API response shape. **The critical contract for loading feed is `detail.tokenValid === true`.**

When `tokenValid` is `false`, the gate is shown and protected features must not load feed/data.

---

## Explore dependency

- **Explore only loads its feed after** `lantern-class-access-resolved` fires with `tokenValid === true`.
- If the event **never fires** (e.g. gate container missing, script order issue), Explore will **not** call `refresh()` and the feed stays **empty**.
- **This is not a data bug** — it is a **gate/event issue**. When missions or posts are “missing” on Explore, check class access first.

---

## Debug override

A debug override exists for development:

- **Flag:** `window.LANTERN_DEBUG_CLASS_ACCESS = true`
- **Effect:** Enables debug logging in the class-access bootstrap (e.g. in `class-access.js`). Use to verify bootstrap runs and event fires.
- Does not by itself grant or bypass the gate; behavior of the gate and event remains as above.

---

## Summary

| Point | Detail |
|-------|--------|
| Class access required | Yes, for Explore and protected features. |
| Mechanism | Event `lantern-class-access-resolved` with `detail.tokenValid`. |
| Explore load | Feed loads only when event has fired with `tokenValid === true`. |
| Empty Explore feed | If event never fires or `tokenValid` is false → gate issue, not a backend data bug. |
| Debug | `window.LANTERN_DEBUG_CLASS_ACCESS = true` for logging. |

---

## Related

- [Lantern architecture](lantern-architecture.md)
- [Missions & visibility](missions.md)
