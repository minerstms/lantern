# Follow-up (optional): Hide report control on Locker Featured Post

**Type:** UX / `LanternCards` surface scoping  
**Priority:** Optional polish  
**Related:** **Locker Featured Post → LanternCards** (merged 2026-03-19). Does **not** reopen the main slice; implement only as a **small, scoped** follow-up if desired.

## Summary

The Locker **Featured post** block is rendered with **`LanternCards.createFeedPostCard`**, which attaches the standard **report** control (`.exploreCardReportBtn`) when applicable.

On **Explore** and other **reader-facing** surfaces, report is appropriate. On **Locker Overview**, Featured Post is a **personal showcase** of the student’s own post; the report affordance can feel **misplaced** (“report my own pinned post”).

## Recommendation

- **Option A (preferred if doing UX polish):** Suppress the report control **only** for cards inside **`#featuredPostEl`** / class **`lockerFeaturedPostExplore`** (or equivalent single hook), without changing global `LanternCards` behavior for other contexts.
- **Option B:** Leave as-is; functionally acceptable (report may still map to `feed_post` + id).

## Implementation constraints (when implemented)

1. **Scoped only** to the Locker featured-post surface — do **not** change report behavior for Explore, rails, My Creations, news, etc.
2. Prefer a **narrow** mechanism, e.g.:
   - `createFeedPostCard` option `suppressReport: true` used **only** from `renderFeaturedPost`, or
   - CSS `display: none` on `.featuredPostCard .exploreCardReportBtn` **only** (if product accepts non-semantic hide; weaker for a11y than not emitting the button).
3. **Do not** weaken reporting for content that is **not** the Locker featured self-showcase.

## QA when done

- Featured post still renders; **no** report button (or inert/hidden per chosen approach).
- Other Locker cards (if any production `LanternCards` elsewhere on the page) **unchanged**.
- Explore / other pages: report still present where expected.
