# Nugget Economy Contract

**Prompt #169 / #229 / #229A.** TMS Nuggets is the only authoritative spendable ledger. Lantern may display a derived balance and initiate earn/spend. Lantern must not maintain a second spendable wallet.

Routine amounts are **System Admin settings** in `lantern_settings` (`economy.*`). Missing or invalid settings use documented fallbacks. Missions persist their own `reward_amount`; later default changes do not rewrite existing missions. Historical ledger rows stay at the amount originally written — analytics sums persisted `delta`, never today's setting.

## Authority

| Layer | Role |
|-------|------|
| TMS Nuggets | Authoritative balance + transactions |
| Lantern Worker | Initiates earn/spend; mirrors `lantern_transactions` for history/achievements |
| `lantern_wallets` | Isolated demo/persona fallback only. Never authenticated production self-economy. Never staff. |
| Client / localStorage | Display only. Never spendable authority. |

Student principal: session MTSS `student_id` (exact).  
Staff principal: `tms_identity_links` → `tms_staff_id` (exact; never fuzzy). Unlinked staff: **Needs Link**, no fake success.

## ACTION \| WHO \| DELTA \| WHEN \| IDEMPOTENCY \| AUTHORITY

| ACTION | WHO | DELTA | WHEN | IDEMPOTENCY | AUTHORITY |
|--------|-----|-------|------|-------------|-----------|
| Poll completion | student or linked staff participant | configured (`economy.poll_response`, default **0**) | first finalized vote per poll per account | `lantern:poll_complete:<poll_id>:<account_key>` | TMS (`poll_complete`); 0 skips TMS |
| Poll answer change after lock | same | 0 | votes are immutable | same key; already voted | N/A |
| Poll reload / reopen | same | 0 extra | reward recovered if vote exists and TMS credit missing | same key | TMS |
| Poll creation | creator | 0 | creation itself | — | N/A |
| Student daily first News / Shout-Out / Poll publish | student only | configured (`economy.content_creation`, default **+1**) | first publish of that type that Denver school day (#224) | daily content-creation event key | TMS (`content_creation`) |
| Create a Poll Mission | eligible participant | 0 mission Nuggets | first verified mission *progress* | event key; `skipReward` | Daily content-creation cap is the Nugget path |
| Ordinary / event mission verified completion | eligible participant | **saved `reward_amount`** (0–5) | first paid completion of that submission/event | `lantern:mission_reward:<submission_id>` | TMS; 0 skips TMS |
| Mission replay after paid completion | same | 0 | replay allowed; reward already paid | same submission/event key | N/A |
| Daily Check-In | eligible participant | saved mission `reward_amount` | once per Denver school day | `daily_checkin:<account>:<day>` → mission reward | TMS |
| First Game Played | eligible player | saved mission `reward_amount` | first successful `game_play` | `first_game:<account>` → mission reward | TMS |
| Trinidad History Challenge start | mission+game pair | 0 | sponsored Mission launch | exact pair | N/A |
| Trinidad first 10-correct | participant | saved mission `reward_amount` | first verified completion | mission event key | TMS |
| Trinidad replay | same | 0 | already completed | same | N/A |
| SRP Safety Challenge start | mission+game pair | 0 | sponsored Mission launch | exact pair | N/A |
| SRP first 10-correct | participant | saved mission `reward_amount` | first verified completion | mission event key | TMS |
| SRP replay | same | 0 | already completed | same | N/A |
| Direct paid game start | eligible player | configured (`economy.game_play`, default **−1**) | successful paid start | `lantern:game_play:<run_id>` | TMS (`game_play`); 0 = free play |
| Play Again (new run) | eligible player | −1 | new `run_id` | new run reference | TMS |
| Same-run retry / double-click | same | 0 extra | TMS idempotent on `run_id` | same `run_id` | TMS |
| Sponsored Mission game start | exact pair only | 0 | no fake paid run | forged pair rejected | N/A |
| Game win (Nugget Hunt + other advertised wins) | eligible player | configured (`economy.game_win`, default **+1**) | verified win for that run | `lantern:game_win:<run_id>` | TMS (`game_win`) |
| Cosmetic / Locker purchase | student or linked staff | −catalog price | entitlement only after debit | `lantern:store_purchase:<idempotency_key>` | TMS (`cosmetic`) |
| Avatar upload | eligible account | configured (`economy.avatar_upload`, default **−1**) | successful paid upload | `lantern:avatar_upload:<tx or key>` | TMS (`avatar_upload`) |
| Admin Nugget Adjustment | admin actor, any linked target | variable | explicit reason | caller idempotency key / tx | TMS (`admin_adjustment`) |
| Staff Starter Nuggets | linked staff only | configured batch amount | per target in batch | `lantern:staff_starter_nuggets:<batch_id>:<economy_key>` | TMS (`staff_starter_nuggets`) |
| Early encourager | feature-flagged (off in production) | +1 | first 5 reactors / daily cap 3 | `lantern:early_encourager:<type>:<id>:<account>` | TMS if enabled |
| Hidden Nugget find | eligible student | configured (`economy.hidden_nugget`, default **+1**) | accepted poll vote or finalized reaction on that day's assigned Explore card | `lantern:hidden_nugget:<schoolDay>:<account>` | TMS; 0 records discovery only. Requires assignment table (not migrated in #230). |
| Ordinary reaction | any | configured (`economy.reaction`, default **0**, dormant) | no ledger path in #229/#229A/#230 | — | N/A |
| Shout-Out send/receive (unless a Mission) | — | 0 | recognition is not a wallet event | — | N/A |

## Transaction kinds (current vocabulary)

Do not rename historical kinds for aesthetics.

| Kind | Typical delta | Notes |
|------|---------------|--------|
| `poll_complete` | configured (default 0) | Canonical Poll participation (replaces global `poll_vote` reference) |
| `game_play` | configured (default −1) | Paid start; #159 run proof; 0 = free-play proof row |
| `game_win` | configured (default +1) | Win for that `run_id` |
| `lantern_mission_reward` / `teacher_mission` | saved mission `reward_amount` | Mission approval / event completion |
| `cosmetic` | −catalog | Server price |
| `avatar_upload` | −1 | |
| `admin_adjustment` | variable | Reason + actor required |
| `staff_starter_nuggets` | variable | Staff only |
| `content_creation` | configured (default +1) | Student daily first publish (#224). Historical docs said `content_reward`; live kind is `content_creation`. |
| `early_encourager` | +1 | Flag off in production |

Legacy kinds (`poll_vote`, `daily_hunt`, `hidden_nugget`, `daily_checkin` via generic `/api/economy/transact`) may exist in history. New Poll rewards use `poll_complete`. Generic transact **rejects** `poll_vote` / `poll_complete` (vote path only).

## Poll completion

Eligible student **and** linked staff: **configured poll amount once per poll per account**. Default / fallback is **0** (vote and voter-reward marker still written; no TMS credit).

- Vote may persist if the reward call fails. Reload/GET recovers the same reference exactly once.
- Unlinked staff: vote saved, `reward_status: needs_link`, `voter_nuggets: 0` (when a non-zero poll reward is configured).
- UI may claim a Nugget **only** when that response actually awarded `voter_nuggets > 0`.

## Historical missed rewards

#169 identified 19 deterministic Poll +1 misses (14 staff + 5 non-staff) and did not write. #173 ships `worker/scripts/backfill-poll-rewards-173.mjs` (dry-run/apply) using `lantern:poll_complete:<poll_id>:<account_key>` on the authoritative TMS student/staff ledgers. Apply is refused unless the exact-identity gate is still 14 staff + 5 TMS-resolvable students. Demo/persona vote keys are not TMS students. Votes with no local marker remain recoverable by reload after #169.

## Parallel wallets

Staff must never write `lantern_wallets`. Students write it only when TMS returns student-not-found (demo/persona). Locker/balance reads for staff use the TMS staff ledger.

## CANONICAL BALANCE READ CONTRACT

Prompt #170. There is exactly one spendable Nugget balance per authenticated real account.

```
SIGNED-IN ACCOUNT
  → session identity (never a client username / student_id / staff_id picker)
  → exact TMS student or staff principal
  → TMS authoritative ledger
  → GET /api/economy/balance
  → LanternWallet / LanternEconomy shared helper
  → every personal meter
```

| Surface | Role | Source |
|---------|------|--------|
| Games pill, pregame, Missions pill | signed-in self | `LanternWallet.refreshBalance()` / `bindElement` |
| Teacher Tools sidebar | signed-in self | same helper |
| Locker Nugget Balance + Store hero / available | signed-in self | same helper |
| Locker Lifetime Nuggets Earned | signed-in self | same helper `earned` (hidden if TMS unavailable) |
| Avatar crop affordability | signed-in self | same helper |
| Admin Nugget Adjustment | **selected target** | `GET /api/economy/balance?character_name=<target key>` (TMS) |
| Teacher Rewards / Redeemer | **selected student target** | TMS Nuggets bridge (`/api/tms-nuggets/*`) |

Rules:

- Client must not send `username`, `student_id`, or `staff_id` to choose whose signed-in balance to read.
- `?username=` on the signed-in balance endpoint is forbidden.
- Unlinked staff: `{ ok: false, code: "needs_link" }` — UI shows **Needs Link**, never a fake 0.
- Web Admin self-read: `{ ok: false, code: "no_nugget_account" }` — **N/A** / **No Nugget account**. Does not inherit Rick / Radle.
- Real authenticated students/staff never display `lantern_wallets` as authority.
- Failed reads must not overwrite a known number with 0. Prefer last known (marked stale) or **Balance unavailable**.
- After a successful authoritative transaction, refresh from the server. Do not `balance +=` / `balance -=`.
- Refresh on page load, after local transactions, and on `visibilitychange` (debounced). Do not poll every second.
- Balance responses are `Cache-Control: private, no-store`. TMS PWA `shouldBypassCache` already excludes `/api/`.
- Display wording may differ (`55 Nuggets available` vs `55 Nuggets`); the number must be identical.
