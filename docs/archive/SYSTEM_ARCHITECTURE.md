# TMS Lantern — System Architecture

## Platform Architecture

- **Frontend:** Static pages (HTML/JS/CSS).
- **Backend:** Cloudflare Worker API.
- **Database:** Cloudflare D1.
- **Media storage:** Cloudflare R2.
- **LocalStorage:** Drafts and UI state only; not durable application data.

---

## Lantern Architecture (Current Locked Shape)

STUDENT / TEACHER BROWSER
│
├─ Frontend Pages (Cloudflare Pages)
│  ├─ /                → Profile / home
│  ├─ /news            → Student News
│  ├─ /teacher         → Teacher approvals
│  ├─ /store           → Store / nuggets
│  └─ /games           → Games
│
│  Frontend JS uses:
│  window.LANTERN_AVATAR_API = https://lantern-api.mrradle.workers.dev
│
▼
LANTERN WORKER (lantern-api)
│
├─ CORS
│  └─ Allows only Lantern Pages + localhost dev
│
├─ Avatar routes
│  ├─ POST /api/avatar/upload
│  ├─ GET  /api/avatar/status
│  ├─ GET  /api/avatar/image
│  ├─ POST /api/avatar/approve
│  └─ POST /api/avatar/reject
│
├─ Economy routes
│  ├─ GET  /api/economy/balance
│  └─ POST /api/economy/transact
│
├─ News routes
│  ├─ POST /api/news/upload-image
│  ├─ POST /api/news/create
│  ├─ POST /api/news/resubmit
│  ├─ GET  /api/news/approved
│  ├─ GET  /api/news/mine
│  └─ GET  /api/news/image
│
├─ Shared approvals routes
│  ├─ GET  /api/approvals/pending
│  ├─ GET  /api/approvals/history
│  ├─ POST /api/approvals/take
│  ├─ POST /api/approvals/approve
│  ├─ POST /api/approvals/return
│  └─ POST /api/approvals/reject
│
▼
LANTERN D1 DATABASE (lantern-db)
│
├─ Avatar tables
│  ├─ lantern_avatar_submissions
│  └─ lantern_avatar_profiles
│
├─ Economy tables
│  ├─ lantern_wallets
│  └─ lantern_transactions
│
├─ News tables
│  └─ lantern_news_submissions
│
└─ Shared moderation table
   └─ lantern_approvals
│
▼
R2 STORAGE
│
├─ lantern-avatars
│  └─ approved/pending avatar image files
│
└─ lantern-media
   └─ news image uploads


## Core Moderation Pattern

Student submits media
→ Worker stores file in R2
→ Worker stores metadata in D1
→ Worker creates lantern_approvals row
→ Teacher sees item in approvals queue
→ Teacher approves or rejects
→ Approved content appears on final surface


## Current Proven Pipelines

1. Avatar upload

Student
→ /api/avatar/upload
→ lantern_avatar_submissions
→ lantern_approvals (item_type = avatar)
→ teacher approval
→ lantern_avatar_profiles
→ profile display

2. News image upload

Student
→ /api/news/upload-image
→ lantern-media
→ /api/news/create
→ lantern_news_submissions
→ lantern_approvals (item_type = news)
→ teacher approval
→ /api/news/approved
→ News page render


## Locked Boundaries

MTSS / behavior / private student case data
≠
Lantern public or semi-public recognition/media system

MTSS Worker: separate
Lantern Worker: separate
MTSS DB: separate
Lantern DB: separate

All future student media types (news images, gallery posts, creations, etc.) must pass through the lantern_approvals moderation pipeline before appearing anywhere in the Lantern UI.


## DEAD SIMPLE Rule for Future Work

Do:
- reuse this exact pipeline pattern for future image features
- keep teacher approval required
- keep feature-specific endpoints if needed

Do not:
- build one giant generalized media platform yet
- add video until a real feature requires it
- mix Lantern with MTSS systems


## Recommended Next Build Order

1. Lock current Lantern baseline
2. Avatar approval polish
3. Help Mode / onboarding polish
4. Seed richer demo world data
5. Teacher recognition panel
6. Identity propagation polish
7. Video only later if truly needed


## One-Page Architecture Diagram (Reference)

```
Student Browser
    │
    │  window.LANTERN_AVATAR_API → Worker base URL
    ▼
Cloudflare Pages (lantern-app)
    │  Static HTML/JS/CSS
    │  Profile, News, Teacher, Store, Games
    │
    │  fetch(API + /api/...)
    ▼
Lantern Worker (lantern-api)
    │  All application logic
    │  Avatar, Economy, News, Approvals routes
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
R2 (media)         D1 (lantern-db)   Response to client
lantern-avatars    lantern_avatar_*
lantern-media      lantern_news_*
                   lantern_wallets
                   lantern_transactions
                   lantern_approvals
    │
    │  Teacher uses same Worker
    │  GET /api/approvals/pending
    ▼
Teacher moderation (teacher page)
    │  Approve / Reject / Return
    │  POST /api/approvals/approve etc.
    ▼
Worker updates D1 (status, reviewed_at)
    │
    │  Approved content only
    ▼
Approved content feeds
    │  GET /api/news/approved
    │  GET /api/avatar/status (active_image from profiles)
    ▼
Student/Teacher UI shows approved content only
```


## Why This Pipeline Works for Future Development

- **Single moderation surface:** All student media flows through `lantern_approvals`. Teachers use one queue; no new queues per feature.
- **Same pattern every time:** Store file in R2 → store metadata in a feature table → insert row in `lantern_approvals` → teacher approves → update feature table and/or profile → public API returns only approved rows.
- **No new infrastructure:** Reuse existing Worker, D1, R2, and approval routes. New features add routes and tables, not new systems.
- **Clear visibility rule:** If it is not approved (and, where relevant, reflected in the feature table), it does not appear on any public or feed UI. The Worker enforces this; the frontend only calls APIs that return approved data or the user’s own submissions.


## Checklist for Building a Future Media Pipeline

Before adding a new student media type (e.g. gallery, creations, another image type), answer:

1. **Where is the file stored?** → R2 bucket (existing or new bucket; prefer existing if it fits).
2. **What table stores metadata?** → New or existing D1 table (e.g. `lantern_news_submissions`). Must include a status field (e.g. pending / approved / rejected).
3. **What approval row is created?** → On submit, INSERT into `lantern_approvals` with `item_type` and `item_id` pointing at the new submission.
4. **What teacher UI reviews it?** → Same shared approvals queue (`/api/approvals/pending`). Ensure `item_type` is handled in the Worker when building the pending list (and in approve/return/reject handlers).
5. **What condition makes it visible?** → Only when status is approved (and, if applicable, copied into a profile or “live” table). The API that feeds the public UI must filter by `status = 'approved'` (or equivalent). No listing of unapproved items on public or feed surfaces.

If any answer is “we’ll show it before approval” or “we won’t use lantern_approvals,” the design violates the locked pipeline and must be revised.


---

## Frontend

- **apps/lantern-app** — Main Lantern platform (student and teacher UI). Explore page: responsive header (centered search, bell, avatar, Help demoted on smaller widths), single-row scrollable filter chips, polished top-of-page spacing. Explore UI updates were frontend-only; no backend changes.

---

## Backend

- **lantern-worker/** — Lantern API (Worker name: lantern-api). Serves `/api/avatar`, `/api/economy`, `/api/news`, `/api/approvals`. Lantern frontend calls this Worker only; no MTSS routes.

---

## Database

- **Cloudflare D1** — Moderation state, submissions, approvals, identity, economy.
- Migrations live in `migrations/`.

### Demo seed (Lantern only)

To populate the app with safe, non-sensitive demo data for demos and testing (no MTSS, no FERPA risk):

1. From repo root:  
   `npx wrangler d1 execute lantern-db --remote --file=migrations/018_lantern_seed_demo.sql`
2. This inserts demo wallets (e.g. Alex Adventure, Sam Star), sample transactions, and approved news into **lantern-db** only. Teacher approval remains the normal rule for real submissions.
3. To clear and re-seed: run `migrations/019_lantern_clear_demo.sql` then run step 1 again.

---

## Media Storage

- **Cloudflare R2** — File storage (e.g. news images). One image per news article.

---

## Apps

- **lantern-app** — Main platform (news, explore, profile, store, games, display, teacher).
- **helper-app** — FERPA-safe helper utilities.
- **sandbox-app** — Experimentation and prototypes.

---

## Identity System

- Avatars and profiles.
- Used across the platform for display and attribution.

---

## Economy System

- **lantern_wallets** (or equivalent) — Balances.
- **lantern_transactions** (or equivalent) — Append-only ledger.
- Do not refactor when adding news or approvals.

---

## Moderation System

- Teacher approval required for student content.
- Shared approvals table for moderation work; content lives in feature tables (e.g. news submissions).
- Queue visibility: assigned, suggested, unassigned within scope — never global dump of all student content.

---

## Lantern Media Pipeline Rule (LOCKED)

Lantern media features follow the DEAD SIMPLE rule and FERPA safety rule.

Architecture priorities:

1. Student privacy safety (FERPA)
2. Teacher moderation control
3. Simplicity of architecture
4. Avoiding overbuilt systems

### Reference Pipeline

The Lantern News image upload system is the canonical media pipeline.

Pipeline:

Student Upload  
→ Lantern Worker  
→ R2 storage (lantern-media)  
→ D1 metadata record  
→ Teacher approval queue  
→ Teacher approval  
→ Public render on Lantern News

All future image features should reuse this pattern.

### Avatar Upload

Avatar uploads remain a separate pipeline because avatars are identity assets.

### Future Image Uploads

For new image features:

- reuse the News image pipeline
- keep teacher moderation
- store files in R2
- store metadata in D1
- avoid building a generalized media platform

### Video Uploads

Video uploads are intentionally not implemented yet.

Reasons:

- large files
- storage cost
- moderation complexity
- playback infrastructure
- higher FERPA risk

Video support will only be added when a specific feature requires it.

### Moderation Rule

All student media must follow:

Student submit  
→ Teacher review  
→ Teacher approve or reject  
→ Only approved content becomes visible

There is no direct student-to-public publishing.

### Architectural Principle

Lantern prefers multiple simple pipelines rather than a single complex media system.

---

## Development Order

1. Database migration
2. Backend worker route
3. API wrapper (in lantern-app JS)
4. Student UI page
5. Teacher moderation UI

Do not skip layers or change multiple layers in one pass unless the task explicitly requests it.
