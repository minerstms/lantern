# Teacher catalog-item sales UI (archived)

- **Former surface:** Teacher page → Rewards Panel → “Manual catalog reward” with product card grid (Pencil, Eraser, Sticker Pack, etc.)
- **Former purpose:** Teachers picked a student, selected a catalog item and quantity, and deducted Nuggets like a store redemption.
- **Retired:** August 2026 — replaced by **Manual sale** (enter Nugget amount directly; no catalog item required).
- **Restoration source:** Git history before commit “Simplify Teacher sales to manual transactions” (`teacher.html`, `app/js/lantern-teacher-reward-redeem.js`).

## Preserved intentionally

- `DEFAULT_CATALOG` in `app/js/lantern-data.js` (localStorage catalog for student Store)
- Worker `/api/economy/*` and any catalog-related APIs
- D1 catalog/wallet/transaction tables and historical ledger rows

The live Teacher workflow no longer renders the catalog grid. Catalog data and APIs remain for Locker → Store and possible future teacher product sales.
