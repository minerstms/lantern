/**
 * Prompt #174 — Fight Song Challenge focused tests.
 * Usage: node worker/scripts/fight-song-challenge-174-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  FIGHT_SONG_LINES,
  FIGHT_SONG_CANONICAL_IDS,
  FIGHT_SONG_MISSION_ID,
  FIGHT_SONG_MISSION,
  FIGHT_SONG_WRONG_MESSAGE,
  FIGHT_SONG_SUCCESS_MESSAGE,
  isCanonicalFightSongOrder,
  normalizeFightSongOrder,
  shuffleFightSongIds,
  overlayFightSongMission,
  checkFightSongOrder,
} from '../fight-song-challenge.js';
import { overlayEducationalTriviaMissions } from '../educational-trivia-missions.js';
import { WAVE2_MISSION_IDS } from '../mission-event-completions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}

const LOCKED_LINES = [
  'Stand up and cheer,',
  'Stand up and cheer for dear old Trinidad.',
  'For today we raise',
  'the Blue and White above the rest.',
  'Our teams are fighting,',
  'and they are bound to win this game.',
  'We’ve got the team;',
  'we’ve got the steam,',
  'for this is Trinidad High School’s day!',
];

function loadClient() {
  const src = fs.readFileSync(path.join(root, 'app/js/lantern-fight-song-challenge.js'), 'utf8');
  const sandbox = {
    window: {},
    Math,
    console,
    fetch: function () {
      return Promise.resolve({
        json: function () {
          return Promise.resolve({ ok: false, error: 'no_fetch' });
        },
      });
    },
  };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(src, sandbox);
  return sandbox.window.LANTERN_FIGHT_SONG;
}

function makeDb() {
  const missions = new Map();
  const submissions = new Map();
  const completions = new Map();
  const txs = new Map();
  const wallets = new Map();

  function matchSelect(sql, binds) {
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
      return best ? { id: best.id, created_at: best.created_at, status: best.status } : null;
    }
    if (s.includes('FROM lantern_mission_submissions WHERE id = ?')) {
      return submissions.get(binds[0]) || null;
    }
    if (s.includes('FROM lantern_missions WHERE id = ?')) {
      return missions.get(binds[0]) || null;
    }
    if (s.includes("FROM lantern_transactions WHERE character_name = ? AND kind = 'first_game'")) {
      return null;
    }
    if (s.includes('FROM lantern_transactions WHERE id = ?') || s.includes('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
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
              return matchSelect(s, binds);
            },
            async run() {
              if (s.includes('INSERT OR IGNORE INTO lantern_missions')) {
                if (!missions.has(binds[0])) {
                  missions.set(binds[0], {
                    id: binds[0],
                    title: binds[3],
                    description: binds[4],
                    reward_amount: binds[5],
                    active: 1,
                    archived: 0,
                  });
                }
                return { meta: { changes: 1 } };
              }
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
                  reviewed_at: binds.length > 8 ? binds[7] : null,
                  reviewed_by: binds.length > 8 ? binds[8] : binds[7],
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
    _missions: missions,
    _submissions: submissions,
    _completions: completions,
    _txs: txs,
    _wallets: wallets,
  };
}

const client = loadClient();
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const missionsPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const missionsCss = fs.readFileSync(path.join(root, 'app/css/lantern-missions-page.css'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const completionsSrc = fs.readFileSync(path.join(root, 'worker/mission-event-completions.js'), 'utf8');
const clientSrc = fs.readFileSync(path.join(root, 'app/js/lantern-fight-song-challenge.js'), 'utf8');
const authSrc = fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8');
const rewardSrc = fs.readFileSync(path.join(root, 'worker/missions-reward.js'), 'utf8');
const tmsSrc = fs.readFileSync(path.join(root, 'worker/tms-economy-bridge.js'), 'utf8');
const triviaSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');

if (FIGHT_SONG_LINES.length === 9 && client.LINES.length === 9 && LOCKED_LINES.length === 9) {
  ok('1. exactly 9 canonical lines exist');
} else bad('1. line count', { server: FIGHT_SONG_LINES.length, client: client.LINES.length });

const serverTexts = FIGHT_SONG_LINES.map((l) => l.text);
const clientTexts = client.LINES.map((l) => l.text);
if (serverTexts.every((t, i) => t === LOCKED_LINES[i]) && clientTexts.every((t, i) => t === LOCKED_LINES[i])) {
  ok('2. every line matches the supplied school text exactly');
} else bad('2. exact text', { serverTexts, clientTexts, LOCKED_LINES });

const serverIds = FIGHT_SONG_LINES.map((l) => l.id);
const uniqueIds = new Set(serverIds);
if (
  uniqueIds.size === 9 &&
  serverIds.every((id, i) => id === 'fight_line_' + (i + 1)) &&
  client.CANONICAL_IDS.join(',') === FIGHT_SONG_CANONICAL_IDS.join(',')
) {
  ok('3. every line id exists exactly once');
} else bad('3. ids', serverIds);

let alwaysShuffled = true;
let neverCanonical = true;
for (let i = 0; i < 40; i++) {
  const shuffled = shuffleFightSongIds();
  if (!normalizeFightSongOrder(shuffled)) alwaysShuffled = false;
  if (isCanonicalFightSongOrder(shuffled)) neverCanonical = false;
  const clientShuffled = client.shuffleOrder(client.CANONICAL_IDS);
  if (!client.isValidPermutation(clientShuffled) || client.isCanonicalOrder(clientShuffled)) {
    alwaysShuffled = false;
    neverCanonical = false;
  }
}
if (alwaysShuffled) ok('4. initial order is a valid shuffled permutation');
else bad('4. shuffle validity');
if (neverCanonical) ok('5. initial order never equals canonical correct order');
else bad('5. accidental canonical start');

const again = client.shuffleOrder(client.CANONICAL_IDS);
if (client.isValidPermutation(again) && !client.isCanonicalOrder(again) && again.length === 9) {
  ok('6. Shuffle Again yields a valid permutation');
} else bad('6. shuffle again', again);

if (
  clientSrc.includes('applyDrag') &&
  clientSrc.includes('draggable') &&
  clientSrc.includes('dragstart') &&
  typeof client.applyDrag === 'function'
) {
  const dragged = client.applyDrag(['fight_line_1', 'fight_line_2', 'fight_line_3', 'fight_line_4', 'fight_line_5', 'fight_line_6', 'fight_line_7', 'fight_line_8', 'fight_line_9'], 0, 2);
  if (dragged[2] === 'fight_line_1' && dragged[0] === 'fight_line_2') ok('7. reordering works with mouse/trackpad drag helper');
  else bad('7. applyDrag', dragged);
} else bad('7. drag helpers missing');

if (
  missionsHtml.includes('id="fightSongUpBtn"') &&
  missionsHtml.includes('id="fightSongDownBtn"') &&
  missionsCss.includes('min-height: 56px') &&
  missionsCss.includes('clamp(22px')
) {
  ok('8. touch-accessible Move Up / Move Down targets exist');
} else bad('8. touch controls');

if (
  clientSrc.includes('ArrowUp') &&
  clientSrc.includes('ArrowDown') &&
  clientSrc.includes("setAttribute('role', 'option')") &&
  typeof client.moveItem === 'function'
) {
  const moved = client.moveItem(FIGHT_SONG_CANONICAL_IDS, 1, -1);
  if (moved[0] === 'fight_line_2' && moved[1] === 'fight_line_1') ok('9. keyboard/accessibility fallback works');
  else bad('9. moveItem', moved);
} else bad('9. keyboard fallback');

{
  const db = makeDb();
  const wrong = FIGHT_SONG_CANONICAL_IDS.slice().reverse();
  const res = await checkFightSongOrder(db, null, {
    characterName: '20889',
    missionId: FIGHT_SONG_MISSION_ID,
    order: wrong,
    correct: true,
  });
  if (res.ok && res.correct === false && res.completed === false && res.rewarded === false && db._completions.size === 0 && db._txs.size === 0) {
    ok('10. wrong order does not complete mission');
  } else bad('10. wrong complete', res);
  const wrongBlob = JSON.stringify(res);
  if (
    res.message === FIGHT_SONG_WRONG_MESSAGE &&
    !res.canonical &&
    !res.answer &&
    !res.canonical_ids &&
    !Array.isArray(res.order) &&
    !wrongBlob.includes('fight_line_1') &&
    !wrongBlob.includes('Stand up and cheer for dear old Trinidad.')
  ) {
    ok('11. wrong order does not reveal answer');
  } else bad('11. reveal', res);
  if (normalizeFightSongOrder(wrong).join(',') === wrong.join(',')) {
    ok('12. wrong order preserves current arrangement');
  } else bad('12. preserve arrangement');
}

{
  const db = makeDb();
  const claim = await checkFightSongOrder(db, null, {
    characterName: '20889',
    missionId: FIGHT_SONG_MISSION_ID,
    correct: true,
    order: ['fight_line_9', 'fight_line_8', 'fight_line_7', 'fight_line_6', 'fight_line_5', 'fight_line_4', 'fight_line_3', 'fight_line_2', 'fight_line_1'],
  });
  if (claim.ok && claim.correct === false && db._completions.size === 0) {
    ok('15. client cannot simply claim success');
  } else bad('15. client claim', claim);

  const good = await checkFightSongOrder(db, null, {
    characterName: '20889',
    missionId: FIGHT_SONG_MISSION_ID,
    order: FIGHT_SONG_CANONICAL_IDS.slice(),
  });
  if (good.ok && good.correct && good.completed && good.rewarded && good.message === FIGHT_SONG_SUCCESS_MESSAGE) {
    ok('13. correct order is recognized');
  } else bad('13. correct recognized', good);
  const usedExisting =
    handlersSrc.includes("path === '/api/missions/fight-song/check'") &&
    handlersSrc.includes('checkFightSongOrder') &&
    completionsSrc.includes('creditMissionApprovalReward') &&
    good.ok &&
    [...db._completions.values()].some((c) => c.mission_id === FIGHT_SONG_MISSION_ID && c.trigger_type === 'fight_song_reorder');
  if (usedExisting && [...db._txs.values()].length === 1) ok('14. correct order completes through existing authoritative mission path');
  else bad('14. completion path', { good, comps: [...db._completions.values()], txs: [...db._txs.values()] });

  const againGood = await checkFightSongOrder(db, null, {
    characterName: '20889',
    missionId: FIGHT_SONG_MISSION_ID,
    order: FIGHT_SONG_CANONICAL_IDS.slice(),
  });
  if (againGood.ok && againGood.correct && !againGood.rewarded && db._txs.size === 1 && db._wallets.get('20889') === 1) {
    ok('16. mission cannot accidentally double-award');
  } else bad('16. double award', { againGood, txs: db._txs.size, bal: db._wallets.get('20889') });
  if (againGood.ok && (againGood.already_completed || againGood.reward_idempotent || !againGood.rewarded)) {
    ok('17. repeat participation allowed without changing other missions');
  } else bad('17. repeat participation', againGood);
  if (againGood.rewarded === false && db._txs.size === 1) {
    ok('18. existing repeat-reward rules remain unchanged (once-ever via completeMissionByEvent)');
  } else bad('18. repeat reward', againGood);
}

if (
  overlayEducationalTriviaMissions([]).length === 4 &&
  overlayFightSongMission(overlayEducationalTriviaMissions([])).length === 5 &&
  overlayFightSongMission([]).some((m) => m.id === FIGHT_SONG_MISSION_ID) &&
  WAVE2_MISSION_IDS.FIGHT_SONG === 'perm_fight_song' &&
  WAVE2_MISSION_IDS.SRP_SAFETY === 'perm_srp_safety'
) {
  ok('19. other missions remain unchanged');
} else bad('19. other missions', {
  trivia: overlayEducationalTriviaMissions([]).length,
  both: overlayFightSongMission(overlayEducationalTriviaMissions([])).length,
});

if (!rewardSrc.includes('fight_song') && !tmsSrc.includes('fight_song') && rewardSrc.includes('lantern:mission_reward:')) {
  ok('20. TMS/Nugget integration remains unchanged');
} else bad('20. nugget files touched');

if (
  !authSrc.includes('fight_song') &&
  !authSrc.includes('Fight Song') &&
  missionsHtml.includes('guardPilotPage({ mode: \'general\' }')
) {
  ok('21. auth remains unchanged');
} else bad('21. auth');

if (
  missionsHtml.includes('lantern-fight-song-challenge.js') &&
  missionsHtml.includes("fightSong: 'perm_fight_song'") &&
  missionsHtml.includes('id="fightSongChallengeOverlay"') &&
  missionsHtml.includes('id="fightSongCheckBtn"') &&
  missionsHtml.includes('id="fightSongShuffleBtn"') &&
  missionsHtml.includes('LANTERN_FIGHT_SONG.open') &&
  FIGHT_SONG_MISSION.title === 'Fight Song Challenge' &&
  FIGHT_SONG_MISSION.description === 'Put the lines of the school fight song in the correct order.'
) {
  ok('UI wired on Missions page');
} else bad('UI wiring');

if (
  handlersSrc.includes('overlayFightSongMission') &&
  handlersSrc.includes('ensureFightSongMission') &&
  handlersSrc.includes("body.correct") === false
) {
  ok('server ignores client-authoritative success fields');
} else if (handlersSrc.includes('checkFightSongOrder') && !/body\.correct/.test(handlersSrc)) {
  ok('server ignores client-authoritative success fields');
} else bad('server body.correct');

if (
  clientSrc.includes("body: JSON.stringify({") &&
  clientSrc.includes('mission_id: MISSION_ID') &&
  !/correct:\s*true/.test(clientSrc)
) {
  ok('client submits line IDs only');
} else bad('client payload');

if (!triviaSrc.includes('perm_fight_song') && missionsPageJs.includes("item.id === 'perm_srp_safety'")) {
  ok('trivia/SRP mission modules left intact');
} else bad('unrelated mission modules');

const badOrder = await checkFightSongOrder(makeDb(), null, {
  characterName: '20889',
  order: ['fight_line_1', 'fight_line_1', 'fight_line_2', 'fight_line_3', 'fight_line_4', 'fight_line_5', 'fight_line_6', 'fight_line_7', 'fight_line_8'],
});
if (!badOrder.ok && badOrder.error === 'invalid_order') ok('duplicate/omitted IDs rejected');
else bad('invalid permutation', badOrder);

const missingId = await checkFightSongOrder(makeDb(), null, { characterName: '20889' });
if (!missingId.ok && missingId.error === 'invalid_order') ok('missing order rejected even with forged correct flag');
else bad('missing order', missingId);

if (LOCKED_LINES[6].includes('\u2019') && LOCKED_LINES[7].includes('\u2019') && LOCKED_LINES[8].includes('\u2019')) {
  ok('locked apostrophes are the school-provided curly marks');
} else bad('apostrophes', LOCKED_LINES.slice(6));

const fightSongRoute = handlersSrc.slice(
  handlersSrc.indexOf("path === '/api/missions/fight-song/check'"),
  handlersSrc.indexOf("path === '/api/missions/teacher'")
);
const triviaStartRoute = handlersSrc.slice(
  handlersSrc.indexOf("path === '/api/missions/trivia/run/start'"),
  handlersSrc.indexOf("path === '/api/missions/trivia/answer'")
);
const thankYouSrc = fs.readFileSync(path.join(root, 'worker/thank-you-mission.js'), 'utf8');
const pollVoteSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const overlaid = overlayFightSongMission([]);
const fightMeta = overlaid.find((m) => m.id === FIGHT_SONG_MISSION_ID);

{
  const studentDb = makeDb();
  const student = await checkFightSongOrder(studentDb, null, {
    characterName: '20889',
    order: FIGHT_SONG_CANONICAL_IDS.slice(),
  });
  if (student.ok && student.correct && student.rewarded) ok('1c. student can check Fight Song');
  else bad('1c. student check', student);
}

{
  const roles = [
    ['teacher', 'staff:mrradle'],
    ['staff', 'staff:office'],
    ['admin', 'staff:admin'],
  ];
  let allOk = true;
  for (const [label, key] of roles) {
    const db = makeDb();
    const res = await checkFightSongOrder(db, null, {
      characterName: key,
      order: FIGHT_SONG_CANONICAL_IDS.slice(),
    });
    if (!(res.ok && res.correct && res.completed && res.rewarded && db._txs.size === 1)) {
      allOk = false;
      bad('role check ' + label, res);
    }
  }
  if (allOk) {
    ok('2c. teacher can check Fight Song');
    ok('3c. staff can check Fight Song');
    ok('4c. admin can check Fight Song');
  }
}

if (
  fightSongRoute.includes('requireMissionSession') &&
  fightSongRoute.includes('resolveParticipantMissionIdentity') &&
  fightSongRoute.includes('checkFightSongOrder') &&
  !fightSongRoute.includes('students_only') &&
  !fightSongRoute.includes("participantKind !== 'student'")
) {
  ok('5c. no role gets students_only solely for Fight Song');
} else bad('5c. fight-song students_only leftover', fightSongRoute.slice(0, 400));

if (fightMeta && fightMeta.participant_scope === 'everyone') {
  ok('Fight Song overlay scope is everyone');
} else bad('overlay scope', fightMeta && fightMeta.participant_scope);

if (
  /#fightSongChallengeOverlay[\s\S]*max-height:\s*none/.test(missionsCss) &&
  /#fightSongChallengeOverlay[\s\S]*overflow:\s*visible/.test(missionsCss) &&
  !/#fightSongChallengeOverlay[\s\S]{0,400}max-height:\s*min\(92vh/.test(missionsCss)
) {
  ok('15c. natural scrolling CSS has no Fight Song inner max-height pane');
} else bad('15c. fight song scroll css');

if (
  !clientSrc.includes('mission-detail-open') &&
  missionsCss.includes('.missionDetailPanel') &&
  missionsCss.includes('max-height: min(92vh, 92dvh)')
) {
  ok('16c. Fight Song no longer uses body mission-detail-open scroll lock');
} else bad('16c. body lock');

if (
  triviaStartRoute.includes("participantKind !== 'student'") &&
  triviaStartRoute.includes('students_only') &&
  handlersSrc.includes("path === '/api/missions/trivia/answer'")
) {
  ok('17c. trivia student-only behavior remains unchanged');
} else bad('17c. trivia gate');

if (thankYouSrc.includes("role !== 'student'") && thankYouSrc.includes('students_only')) {
  ok('18c. Thank a Teacher behavior remains unchanged');
} else bad('18c. thank-you');

if (pollVoteSrc.includes('already_voted: true') && pollVoteSrc.includes('lantern_poll_votes') && pollVoteSrc.includes('creditPollCompletionReward')) {
  ok('19c. poll already_voted semantics remain unchanged');
} else bad('19c. polls');

console.log('\nFight Song Challenge #174:', passed, 'passed,', failed, 'failed');
process.exit(failed ? 1 : 0);
