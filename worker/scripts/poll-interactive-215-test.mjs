/**
 * Prompt #215 — Explore interactive Poll: vote-first, results-after; no generic content fallthrough.
 * Usage: node worker/scripts/poll-interactive-215-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizePollRow } from '../feed-handlers.js';
import worker from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('OK', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const cards = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const feedHandlers = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');
const workerSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');

assert(/type === 'poll'[\s\S]{0,200}openPoll/.test(cardUi), 'H. openFeedItem routes poll → openPoll');
assert(/pollLockInBtn/.test(cardUi) && /Lock In/.test(cardUi), 'Lock In commit control present');
assert(/role',\s*'radiogroup'/.test(cardUi) || /role="radiogroup"/.test(cardUi), 'radiogroup semantics');
assert(/is-selected/.test(cardUi) && /is-selected/.test(css), 'selected visual state');
assert(/credentials:\s*'include'/.test(cardUi) && /\/api\/polls\//.test(cardUi), 'poll GET uses credentials');
assert(/Do NOT trust \?character_name|session only/.test(workerSrc) || /resolveEconomyGamePlayTransact\(pilotAccount, null/.test(workerSrc), 'GET results gated by session');
assert(/is_yours/.test(workerSrc), 'results mark is_yours');
assert(/Invalid choice/.test(workerSrc), 'G. invalid option rejected');
assert(/Already voted/.test(workerSrc), 'F. duplicate vote blocked');
assert(/do NOT flatten MC choices|Tap to vote/.test(feedHandlers), 'I. feed no longer flattens choices into body');
assert(/type === 'poll'[\s\S]{0,80}\? ''/.test(cards) || /descriptionPreview: desc/.test(cards), 'card face suppresses poll choice dump');
assert(/lanternFinalRxHost/.test(cardUi) && /Prompt #215[\s\S]{0,200}r\.innerHTML = ''/.test(cardUi), 'generic reactions cleared on poll open');
assert(/finalizePollContributionPublish|staffPublisher|NEWS_PUBLISHER_ROLES|immediate/.test(workerSrc) || /poll-publish/.test(fs.readFileSync(path.join(root, 'worker/poll-publish.js'), 'utf8')), 'J. #211 publish helpers preserved');

const normalized = normalizePollRow(
  {
    id: 'pcontrib_test',
    question: 'Would you rather be able to…',
    choices_json: JSON.stringify(['Pause time', 'Rewind time', 'Fast-forward time', 'See the future']),
    image_url: 'https://example.com/poll.png',
    character_name: 'Teacher',
    created_at: '2026-08-11T00:00:00.000Z',
    approved_at: '2026-08-11T00:00:00.000Z',
  },
  'https://example.com'
);
assert(normalized.type === 'poll', 'normalize type poll');
assert(!/Pause time/.test(normalized.body || '') && !/Rewind time/.test(normalized.summary || ''), 'I. choices not in body/summary');
assert(normalized.contentSlot && Array.isArray(normalized.contentSlot.choices) && normalized.contentSlot.choices.length === 4, 'choices remain in contentSlot');
assert(normalized.contentSlot.pollId === 'pcontrib_test', 'pollId in contentSlot');

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function signTestJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sigBuf))}`;
}
async function cookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt(
    {
      sub: account.username,
      role: account.role,
      scn: account.student_character_name || null,
      tid: account.teacher_id || null,
      iat: now,
      exp: now + 3600,
    },
    TEST_PILOT_SECRET
  );
  return `lantern_pilot=${token}`;
}
function studentAccount(overrides) {
  return {
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    student_character_name: 'Lucas',
    teacher_id: null,
    mtss_student_id: '20889',
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}
function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.polls = state.polls || {};
  state.votes = state.votes || [];
  state.voterRewards = state.voterRewards || [];
  state.transactions = state.transactions || [];
  state.wallets = state.wallets || {};
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        if (s.includes('FROM lantern_polls WHERE id = ?')) {
          return state.polls[binds[0]] || null;
        }
        if (s.includes('FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ?')) {
          return state.votes.find((v) => v.poll_id === binds[0] && v.character_name === binds[1]) || null;
        }
        if (s.includes('FROM lantern_poll_voter_rewards WHERE poll_id = ? AND character_name = ?')) {
          return state.voterRewards.find((v) => v.poll_id === binds[0] && v.character_name === binds[1]) || null;
        }
        if (s.includes('FROM lantern_wallets WHERE character_name = ?')) {
          const bal = state.wallets[binds[0]];
          return bal != null ? { balance: bal } : null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_poll_votes WHERE poll_id = ?')) {
          return { results: state.votes.filter((v) => v.poll_id === binds[0]) };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_poll_votes')) {
          if (state.votes.some((v) => v.poll_id === binds[1] && v.character_name === binds[2])) {
            throw new Error('UNIQUE constraint failed: lantern_poll_votes.poll_id, lantern_poll_votes.character_name');
          }
          state.votes.push({ id: binds[0], poll_id: binds[1], character_name: binds[2], choice_index: binds[3] });
        } else if (s.includes('INSERT INTO lantern_poll_voter_rewards')) {
          if (state.voterRewards.some((v) => v.poll_id === binds[1] && v.character_name === binds[2])) {
            throw new Error('UNIQUE constraint failed: lantern_poll_voter_rewards.poll_id, lantern_poll_voter_rewards.character_name');
          }
          state.voterRewards.push({ id: binds[0], poll_id: binds[1], character_name: binds[2] });
        } else if (s.includes('INSERT INTO lantern_transactions')) {
          state.transactions.push({ id: binds[0], character_name: binds[1], delta: binds[2], kind: binds[3] });
        } else if (s.includes('INSERT INTO lantern_wallets')) {
          state.wallets[binds[0]] = (state.wallets[binds[0]] || 0) + Number(binds[3] || 0);
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
  };
}
function withMockedBridge(behavior, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const call = { url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null };
    const result = behavior(call);
    return {
      ok: result.httpOk !== false,
      status: result.status || (result.httpOk === false ? 400 : 200),
      json: async () => result.body,
    };
  };
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

async function getPoll(env, cookie, pollId) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const req = new Request('https://lantern.example/api/polls/' + encodeURIComponent(pollId), { method: 'GET', headers });
  const res = await worker.fetch(req, env);
  return { status: res.status, json: await res.json() };
}
async function postVote(env, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const req = new Request('https://lantern.example/api/polls/vote', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  return { status: res.status, json: await res.json() };
}

await withMockedBridge((call) => {
  if (call.url.endsWith('/economy/transact')) {
    return { body: { ok: true, student_id: '20889', student_name: '20889', delta: 1, earned: 1, spent: 0, available: 1 } };
  }
  return { body: { ok: false, error: 'unexpected_call' } };
}, async () => {
  const lucas = studentAccount();
  const other = studentAccount({
    username: '20999',
    display_name: 'Sam',
    student_character_name: 'Sam',
    mtss_student_id: '20999',
  });
  const state = {
    accounts: { '20889': lucas, '20999': other },
    polls: {
      poll_a: {
        id: 'poll_a',
        question: 'Would you rather…',
        choices_json: JSON.stringify(['Pause time', 'Rewind time', 'Fast-forward time', 'See the future']),
        approved_at: '2026-08-11T00:00:00.000Z',
        character_name: 'Teacher',
        created_at: '2026-08-11T00:00:00.000Z',
      },
    },
  };
  const env = makeEnv(state);
  const cookie1 = await cookieFor(lucas);
  const cookie2 = await cookieFor(other);

  // A — unvoted user: options present, no results/counts
  {
    const { status, json } = await getPoll(env, cookie1, 'poll_a');
    assert(status === 200 && json.ok && Array.isArray(json.poll.choices) && json.poll.choices.length === 4, 'A. options visible');
    assert(json.has_voted === false && json.results == null, 'A. percentages/counts absent', json);
  }

  // spoof other voter's name in query must not unlock results
  {
    state.votes.push({ id: 'pv_x', poll_id: 'poll_a', character_name: '20999', choice_index: 0 });
    const req = new Request('https://lantern.example/api/polls/poll_a?character_name=20999', {
      method: 'GET',
      headers: { Cookie: cookie1 },
    });
    const res = await worker.fetch(req, env);
    const json = await res.json();
    assert(json.has_voted === false && json.results == null, 'A/E. query character_name cannot leak results', json);
    state.votes = [];
  }

  // C — vote once
  {
    const { status, json } = await postVote(env, cookie1, { poll_id: 'poll_a', choice_index: 1 });
    assert(status === 200 && json.ok && json.voted_choice_index === 1, 'C. vote saved once');
    assert(Array.isArray(json.results) && json.results[1].is_yours === true, 'C. results after vote + your choice');
    assert(state.votes.filter((v) => v.poll_id === 'poll_a' && v.character_name === '20889').length === 1, 'C. one persisted response');
  }

  // D — return visit
  {
    const { json } = await getPoll(env, cookie1, 'poll_a');
    assert(json.has_voted === true && json.voted_choice_index === 1 && Array.isArray(json.results), 'D. return visit choice + results');
  }

  // E — second user unvoted still no results
  {
    const { json } = await getPoll(env, cookie2, 'poll_a');
    assert(json.has_voted === false && json.results == null, 'E. second user unvoted no results', json);
  }

  // F — duplicate
  {
    const { status, json } = await postVote(env, cookie1, { poll_id: 'poll_a', choice_index: 2 });
    assert(status === 400 && /Already voted/i.test(json.error || ''), 'F. duplicate rejected');
    assert(json.already_voted === true && json.voted_choice_index === 1, 'F. locked choice preserved (no rewrite)');
    assert(Array.isArray(json.results), 'F. results returned on replay');
    assert(state.votes.filter((v) => v.poll_id === 'poll_a' && v.character_name === '20889').length === 1, 'F. still one vote');
  }

  // F2 — concurrent UNIQUE path (skip pre-check by clearing then double-insert race simulation)
  {
    state.votes = state.votes.filter((v) => !(v.poll_id === 'poll_a' && v.character_name === '20889'));
    state.voterRewards = state.voterRewards.filter((v) => !(v.poll_id === 'poll_a' && v.character_name === '20889'));
    const first = await postVote(env, cookie1, { poll_id: 'poll_a', choice_index: 0 });
    assert(first.status === 200 && first.json.ok, 'F2. first vote ok');
    const second = await postVote(env, cookie1, { poll_id: 'poll_a', choice_index: 3 });
    assert(second.status === 400 && second.json.already_voted && second.json.voted_choice_index === 0, 'F2. second choice blocked');
    assert(state.votes.filter((v) => v.poll_id === 'poll_a' && v.character_name === '20889').length === 1, 'F2. still one row');
  }

  // G — invalid option
  {
    const { status, json } = await postVote(env, cookie2, { poll_id: 'poll_a', choice_index: 99 });
    assert(status === 400 && /Invalid choice/i.test(json.error || ''), 'G. invalid option rejected');
    assert(state.votes.filter((v) => v.character_name === '20999').length === 0, 'G. no vote saved');
  }

  // zero responses GET still works for fresh poll
  {
    state.polls.poll_z = {
      id: 'poll_z',
      question: 'Extra hour?',
      choices_json: JSON.stringify(['Sleep', 'Play', 'Help', 'Create']),
      approved_at: '2026-08-11T00:00:00.000Z',
      character_name: 'Teacher',
      created_at: '2026-08-11T00:00:00.000Z',
    };
    const { json } = await getPoll(env, cookie2, 'poll_z');
    assert(json.ok && json.has_voted === false && json.poll.choices.length === 4 && json.results == null, 'zero-response poll OK');
  }
});

console.log('\npoll-interactive-215-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
