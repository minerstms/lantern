# Teacher Create Mission — legacy option audit (Prompt #78)

Traced both cryptic Create Mission checkboxes end-to-end (DOM → JS payload → Worker
handler → D1 column → every reader) before deciding what to do with them.

## Highlight-worthy / site-eligible — ARCHIVED

- **DOM control:** `#missionSiteEligible` checkbox in `app/teacher.html` (removed in
  Prompt #78).
- **JS payload:** was sent as `site_eligible` in the `POST /api/missions` body from
  `callCreateTeacherMission`.
- **Worker/handler:** `worker/missions-handlers.js` accepts `site_eligible`, stores it
  on INSERT, allows it on PATCH, and returns it in every mission read
  (`missionRowToJson`, `GET /api/missions/active`, `GET /api/missions/teacher`).
- **D1 field:** `lantern_missions.site_eligible INTEGER NOT NULL DEFAULT 0`.
- **Every reader searched:** `app/missions.html`, `app/js/lantern-missions-page.js`,
  `app/js/lantern-cards.js`, `app/explore.html`, and the Explore feed builder
  (`collectApprovedFeed` in `app/js/lantern-api.js`) — none of them ever read
  `site_eligible`. It is round-tripped through storage but never consumed to gate
  visibility, sort order, a badge, or Explore inclusion anywhere in the app or Worker.
- **Visible consequence today:** none. It does not control public/private visibility
  (no RED STOP condition applies) — it simply has zero effect.
- **Decision:** archived from the Create Mission UI per the Prompt #78 decision rule
  (no consumer, no visible effect, legacy). The teacher-facing control is removed and
  new missions stop sending the field. No D1 migration, no schema change, no cleanup of
  already-stored rows — old missions keep whatever value they already have.

## Pin as featured mission — RETAINED, RENAMED

- **DOM control:** `#missionFeatured` checkbox, relabeled **"Feature this mission"**
  with helper text: *"Shows this mission prominently to students — it's sorted to the
  top of their Active Missions list."*
- **JS payload:** sent as `featured` in the `POST /api/missions` body (unchanged).
- **Worker/handler:** `worker/missions-handlers.js` stores `featured` on INSERT, allows
  it on PATCH, and — critically — `GET /api/missions/active` (the endpoint the student
  Missions page calls) runs `ORDER BY featured DESC, created_at DESC`.
- **D1 field:** `lantern_missions.featured INTEGER NOT NULL DEFAULT 0`.
- **Client consumer:** `app/js/lantern-missions-page.js` (used by `app/missions.html`,
  the real student Missions page) also default-sorts `featured` items first
  client-side (`sortItems()`), matching the server order.
- **Actual, proven, user-visible behavior:** a featured mission is sorted to the top of
  the student's default-sorted Active Missions list. No separate "Featured" badge is
  rendered on the mission card itself — the effect is purely list position.
- **Decision:** retained with a plain-language label + one-sentence explanation, per
  the Prompt #78 decision rule (proven, distinct, currently meaningful behavior). Not
  moved to an "Advanced" sub-panel since, after archiving `site_eligible`, it's the only
  remaining option in that group — it now lives under its own "Advanced / other" section
  in the Create Mission form.

No backend behavior, D1 schema, or persisted mission data was changed by this audit.
