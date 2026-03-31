# TMS Lantern — Isolation & Build Plan

**Purpose:** A safe beta environment for testing the Nuggets engagement loop using fictional character identities. Lantern is NOT the MTSS helper, behavior/admin/secretary system, or connected to real student data.

---

## A. Relevant Files for Lantern

### Primary visual sources (clone & adapt)
| File | Purpose |
|------|---------|
| `public/store.html` | Visual basis for Lantern cosmetic store (~1280 lines). Redeem UI, catalog list, leaderboard, balance stats, modal, student dropdown, nav row, `:root` CSS. |
| `public/teacher.html` | Visual basis for Lantern teacher approval page (~1357 lines). Cards, tables, pending list, filters, overlay/modal, nav row, `:root` CSS. |

### Shared styling / assets (reference or copy)
| File | Purpose |
|------|---------|
| `public/store.html` (lines 13–560) | `:root` variables, `.wrap`, `.titleRow`, `.appTitle`, `.topRow`, `.topRowBtn`, `.card`, `.cardHd`, `.cardBd`, `.btn`, `.pill`, `.modal`, `.overlay`, `.studentCombo`, `.studentDropdown`, table styles. |
| `public/teacher.html` (lines 12–450) | Same design system; `.blocker`, `.toast`, `.filterBar`, `.escalationItem`. |
| `public/sfx.js` | Cha-ching sound helper. Safe to reuse. |
| `assets/cha_ching.mp3` | SFX asset. Safe to reuse. |

### Existing Lantern placeholder
| File | Purpose |
|------|---------|
| `public/index.html` | Current Lantern landing (11 lines). Will become Student/Profile page. |

### Reference only (do not use as-is)
| File | Purpose |
|------|---------|
| `packages/sandbox-data/index.js` | FAKE_STAFF, FAKE_STUDENTS, FAKE_CATALOG. Lantern needs different structure (characters, avatars, owned cosmetics). Use as pattern only. |
| `apps/sandbox-app/sandboxProvider.js` | MTSS sandbox provider. Lantern needs its own `lanternProvider.js` with different API surface. |

---

## B. Files to Avoid

### MTSS / Admin / Behavior / Secretary (do not use)
| File | Reason |
|------|--------|
| `public/admin.html` | Admin UI. No admin page in Lantern. |
| `public/secretary.html` | Secretary/Response Team. No secretary page in Lantern. |
| `public/index.html` (if it becomes Behavior Logger) | Behavior logging. Lantern index = Student/Profile. |
| `worker/index.js` | Production Worker. Lantern uses no Worker. |
| `workers/helper-api/*` | Helper feedback API. Optional later; not for v1. |
| `packages/bootstrap/index.js` | Production/sandbox host checks. Lantern has its own env. |
| `packages/shared-roles/index.js` | MTSS roles (teacher, secretary, admin, store). Lantern has simpler roles. |
| `packages/shared-workflows/index.js` | Case workflow statuses. Not used in Lantern. |
| `packages/shared-ui/index.js` | MTSS nav rendering. Lantern nav is different. |
| `packages/shared-config/index.js` | MTSS page names, nav buttons. Lantern config is separate. |

### Existing sandbox-app (different purpose)
| File | Reason |
|------|--------|
| `apps/sandbox-app/*` | MTSS training sandbox (behavior, cases, secretary). Not Lantern. |

---

## C. Live Dependencies to Strip

### Store page (`public/store.html`)

| Dependency | Location | Replacement |
|------------|----------|-------------|
| `api.js` | Script tag | `lantern-api.js` (localStorage/mock) |
| `LS_TEACHER_LOCK` / `loadAuthLockOrRedirect()` | Lines 688–767 | Lantern: adopted character from localStorage; no redirect to index.html for enrollment |
| `auth.teacher_id` / `auth.teacher_name` | Throughout | Lantern: `adoptedCharacter` (character_id, name, avatar, balance) |
| `storeBootstrap({ teacher_id })` | Lines 989, 1169 | Mock: students → characters; catalog from localStorage |
| `storeGetBalance({ student_name, teacher_id })` | Lines 999, 1009 | Mock: read balance from localStorage by character |
| `storeRedeem({ teacher_id, student_name, item_id, qty, note })` | Lines 1009–1025 | Mock: deduct from localStorage; append to owned/purchases |
| `storeStudentHistory({ student_name, teacher_id })` | Lines 1025, 913 | Mock: history from localStorage |
| `teacherDashboardData({ teacher_id })` | Lines 739, 1169 | Not needed for store; or mock empty |
| `PREFETCH_STORE_KEY` / `PREFETCH_DASHBOARD_KEY` | Lines 690–691, 1167, 1264 | Optional: keep for localStorage cache of catalog/leaderboard |
| Nav: Behavior, Secretary, Admin | Lines 579–585, 1229–1252 | Replace with: Profile, Teacher, Store (no Behavior/Secretary/Admin) |
| `window.top.location.href = 'index.html'` (enrollment redirect) | Line 762 | Lantern: redirect to profile/character-select if no adopted character |
| Student dropdown (real students) | Lines 779–814, 1000+ | Character dropdown (adopted character or switch) |

### Teacher page (`public/teacher.html`)

| Dependency | Location | Replacement |
|------------|----------|-------------|
| `api.js` | Script tag | `lantern-api.js` |
| `LS_TEACHER_LOCK` / `ensureEnrolledOrBlock()` | Lines 683–776 | Lantern: simple “teacher” identity in localStorage (no enrollment password) |
| `teacherDashboardData({ teacher_id })` | Lines 817–826, 1203, 1323 | Mock: pending submissions from localStorage |
| `assignStudentToPending({ teacher_id, log_id, student_name })` | Lines 828–835 | Replace: approve/reject submission; Approve +1/+3/+5/Spotlight |
| `updateLog` / `deleteLog` | Lines 838–855 | Not used in Lantern teacher flow |
| `getGroupCategories` / `getStudentGroups` / `getStudentsFiltered` | Implicit in dashboard | Not needed for Lantern v1 |
| Nav: Behavior, Secretary, Admin | Lines 506–510, 1251–1274 | Replace with: Profile, Teacher, Store |
| `blocker` / “Device not enrolled” | Lines 656–671, 759 | Lantern: no enrollment; optional “Select teacher” if multi-teacher |
| Pending = unassigned logs | Teacher page logic | Lantern: Pending = student submissions awaiting approval |
| Recent escalations | Lines 901–933 | Not used in Lantern |

### API (`public/api.js`)

| Item | Replacement |
|------|-------------|
| `API_ORIGIN` / `fetch(apiUrl(path))` | No network calls. `lantern-api.js` returns promises that resolve to mock data. |
| `verifyEnrollment` / `verifyTeacherPassword` / `setTeacherPassword` | Not used. Lantern has no production auth. |
| `getBootstrap` | Mock: characters, catalog, no staff/students from D1. |
| All `post()` calls | In-memory / localStorage reads and writes. |

---

## D. Proposed Lantern File Structure

```
apps/lantern-app/
├── index.html              # Student/Profile page (character, avatar, balance, owned cosmetics, activity log)
├── teacher.html            # Teacher approval page (cloned from public/teacher.html, stripped)
├── store.html              # Cosmetic store (cloned from public/store.html, stripped)
├── games/                  # (Future) Reaction Tap, Nugget Click Rush, Memory Match, Hidden Nugget Hunt
│   └── (game HTML/JS)
├── missions/              # (Future) Daily Check-In, Hidden Nugget, First Game Played
├── css/
│   └── lantern-shared.css  # Extracted :root + shared styles (optional; can stay inline for v1)
├── js/
│   ├── lantern-api.js     # Mock API: localStorage reads/writes, no fetch
│   ├── lantern-data.js    # Default characters, catalog, missions
│   └── sfx.js             # Copy of public/sfx.js or symlink
├── assets/
│   └── cha_ching.mp3       # Copy or symlink to ../../assets/cha_ching.mp3
└── README.md               # Lantern-specific deploy notes
```

**Alternative (simpler):** Keep everything in `apps/lantern-app/` flat: `index.html`, `teacher.html`, `store.html`, `lantern-api.js`, `lantern-data.js`, `sfx.js`, and reference `../../assets/cha_ching.mp3` via path.

**Deploy:** Cloudflare Pages project with root = `apps/lantern-app`, build output = `./`. No Worker, no D1.

---

## E. Recommended Implementation Order

1. **Create `apps/lantern-app/`** and copy `public/sfx.js`, `assets/cha_ching.mp3` (or reference).
2. **Create `lantern-data.js`** — default characters (avatar, name, balance, owned cosmetics), catalog, missions stub.
3. **Create `lantern-api.js`** — mock `storeBootstrap`, `storeGetBalance`, `storeRedeem`, `storeStudentHistory`, `teacherDashboardData` (pending submissions), `approveSubmission` (+1/+3/+5/Spotlight). All use localStorage.
4. **Clone `public/store.html` → `apps/lantern-app/store.html`**:
   - Replace `api.js` with `lantern-api.js`.
   - Remove auth lock; use adopted character from localStorage.
   - Change nav: Profile, Teacher, Store (remove Behavior, Secretary, Admin).
   - Wire redeem/balance/history to `lantern-api.js`.
   - Update links: `index.html` = Profile, `teacher.html` = Teacher.
5. **Clone `public/teacher.html` → `apps/lantern-app/teacher.html`**:
   - Replace `api.js` with `lantern-api.js`.
   - Remove enrollment blocker.
   - Replace “Pending Nuggets” (assign student) with “Pending Submissions” (approve/reject, Approve +1/+3/+5/Spotlight).
   - Change nav to Profile, Teacher, Store.
6. **Build `index.html`** as Student/Profile page — character card, avatar, balance, owned cosmetics, activity log, “Switch character”, testing controls (add nuggets, reset wallet, clear purchases).
7. **Add testing controls** — add 1/5/10 nuggets, custom nugget add, reset wallet, clear purchases, switch character.
8. **Add missions** — Daily Check-In, Hidden Nugget, First Game Played (localStorage).
9. **Add games** — Reaction Tap, Nugget Click Rush, Memory Match, Hidden Nugget Hunt (1 nugget cost, no nugget awards).
10. **Add recognition/activity feed** — display recent activity from localStorage.

---

## F. Risks / Watch-outs

| Risk | Mitigation |
|------|------------|
| Accidentally loading production `api.js` | Lantern pages must never reference `public/api.js`. Use only `lantern-api.js`. |
| Nav links pointing to production pages | All `href` and `location.href` must stay within `apps/lantern-app/` (e.g. `index.html`, `teacher.html`, `store.html`). |
| Shared `LS_TEACHER_LOCK` with production | Use separate keys: `LANTERN_ADOPTED_CHARACTER`, `LANTERN_CATALOG`, `LANTERN_PURCHASES`, etc. |
| Copy-paste leaving `teacher_id` / `student_name` | Replace with `character_id` / `character_name` in Lantern. |
| Store page expects `students` array | Lantern uses `characters` (adopted character + optional list for leaderboard). |
| Teacher page expects `pending` = unassigned logs | Lantern `pending` = submissions (e.g. `{ id, character_id, character_name, submission_type, nuggets_requested }`). |
| Bootstrap / shared-roles in Lantern | Do not load `packages/bootstrap` or `packages/shared-roles`. Lantern is self-contained. |
| “Sandbox” wording in UI | User rule: no “sandbox” in UI. Use “Lantern” or “Beta” only. |
| Font size 22–36px | Per user rules, keep font sizes in range. |
| Single-column mobile layout | Preserve responsive layout from store/teacher. |

---

## G. Minimal File Set for Real App–Family Look

To preserve the real app look for store and teacher pages:

| Asset | Source | Action |
|-------|--------|--------|
| `:root` CSS variables | `public/store.html` lines 14–43 | Copy into `store.html` and `teacher.html` (or shared CSS) |
| `.wrap`, `.titleRow`, `.appTitle`, `.subTitle` | Both pages | Copy |
| `.topRow`, `.topRowBtn` | Both pages | Copy; adjust for 3 buttons (Profile, Teacher, Store) |
| `.card`, `.cardHd`, `.cardBd` | Both pages | Copy |
| `.btn`, `.btn.primary`, `.btn.good`, `.btn.bad` | Both pages | Copy |
| `.pill`, `.modal`, `.overlay` | Both pages | Copy |
| Table styles | Both pages | Copy |
| `sfx.js` + `cha_ching.mp3` | `public/sfx.js`, `assets/` | Copy or link |

---

## H. What to Replace with localStorage / Mock for Lantern v1

| Live behavior | Lantern v1 replacement |
|---------------|-------------------------|
| `storeBootstrap` | Read `LANTERN_CATALOG`, `LANTERN_CHARACTERS`, `LANTERN_LEADERBOARD` from localStorage; seed defaults from `lantern-data.js` if empty |
| `storeGetBalance` | Sum from `LANTERN_ACTIVITY` (earned) and `LANTERN_PURCHASES` (spent) for character |
| `storeRedeem` | Append to `LANTERN_PURCHASES`; deduct from character balance in `LANTERN_CHARACTERS` or derived from activity |
| `storeStudentHistory` | Build from `LANTERN_ACTIVITY` + `LANTERN_PURCHASES` for character |
| `teacherDashboardData` | Return `pending` from `LANTERN_PENDING_SUBMISSIONS` |
| Approve / Reject | Update `LANTERN_PENDING_SUBMISSIONS`; on approve, append to `LANTERN_ACTIVITY` with nugget delta |
| Enrollment / auth | None. Use `LANTERN_ADOPTED_CHARACTER` for current character; optional `LANTERN_TEACHER_ID` for teacher view |
| Worker / D1 | No Worker. All data in localStorage. |

---

*Plan completed. Do not build until audit is approved.*
