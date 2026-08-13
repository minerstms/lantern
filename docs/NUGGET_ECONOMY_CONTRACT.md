# Nugget Economy Contract

**Prompt #169.** TMS Nuggets is the only authoritative spendable ledger. Lantern may display a derived balance and initiate earn/spend. Lantern must not maintain a second spendable wallet.

Default product amount is **1 Nugget** unless a feature explicitly configures another amount (Admin adjustment, Staff Starter batch).

## Authority

| Layer | Role |
|-------|------|
| TMS Nuggets | Authoritative balance + transactions |
| Lantern Worker | Initiates earn/spend; mirrors `lantern_transactions` for history/achievements |
| `lantern_wallets` | Demo/persona fallback for unrecognized **students only**. Never for staff. |
| Client / localStorage | Display only. Never spendable authority. |

Student principal: session MTSS `student_id` (exact).  
Staff principal: `tms_identity_links` → `tms_staff_id` (exact; never fuzzy). Unlinked staff: **Needs Link**, no fake success.

## ACTION \| WHO \| DELTA \| WHEN \| IDEMPOTENCY \| AUTHORITY

| ACTION | WHO | DELTA | WHEN | IDEMPOTENCY | AUTHORITY |
|--------|-----|-------|------|-------------|-----------|
| Poll completion | student or linked staff participant | +1 | first finalized vote per poll per account | `lantern:poll_complete:<poll_id>:<account_key>` | TMS (`poll_complete`) |
| Poll answer change after lock | same | 0 | votes are immutable | same key; already voted | N/A |
| Poll reload / reopen | same | 0 extra | reward recovered if vote exists and TMS credit missing | same key | TMS |
| Poll creation | creator | 0 | creation itself | — | N/A |
| Student daily first News / Shout-Out / Poll publish | student only | +1 | first publish of that type that Denver school day (#224) | `lantern:content_reward:<type>:<account>:<day>` | TMS |
| Create a Poll Mission | eligible participant | +1 | first verified mission completion | `lantern:mission_reward:<submission_id>` | TMS |
| Ordinary mission verified completion | eligible participant | +1 | first paid completion of that submission/event | `lantern:mission_reward:<submission_id>` | TMS |
| Mission replay after paid completion | same | 0 | replay allowed; reward already paid | same submission/event key | N/A |
| Daily Check-In | eligible participant | +1 | once per Denver school day | `daily_checkin:<account>:<day>` → mission reward | TMS |
| First Game Played | eligible player | +1 | first successful `game_play` | `first_game:<account>` → mission reward | TMS |
| Trinidad History Challenge start | mission+game pair | 0 | sponsored Mission launch | exact pair | N/A |
| Trinidad first 10-correct | participant | +1 | first verified completion | mission event key | TMS |
| Trinidad replay | same | 0 | already completed | same | N/A |
| SRP Safety Challenge start | mission+game pair | 0 | sponsored Mission launch | exact pair | N/A |
| SRP first 10-correct | participant | +1 | first verified completion | mission event key | TMS |
| SRP replay | same | 0 | already completed | same | N/A |
| Direct paid game start | eligible player | −1 | successful paid start | `lantern:game_play:<run_id>` | TMS (`game_play`) |
| Play Again (new run) | eligible player | −1 | new `run_id` | new run reference | TMS |
| Same-run retry / double-click | same | 0 extra | TMS idempotent on `run_id` | same `run_id` | TMS |
| Sponsored Mission game start | exact pair only | 0 | no fake paid run | forged pair rejected | N/A |
| Game win (Nugget Hunt + other advertised wins) | eligible player | +1 | verified win for that run | `lantern:game_win:<run_id>` | TMS (`game_win`) |
| Cosmetic / Locker purchase | student or linked staff | −catalog price | entitlement only after debit | `lantern:store_purchase:<idempotency_key>` | TMS (`cosmetic`) |
| Avatar upload | eligible account | −1 | successful paid upload | `lantern:avatar_upload:<tx or key>` | TMS (`avatar_upload`) |
| Admin Nugget Adjustment | admin actor, any linked target | variable | explicit reason | caller idempotency key / tx | TMS (`admin_adjustment`) |
| Staff Starter Nuggets | linked staff only | configured batch amount | per target in batch | `lantern:staff_starter_nuggets:<batch_id>:<economy_key>` | TMS (`staff_starter_nuggets`) |
| Early encourager | feature-flagged (off in production) | +1 | first 5 reactors / daily cap 3 | `lantern:early_encourager:<type>:<id>:<account>` | TMS if enabled |
| Reactions Lock In | any | 0 | placement only | — | N/A |
| Shout-Out send/receive (unless a Mission) | — | 0 | recognition is not a wallet event | — | N/A |

## Transaction kinds (current vocabulary)

Do not rename historical kinds for aesthetics.

| Kind | Typical delta | Notes |
|------|---------------|--------|
| `poll_complete` | +1 | Canonical Poll participation (replaces global `poll_vote` reference) |
| `game_play` | −1 | Paid start; #159 run proof |
| `game_win` | +1 | Win for that `run_id` |
| `lantern_mission_reward` / `teacher_mission` | +1 | Mission approval / event completion |
| `cosmetic` | −catalog | Server price |
| `avatar_upload` | −1 | |
| `admin_adjustment` | variable | Reason + actor required |
| `staff_starter_nuggets` | variable | Staff only |
| `content_reward` | +1 | Student daily first publish (#224) |
| `early_encourager` | +1 | Flag off in production |

Legacy kinds (`poll_vote`, `daily_hunt`, `hidden_nugget`, `daily_checkin` via generic `/api/economy/transact`) may exist in history. New Poll rewards use `poll_complete`. Generic transact **rejects** `poll_vote` / `poll_complete` (vote path only).

## Poll completion

Eligible student **and** linked staff: **+1 once per poll per account**.

- Vote may persist if the reward call fails. Reload/GET recovers the same reference exactly once.
- Unlinked staff: vote saved, `reward_status: needs_link`, `voter_nuggets: 0`.
- UI may say “+1 nugget for participating!” **only** when `voter_nuggets === 1` for that response.

## Historical missed rewards

Do **not** mass-backfill under #169. Votes with a `lantern_poll_voter_rewards` row but no matching TMS `lantern:poll_complete:<poll>:<account>` row are **deterministic candidates**. Votes with no local marker are recoverable by reload after deploy.

## Parallel wallets

Staff must never write `lantern_wallets`. Students write it only when TMS returns student-not-found (demo/persona). Locker/balance reads for staff use the TMS staff ledger.
