# Plan: Teacher login and passwords

## 1. How the app is currently set up for new teachers

- **No per-teacher passwords.** Teachers do not have individual passwords in the database. The `staff` table has: `teacher_id`, `teacher_name`, `teacher_email`, `is_admin`, `role` — no password column.
- **Single shared “Enrollment Password”.** When a teacher uses the **Logger (index.html)** for the first time:
  1. They choose their name from a dropdown (built from the staff list).
  2. They enter **one shared password** (the “Enrollment Password”).
  3. The app calls `verifyEnrollment({ attempt })`; the worker compares `attempt` to the value in `settings.enroll_password`.
  4. If it matches, the **device** is “enrolled”: the app saves in **localStorage** (`MTSS_TEACHER_LOCK_V2`) the chosen `teacher_id`, `teacher_name`, `teacher_email`, and `enroll_version`. No server-side “account” or password is stored for that teacher.
- **Device lock, not login.** After that, the same device/browser is considered “logged in” as that teacher. **Teacher** and **Store** pages only read that localStorage lock; they do not ask for a password again. So “login” is really “enroll this device once with the shared secret.”

So today: **new teachers “log in” by picking their name and entering the single Enrollment Password; there is no per-teacher temp or personal password.**

---

## 2. Is ENROLL2026 gone?

**No.** ENROLL2026 is still the default:

- **schema.sql** (line ~196):  
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('enroll_password', 'ENROLL2026');`
- **worker/index.js** (`verifyEnrollment`):  
  `const real = (row?.value || 'ENROLL2026').trim();`

So the app still uses ENROLL2026 unless an admin has changed `enroll_password` in the `settings` table. If you want to remove it as the default or move to per-teacher passwords, that would be part of the changes below.

---

## 3. Proposed direction (to match your goals)

You want:

1. **Temp password = last name backwards, all lowercase** (e.g. “Radle” → `elrad`).
2. **Temp used only once:** first time they “log in” with that temp, they **must** set their own password; after that they use their own password (or reset flow).
3. **Teacher self-service “Reset password”** (forgot password).
4. **Admin:** a way to reset a teacher’s password (e.g. **“Reset password” button in the teacher card** that sets them back to temp or a new temp).

To support that, the app has to move from “one shared enrollment password” to **per-teacher passwords** and a real “login” step when they choose their name.

---

## 4. High-level flow (proposed)

- **First time (new device / new teacher):**
  - Teacher picks their name on the Logger.
  - App asks for **their temp password** (last name backwards, lowercase). Backend checks it against the stored temp (or derived rule) for that teacher.
  - If correct, backend either:
    - Requires “set your password” (no session until they set a real password), or
    - Issues a one-time “must change password” token and redirects to a “Set your password” screen.
  - Teacher sets a new password; backend stores a **hash** of that password and marks “temp used / password set.”
  - Device is then “enrolled” (localStorage lock) and they use the app as today.

- **Later (same or new device):**
  - If device already has the lock and backend says “password set,” no prompt (current behavior).
  - If they’re on a **new device** or lock was cleared: pick name, then enter **their own password** (not the shared ENROLL2026). Backend verifies against the stored hash and then enrolls the device.

- **“Forgot password” (teacher self-service):**
  - Option A: **Reset link by email** — enter teacher_id or email, backend sends a time-limited link; they set a new password from that link.
  - Option B: **Admin-assisted reset only** — no self-service; they contact admin, admin uses “Reset password” in the teacher card (below). Simpler, no email sending.

- **Admin “Reset password” (in teacher card):**
  - In Admin → Teachers, each row has an **Edit** button. The plan is to add a **“Reset password”** button (or action inside Edit).
  - Action: backend sets that teacher’s password back to **temp** (e.g. last name backwards again) and sets a flag “must change password on next login.” Optionally backend returns the temp value so admin can tell the teacher (“Your temp is `elrad` again; log in and set a new password.”).
  - Next time that teacher logs in (any device), they must use the temp and then set a new password.

So: **yes, a “Reset password” button in the teacher card is the right place for admin-initiated reset;** it would call an API that sets the teacher back to temp and “must change password.”

---

## 5. What needs to change (summary)

| Area | Change |
|------|--------|
| **Schema** | Add to `staff`: `password_hash` (or similar), `must_change_password` (flag), and optionally `temp_password_used_at`. Optionally keep `enroll_password` for a transition period or remove it once all flows use per-teacher auth. |
| **Temp password rule** | Backend (and optionally admin UI) can compute “last name backwards, lowercase” from `teacher_name` (e.g. split on space, take last segment, reverse, toLowerCase). Store a hash of that for verification, or store it temporarily until first login. |
| **Logger (index.html)** | After “pick your name”: if teacher has no password set → ask for **temp password**; if teacher has password set → ask for **their password**. On first successful temp login → redirect/force “Set your password” screen; on success store hash and enroll device. |
| **Worker** | New or updated APIs: e.g. `verifyTeacherPassword({ teacher_id, attempt })` (temp or real), `setTeacherPassword({ teacher_id, new_password })` (when setting own password, require current temp or valid session), `adminResetTeacherPassword({ key, teacher_id })` (sets temp and must_change_password). `createStaff` (and any “add teacher” flow) sets initial temp (e.g. last name backwards). |
| **Admin → Teachers** | Add **“Reset password”** button (or link) per teacher row (or inside Edit teacher modal). Calls `adminResetTeacherPassword`; optionally show a message “Password reset to temp; tell teacher to use [temp] and set a new password.” |
| **Teacher self-service reset** | If desired: a small “Forgot password?” flow (e.g. on Logger or a dedicated page) that either sends an email with reset link (needs email sending in worker) or instructs “Contact admin to reset your password.” |

---

## 6. Recommendation on “reset password” for the teacher

- **Simplest:** No self-service. Teachers who forget password contact you; you use **Admin → Teachers → Reset password** for that teacher. They use the temp (last name backwards) once and set a new password. No email or tokens.
- **If you want self-service later:** Add a “Forgot password?” that asks for teacher_id (and maybe email); backend generates a short-lived token, stores it, and either shows a “Set new password” form (token in URL) or sends an email with the link (requires configuring email in the worker).

---

## 7. ENROLL2026 going away

Once per-teacher passwords are in place:

- **Option A:** Remove the shared enrollment password entirely. All enrollment uses teacher_id + (temp or personal) password. Delete or ignore `settings.enroll_password` (and ENROLL2026).
- **Option B (transition):** Keep `verifyEnrollment(attempt)` for a while: if `attempt` equals the stored `enroll_password`, treat it as “legacy” and still enroll the device for the chosen teacher (and optionally force “set your password” so they migrate to a personal password). Then later remove this.

Recommendation: **remove ENROLL2026** as part of this work so there is a single, clear flow: **per-teacher temp → set own password → use own password (or admin reset back to temp).**

---

## 8. Summary

| Question | Answer |
|----------|--------|
| How are new teachers set up to “log in” now? | They pick their name and enter the **single shared** Enrollment Password; the device is then locked to that teacher in localStorage. No per-teacher password. |
| Is ENROLL2026 gone? | No. It’s still the default in schema and worker. |
| Temp password = last name backwards? | Not yet. To do it: add per-teacher password/temp storage and use “last name backwards, lowercase” as the initial temp when creating a teacher (and when admin resets). |
| One-time temp then set own password? | Requires schema (password hash, must_change_password), new/updated APIs, and Logger UI to force “Set your password” on first temp login. |
| Reset password for teacher (self-service)? | Optional. Simplest is “contact admin”; admin uses **Reset password** in the teacher card. |
| Admin reset teacher password? | **Yes.** Add a **“Reset password”** button in the teacher card (Admin → Teachers). It should call an API that sets that teacher’s password back to temp (e.g. last name backwards) and forces “must change password on next login.” |

If you want to proceed, the next step is to implement in this order: schema migration (add password/must_change columns), worker APIs (verify teacher password, set password, admin reset, and temp = last name backwards), then Logger enrollment flow, then Admin “Reset password” button, then optional self-service reset.

## 9. Implementation (done)

- **Migration:** `migrations/010_staff_passwords.sql` — run on **existing** DBs before using per-teacher auth. For **new** DBs, `schema.sql` now includes `password_salt`, `password_hash`, and `must_change_password` on `staff`, so a single schema run is enough.
- **Worker:** verifyTeacherPassword, setTeacherPassword, admin/resetTeacherPassword; createStaff sets temp; lazy init for existing staff.
- **Logger:** Uses only per-teacher password (verifyTeacherPassword). Your password → verifyTeacherPassword; if must_set_password, Set your password step → setTeacherPassword. ENROLL2026 is not used in the Logger flow.
- **Admin:** Reset password button per teacher; shows temp password in alert.
