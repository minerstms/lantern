# Lantern Auth + Class Access — LOCKED BASELINE

## Status

**WORKING · KNOWN-GOOD · DO NOT BREAK**

This document records the baseline for pilot login, session cookies, login page behavior, and class-access gating. Treat it as the contract when changing `worker/index.js`, `app/login.html`, `app/js/class-access.js`, or related CORS/credentials usage.

---

## Auth system

- **Login endpoint:** `POST /api/auth/login` (Worker aliases `/api/pilot/login`; same behavior).
- **Real student login** works against `lantern_pilot_accounts` (password + PBKDF2).
- **Session:** HttpOnly JWT cookie **`lantern_pilot`** set on successful login.
- **Cookie attributes:** **HttpOnly**, **SameSite=None**, **Secure** (when served over HTTPS) — required for cross-site credentialed API calls.
- **Frontend:** Login form submits correctly: submit handler is always registered; fetch uses **`credentials: 'include'`**.

---

## Frontend login contract (`app/login.html`)

- **Form submit** is wired with **`addEventListener('submit', …)`** on `#loginForm`; the Sign in control is **`type="submit"`**.
- **No early return before the listener attaches** — missing `LANTERN_AVATAR_API` must not skip registration (show error + disable button instead).
- **`novalidate`** on the form so the browser does not block `submit` on empty fields without firing the handler; **explicit JS validation** shows errors for empty username/password.
- **Login `fetch`** uses **`credentials: 'include'`** so the Set-Cookie from login is stored and sent to the Worker origin.

---

## Cookie + CORS contract

- Any request that must carry the **`lantern_pilot`** session (auth **me**, **login**, **logout**, **`GET /api/class-access/state`**) must use **`fetch(..., { credentials: 'include' })`** (or equivalent).
- The Worker must use **reflected-origin, credential-safe CORS** for those routes (same pattern as pilot/auth: **`Access-Control-Allow-Origin: <request Origin>`** + **`Access-Control-Allow-Credentials: true`**), not **`Access-Control-Allow-Origin: *`**.
- **Why:** With wildcard `*`, browsers **do not attach cookies** to cross-origin credentialed requests, and preflight/response headers are wrong for session-based auth. That previously broke **class-access state** (gate could not “see” login).

---

## Class access baseline

- **Endpoint:** **`GET /api/class-access/state`** — single source of truth for gate UI (`app/js/class-access.js`).
- **Lock hours:** Enforced in Worker via **`isLockHours()`** (America/Denver window; Mon–Thu in-window per implementation).
- **Outside school hours:** State returns access that does **not** require a class token for the time rule ( **`tokenValid: true`** for that branch).
- **Simulation:** Verify **simulation** branch for class access is **unchanged** by auth integration work — demo/switch behavior stays separate from live pilot session.
- **Class token path:** Join/session tokens in D1 **`class_access_*`** tables remain valid; students can still use a board code when required.

---

## Critical locked rule

**Valid logged-in student session bypasses the class-access gate during lock hours** — when live mode is locked and there is no valid class token, the Worker may grant access if the request includes a **valid pilot JWT** for an **active** account with **`role === 'student'`** (same validation idea as `GET /api/auth/me`). **Real student login is canonical identity** for that bypass.

---

## Access states (live / client-facing)

| State | Meaning |
|-----|--------|
| **`live_student_has_valid_access`** | Valid **class-access token** tied to an active session (traditional board-code path). |
| **`live_student_login_access`** | Lock hours, no (or invalid) class token, but **logged-in student** pilot session is valid — gate allowed. |
| **`live_locked_no_session`** | Lock hours, no token, no active class session (or no student bypass). |
| **`live_locked_session_available`** | Lock hours, no token, but a teacher **has** started a class session (code available). |
| **`live_outside_school_hours`** | Outside the lock-hours window — time rule does not require a class token. |

(Other states such as expired/revoked tokens may still appear; do not remove handling in `shouldShowGate` without auditing.)

---

## Verified working checks

The following were verified for this baseline:

- Real **student** login works end-to-end.
- **Refresh** keeps the session (cookie persists; `/api/auth/me` still authenticated).
- **Logged-in student** bypasses the class-access **gate during lock hours** without a class token (when pilot session is valid).
- **Anonymous / InPrivate** user (no cookie) remains **blocked** by the gate during lock hours when applicable.
- **Explore** loads for authenticated users past gate.
- **Locker** loads for authenticated users past gate.
- **Canonical identity** resolves using **username fallback** when **`student_character_name`** is missing (see `app/js/lantern-pilot-auth.js` — `applyStudentStorageFromLoginResponse` / session helpers).

---

## Do not break list

Future edits must **not** break:

- **`credentials: 'include'`** on login, **me**, logout, and **`/api/class-access/state`** fetches where session is required.
- **Credential-safe CORS** for **`/api/class-access`** (and auth routes) — **no wildcard** `*` for those credentialed routes.
- **Login submit wiring** — listener always attached; **`novalidate`** + JS validation pattern.
- **Cookie / session flow** — HttpOnly pilot cookie must reach the Worker on credentialed requests.
- **Student bypass during lock hours** — do not remove **`live_student_login_access`** / pilot check without product sign-off.
- **Username fallback** for student identity when **`student_character_name`** is absent — do not drop fallback without replacing with an equivalent canonical rule.
- **Worker ↔ frontend alignment** on API base (`LANTERN_AVATAR_API`), paths (`/api/auth/*`), and class-access headers.

---

## Safe next-build note

New features should **build on this baseline** (same endpoints, cookies, CORS, and gate rules). **Do not redesign** auth or class-access from scratch in a side branch without updating this document and re-running the verified checks.

---

*Cross-reference: high-level system rules remain in `docs/LANTERN_SYSTEM_CONTEXT.md`; this file is the **auth + class-access** lock specifically.*
