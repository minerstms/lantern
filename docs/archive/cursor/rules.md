\# MTSS Behavior Log — Cursor Rules (Careful but Helpful)

**Live code:** worker/index.js, schema.sql, migrations/, public/* (index.html, teacher.html, store.html, admin.html, api.js). References to Code.gs or Google Sheets in these rules refer to legacy docs; the repo is Cloudflare-based.

These rules are STRICT unless explicitly overridden by the user.



\## 1) Architecture is locked

\- Do NOT change overall architecture, file roles, routing, or data model.

\- Do NOT rename files, pages, functions, or tabs.

\- Do NOT reorganize or “clean up” by moving code across files.

\- Be conservative: modify only what is requested.



\## 2) Google Sheets safety

\- NEVER auto-create a Google Sheet, tabs, or headers.

\- If a required tab/header is missing, throw a clear error message instead of creating anything.

\- Do not rewrite history rows or “normalize” existing sheet data unless explicitly told.



\## 3) Phone-first UI requirements

\- Single-column layout only (no two-column grids).

\- All text must remain between 22px and 36px (no smaller than 22; no larger than 36).

\- Ensure the on-screen keyboard does NOT cover critical actions (especially Logger bottom buttons).

\- Writing field should be comfortably tall on phones.

\- Dropdown menus must always be readable: never light-on-light or dark-on-dark.



\## 4) Navigation rules (top row — 3 buttons, matches log row)

\- Top row has exactly **3** buttons: **left** (blue) | **center** (clear, identity) | **right** (blue). Same size and shape as the log row (Log Positive)(Clear Writing)(Log Concern): same height (var(--btnH)), same border-radius (18px), grid 1fr 260px 1fr so left and right equal width, center fixed width.

\- **Colors:** Left = blue (Columbia blue), Center = clear/trans (like Clear Writing), Right = blue. No link to current page.

\- **Logger page:** (School Store (N)) | (Teacher Name - Role) | Teacher Dashboard. N = pending count.

\- **Store page:** Teacher Dashboard | (Teacher Name - Role) | Behavior Logger.

\- **Teacher Dashboard page:** (School Store (N)) | (Teacher Name - Role) | Behavior Logger. N = pending count.

\- Center button is identity only (not a link); left and right are nav links. Font size 22–36.



\## 5) Behavior when editing

\- Prefer minimal, targeted changes over broad refactors.

\- Small, safe refactors INSIDE a function are allowed only when they support the requested change.

\- Do not change working logic “because it looks better.”

\- If uncertain about a behavior change, stop and ask (or propose options).



\## 6) Output expectations (important)

\- When making edits inside Cursor, apply changes directly to the file.

\- When the user asks for code to copy/paste into Apps Script, return FULL FILES.

\- Do not output partial files unless explicitly requested.

\- Do not delete the persistent “Build confirmation checklist / shipped-fixes verification list + vision/plan” comment block in Code.gs.

\- Preserve build headers/version markers at the top of files.

