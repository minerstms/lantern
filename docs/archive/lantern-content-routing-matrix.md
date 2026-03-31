# Lantern — Content routing & recognition matrix (code-backed)

This document mirrors `apps/lantern-app/js/lantern-content-routing.js` (`ROUTING_ROWS`). When they differ, **trust the JS** after a deliberate change.

## Rules (product)

| Rule | Implementation |
|------|----------------|
| New vs Best | Same post may appear in **both**; Best = pick/feature; New = chronological of all approved. `explore.html` `renderAll()`. |
| Approval → no auto Spotlight | Approved creation/poll/news does **not** insert D1 recognition unless shout-out merge or teacher action. |
| Teacher Pick → Spotlight | D1 row when `LANTERN_AVATAR_API` + teacher curates pick (`teacher.html`); else history-only. Deduped on Profile. |
| Peer shout-out | Stays news; **also** merged into `GET /api/recognition/list` for matched student. |
| Game scores | Leaderboards / Display; **not** Profile Spotlight rail (per-score). |

## Matrix

| Item type | Normal destination(s) | Approval? | Recognition / Spotlight duplicate? | Code location |
|-----------|------------------------|-----------|-------------------------------------|---------------|
| Teacher recognition | Spotlight API, displays | No | Row IS recognition | `POST /api/recognition/create`, `teacher.html` |
| Peer shout-out | News / Happening | Yes | Merged into recognition list | `lantern-worker` recognition list + shout-out SQL |
| Teacher Pick (creation) | Best + New | Post approved | D1 + history (deduped) | `curatePost`, `teacher.html` fetch, `index.html` rail |
| Teacher Featured | Best + New | Yes | History Spotlight only | `curatePost` + `getActivityLabel` |
| Approved creation | My Creations, New | Yes | No | `getExploreFeed` |
| Mission default | Missions / explore | Yes | No unless Spotlight on approve | `approveSubmission` |
| Poll / news | Happening / polls | Yes | No | Worker approvals |
| Game scores | Leaderboards, Display | N/A | Not Profile Spotlight rail | `getDisplayFeed`, `getGameLeaderboard` |
| Thank-you | Teacher flow | Yes | No | `thanks.html`, `approveThanks` |

## Gaps / further testing

- Removing Teacher Pick does not delete D1 recognition row.
- Pure Apps Script (no worker): Teacher Pick Spotlight relies on **activity history** only unless teacher panel has API base.
- Mission spotlight checkbox: verify `note_text` contains `Spotlight` for Profile rail.

## Verify UI

Open **Verify** → **Routing matrix (code-backed)** table, or console: `LanternContentRouting.logVerifySummary()`.
