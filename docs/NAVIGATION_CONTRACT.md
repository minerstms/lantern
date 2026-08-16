# Canonical Navigation Contract

Authoritative. TMS `docs/NAVIGATION_CONTRACT.md` must remain identical.

Nav visibility is not the security boundary. Server capability checks remain authoritative.

Teacher Tools is the canonical staff utility workspace.

Behavior Logger is the canonical quick behavior-entry application.

Reports, Behavior Administration, and System are capability-specific privileged destinations.

There is no separate canonical Teacher Dashboard product.

## Labels (exact)

NAVIGATION: Lantern, Locker, Create, Media Library, Play, Missions

STAFF: Teacher Tools, Behavior Logger

PRIVILEGED: Reports, Behavior Administration, System

Do not use Teacher, Admin, Behavior Admin, Dashboard, or System Admin as canonical nav labels.

## Destinations

| Label | Destination |
|---|---|
| Lantern | `/explore.html` |
| Locker | `/locker.html` |
| Create | `/contribute.html` |
| Media Library | `https://miners-yearbook.pages.dev/` (no tokens, no auto-authorize) |
| Play | `/games.html` |
| Missions | `/missions.html` (badge/count is presentation only) |
| Teacher Tools | Lantern `/teacher.html` or `/teacher` |
| Behavior Logger | TMS `index.html` / device authorize |
| Reports | TMS `admin.html#reports` |
| Behavior Administration | TMS `admin.html#behavior` |
| System | Lantern `/admin#system` |

TMS `/teacher.html` is a compatibility redirect to Teacher Tools. It is not a canonical navigation destination.

## Capability rules

- Student: NAVIGATION only
- TEACHER: NAVIGATION + STAFF
- REPORT_MAKER adds Reports. Does not add Behavior Administration or System
- BEHAVIOR_ADMIN adds Behavior Administration. Also sees Reports. Does not add System
- SYSTEM_ADMIN adds System. Does not imply REPORT_MAKER or BEHAVIOR_ADMIN
- Privileged items use TMS capabilities only. Lantern `role === admin` does not grant Reports, Behavior Administration, or System

## Persona matrix

STUDENT: Lantern, Locker, Create, Media Library, Play, Missions

ORDINARY TEACHER (TEACHER): student items + Teacher Tools, Behavior Logger

RICK / rick.radle (TEACHER + REPORT_MAKER): ordinary teacher + Reports

DEANA PACHELLI (TEACHER + REPORT_MAKER + BEHAVIOR_ADMIN): Rick items + Behavior Administration

WEB ADMIN (TEACHER + REPORT_MAKER + BEHAVIOR_ADMIN + SYSTEM_ADMIN): Deana items + System

No persona receives Teacher Dashboard.
