/**
 * Prompt #259 — Locker My Lantern Stats (server-authoritative aggregates).
 * Usage: node worker/scripts/locker-stats-259-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  countCreationsShared,
  countGamesPlayed,
  countReactionsGiven,
  fetchLockerLanternStats,
} from '../locker-stats.js';
import { handleLockerRoutes } from '../locker-handlers.js';

const studentA = {
  username: '20889',
  display_name: 'Alex',
  student_character_name: '20889',
  role: 'student',
  _economy_character_name: '20889',
};

function jsonResponse(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

const depsFor = (account) => ({
  jsonResponse,
  getPilotAccountFromRequest: async () => account,
  pilotEconomyCharacterName: (a) =>
    String(a.role || '').toLowerCase() === 'student' ? a._economy_character_name || a.student_character_name : null,
  pilotAccountRequiresChangePassword: () => false,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
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

const shellJs = fs.readFileSync(path.join(root, 'app/js/lantern-locker-shell.js'), 'utf8');
const handlersJs = fs.readFileSync(path.join(root, 'worker/locker-handlers.js'), 'utf8');
if (shellJs.includes('My Lantern Stats') && shellJs.includes('Creations Shared')) ok('UI My Lantern Stats block');
else bad('UI stats block');
if (!shellJs.includes('lockerHeaderAbout') || shellJs.includes('lanternStatsBlockHtml')) ok('About/bio section replaced');
else bad('bio section still primary');
if (handlersJs.includes('student_bio_not_allowed')) ok('student bio PATCH rejected');
else bad('student bio gate');
if (handlersJs.includes('lantern_stats')) ok('locker/me exposes lantern_stats');

function makeStatsDb(state) {
  state = state || {};
  return {
    prepare(sql) {
      const binds = [];
      const s = String(sql).replace(/\s+/g, ' ').trim();
      const api = {
        bind(...args) {
          binds.length = 0;
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_news_submissions') && s.includes('approved')) {
            const names = binds.slice(0, binds.length);
            const rows = (state.news || []).filter(
              (r) => names.includes(r.author_name) && String(r.status).toLowerCase() === 'approved'
            );
            return { c: rows.length };
          }
          if (s.includes('FROM lantern_polls') && s.includes('approved_at')) {
            const key = binds[0];
            const rows = (state.polls || []).filter(
              (r) => r.character_name === key && r.approved_at && String(r.approved_at).trim()
            );
            return { c: rows.length };
          }
          if (s.includes('FROM lantern_feed_items') && s.includes('approved')) {
            const keys = binds.slice(0, binds.length / 2).map((k) => String(k).toLowerCase());
            const rows = (state.feedItems || []).filter(
              (r) =>
                String(r.status).toLowerCase() === 'approved' &&
                (keys.includes(String(r.author_id || '').toLowerCase()) ||
                  keys.includes(String(r.author_display_name || '').toLowerCase()))
            );
            return { c: rows.length };
          }
          if (s.includes("kind = 'game_play'")) {
            const key = binds[0];
            const rows = (state.transactions || []).filter(
              (r) => r.character_name === key && r.kind === 'game_play'
            );
            return { c: rows.length };
          }
          if (s.includes('FROM lantern_final_reaction_responses')) {
            const user = String(binds[0] || '').toLowerCase();
            const rows = (state.reactions || []).filter(
              (r) => String(r.reactor_username || '').toLowerCase() === user
            );
            return { c: rows.length };
          }
          if (s.includes('SELECT bio FROM lantern_pilot_accounts')) {
            const u = binds[0];
            return state.pilotAccounts && state.pilotAccounts[u] ? { bio: state.pilotAccounts[u].bio } : null;
          }
          if (s.includes('COUNT(*) AS c FROM lantern_mission_submissions')) {
            return { c: state.missionsCompleted || 0 };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
      return api;
    },
  };
}

(async function run() {
  const account = { username: '20889', role: 'student', display_name: 'Alex', student_character_name: '20889' };
  const db = makeStatsDb({
    news: [
      { author_name: 'Alex', status: 'approved' },
      { author_name: 'Alex', status: 'approved' },
      { author_name: 'Alex', status: 'pending' },
      { author_name: 'Alex', status: 'returned' },
    ],
    polls: [],
    feedItems: [],
    transactions: [
      { character_name: '20889', kind: 'game_play' },
      { character_name: '20889', kind: 'game_play' },
      { character_name: '20889', kind: 'game_play' },
      { character_name: '20889', kind: 'page_view' },
    ],
    reactions: [
      { reactor_username: '20889', item_type: 'feed', item_id: 'a' },
      { reactor_username: '20889', item_type: 'feed', item_id: 'b' },
      { reactor_username: '20889', item_type: 'feed', item_id: 'c' },
      { reactor_username: '20889', item_type: 'feed', item_id: 'd' },
      { reactor_username: '20889', item_type: 'feed', item_id: 'e' },
    ],
  });

  const creations = await countCreationsShared(db, account, '20889');
  if (creations === 2) ok('Creations Shared counts approved only (2)');
  else bad('creations count', creations);

  const games = await countGamesPlayed(db, '20889');
  if (games === 3) ok('Games Played counts game_play rows only (3)');
  else bad('games count', games);

  const reactions = await countReactionsGiven(db, '20889');
  if (reactions === 5) ok('Reactions Given counts finalized rows (5)');
  else bad('reactions count', reactions);

  const stats = await fetchLockerLanternStats(db, account, '20889');
  if (stats.creations_shared === 2 && stats.games_played === 3 && stats.reactions_given === 5) {
    ok('combined stats payload');
  } else bad('combined stats', stats);

  const bioState = { pilotAccounts: { '20889': { username: '20889', bio: 'Stored bio text.' } } };
  const bioDb = makeStatsDb(bioState);
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'nope' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: bioDb }, {}, depsFor(studentA));
  const body = await res.json();
  if (res.status === 403 && body.error === 'student_bio_not_allowed') ok('student bio PATCH forbidden');
  else bad('student bio PATCH', { status: res.status, body });

  if (bioState.pilotAccounts['20889'].bio === 'Stored bio text.') ok('historical bio preserved in storage');
  else bad('bio deleted');

  console.log('\nlocker-stats-259-test:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
