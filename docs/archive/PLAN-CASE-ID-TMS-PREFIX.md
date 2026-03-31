# Plan: Case ID prefix TN → TMS

## Goal
- Use **TMS-YYYY-NNNNNN** (e.g. TMS-2026-000034) instead of TN-YYYY-NNNNNN so case numbers are more meaningful at a glance.
- Update **existing** case IDs in the database from TN-* to TMS-*.
- Show **Case: TMS-2026-000034** on the Case card (admin case detail modal).

## Is it problematic?
- **Not problematic** for the app itself. Case IDs are stored in `cases.case_id` and referenced in `case_audit.case_id`. We only change the **prefix** (TN → TMS); the year and sequence stay the same, so we can safely rename in place.
- **One caveat:** Any **existing links** that include the old case ID (e.g. email action URLs with `case_id=TN-2026-000034`) will stop working after the rename. New links will use TMS-*. If you have important old emails with action links, consider leaving existing IDs as TN-* and only using TMS- for **new** cases; otherwise, renaming all is fine and simpler.

## Changes
1. **Worker** – `generateCaseId()`: return `TMS-${year}-${seq}` instead of `TN-...`.
2. **Migration** – New file to update existing rows:
   - `UPDATE cases SET case_id = 'TMS-' || substr(case_id, 4) WHERE case_id LIKE 'TN-%';`
   - `UPDATE case_audit SET case_id = 'TMS-' || substr(case_id, 4) WHERE case_id LIKE 'TN-%';`
3. **Admin** – Case detail title: use **"Case: " + case_id** (e.g. "Case: TMS-2026-000034").
4. **Schema comment** – Document format as TMS-YYYY-NNNNNN.

## Summary
| Item | Action |
|------|--------|
| New cases | Generated as TMS-YYYY-NNNNNN |
| Existing cases | Migration renames TN-* → TMS-* in `cases` and `case_audit` |
| Case card | Displays "Case: TMS-2026-000034" |
