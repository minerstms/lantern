# Canonical Navigation Contract

Authoritative. TMS `docs/NAVIGATION_CONTRACT.md` must remain identical.

Nav visibility is not the security boundary. Server capability checks remain authoritative.

Teacher Tools is the canonical staff utility workspace.

Behavior Logger is the canonical quick behavior-entry application.

MTSS Reports, Behavior Admin, and System Tools are capability-specific privileged destinations.

There is no separate canonical Teacher Dashboard product.

## Labels (exact)

NAVIGATION: Lantern, My Locker, Create, Photo Library, Games, Missions

STAFF: Teacher Tools, Behavior Logger

PRIVILEGED: MTSS Reports, Behavior Admin, System Tools

Do not use Photography, Photo Bank, Media Library, Reports, Behavior Reports, Behavior Administration, System, System Administration, or Locker Options as canonical nav labels.

## Destinations

| Label | Destination |
|---|---|
| Lantern | `/explore.html` |
| My Locker | `/locker.html` |
| Create | `/contribute.html` |
| Photo Library | `https://miners-yearbook.pages.dev/` (no tokens, no auto-authorize) |
| Games | `/games.html` |
| Missions | `/missions.html` (badge/count is presentation only) |
| Teacher Tools | Lantern `/teacher.html` or `/teacher` |
| Behavior Logger | TMS `index.html` / device authorize |
| MTSS Reports | TMS `admin.html#reports` |
| Behavior Admin | TMS `admin.html#behavior` |
| System Tools | Lantern `/admin#system` |

TMS `/teacher.html` is a compatibility redirect to Teacher Tools. It is not a canonical navigation destination.

Teacher Tools may link to the Media Library staff dashboard at `https://miners-yearbook.pages.dev/staff.html`. That link is navigation only. It does not copy Media Library students, device requests, approvals, or sessions into Lantern, and it does not put tokens or student identifiers in the URL.

## Capability rules

Capabilities are independent. Holding one never implies another.

- Student: NAVIGATION only
- TEACHER: NAVIGATION + STAFF
- REPORT_MAKER adds MTSS Reports only. Does not add Behavior Admin or System Tools
- BEHAVIOR_ADMIN adds Behavior Admin only. Does not add MTSS Reports or System Tools
- SYSTEM_ADMIN adds System Tools only. Does not add MTSS Reports or Behavior Admin
- Privileged items use TMS capabilities only. Lantern `role === admin` does not grant MTSS Reports, Behavior Admin, or System Tools
- Combined capabilities are additive. A future account with BEHAVIOR_ADMIN and no REPORT_MAKER must see Behavior Administration and must not see Reports

## Persona matrix

STUDENT: Lantern, My Locker, Create, Photo Library, Games, Missions

ORDINARY TEACHER (TEACHER): student items + Teacher Tools, Behavior Logger

RICK / rick.radle (TEACHER + REPORT_MAKER): ordinary teacher + MTSS Reports

DEANA PACHELLI (TEACHER + REPORT_MAKER + BEHAVIOR_ADMIN): ordinary teacher + MTSS Reports + Behavior Admin

WEB ADMIN (TEACHER + REPORT_MAKER + BEHAVIOR_ADMIN + SYSTEM_ADMIN): ordinary teacher + MTSS Reports + Behavior Admin + System Tools

BEHAVIOR_ADMIN without REPORT_MAKER: ordinary teacher + Behavior Admin. No MTSS Reports. No System Tools.

No persona receives Teacher Dashboard.

## Badges

Badges represent actionable unresolved work or genuinely new/unseen items.

Badges do not represent total inventory, total available features, or generic counts.
