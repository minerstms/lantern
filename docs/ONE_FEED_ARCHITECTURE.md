# Lantern ONE FEED Architecture

## The law

Lantern public content follows six locked rules:

1. **ONE FEED** — one normalized approved collection (`GET /api/feed`)
2. **ONE CONTAINER** — Explore renders into `#feedGrid` only
3. **ONE CARD** — `LANTERN_FEED_CARD.buildCard()` is the only public card shell
4. **MANY FILTERS** — category chips filter the same in-memory collection
5. **ZERO RAILS** — no horizontal scroller sections on Explore
6. **ONE PIPELINE** — student creates → submits → teacher approves → same API serves public feed

## Normalized item contract

Every public item returned by `/api/feed` includes:

| Field | Purpose |
|-------|---------|
| `id` | Stable feed id (`feed-*`, `news:*`, `mission:*`) |
| `type` / `typeLabel` | Category tag for filters and card badge |
| `title`, `body`, `summary` | Text content |
| `authorId`, `authorDisplayName`, `authorRole` | Source identity |
| `createdAt`, `submittedAt`, `approvedAt`, `approvedBy` | Lifecycle timestamps |
| `status` | Always `approved` on public feed |
| `thumbnailUrl`, `imageUrl` | Media when available |
| `reactionCounts`, `myReactions` | Positive icon reactions |
| `teacherComments` | Teacher-only public commentary |
| `slideshowEligible`, `featuredEligible`, `homeEligible` | Presentation flags |
| `contentSlot` | Type-specific inset (mission, shout-out, score, etc.) |

## Card shell slots

The shared card (`lantern-feed-card.js`) always renders:

- Type tag (top)
- Media (optional)
- Title
- **Content slot** (type-specific, optional)
- Summary
- Author + approved date
- Reaction bar (6 positive icons)
- Teacher comment list
- Open/detail action

Type-specific data goes in `contentSlot` — never a separate card component.

## Status workflow

| Status | Visibility | Who can edit |
|--------|------------|--------------|
| `draft` | Owner + staff | Student owner |
| `submitted` | Owner + staff (review queue) | Locked until returned |
| `approved` | Public feed | Staff metadata only |
| `rejected` | Owner (with private feedback) | Owner can revise → draft/submit |
| `hidden` | Staff audit only | Staff |

Status transitions are validated in the Worker — the browser cannot set `approved` directly.

## Reactions

- Types: clap, star, celebrate, heart, fire, lightbulb
- `POST /api/reactions/toggle` with `item_type: feed`
- One toggle per user per reaction type per item
- Only approved public items accept reactions

## Comments

- `POST /api/feed/comments` — teachers/admins only (session-checked)
- Students read teacher comments on approved items
- Private rejection feedback stays on the item record, never in public comments

## Data sources (adapters)

| Source table | Feed type | Adapter id prefix |
|--------------|-----------|-------------------|
| `lantern_feed_items` | all supported create types | `feed-*` |
| `lantern_news_submissions` | news, article, photo, video | `news:*` |
| `lantern_mission_submissions` | mission | `mission:*` |

Future adapters (not yet wired): game scores, leaderboards, achievements, polls.

## Pages

| Page | Role |
|------|------|
| `home.html` | Entry points + featured/latest from same feed |
| `explore.html` | One-container filtered feed |
| `create.html` | Student draft + submit |
| `my-submissions.html` | Student status + private feedback |
| `feed-review.html` | Teacher moderation queue |
| `display.html` | Slideshow over `/api/feed/slideshow` |
| `games.html` | Live trivia from `/api/trivia/live` |

## Adding a new content type

1. Add type to `FEED_TYPES` in `worker/feed-handlers.js`
2. Add filter chip in `lantern-feed-api.js`
3. Optionally add `contentSlot` rendering in `lantern-feed-card.js`
4. Do **not** add a new container, rail, or card component
