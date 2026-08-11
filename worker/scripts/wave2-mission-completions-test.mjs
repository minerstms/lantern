/**
 * Prompt #165 — Wave 2 mission event completion primitive tests (no live D1 writes).
 */
import {
  WAVE2_MISSION_IDS,
  DAILY_CHECKIN_CHOICES,
  eventKeyDailyCheckin,
  eventKeyFirstGame,
  eventKeyFirstPhoto,
  eventKeyCreatePoll,
  eventKeyShoutout,
  submissionIdForEventKey,
  completeMissionByEvent,
  claimDailyCheckInForCharacter,
  ensureFirstGameMissionCompletion,
  ensureContentApprovedMissionCompletion,
  getMissionProgressForCharacter,
  denverLocalDateYYYYMMDD,
} from '../mission-event-completions.js';
import { SCHOOL_SCHEDULE_TIMEZONE } from '../school-schedule.js';

let passed = 0;
let failed = 0;
function ok(msg) {
  passed += 1;
  console.log('OK  ' + msg);
}
function bad(msg, detail) {
  failed += 1;
  console.error('FAIL ' + msg, detail != null ? detail : '');
}

function makeDb(seed) {
  const completions = new Map();
  const submissions = new Map((seed.submissions || []).map((s) => [s.id, { ...s }]));
  const txs = new Map((seed.txs || []).map((t) => [t.id, { ...t }]));
  const wallets = new Map();

  function match(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_mission_completions WHERE event_key')) {
      return completions.get(binds[0]) || null;
    }
    if (s.includes('FROM lantern_mission_completions WHERE mission_id = ? AND character_name = ?')) {
      for (const row of completions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1]) return row;
      }
      return null;
    }
    if (s.includes("FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? AND status = 'accepted'")) {
      let best = null;
      for (const row of submissions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1] && row.status === 'accepted') {
          if (!best || String(row.created_at) < String(best.created_at)) best = row;
        }
      }
      return best;
    }
    if (s.includes('FROM lantern_mission_submissions WHERE id = ?')) {
      return submissions.get(binds[0]) || null;
    }
    if (s.includes("FROM lantern_transactions WHERE character_name = ? AND kind = 'first_game'")) {
      for (const row of txs.values()) {
        if (row.character_name === binds[0] && row.kind === 'first_game') return row;
      }
      return null;
    }
    if (s.includes('FROM lantern_transactions WHERE id = ?')) {
      return txs.get(binds[0]) || null;
    }
    if (s.includes('SELECT balance FROM lantern_wallets')) {
      const bal = wallets.get(binds[0]);
      return bal != null ? { balance: bal } : null;
    }
    return null;
  }

  return {
    prepare(sql) {
      const s = String(sql);
      return {
        bind(...binds) {
          return {
            async first() {
              return match(s, binds);
            },
            async run() {
              if (s.startsWith('INSERT INTO lantern_mission_completions')) {
                const row = {
                  id: binds[0],
                  mission_id: binds[1],
                  character_name: binds[2],
                  trigger_type: binds[3],
                  event_key: binds[4],
                  source_ref: binds[5],
                  submission_id: binds[6],
                  created_at: binds[7],
                };
                if (completions.has(row.event_key) || [...completions.values()].some((c) => c.id === row.id)) {
                  throw new Error('UNIQUE');
                }
                completions.set(row.event_key, row);
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('INSERT INTO lantern_mission_submissions')) {
                if (submissions.has(binds[0])) throw new Error('UNIQUE');
                submissions.set(binds[0], {
                  id: binds[0],
                  mission_id: binds[1],
                  character_name: binds[2],
                  submission_type: binds[3],
                  submission_content: binds[4],
                  status: binds[5],
                  created_at: binds[6],
                  reviewed_at: binds[7],
                  reviewed_by: binds[8],
                });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('UPDATE lantern_mission_submissions')) {
                const row = submissions.get(binds[binds.length - 1]);
                if (row) {
                  row.status = binds[0];
                  row.reviewed_at = binds[1];
                  row.reviewed_by = binds[2];
                  row.submission_content = binds[3];
                }
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (s.startsWith('INSERT INTO lantern_transactions')) {
                if (txs.has(binds[0])) throw new Error('UNIQUE');
                txs.set(binds[0], {
                  id: binds[0],
                  character_name: binds[1],
                  delta: binds[2],
                  kind: binds[3],
                  source: binds[4],
                  note: binds[5],
                  created_at: binds[6],
                });
                return { meta: { changes: 1 } };
              }
              if (s.includes('INSERT INTO lantern_wallets')) {
                const key = binds[0];
                const startBal = binds[1];
                const delta = binds[3];
                const cur = wallets.has(key) ? wallets.get(key) : startBal - delta;
                wallets.set(key, cur + delta);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(stmts) {
      for (const st of stmts) await st.run();
    },
    _completions: completions,
    _submissions: submissions,
    _txs: txs,
    _wallets: wallets,
  };
}

if (WAVE2_MISSION_IDS.DAILY_CHECKIN === 'perm_daily_checkin') ok('Wave2 mission ids include daily check-in');
else bad('daily id');
if (WAVE2_MISSION_IDS.FIRST_PHOTO === 'tmission_1773676581540_qzl0kx') ok('First Photo reuses existing production row id');
else bad('photo id');
if (DAILY_CHECKIN_CHOICES.includes('Ready') && DAILY_CHECKIN_CHOICES.includes('Need a reset')) ok('daily choices present');
else bad('choices');
if (SCHOOL_SCHEDULE_TIMEZONE === 'America/Denver') ok('school timezone Denver');
else bad('tz');
if (denverLocalDateYYYYMMDD(new Date('2026-08-11T06:00:00.000Z')).match(/^\d{4}-\d{2}-\d{2}$/)) ok('denver date helper returns YYYY-MM-DD');
else bad('denver date');

const ek = eventKeyDailyCheckin('20889', '2026-08-11');
if (ek === 'daily_checkin:20889:2026-08-11' && submissionIdForEventKey(ek).startsWith('msub_evt_')) ok('event key + submission id');
else bad('event key', ek);

{
  const db = makeDb({});
  const r1 = await claimDailyCheckInForCharacter(db, null, '20889', 'Ready', new Date('2026-08-11T18:00:00.000Z'));
  if (r1.ok && r1.rewarded && r1.day) ok('daily check-in first claim awards');
  else bad('daily first', r1);
  const r2 = await claimDailyCheckInForCharacter(db, null, '20889', 'Okay', new Date('2026-08-11T20:00:00.000Z'));
  if (r2.ok && r2.idempotent && !r2.rewarded) ok('daily second same day is idempotent');
  else bad('daily second', r2);
  const r3 = await claimDailyCheckInForCharacter(db, null, '20889', 'Tired', new Date('2026-08-12T18:00:00.000Z'));
  if (r3.ok && r3.rewarded) ok('daily next Denver day can claim again');
  else bad('daily next day', r3);
  const badChoice = await claimDailyCheckInForCharacter(db, null, '20889', 'Anxious', new Date('2026-08-13T18:00:00.000Z'));
  if (!badChoice.ok && badChoice.error === 'invalid_choice') ok('daily rejects non-allowlisted choices');
  else bad('daily bad choice', badChoice);
}

{
  const db = makeDb({
    txs: [{ id: 'tx-hist-fg', character_name: '20889', kind: 'first_game', delta: 10 }],
  });
  const r = await ensureFirstGameMissionCompletion(db, null, '20889', 'tx-new');
  if (r.ok && (r.reconciled || r.idempotent || !r.rewarded)) ok('historical first_game reconciles without new reward');
  else bad('first game hist', r);
}

{
  const db = makeDb({});
  const a = await ensureFirstGameMissionCompletion(db, null, 'lucas', 'tx-play-1');
  if (a.ok && a.rewarded) ok('first successful game_play path awards +1 once');
  else bad('first game award', a);
  const b = await ensureFirstGameMissionCompletion(db, null, 'lucas', 'tx-play-2');
  if (b.ok && !b.rewarded) ok('later game_play does not duplicate first-game reward');
  else bad('first game dup', b);
}

{
  const db = makeDb({
    submissions: [
      {
        id: 'msub_old_photo',
        mission_id: WAVE2_MISSION_IDS.FIRST_PHOTO,
        character_name: '20889',
        status: 'accepted',
        created_at: '2026-08-01T00:00:00.000Z',
      },
    ],
  });
  const r = await ensureContentApprovedMissionCompletion(db, null, 'photo', '20889', 'feed-1');
  if (r.ok && r.reconciled && !r.rewarded) ok('historical First Photo accepted submission does not double-reward');
  else bad('photo hist', r);
}

{
  const db = makeDb({});
  const p1 = await ensureContentApprovedMissionCompletion(db, null, 'poll', 'zane', 'poll-1');
  if (p1.ok && p1.rewarded) ok('approved poll completes Create a Poll once');
  else bad('poll first', p1);
  const p2 = await ensureContentApprovedMissionCompletion(db, null, 'poll', 'zane', 'poll-2');
  if (p2.ok && !p2.rewarded) ok('second approved poll does not re-reward');
  else bad('poll second', p2);
}

{
  const db = makeDb({});
  const s1 = await ensureContentApprovedMissionCompletion(db, null, 'shoutout', 'alex', 'feed-shout');
  if (s1.ok && s1.rewarded) ok('approved shout-out completes mission once');
  else bad('shout first', s1);
  const s2 = await ensureContentApprovedMissionCompletion(db, null, 'shoutout', 'alex', 'feed-shout-2');
  if (s2.ok && !s2.rewarded) ok('subsequent shout-out is idempotent');
  else bad('shout second', s2);
}

{
  const db = makeDb({});
  await claimDailyCheckInForCharacter(db, null, '20889', 'Ready', new Date('2026-08-11T18:00:00.000Z'));
  await ensureFirstGameMissionCompletion(db, null, '20889', 'tx1');
  const prog = await getMissionProgressForCharacter(db, '20889', new Date('2026-08-11T19:00:00.000Z'));
  if (prog.ok && prog.daily_checkin.completed_today && prog.first_game.completed) ok('progress API reflects server completions');
  else bad('progress', prog);
}

{
  const r = await completeMissionByEvent(makeDb({}), null, {
    missionId: WAVE2_MISSION_IDS.FIRST_GAME,
    characterName: 'x',
    triggerType: 'game_play_first',
    eventKey: eventKeyFirstGame('x'),
    cadence: 'once',
  });
  if (r.ok) ok('completeMissionByEvent once-ever works');
  else bad('primitive', r);
}

if (!eventKeyFirstPhoto('a').includes('first_photo')) bad('photo key');
else ok('photo/poll/shout event keys');
eventKeyCreatePoll('a');
eventKeyShoutout('a');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
