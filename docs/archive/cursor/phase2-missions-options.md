# Phase 2: Missions — Three Options (No Code Yet)

**Read and followed:** `.cursor/lantern-rules.md`, `.cursor/missions-master.prompt.md`, `.cursor/phase1-missions-audit.md`.

**Constraints honored:** No redesign of Missions; no replacement of localStorage; no move to Worker/D1 unless necessary; current My Missions (student) and Teacher mission flow preserved; FERPA and DEAD SIMPLE unchanged; minimal changes and near-zero architectural drift.

---

## Option 1 — Safest / Smallest

### What changes

- **Help Mode coverage for Missions.** Ensure the existing Help Mode (lantern-help.js) includes entries for the My Missions section and the Teacher Create Mission form. Add or align `data-help` attributes on key elements so that when Help Mode is on, students and teachers get consistent tooltips/labels for missions (e.g. `missions`, `edit_profile` already exist; add or verify `create_mission`, mission card areas, and any missing spots). No change to mission logic, data, or visibility.

### Which files would change

- `apps/lantern-app/js/lantern-help.js` — ensure help map includes mission-related keys used in the app (e.g. missions, create_mission, mission cards if referenced).
- `apps/lantern-app/index.html` — add or verify `data-help` on My Missions section and/or featured/active/completed areas if any are missing.
- `apps/lantern-app/teacher.html` — add or verify `data-help` on Create Mission card and key inputs (e.g. missionTitle, missionDesc, missionAudience) so Help Mode can describe them.

### Why it is useful

- Brings Missions in line with the rest of the app’s Help Mode behavior; improves onboarding and clarity without touching data or permissions.
- Zero impact on mission behavior or FERPA; purely UX/documentation.

### FERPA risk level

- **None.** No student data, no visibility, no new views. Only in-app help text and attributes.

### Architecture risk level

- **None.** No new APIs, no new storage, no Worker. Only frontend attributes and help map entries.

### Before Worker/D1 mission persistence?

- **Yes.** Safe to do first. Independent of any backend; when Worker/D1 missions are added later, Help Mode still applies to the same UI.

---

## Option 2 — Medium

### What changes

- **Wire “Selected Students” on Teacher Create Mission.** The Create Mission form already has an Audience dropdown including “Selected Students,” and the API already supports `target_character_names`, but the teacher cannot currently select which characters. Add a multi-select (or checklist) of character names that appears when Audience is “Selected Students,” populated from the same character list the app already uses (e.g. from `LANTERN_DATA.ensureCharacters()` or the existing character list used elsewhere on teacher.html). On submit, when audience is `selected_students`, pass the selected names as `target_character_names` to `callCreateTeacherMission`. No new API; no new storage keys; no change to student visibility logic (already in `getActiveTeacherMissionsForCharacter`).

### Which files would change

- `apps/lantern-app/teacher.html` — (1) When Audience select is “Selected Students,” show a multi-select or checklist of character names (same source as e.g. recCharacterName options). (2) In the `createMissionBtn` click handler, when `missionAudience` is `selected_students`, collect selected names and pass them as `target_character_names` to `callCreateTeacherMission`. No change to runner or lantern-api.js (already accept `target_character_names`).

### Why it is useful

- Makes “Selected Students” actually functional and supports differentiation (e.g. different missions for different groups) with no backend. Uses the existing mission model and FERPA-safe visibility (students only see missions they’re in for `selected_students`).

### FERPA risk level

- **Low.** Visibility is narrowed (only selected students see the mission). Teachers still only see submissions for missions they own (`getMissionSubmissionsForTeacher(teacherId)`). Today the character list is demo/default characters; if it were ever driven by a real roster, the roster source would need to be teacher-scoped (out of scope for this option).

### Architecture risk level

- **None.** All client-side; existing localStorage and runner unchanged; no Worker, no D1.

### Before Worker/D1 mission persistence?

- **Yes.** This is the intended use of the existing `audience` + `target_character_names` design. Doing it before Worker/D1 keeps the backend contract simple when added (same payloads).

---

## Option 3 — Biggest Still Reasonable

### What changes

- **Optional mission type/category.** Add one optional display field to the mission model and UI: e.g. “Type” or “Category” (Writing, Reflection, Interview, Kindness, Story, Project, or free text). (1) **API:** In `createTeacherMission` and `updateTeacherMission`, accept an optional `mission_type` (or `category`) and store it on the mission object in localStorage; include it in mission objects returned by existing getters. (2) **Teacher:** In the Create Mission card, add an optional “Type (optional)” dropdown or text field and pass the value into `callCreateTeacherMission`; optionally allow editing in Your Missions if there is an edit path. (3) **Profile:** In `renderMyMissions` (featured card and `appendMissionRow`), show a small label or tag when `mission_type` is set (e.g. “Writing”, “Reflection”). No new localStorage keys (mission object is already one blob per mission); no new endpoints; no change to submission or visibility logic.

### Which files would change

- `apps/lantern-app/js/lantern-api.js` — In `createTeacherMission`, accept optional `mission_type` (or `category`), normalize (e.g. string, max length), set on mission object; in `updateTeacherMission`, allow updating it. No change to submission or visibility functions.
- `apps/lantern-app/teacher.html` — Add optional “Type (optional)” control (dropdown with fixed list or short text input) to Create Mission card; pass value into `callCreateTeacherMission`. If Your Missions list has an edit/toggle flow that shows mission details, optionally show/edit type there.
- `apps/lantern-app/index.html` — In the script that builds the featured mission card and in `appendMissionRow`, if `m.mission_type` (or `m.category`) is set, render a small label/tag (e.g. under the title or in the meta row).

### Why it is useful

- Gives teachers and students a clear, optional label for what kind of mission it is (e.g. Thank-You Letter, Reflection, Interview), which supports clarity and future filtering/display without adding LMS concepts (no grading, no rubrics). Keeps the model minimal (one optional field).

### FERPA risk level

- **None.** Type/category describes the mission, not student data. No new visibility or submission exposure.

### Architecture risk level

- **Very low.** One optional field on the existing mission object; no new keys, no Worker, no D1. If Worker/D1 missions are added later, one extra column can mirror this field.

### Before Worker/D1 mission persistence?

- **Yes.** Best added while missions are still client-only so the schema is “mission object + optional type” everywhere; when persisting to D1, add a single column and mirror the field.

---

## Summary Table

| Option | What changes | FERPA risk | Architecture risk | Before Worker/D1? |
|--------|----------------|------------|-------------------|--------------------|
| **1. Safest** | Help Mode coverage for My Missions + Create Mission | None | None | Yes |
| **2. Medium** | Wire Selected Students multi-select to `target_character_names` on Teacher | Low | None | Yes |
| **3. Biggest** | Optional mission_type/category in model + Teacher + Profile display | None | Very low | Yes |

All three options are additive, preserve the current localStorage mission system and runner, keep the existing My Missions and Teacher flows, and maintain FERPA and DEAD SIMPLE. None require or introduce Worker/D1 mission persistence.
