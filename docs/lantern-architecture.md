# Lantern System Architecture

## Core Philosophy

- **Dead simple** — one worker API, one D1 database, minimal moving parts.
- **No duplicate tables** for “published” vs “draft” mission work — the same row is updated in place.
- **No publish pipeline** — visibility is not a separate publishing step.
- **Visibility is controlled by queries only** — different endpoints return different slices of the same stored rows.

## System Model

**Data is:**

- Written once (for example a mission submission is one row in `lantern_mission_submissions`).
- Filtered by query (which API you call and which `WHERE` clauses apply).
- Rendered per surface (Explore, Profile, Teacher tools each call the endpoints they need).

**This is not:**

- A CMS with a separate “go live” channel.
- A multi-step publish workflow for student mission work.
- A multi-sync system that copies rows between tables for visibility.

## Major Systems

- **Class Access** — Gate for Explore (and similar pages): the UI stays hidden until access is resolved; listeners run loaders only when access is valid. See `docs/class-access.md`.
- **Missions** — Students submit work; teachers update the same row (status, review fields). See `docs/missions.md`.
- **Explore** — Renders multiple rails (announcements, mission spotlight, merged “latest” feed, news, etc.) by combining API responses and client-side rendering.
- **Profile** — Loads submissions for a character via the character-scoped missions API.

## Data Flow Example

1. Student submits a mission → stored in **`lantern_mission_submissions`** (for example `status = 'pending'`).
2. Teacher approves → **same row** updated: `status = 'accepted'`, plus `reviewed_by`, `reviewed_at` (via Worker approve route).
3. Explore and Profile use **different GET endpoints** that query that table with different rules (approved-only for public explore feed vs all statuses for a character’s profile list).
4. UI renders cards from JSON — nothing extra is “published” into another store.

## Key Rule

**If something is not showing, assume a query, filter, or UI rail first — not “missing data” in a second system.**  
Confirm class access, endpoint, section (which rail), and row status before changing schema or adding tables.
