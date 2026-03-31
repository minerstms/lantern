# Phase — Content reseed & beta stress (TONIGHT)

**Status:** Locked for tonight’s run · Human verification **tomorrow AM**.  
**Rules:** FERPA-safe · DEAD SIMPLE · **No** new architecture · **No** MTSS merge · **No** broad redesign · Use **current** `LANTERN_DATA` / **localStorage** seed path (`seedDemoWorld` in **`apps/lantern-app/js/lantern-data.js`**).

---

## Goal

Get Lantern into a **content-loaded**, **stress-testable** beta state: enough **posts**, **missions**, and **store** rows so **scrollers overflow**, **patterns repeat**, and **weak surfaces** show up — **without** breaking live logic.

---

## Scope (tonight)

| Area | What we do |
|------|------------|
| **Data** | Expand **`seedDemoWorld()`** in **`lantern-data.js`** — same pipeline as **“Seed sample content”** on Locker testing panel |
| **Posts** | **60** demo posts (`dp1`–`dp60`) |
| **Missions** | **20** teacher missions (**`tm1`–`tm20`**, one inactive) in **`LANTERN_TEACHER_MISSIONS`** |
| **Store** | **20** nugget **catalog** rows in **`DEFAULT_CATALOG`** / **`LANTERN_CATALOG`** + **~40+** cosmetics in **`DEFAULT_COSMETICS`** (unchanged) |
| **Docs** | This file + optional **`CHANGELOG_LOCKED.md`** line |

---

## Exclusions

- **No** Worker / D1 bulk scripts tonight (unless you already run them separately).
- **No** Studio / Contribute layout work.
- **No** rail/card system changes.
- **No** caps, attrition, or moderation policy — **pressure visible only**.

---

## Content rules (FERPA + tone)

- **First names / aliases only** — use existing fictional character names from **`DEFAULT_CHARACTERS`**.
- **No** last names, grades, IEPs, behavior labels, or real identifiers.
- **Short**, student-facing lines — **no** corporate essay tone.
- **Fictional** demo only.

---

## Phase C0 — Lock the plan

- [x] This doc exists.
- [x] **`docs/LANTERN_SYSTEM_CONTEXT.md`** / checklists unchanged except pointer if added.
- [ ] You **committed** this doc before or with the seed PR.

---

## Phase C1 — Generate content (implementation)

**Path:** **`window.LANTERN_DATA.seedDemoWorld()`** writes **`LANTERN_POSTS`**, **`LANTERN_TEACHER_MISSIONS`**, **`LANTERN_CATALOG`**, news, activity, etc.

**Targets (minimum):**

| Kind | Target |
|------|--------|
| Posts | **40–60** (tonight: **~60**) |
| Teacher missions | **15–20** (tonight: **20**) |
| Catalog (nugget store rows) | **20–30** (tonight: **~20** catalog + cosmetics unchanged) |

---

## Phase C2 — Wire (no new architecture)

1. User opens app with **`lantern-data.js`** loaded.
2. **First visit / empty posts:** **`ensureStartupMode()`** may auto-call **`seedDemoWorld()`** if posts **< 5**.
3. **Manual:** Locker → Testing → **“Seed sample content”** — **always** runs full **`seedDemoWorld()`** (reload after).

**Do not** add a second parallel seed pipeline tonight.

### Local vs Worker (important)

| Surface | Uses seeded **`localStorage`** when… |
|--------|--------------------------------------|
| **Explore / Latest Posts** | Always via **`lantern-api.js`** → **`getExploreFeed()`** → approved posts (cap raised to **60** to match seed). |
| **Missions list** | **`missions.html`** uses **`fetch(…/api/missions/active)`** when **`window.LANTERN_AVATAR_API`** or **`LANTERN_ECONOMY_API`** is set — then missions come from **Worker/D1**, **not** from **`LANTERN_TEACHER_MISSIONS`**. For tonight’s **20 local missions**, test with **no** API base URL on the page (falls back to **`createRun`…`getActiveTeacherMissionsForCharacter`** → localStorage). |
| **Locker Store (nugget catalog)** | **`LANTERN_CATALOG`** after seed — local. |

---

## Phase C3 — Stress (what should “break surface”)

After seeding, you should **see**:

- **Explore** — Latest Posts / rails **scroll** with **many** cards.
- **Missions** — long list of mission rows (scroll).
- **Locker Store** — catalog + cosmetics **feel full**; **Featured** rail can overflow.
- **Repeated** titles/cards (expected — shows need for future variety rules **later**).

---

## Tonight checklist (copy/paste)

- [ ] Pull latest, branch if needed.
- [ ] Confirm **`lantern-data.js`** has expanded **`seedDemoWorld`** (this PR).
- [ ] Open **`locker.html`** → adopt a test student → **Testing** → **Seed sample content** → wait for reload.
- [ ] Open **`explore.html`** — scroll **Latest Posts** + one other rail.
- [ ] Open **`missions.html`** — scroll full mission list.
- [ ] Open **Locker → Store** — scroll **Featured** + cosmetics host.
- [ ] **Console:** note any **red** errors (ignore known follow-up noise if documented).
- [ ] **Commit + push** tonight.

---

## Tomorrow AM — Human check checklist

**Open each URL and answer in one line: scroll OK? hierarchy OK? anything broken?**

| Surface | What to look for |
|---------|------------------|
| **`explore.html`** | Rails **scroll horizontally**; **Latest Posts** has **many** items; no blank rail **unless** API gate blocks (class access). |
| **Locker → Overview** | Profile loads; **My Creations** rail scrolls if populated; **no** layout explosion. |
| **Locker → Items** | Cosmetics **rows** scroll; **equip** still works on one item (smoke). |
| **Locker → Store** | **Featured** rail overflows; **wallet** row readable; **no** overlapping text. |
| **`missions.html`** | **Many** mission rows; **scroll** vertical list; open **one** mission card / submit UI if time. |
| **Console** | **No** new **uncaught** errors tied to seed (screenshot if any). |

**Truth checks**

- **Scroll truth:** Do horizontal rails actually need thumb affordance? Any **stuck** scroll?
- **Hierarchy truth:** Do titles + rewards still scan at **22–36px** norms?
- **Store desirability:** Does the store **feel** worth browsing (enough variety)?
- **Repetition:** Same template text repeating? (Expected — note for **later** content variety, **not** tonight.)
- **Broken states:** Missing images (picsum) acceptable; **white screen** / **infinite spinner** = **file issue**.

---

## Merge / push recommendation

**Merge** when: code review is “data-only in **`lantern-data.js`** + doc”; smoke **Seed sample content** once locally or on staging.

**Push** tonight so AM review is on a **single** commit/branch.

---

*PHASE-CONTENT-RESEED-BETA — v1.0 — tonight mode*
