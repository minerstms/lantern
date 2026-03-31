# Lantern News Submission + Approval Pipeline

## Status

**Working baseline — current live path.** This document describes the **Worker + D1 + R2** pipeline. It exists so new work does not confuse that path with **legacy localStorage** news helpers in `app/js/lantern-api.js`.

---

## Entry point

- **Student news submission** happens through **`app/contribute.html?type=post`** (Create Design Studio → post flow: title/body, optional image/video/link, **Submit for approval**).
- **`app/news.html`** is a **stub / redirect** surface (links to Explore, Contribute, Locker). It is **not** the primary submission form.

---

## Data / storage

| Layer | Role |
|--------|------|
| **D1** | **`lantern_news_submissions`** — one row per article; `status` includes `pending` / `approved` / `returned` / `rejected` as implemented in Worker. |
| **D1** | **`lantern_approvals`** — queue row with `item_type = 'news'`, `item_id` = submission id, `status` until reviewed. |
| **R2** | **`NEWS_BUCKET` or `AVATAR_BUCKET`**; keys under **`news/`** (images) and **`news/video/`** (video). |

---

## Worker endpoints (key routes)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/news/upload-image` | Base64 image → R2; returns `image_r2_key`, etc. |
| `POST` | `/api/news/upload-video` | Optional video → R2. |
| `POST` | `/api/news/create` | Insert submission; student → `pending` + `lantern_approvals`; teacher/staff/admin → can auto-approve per Worker logic. |
| `POST` | `/api/news/resubmit` | Resubmit **returned** articles. |
| `GET` | `/api/news/approved` | **Public approved list** for Explore and other consumers. |
| `GET` | `/api/news/mine` | Per-author list (`author_name` query) — Locker / “My articles” patterns. |
| `GET` | `/api/news/image` | Serve image by `key`. |
| `GET` | `/api/news/video` | Serve video by `key`. |

**Teacher moderation (Worker):**

- `GET /api/approvals/pending` (and related filters)
- `POST /api/approvals/approve`
- `POST /api/approvals/return`
- `POST /api/approvals/reject`
- `POST /api/approvals/take` (when used)

---

## Teacher moderation path

- The **unified approvals queue** (when `LANTERN_AVATAR_API` is set) is the **live** path: pending items are **`approval_item`** rows tied to Worker `lantern_approvals`.
- **Approve / return / reject** for those items must go through **`approveApprovalItem` / `returnApprovalItem` / `rejectApprovalItem`** (or equivalent) → **`POST /api/approvals/*`** — i.e. **`approval_item` + `approveApprovalItem`** is the **real Worker-backed** moderation route.

**Legacy (not canonical for live submissions):** In `lantern-api.js`, helpers such as **`approveNewsArticle`** that only touch **localStorage** news are **not** the canonical path for **Worker-backed** `news-…` submission IDs. Do not treat that path as the source of truth for production moderation.

---

## Explore consumption

- **Approved** student/staff news is loaded from **`GET /api/news/approved`** (via `LANTERN_API.getApprovedNews` when `lantern-api.js` and `LANTERN_AVATAR_API` are present).
- **`app/explore.html`**: If **`createRun()`** is unavailable but the API base is set, **`callGetApprovedNews`** may **fetch `/api/news/approved` directly** so the School News strip still populates (resilience fallback).

---

## Verified baseline

The following chain is the intended **live** behavior:

1. Student submit from **Contribute** (`?type=post`) works.
2. **Media upload** to R2 works when used.
3. **Pending** submission + **`lantern_approvals`** row is created for student authors.
4. **Teacher approval** via unified queue + **`/api/approvals/approve`** updates D1 correctly.
5. **Approved** content appears in **Explore** via **`/api/news/approved`**.

*(Re-verify after Worker or schema changes.)*

---

## Do not break

- Do **not** introduce a **second competing** news submission architecture; extend **Contribute + Worker** unless product explicitly replaces it.
- Do **not** use the **legacy localStorage** approval path for **Worker-backed** submissions.
- Do **not** break the chain: **Contribute → D1 + approvals → teacher `/api/approvals/*` → `/api/news/approved` → Explore.**

---

*See also: high-level system context in `docs/LANTERN_SYSTEM_CONTEXT.md`; auth/session rules in `docs/LANTERN_AUTH_BASELINE.md` (do not conflate with this news pipeline).*
