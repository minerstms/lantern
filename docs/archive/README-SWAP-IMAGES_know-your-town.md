# Know Your Town — image swap-in (Trinidad, Colorado)

## Files to replace

Put your real photos here, **same names** (overwrite):

| File | Used by question id |
|------|-------------------|
| `trinidad-co-01.jpg` | `trinidad_co_01` |
| `trinidad-co-02.jpg` | `trinidad_co_02` |
| `trinidad-co-03.jpg` | `trinidad_co_03` |
| `trinidad-co-04.jpg` | `trinidad_co_04` |
| `trinidad-co-05.jpg` | `trinidad_co_05` |

JPEG or PNG is fine; if you use PNG, rename to `.png` and update `image_url` in each question inside `js/lantern-school-survival.js` (search for `trinidad-co-0`).

## After you add photos

Edit the matching objects in **`apps/lantern-app/js/lantern-school-survival.js`** (array `TRINIDAD_CO_PILOT_QUESTIONS`):

- `image_alt` — short description of what’s in *your* photo (for screen readers).
- `prompt`, `choices`, `correctIndex` — must match the photo.
- `explanation`, `wrongWhy`, `tip` — teach-back text for students.

Open the game: **Explore → Know Your Town** or `school-survival.html?pack=trinidad-co`.
