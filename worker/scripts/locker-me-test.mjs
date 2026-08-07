/**
 * GET /api/locker/me — session identity, isolation, category shapes, equip/unlock, and test-students disabled stub.
 * Usage: node worker/scripts/locker-me-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildLockerMeResponse, handleLockerRoutes } from '../locker-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let fail = 0;
let pass = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}

function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

function jsonResponse(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

function makeDb(state) {
  state.achievements = state.achievements || {};
  state.cosmeticOwnership = state.cosmeticOwnership || {};

  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_wallets')) {
            const key = binds[0];
            return state.wallets[key] || null;
          }
          if (s.includes('FROM lantern_avatar_profiles')) {
            const key = binds[0];
            return state.avatarProfiles[key] || null;
          }
          if (s.includes('lantern_avatar_submissions') && s.includes('pending')) {
            const key = binds[0];
            return state.pendingAvatars[key] || null;
          }
          if (s.includes('FROM lantern_achievements') && s.includes('achievement_id = ?')) {
            const key = binds[0];
            const achId = binds[1];
            const rows = (state.achievements[key] || []).filter((r) => r.achievement_id === achId);
            return rows[0] || null;
          }
          if (s.includes('FROM lantern_cosmetic_ownership')) {
            const key = binds[0];
            return state.cosmeticOwnership[key] || null;
          }
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_transactions')) {
            const key = binds[0];
            return { results: (state.transactions[key] || []).slice() };
          }
          if (s.includes('FROM lantern_news_submissions')) {
            const names = binds.slice(0, -0);
            const allowed = new Set(names);
            const rows = (state.news || []).filter((n) => allowed.has(n.author_name));
            return { results: rows };
          }
          if (s.includes('FROM lantern_mission_submissions')) {
            const key = binds[0];
            return { results: (state.missions[key] || []).slice() };
          }
          if (s.includes('FROM lantern_poll_contributions')) {
            const key = binds[0];
            return { results: (state.polls[key] || []).slice() };
          }
          if (s.includes('FROM lantern_teacher_recognition')) {
            const key = binds[0];
            return { results: (state.recognitions[key] || []).slice() };
          }
          if (s.includes('FROM lantern_achievements')) {
            const key = binds[0];
            return { results: (state.achievements[key] || []).slice() };
          }
          if (s.includes('SELECT character_name, current_avatar_key FROM lantern_avatar_profiles')) {
            return {
              results: Object.entries(state.avatarProfiles || {}).map(([character_name, v]) => ({
                character_name,
                current_avatar_key: v.current_avatar_key,
              })),
            };
          }
          if (s.includes('FROM lantern_missions WHERE id IN')) {
            return { results: state.missionDefs || [] };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO lantern_achievements')) {
            const [id, character_name, achievement_id, unlocked_at, source, meta_json] = binds;
            state.achievements[character_name] = state.achievements[character_name] || [];
            state.achievements[character_name].push({
              id,
              character_name,
              achievement_id,
              unlocked_at,
              source,
              meta_json,
            });
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_cosmetic_ownership')) {
            const [character_name, owned_json, equipped_json, updated_at] = binds;
            const existing = state.cosmeticOwnership[character_name];
            if (s.includes('ON CONFLICT(character_name) DO UPDATE SET owned_json')) {
              state.cosmeticOwnership[character_name] = {
                character_name,
                owned_json,
                equipped_json: existing ? existing.equipped_json : equipped_json,
                updated_at,
              };
            } else if (s.includes('ON CONFLICT(character_name) DO UPDATE SET equipped_json')) {
              state.cosmeticOwnership[character_name] = {
                character_name,
                owned_json: existing ? existing.owned_json : owned_json,
                equipped_json,
                updated_at,
              };
            } else {
              state.cosmeticOwnership[character_name] = {
                character_name,
                owned_json,
                equipped_json,
                updated_at,
              };
            }
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

async function testStudentResponseShape() {
  const state = {
    wallets: { '20889': { balance: 12, updated_at: '2026-01-01T00:00:00.000Z' } },
    transactions: {
      '20889': [
        {
          id: 'tx1',
          character_name: '20889',
          delta: -5,
          kind: 'cosmetic',
          source: '',
          note: 'Gold Frame purchase',
          created_at: '2026-01-02T00:00:00.000Z',
          meta_json: '{"cosmetic_id":"frame_gold","item_name":"Gold Frame"}',
        },
        {
          id: 'tx2',
          character_name: '20889',
          delta: 5,
          kind: 'mission',
          source: '',
          note: 'Earned',
          created_at: '2026-01-02T00:00:00.000Z',
          meta_json: '{}',
        },
      ],
    },
    achievements: {
      '20889': [
        {
          id: 'ach1',
          character_name: '20889',
          achievement_id: 'first_purchase',
          unlocked_at: '2026-01-02T00:00:00.000Z',
          source: 'economy_transact',
          meta_json: '{}',
        },
      ],
    },
    cosmeticOwnership: {
      '20889': {
        character_name: '20889',
        owned_json: '["frame_gold","hat_red"]',
        equipped_json: '{"frame":"frame_gold"}',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    },
    avatarProfiles: {},
    pendingAvatars: {},
    news: [],
    missions: {},
    polls: {},
    recognitions: { '20889': [] },
    missionDefs: [],
  };
  const account = {
    username: 'lucas',
    display_name: 'Lucas R.',
    role: 'student',
    student_character_name: 'Lucas R.',
    teacher_id: null,
    mtss_student_id: '20889',
    is_active: 1,
    must_change_password: 0,
    _economy_character_name: '20889',
  };
  const body = await buildLockerMeResponse(account, { DB: makeDb(state) }, 'https://example.test');
  if (!body.ok) return bad('student response ok', body);
  if (body.account.username !== 'lucas') return bad('student username', body.account);
  if (body.identity.economy_character_name !== '20889') return bad('economy key', body.identity);
  if (body.identity.economy_key !== '20889') return bad('economy_key field', body.identity);
  if (body.wallet.available !== true || body.wallet.balance !== 12) return bad('wallet balance', body.wallet);
  if (!body.submissions.available || !Array.isArray(body.submissions.items)) return bad('submissions category', body.submissions);
  if (body.achievements.available !== true) return bad('achievements available', body.achievements);
  if (!Array.isArray(body.achievements.items) || body.achievements.items.length < 18) return bad('achievement catalog size', body.achievements);
  const unlocked = body.achievements.items.filter((a) => a.unlocked);
  if (unlocked.length !== 1 || unlocked[0].achievement_id !== 'first_purchase') return bad('unlocked achievement', unlocked);
  if (body.equipped_items.available !== true) return bad('equipped available', body.equipped_items);
  if (body.equipped_items.equipped.frame !== 'frame_gold') return bad('equipped map', body.equipped_items.equipped);
  if (!body.owned_items.available || body.owned_items.items.length < 1) return bad('owned_items', body.owned_items);
  if (!body.owned_items.owned_ids.includes('frame_gold')) return bad('owned_ids merge', body.owned_items.owned_ids);
  ok('student locker response shape');
}

async function testTeacherResponseShape() {
  const state = {
    wallets: { teacher_lee: { balance: 5, updated_at: '2026-01-01T00:00:00.000Z' } },
    transactions: { teacher_lee: [] },
    achievements: {},
    cosmeticOwnership: {},
    avatarProfiles: {},
    pendingAvatars: {},
    news: [],
    missions: {},
    polls: {},
    recognitions: {},
    missionDefs: [],
  };
  const account = {
    username: 'mslee',
    display_name: 'Ms Lee',
    role: 'teacher',
    student_character_name: null,
    teacher_id: 'teacher_lee',
    mtss_student_id: null,
    is_active: 1,
    must_change_password: 0,
    _economy_character_name: null,
  };
  const body = await buildLockerMeResponse(account, { DB: makeDb(state) }, 'https://example.test');
  if (!body.ok) return bad('teacher response ok', body);
  if (body.identity.student_character_name !== null) return bad('teacher no student_character_name', body.identity);
  if (body.identity.economy_key !== 'teacher_lee') return bad('teacher economy_key', body.identity);
  if (body.wallet.available !== true || body.wallet.balance !== 5) return bad('teacher wallet', body.wallet);
  if (body.achievements.available !== true) return bad('teacher achievements available', body.achievements);
  if (body.equipped_items.available !== true) return bad('teacher equipped available', body.equipped_items);
  if (body.recognitions.available !== false) return bad('teacher recognitions n/a', body.recognitions);
  ok('teacher locker response shape');
}

async function testEquipEndpoint() {
  const state = {
    wallets: {},
    transactions: {},
    achievements: {},
    cosmeticOwnership: {
      '20889': {
        character_name: '20889',
        owned_json: '["frame_gold"]',
        equipped_json: '{}',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    },
    avatarProfiles: {},
    pendingAvatars: {},
    news: [],
    missions: {},
    polls: {},
    recognitions: {},
    missionDefs: [],
  };
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => ({
      username: 'lucas',
      display_name: 'Lucas R.',
      role: 'student',
      student_character_name: 'Lucas R.',
      teacher_id: null,
      mtss_student_id: '20889',
      is_active: 1,
      must_change_password: 0,
    }),
    pilotEconomyCharacterName: () => '20889',
    pilotAccountRequiresChangePassword: () => false,
  };
  const url = new URL('https://example.test/api/locker/cosmetics/equip');
  const req = new Request(url.toString(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'frame', cosmetic_id: 'frame_gold' }),
  });
  const res = await handleLockerRoutes(req, url, '/api/locker/cosmetics/equip', { DB: makeDb(state) }, {}, deps);
  const body = await res.json();
  if (res.status !== 200 || !body.ok || body.equipped.frame !== 'frame_gold') return bad('equip owned item', body);
  ok('equip cosmetic endpoint');
}

async function testUnlockAchievementEndpointForbidden() {
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => ({
      username: 'lucas',
      display_name: 'Lucas R.',
      role: 'student',
      student_character_name: 'Lucas R.',
      teacher_id: null,
      mtss_student_id: '20889',
      is_active: 1,
      must_change_password: 0,
    }),
    pilotEconomyCharacterName: () => '20889',
    pilotAccountRequiresChangePassword: () => false,
  };
  const url = new URL('https://example.test/api/locker/achievements/unlock');
  const req = new Request(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ achievement_id: 'first_game', source: 'test' }),
  });
  const res = await handleLockerRoutes(req, url, '/api/locker/achievements/unlock', { DB: makeDb({}) }, {}, deps);
  const body = await res.json();
  if (res.status !== 410 || body.error !== 'achievement_unlock_client_forbidden') return bad('unlock endpoint forbidden', body);
  ok('unlock achievement endpoint forbidden (410)');
}

async function testAccountIsolationInBuild() {
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => ({
      username: 'a',
      display_name: 'A',
      role: 'student',
      student_character_name: 'A',
      teacher_id: null,
      mtss_student_id: null,
      is_active: 1,
      must_change_password: 0,
    }),
    pilotEconomyCharacterName: () => 'A',
    pilotAccountRequiresChangePassword: () => false,
  };
  const url = new URL('https://example.test/api/locker/me?character_name=Other');
  const req = new Request(url.toString(), { method: 'GET' });
  const res = await handleLockerRoutes(req, url, '/api/locker/me', { DB: makeDb({ wallets: {}, transactions: {}, avatarProfiles: {}, pendingAvatars: {}, news: [], missions: {}, polls: {}, recognitions: {}, missionDefs: [] }) }, {}, deps);
  const body = await res.json();
  if (res.status !== 400 || body.error !== 'identity_params_not_allowed') return bad('reject character_name param', body);
  ok('reject client identity params');
}

async function testUnauthenticated() {
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => null,
    pilotEconomyCharacterName: () => '',
    pilotAccountRequiresChangePassword: () => false,
  };
  const url = new URL('https://example.test/api/locker/me');
  const req = new Request(url.toString(), { method: 'GET' });
  const res = await handleLockerRoutes(req, url, '/api/locker/me', { DB: makeDb({}) }, {}, deps);
  const body = await res.json();
  if (res.status !== 401 || body.error !== 'not_authenticated') return bad('unauthenticated 401', body);
  ok('unauthenticated rejected');
}

async function testMustChangePassword() {
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => ({
      username: 'newbie',
      display_name: 'New',
      role: 'student',
      student_character_name: 'New',
      teacher_id: null,
      mtss_student_id: null,
      is_active: 1,
      must_change_password: 1,
    }),
    pilotEconomyCharacterName: () => 'newbie',
    pilotAccountRequiresChangePassword: () => true,
  };
  const url = new URL('https://example.test/api/locker/me');
  const req = new Request(url.toString(), { method: 'GET' });
  const res = await handleLockerRoutes(req, url, '/api/locker/me', { DB: makeDb({}) }, {}, deps);
  const body = await res.json();
  if (res.status !== 403 || body.error !== 'must_change_password') return bad('must_change_password 403', body);
  ok('must_change_password rejected');
}

function testStudentsRouteDisabledInWorkerIndex() {
  const indexPath = path.join(root, 'worker/index.js');
  const text = fs.readFileSync(indexPath, 'utf8');
  if (!text.includes('test_students_disabled')) return bad('worker index 410 stub missing');
  if (text.includes('handleTestStudentRoutes')) return bad('handleTestStudentRoutes still in worker/index.js');
  if (text.includes('INSERT INTO lantern_test_students')) return bad('test student insert still in worker/index.js');
  ok('test-students production routes disabled in worker');
}

await testStudentResponseShape();
await testTeacherResponseShape();
await testEquipEndpoint();
await testUnlockAchievementEndpointForbidden();
await testAccountIsolationInBuild();
await testUnauthenticated();
await testMustChangePassword();
testStudentsRouteDisabledInWorkerIndex();

console.log('\nlocker-me-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
