# Verify & Simulate page (archived)

- **Former route:** `/verify.html` (also referenced as `/verify` via Pages pretty URLs)
- **Former purpose:** Development/QA simulation cockpit for role switching, checklist state, and routing matrix preview (`lantern_verify_state`, `/api/verify/*`)
- **Archived because:** Current Lantern production architecture uses real pilot authentication (`lantern_pilot` session) and no longer needs this standalone simulation UI in the deployed app
- **Retained as:** Historical/reference source only — not served from `app/`
- **Archive date:** 2026-07-27

Backend `/api/verify/*` routes and D1 simulation helpers were intentionally left in place for existing tooling and automated verification infrastructure.
