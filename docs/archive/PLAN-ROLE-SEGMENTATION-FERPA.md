# Role Segmentation & FERPA Safety — Implementation Plan

## Current Architecture Summary

### Data Model
- **staff**: `teacher_id`, `teacher_name`, `teacher_email`, `role`, `is_admin`, `is_backup_responder`, password fields
- **cases**: full escalation records including `note_text`, `student_name`, `teacher_name`, `current_status`, arrival fields
- **logs**: teacher logs with `note_text`, `student_name`, etc.

### Auth Flows
- **Behavior / Teacher / Store**: Teacher enrollment (LS_TEACHER lock). User picks name, enters password. Stored: `teacher_id`, `teacher_name`, `teacher_email`, `is_admin`, `role` (from staff on login).
- **Admin**: ADMIN_KEY in localStorage. No teacher login. Admin APIs require `body.key === ADMIN_KEY`.

### API Endpoints
- **listOpenCases**: Top-level (not under admin). Currently **no auth**. Returns all open cases **with note_text**. Called by admin page.
- **admin/***: Require `body.key === ADMIN_KEY`. listOpenCases is NOT under admin.
- **teacherDashboardData**: Requires `teacher_id`. Returns `recentEscalations` (case_id, student_name, current_status, resolution_action, last_updated_at) — **no note_text**. Good.
- **getCase**, **caseAction**, **acknowledgeCase**, **closeCase**: Under admin, require key.

### Pages & Nav
- **index.html**: Behavior logging. Nav: Behavior | Teacher | Admin | Store (all visible).
- **teacher.html**: Teacher dashboard. Same nav.
- **store.html**: School store. Same nav.
- **admin.html**: Admin tools. Same nav. Uses ADMIN_KEY.

### Gap
- listOpenCases is **unauthenticated** and returns **note_text** to anyone.
- No secretary page. No role-based nav filtering. No backend filtering of note_text by role.

---

## Implementation Plan

### 1. Role Detection Helper (worker)

```js
function getEffectiveRole(role, isAdmin, isBackupResponder) {
  const r = (role || '').trim().toLowerCase();
  if (['secretary','admin','store','web_admin'].includes(r)) return r;
  if (isAdmin === 'TRUE' || isAdmin === true) return 'admin';
  return 'teacher';
}
```

- `is_backup_responder` remains a workflow capability only; not used for role.
- Existing staff with `role` like "Track coach" get `teacher` (default).

### 2. Move listOpenCases Under Admin / Add Secretary Endpoint

- **admin/listOpenCases**: Require `body.key === ADMIN_KEY`. Return full cases (including note_text). Admin page will send key.
- **listOpenCasesForSecretary**: New endpoint. Requires `teacher_id` + auth (we can use a lightweight check: teacher exists and `getEffectiveRole(role, is_admin) === 'secretary' || === 'admin'`). Returns **operational payload only** — omit `note_text` from every case object. Include: case_id, log_id, created_at, teacher_name, student_name, student_id, current_status, resolution_action, acknowledged_at, acknowledged_by_staff_name, last_updated_at, called_to_office_at, student_arrived_at, arrival_overdue.
- Keep existing `listOpenCases` but add `body.key` check — when key present and valid, treat as admin listOpenCases. When no key, reject (or redirect to use new paths). **Smallest change**: migrate admin page to call `admin/listOpenCases` with key, and add that case to handleAdminApi. Remove listOpenCases from main handleApi, or have it delegate to admin when key provided.

Actually simpler: **Move listOpenCases into handleAdminApi** as `listOpenCases`. Admin page already uses MTSS_API; we change the call to `admin/listOpenCases` with `key`. That requires key. Done.

For secretary: new `listOpenCasesForSecretary` in main handleApi. Body: `{ teacher_id }`. No password in that call — we rely on the fact that secretary page is only reachable after teacher login. So the teacher_id in the request is from the locked session. An attacker could spoof another teacher_id — so we need to either:
- Accept that secretary endpoint is protected by "you must have logged in as a secretary" — i.e. we verify the teacher_id belongs to a staff row with role=secretary or admin. We don't re-verify password on each request. This is the same as teacherDashboardData — it takes teacher_id and trusts it (or we could add a session token; that would be a bigger change). For smallest change, we do the same: require teacher_id, verify that staff has secretary or admin role, return operational data. If someone spoofs a teacher_id that isn't secretary, we return 403.
- So: `listOpenCasesForSecretary`: body.teacher_id required. Look up staff. If getEffectiveRole(role, is_admin) not in ['secretary','admin'], return 403. Else return cases without note_text.

### 3. getCase for Secretary

Secretary needs to perform actions: Call Student, Student Arrived, Notify Principal. These hit **caseAction**. So secretary must be able to:
- List cases (operational view) ✓
- Get case by ID for actions — but they must NOT receive note_text. So we need **getCaseForSecretary** or a `view` parameter on getCase. Smallest: add `admin/getCaseOperational` that returns case without note_text, and requires either admin key OR teacher_id of secretary. Actually admin uses key. Secretary uses teacher_id. So we need:
- **admin/getCase** (existing): requires key, full case.
- **getCaseOperational** (new): requires teacher_id. Verify staff is secretary or admin. Return case without note_text. Used by secretary page when opening a case for actions.

### 4. caseAction / acknowledgeCase for Secretary

Secretary needs to: acknowledge (claim), call student, student arrived, notify principal. These are existing caseAction slugs. Currently they're under admin and require key. Options:
- A) Secretary uses admin key too — then they'd have same access as admin. Not desired.
- B) Add secretary-specific endpoints that accept teacher_id and verify secretary role, then call same caseAction logic.

For smallest change: allow **caseAction** and **acknowledgeCase** to be called with EITHER admin key OR (teacher_id + staff_name) when the staff has secretary or admin role. So we add an alternate auth path: if no key, check body.teacher_id and body.staff_name, look up staff, if secretary or admin, allow. This keeps one implementation of caseAction.

### 5. Create public/secretary.html

- Same nav structure as other pages, but only show: Secretary | (maybe Store, Behavior if we allow).
- Actually per spec: "Secretaries see: secretary.html". So nav might show only Secretary for them. Teachers see Behavior, Teacher. etc.
- Secretary page: 
  - Uses LS_TEACHER for auth. If not present, redirect to index.html.
  - Fetches cases via listOpenCasesForSecretary.
  - Displays Active Queue (open cases) and Recent Activity (recently updated/closed).
  - Each case card: student_name, student_id, teacher_name, current_status, created_at, last_updated_at. No note_text.
  - Buttons: Call Student | Student Arrived | Notify Principal. These map to: called_student_to_office, student_arrived, and "Notify Principal" = send principal exception email (student_did_not_arrive or similar triggers that).
  - "Notify Principal" could be a dedicated action that sends the exception email without changing workflow state much — or it could map to student_did_not_arrive when the student hasn't arrived. The spec says "Notify Principal" as a button. The existing principal exception triggers are: student_refused, student_did_not_arrive, student_cannot_be_located. So "Notify Principal" might mean: escalate to principal now. We could add an action `notify_principal` that just sends the email and records it. Or we use student_did_not_arrive as the principal escalation for "student didn't show up". For secretary, simplest: "Notify Principal" = trigger principal exception email. We could add action `notify_principal` that: if principal_exception_email_sent_at null, send email and set it; audit. Doesn't change case flow otherwise.
  - Actually re-reading: "Notify Principal" is a button. The principal exception email is sent for specific events. For secretary console, "Notify Principal" could mean "escalate this to principal now" — so we add an action `notify_principal` that sends the exception email with reason "Manual escalation by secretary" or similar.

### 6. Navigation Filtering

Each page needs to show only nav items allowed by the user's role.

- **index.html** (Behavior): If user has role teacher (or no role), show Behavior, Teacher, Store. Hide Admin unless admin. Add Secretary if secretary.
- **teacher.html**: Same.
- **store.html**: If role is store, show Store only (or Store + Behavior + Teacher if we allow). Per spec "Store staff see store.html only" — so store role might see only Store nav.
- **admin.html**: Admin key user — might have role from somewhere? Actually admin uses key, not teacher lock. So we don't have a "role" for the admin session. The key grants admin. So for nav on admin page: we could hide Behavior/Teacher/Store for "admin-only" users, or show all. The spec says "Admins see admin.html". So admin page shows Admin. Maybe Behavior, Teacher, Store too for convenience.
- **secretary.html**: Secretary sees Secretary. Maybe Behavior, Teacher? Spec says "Secretaries see secretary.html". So we could show only Secretary, or Secretary + Behavior + Teacher. Minimal: Secretary only for secretary role.

Implementation: each page loads, reads LS_TEACHER (for teacher/auth pages) or assumes admin (admin page). Compute effective role. Render nav buttons with visibility: teacher sees Behavior+Teacher+Store, secretary sees Secretary (+ maybe others), admin sees Admin (+ others), store sees Store. This requires role to be in the lock. When we save the lock after login, we should add `role` from the staff row. Check if that's already there — getBootstrap returns staff with role. When we match lock to staff, we have role. We need to persist it. Check continueTeacher / confirmEnroll — when we save the lock, we have auth object. We need to add role to the saved object.

### 7. Status Language

Map internal slugs to operational language: Logged, Principal notified, Student requested, In office, Resolved. Use "School Response Team" exactly where appropriate.

### 8. Compatibility

- Existing staff: role may be empty or "Track coach". getEffectiveRole returns 'teacher'. No change.
- is_backup_responder: keep. Treat as workflow capability for admin page (can acknowledge).
- No DB schema change unless we want a dedicated role column — we'll use existing `role` with specific values for access control.

---

## File Changes Summary

| File | Change |
|------|--------|
| worker/index.js | Add getEffectiveRole; add listOpenCasesForSecretary (operational payload, no note_text); move listOpenCases to handleAdminApi with key check; add getCaseOperational for secretary; allow caseAction/acknowledgeCase via teacher_id when secretary/admin |
| public/secretary.html | **New** — secretary operational console |
| public/api.js | Add post('listOpenCasesForSecretary'), post('getCaseOperational') if called directly |
| public/index.html | Role-based nav; persist role in lock |
| public/teacher.html | Role-based nav |
| public/store.html | Role-based nav |
| public/admin.html | Change to admin/listOpenCases with key; role-based nav |

---

## Confirmation

- **note_text** will **never** be included in listOpenCasesForSecretary or getCaseOperational responses. Filter in Worker before returning JSON.
- Secretary actions (Call Student, Student Arrived, Notify Principal) reuse existing caseAction slugs. No parallel workflow.
