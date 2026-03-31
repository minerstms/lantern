# Lantern — Profile evolution (next phase)

This is a **planning note** for the next profile layout direction. It is grounded in the current repo and is not a specification for immediate implementation.

## Current state

- The **golden student profile** is the canonical template: `#profileView` in `apps/lantern-app/index.html`, driven by a normalized `studentProfileVM` (see `LANTERN_CURRENT_PIPELINES.md` and the inline comments in index.html).
- Students should differ by **data**, not by code path. One template, one view model shape; identity and content come from data.

## Future profile design (planning only)

Future profile design work **may** include, when prioritized and scoped:

- **Spotlight badge overlays** — refinements to how the teacher spotlight badge appears on the profile.
- **Creator reaction charts** — visual summaries of reactions received on student creations (when reaction feature flags are enabled).
- **Recognition cards** — layout or presentation improvements for recognition entries.
- **Nugget progress bar** — optional progress or goal display for nuggets.
- **Praise button customization UI** — extending the existing “My Praise Buttons” / praise preference UI.
- **Student theme system** — optional profile themes (already partially present; further evolution as data-only).

**This note is planning only.** Do **not** implement all of these in a single pass. Do **not** overbuild. Each item should be implemented only when explicitly scoped, and must keep the **DEAD SIMPLE** rule intact.

## Rules for future profile work

1. **DEAD SIMPLE** — All future profile work must keep the design and code paths simple. One canonical profile template; one view model; no duplicate or divergent profile flows.
2. **Golden profile is canonical** — The golden student profile in `#profileView` is the single source of truth. New profile features should plug into this template and view model, not replace or fork it.
3. **Students differ by data, not by code path** — No separate code paths or templates per student or per “type” of student. Differences are data (e.g. theme, nuggets, recognitions, praise preferences).
4. **FERPA boundaries remain unchanged** — No expansion of what student data is shared or with whom. Approval pipelines and moderation logic stay as-is.
5. **Reaction feature flags remain optional** — `ENABLE_EARLY_ENCOURAGER_REWARD`, `ENABLE_REACTION_BREAKDOWN`, `ENABLE_INCLUSION_BOOST`, and any other reaction flags stay optional. Do not force-enable them.
6. **Student text comments are not being introduced** — Teachers write text recognition; students use icon reactions only. This note does not add student-authored text comments to the profile or elsewhere.

## References

- `LANTERN_CURRENT_PIPELINES.md` — current data flows and FERPA boundaries.
- `apps/lantern-app/index.html` — golden profile block and `studentProfileVM` usage.
- Reaction/praise infrastructure (lantern_reactions, lantern_early_encourager_rewards, lantern_praise_preferences, `/api/reactions/feature-flags`) is already in place and must not be redesigned in a profile pass.
