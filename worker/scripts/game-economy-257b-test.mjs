/**
 * Prompt #257B — per-game play economy + multi-play bundles.
 * Usage: node worker/scripts/game-economy-257b-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveGamePlayTransact,
  findActivePlayBundle,
  formatPlayEconomyCopy,
  saveGameEconomySettings,
  resolveGamePlayEconomy,
  buildGameEconomyPublicPayload,
} from '../game-play-economy.js';
import { evaluatePaidGamePlayRun } from '../game-paid-run-proof.js';
import { resolveRegisteredLeaderboardGame } from '../lantern-game-catalog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

function makeDb(state) {
  state.settings = state.settings || {};
  state.transactions = state.transactions || [];
  return {
    state,
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_settings') && s.includes('key = ?')) {
            const v = state.settings[binds[0]];
            return v != null ? { value: v } : null;
          }
          if (s.includes('COUNT(*)') && s.includes('bundle_id')) {
            const bid = binds[0];
            const c = state.transactions.filter(
              (t) => t.kind === 'game_play' && t.meta && t.meta.bundle_id === bid
            ).length;
            return { c };
          }
          if (s.includes('FROM lantern_transactions') && s.includes('run_id')) {
            return (
              state.transactions.find((t) => t.kind === 'game_play' && t.meta && t.meta.run_id === binds[0]) ||
              null
            );
          }
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_transactions') && s.includes('bundle_id')) {
            const char = binds[0];
            const gid = binds[1];
            return {
              results: state.transactions
                .filter(
                  (t) =>
                    t.character_name === char &&
                    t.kind === 'game_play' &&
                    t.meta &&
                    t.meta.game_id === gid &&
                    t.meta.bundle_id &&
                    t.meta.bundle_plays_total
                )
                .map((t) => ({ meta_json: JSON.stringify(t.meta), created_at: t.created_at })),
            };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO lantern_settings')) {
            state.settings[binds[0]] = binds[1];
            return { success: true };
          }
          if (s.includes('DELETE FROM lantern_settings')) {
            delete state.settings[binds[0]];
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_transactions')) {
            const metaJson = binds[7] || '{}';
            state.transactions.push({
              id: binds[0],
              character_name: binds[1],
              delta: binds[2],
              kind: binds[3],
              meta_json: metaJson,
              meta: JSON.parse(metaJson),
              created_at: binds[6],
            });
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

async function insertPlay(db, characterName, resolved) {
  const txId = 'tx-' + Math.random().toString(36).slice(2);
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(txId, characterName, resolved.delta, 'game_play', 'GAME', 'Game', now, JSON.stringify(resolved.meta))
    .run();
  return resolved;
}

{
  const db = makeDb({});
  const save = await saveGameEconomySettings(
    db,
    { game_default_play_mode: '1', game_overrides: { tower: '2', reaction: 'free' } },
    'admin'
  );
  assert(save.ok, '1. save game economy settings');
  const tower = await resolveGamePlayEconomy(db, 'tower');
  assert(tower && tower.playsPerNugget === 2, '2. tower override 2 plays');
  const reaction = await resolveGamePlayEconomy(db, 'reaction');
  assert(reaction && reaction.free, '3. reaction free override');
}

{
  const copy = formatPlayEconomyCopy({ free: false, playsPerNugget: 2 });
  assert(copy.card_meta === '1 Nugget = 2 Plays', '4. copy 2 plays');
  assert(formatPlayEconomyCopy({ free: true }).card_meta === 'Free Play', '5. copy free');
}

{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_default_play_mode: '2' }, 'admin');
  const char = 'student-1';
  const game = resolveRegisteredLeaderboardGame('tower');
  const r1 = await resolveGamePlayTransact(db, char, 'tower', 'run-a');
  assert(r1.ok && r1.delta === -1 && r1.meta.bundle_plays_total === 2, '6. first play debits 1');
  await insertPlay(db, char, r1);
  const r2 = await resolveGamePlayTransact(db, char, 'tower', 'run-b');
  assert(r2.ok && r2.delta === 0 && r2.meta.bundle_play_index === 2, '7. second play consumes bundle');
  await insertPlay(db, char, r2);
  const r3 = await resolveGamePlayTransact(db, char, 'tower', 'run-c');
  assert(r3.ok && r3.delta === -1, '8. third play debits again');
}

{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { 'avatar-match': '3' } }, 'admin');
  const char = 'student-2';
  const runs = ['r1', 'r2', 'r3', 'r4'];
  const deltas = [];
  for (let i = 0; i < runs.length; i++) {
    const r = await resolveGamePlayTransact(db, char, 'avatar-match', runs[i]);
    deltas.push(r.delta);
    await insertPlay(db, char, r);
  }
  assert(JSON.stringify(deltas) === '[-1,0,0,-1]', '9. 3-play bundle debits pattern', deltas);
}

{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { memory: 'free' } }, 'admin');
  const r = await resolveGamePlayTransact(db, 's3', 'memory', 'free-run');
  assert(r.ok && r.delta === 0 && r.meta.free_play, '10. free play zero debit');
  await insertPlay(db, 's3', r);
  const game = resolveRegisteredLeaderboardGame('memory');
  const proof = evaluatePaidGamePlayRun(
    db.state.transactions.find((t) => t.meta.run_id === 'free-run'),
    { characterName: 's3', game, nowMs: Date.now() }
  );
  assert(proof.ok, '11. free play valid leaderboard proof');
}

{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_default_play_mode: '2' }, 'admin');
  const r1 = await resolveGamePlayTransact(db, 'alice', 'tower', 'x1');
  await insertPlay(db, 'alice', r1);
  const activeBob = await findActivePlayBundle(db, 'bob', 'tower');
  assert(!activeBob, '12. cross-student isolation');
  const activeAlice = await findActivePlayBundle(db, 'alice', 'tower');
  assert(activeAlice && activeAlice.plays_remaining === 1, '13. alice has remaining play');
}

assert(/lantern-game-economy\.js/.test(fs.readFileSync(path.join(root, 'app/games.html'), 'utf8')), '14. games.html loads economy helper');
assert(/game_economy/.test(fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8')), '15. admin game economy UI');
assert(/resolveGamePlayTransact/.test(fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8')), '16. worker uses resolveGamePlayTransact');
assert(!/You need 1 Nugget to play/.test(fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8')), '17. paid-start uses dynamic insufficient copy');

const payload = await buildGameEconomyPublicPayload(makeDb({}));
assert(payload.games && payload.games.length >= 13, '18. all registered games in admin payload', payload.games && payload.games.length);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
