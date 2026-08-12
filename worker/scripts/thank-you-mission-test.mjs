/**
 * Prompt #204 — Thank a Teacher mission: email → one completion → +1 Nugget; replay safe.
 * Usage: node worker/scripts/thank-you-mission-test.mjs
 */
import {
  validateThankYouMessage,
  eventKeyThankYou,
  buildThankYouEmailContent,
  sendThankYouMission,
  THANK_YOU_MISSION_ID,
} from '../thank-you-mission.js';
import { WAVE2_MISSION_IDS } from '../mission-event-completions.js';
import fs from 'fs';
import { fileURLToPath } from 'url';

let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log('PASS', m);
}
function bad(m, d) {
  fail++;
  console.error('FAIL', m, d != null ? d : '');
}

if (WAVE2_MISSION_IDS.THANK_YOU === 'perm_thank_you' && THANK_YOU_MISSION_ID === 'perm_thank_you') {
  ok('canonical mission id perm_thank_you');
} else bad('mission id mismatch', WAVE2_MISSION_IDS.THANK_YOU);

if (validateThankYouMessage('').ok) bad('empty message must fail');
else ok('empty message rejected');
if (validateThankYouMessage('   ').ok) bad('whitespace message must fail');
else ok('whitespace message rejected');
if (validateThankYouMessage('short').ok) bad('too-short must fail');
else ok('too-short rejected');
if (!validateThankYouMessage('This is long enough.').ok) bad('valid message should pass');
else ok('valid message accepted');
if (validateThankYouMessage('x'.repeat(1001)).ok) bad('too-long must fail');
else ok('too-long rejected');

const ek = eventKeyThankYou('Lucas R.', '2026-08-11');
if (ek === 'thank_you:Lucas R.:2026-08-11') ok('event key shape');
else bad('event key', ek);

const mail = buildThankYouEmailContent({
  recipient_display_label: 'Rick Radle',
  student_display_label: 'Lucas R.',
  message: 'Thanks for helping me today!',
});
if (/Lucas R\./.test(mail.subject) && /Rick Radle/.test(mail.text) && !/@/.test(mail.subject)) {
  ok('email subject/body privacy-safe');
} else bad('email content', mail);

const migration = fs.readFileSync(fileURLToPath(new URL('../migrations/065_perm_thank_you.sql', import.meta.url)), 'utf8');
if (/perm_thank_you/.test(migration) && /lantern_thank_you_sends/.test(migration) && !/DROP TABLE/.test(migration)) {
  ok('additive migration present');
} else bad('migration missing or destructive');

const missionsHtml = fs.readFileSync(fileURLToPath(new URL('../../app/missions.html', import.meta.url)), 'utf8');
if (/quick_thank_you/.test(missionsHtml)) bad('stub quick_thank_you still in missions UI');
else ok('stub quick_thank_you removed from missions UI');
if (!/openThankYouComposer/.test(missionsHtml) || !/\/api\/missions\/thank-you/.test(missionsHtml)) {
  bad('missions UI missing thank-you composer/API');
} else ok('missions UI wires thank-you composer');

// Prompt #187/#11 — Thank a Teacher card uses built-in desk letter artwork via shared LanternCards map.
const thankYouArt = fileURLToPath(new URL('../../app/assets/thank-you-letter.png', import.meta.url));
const rootThankYouArt = fileURLToPath(new URL('../../assets/thank-you-letter.png', import.meta.url));
if (fs.existsSync(thankYouArt) && fs.existsSync(rootThankYouArt)) ok('thank-you-letter.png present in assets + app/assets');
else bad('thank-you-letter.png missing', { thankYouArt: fs.existsSync(thankYouArt), rootThankYouArt: fs.existsSync(rootThankYouArt) });
const cardsJs = fs.readFileSync(fileURLToPath(new URL('../../app/js/lantern-cards.js', import.meta.url)), 'utf8');
if (
  /perm_thank_you:\s*'assets\/thank-you-letter\.png'/.test(cardsJs) &&
  /missionLibraryCoverUrl/.test(missionsHtml)
) {
  ok('Thank a Teacher (perm_thank_you) wired to thank-you-letter artwork');
} else bad('Thank a Teacher artwork wiring missing');
if (!/mid === WAVE2_MISSION\.thankYou[\s\S]{0,1200}assets\/mission-card\.png/.test(missionsHtml)) {
  ok('Thank a Teacher branch does not hardcode generic mission-card cover');
} else bad('Thank a Teacher still points at mission-card.png');

// In-memory D1 stub for happy path + replay
function makeDb(state) {
  state.sends = state.sends || {};
  state.completions = state.completions || {};
  state.submissions = state.submissions || {};
  state.links = state.links || {
    Radle: [
      { lantern_username: 'rick.radle', is_primary: 1, display_name: 'Rick Radle', email: null, role: 'teacher', is_active: 1 },
      { lantern_username: 'admin', is_primary: 0, display_name: 'Web Admin', email: 'rick.radle@trinidad.k12.co.us', role: 'admin', is_active: 1 },
    ],
  };
  state.accounts = state.accounts || {
    'rick.radle': { username: 'rick.radle', display_name: 'Rick Radle', email: null, role: 'teacher', is_active: 1 },
    admin: { username: 'admin', display_name: 'Web Admin', email: 'rick.radle@trinidad.k12.co.us', role: 'admin', is_active: 1 },
  };

  function prepare(sql) {
    const s = String(sql).replace(/\s+/g, ' ');
    const binds = [];
    const api = {
      bind(...a) {
        binds.push(...a);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_thank_you_sends WHERE event_key')) {
          return state.sends[binds[0]] || null;
        }
        if (s.includes('FROM tms_identity_links l') && s.includes('GROUP BY l.tms_staff_id')) {
          const links = state.links[binds[0]] || state.links[Object.keys(state.links).find((k) => k.toLowerCase() === String(binds[0]).toLowerCase())] || [];
          if (!links.length) return null;
          const primary = links.find((l) => Number(l.is_primary) === 1) || links[0];
          const withEmail = links.find((l) => l.email);
          return {
            tms_staff_id: binds[0],
            primary_display: primary.display_name,
            any_display: primary.display_name,
            first_name: null,
            last_name: null,
            username: primary.lantern_username,
            primary_email: primary.email || null,
            any_email: (withEmail && withEmail.email) || primary.email || null,
            any_active: 1,
          };
        }
        if (s.includes('FROM lantern_mission_completions WHERE event_key')) {
          return state.completions[binds[0]] || null;
        }
        if (s.includes('FROM lantern_mission_completions WHERE mission_id')) {
          return null;
        }
        if (s.includes('FROM lantern_mission_submissions WHERE mission_id')) {
          return null;
        }
        if (s.includes('FROM lantern_student_identities') || s.includes('identity_display')) {
          return { identity_display: 'Lucas R.' };
        }
        if (s.includes('FROM lantern_transactions')) return null;
        if (s.includes('SELECT balance FROM lantern_wallets')) return { balance: 0 };
        return null;
      },
      async run() {
        if (s.includes('INSERT INTO lantern_thank_you_sends')) {
          const eventKey = binds[1];
          if (state.sends[eventKey]) {
            const err = new Error('UNIQUE');
            throw err;
          }
          state.sends[eventKey] = {
            id: binds[0],
            event_key: eventKey,
            mission_id: binds[2],
            character_name: binds[3],
            student_display_label: binds[4],
            tms_staff_id: binds[5],
            recipient_display_label: binds[6],
            message: binds[7],
            send_status: 'attempting',
            provider_message_id: null,
            submission_id: null,
            error_code: null,
            created_at: binds[8],
            sent_at: null,
          };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_thank_you_sends') && s.includes("send_status = 'sent'")) {
          const eventKey = binds[binds.length - 1];
          const row = state.sends[eventKey];
          if (row) {
            row.send_status = 'sent';
            row.provider_message_id = binds[0];
            row.sent_at = binds[1];
            row.message = binds[2];
            row.recipient_display_label = binds[3];
            row.student_display_label = binds[4];
            row.tms_staff_id = binds[5];
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_thank_you_sends') && s.includes("send_status = 'failed'")) {
          const eventKey = binds[1];
          if (state.sends[eventKey]) {
            state.sends[eventKey].send_status = 'failed';
            state.sends[eventKey].error_code = binds[0];
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_thank_you_sends') && s.includes("send_status = 'attempting'") && s.includes("send_status = 'failed'")) {
          const eventKey = binds[0];
          if (state.sends[eventKey] && state.sends[eventKey].send_status === 'failed') {
            state.sends[eventKey].send_status = 'attempting';
            state.sends[eventKey].error_code = null;
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_thank_you_sends SET submission_id')) {
          const eventKey = binds[1];
          if (state.sends[eventKey]) state.sends[eventKey].submission_id = binds[0];
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO lantern_mission_completions')) {
          state.completions[binds[4]] = {
            id: binds[0],
            mission_id: binds[1],
            character_name: binds[2],
            trigger_type: binds[3],
            event_key: binds[4],
            source_ref: binds[5],
            submission_id: binds[6],
            created_at: binds[7],
          };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO lantern_mission_submissions')) {
          state.submissions[binds[0]] = { id: binds[0] };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO lantern_transactions') || s.includes('INSERT INTO lantern_wallets') || s.includes('UPDATE lantern_wallets')) {
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
      async all() {
        return { results: [] };
      },
    };
    return api;
  }
  return {
    prepare,
    async batch(stmts) {
      for (const st of stmts) await st.run();
      return [];
    },
  };
}

const originalFetch = globalThis.fetch;
let mailCalls = 0;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/api/lantern-bridge/mail/thank-you')) {
    mailCalls++;
    const body = JSON.parse(opts.body || '{}');
    if (!body.to || !body.subject) return { ok: false, json: async () => ({ ok: false }) };
    return { ok: true, json: async () => ({ ok: true, id: 're_test_' + mailCalls }) };
  }
  if (u.includes('/api/lantern-bridge/staff/list')) {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        staff: [{ tms_staff_id: 'Radle', teacher_name: 'Rick Radle', teacher_email: 'rick.radle@trinidad.k12.co.us' }],
      }),
    };
  }
  if (u.includes('/api/lantern-bridge/economy/')) {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        available: 10,
        delta: 1,
        idempotent: false,
      }),
    };
  }
  return { ok: false, json: async () => ({}) };
};

const state = {};
const db = makeDb(state);
const env = { TMS_LANTERN_BRIDGE_SECRET: 'test-bridge', TMS_NUGGETS_API_BASE_URL: 'https://example.test' };
const account = {
  username: 'student1',
  role: 'student',
  display_name: 'Lucas Full',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
};

const r1 = await sendThankYouMission(db, env, {
  account,
  characterName: '20889',
  recipient_token: 'staff_tms:Radle',
  message: 'Thank you for believing in me this week!',
  now: new Date('2026-08-11T18:00:00.000Z'),
});
if (r1.ok && r1.completed && mailCalls === 1) ok('happy path: mail once + complete');
else bad('happy path', { r1, mailCalls });

const r2 = await sendThankYouMission(db, env, {
  account,
  characterName: '20889',
  recipient_token: 'staff_tms:Radle',
  message: 'Thank you for believing in me this week!',
  now: new Date('2026-08-11T18:05:00.000Z'),
});
if (r2.ok && r2.idempotent && mailCalls === 1) ok('replay: no second email');
else bad('replay', { r2, mailCalls });

const rBadEmail = await sendThankYouMission(db, env, {
  account,
  characterName: '20889',
  recipient_token: 'evil@example.com',
  message: 'Thank you for believing in me this week!',
  now: new Date('2026-08-12T18:00:00.000Z'),
});
if (!rBadEmail.ok) ok('email injection token rejected');
else bad('email injection allowed', rBadEmail);

const rTeacher = await sendThankYouMission(db, env, {
  account: { ...account, role: 'teacher' },
  characterName: '20889',
  recipient_token: 'staff_tms:Radle',
  message: 'Thank you for believing in me this week!',
  now: new Date('2026-08-12T18:00:00.000Z'),
});
if (!rTeacher.ok && rTeacher.error === 'students_only') ok('teachers cannot complete student thank-you');
else bad('teacher gate', rTeacher);

// Failed mail awards nothing
mailCalls = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes('mail/thank-you')) {
    mailCalls++;
    return { ok: false, status: 500, json: async () => ({ ok: false, error: 'mail_send_failed' }) };
  }
  if (String(url).includes('staff/list')) {
    return { ok: true, json: async () => ({ ok: true, staff: [] }) };
  }
  return { ok: false, json: async () => ({}) };
};
const stateFail = {};
const dbFail = makeDb(stateFail);
const rFail = await sendThankYouMission(dbFail, env, {
  account,
  characterName: '20890',
  recipient_token: 'staff_tms:Radle',
  message: 'Thank you for believing in me this week!',
  now: new Date('2026-08-11T18:00:00.000Z'),
});
if (!rFail.ok && String(rFail.error || '').startsWith('mail_send_failed') && Object.keys(stateFail.completions || {}).length === 0) {
  ok('failed send: no completion/reward');
} else bad('failed send still completed', { rFail, completions: stateFail.completions });

// Prompt #207 — failed audit row remains retryable; provider detail preserved in error string
{
  mailCalls = 0;
  let phase = 'fail';
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('mail/thank-you')) {
      mailCalls++;
      if (phase === 'fail') {
        return {
          ok: false,
          status: 502,
          json: async () => ({
            ok: false,
            error: 'mail_send_failed',
            provider_status: 403,
            provider_error: 'You can only send testing emails to your own email address',
            from_source: 'onboarding_default',
          }),
        };
      }
      const body = JSON.parse((opts && opts.body) || '{}');
      if (!body.to) return { ok: false, json: async () => ({ ok: false }) };
      return { ok: true, json: async () => ({ ok: true, id: 're_retry_ok' }) };
    }
    if (u.includes('staff/list')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          staff: [{ tms_staff_id: 'Radle', teacher_name: 'Rick Radle', teacher_email: 'rick.radle@trinidad.k12.co.us' }],
        }),
      };
    }
    if (u.includes('/api/lantern-bridge/economy/')) {
      return { ok: true, json: async () => ({ ok: true, available: 11, delta: 1, idempotent: false }) };
    }
    return { ok: false, json: async () => ({}) };
  };
  const stateRetry = {};
  const dbRetry = makeDb(stateRetry);
  const rFail2 = await sendThankYouMission(dbRetry, env, {
    account,
    characterName: '20891',
    recipient_token: 'staff_tms:Radle',
    message: 'Thank you for believing in me this week!',
    now: new Date('2026-08-11T18:00:00.000Z'),
  });
  if (
    !rFail2.ok &&
    /onboarding_default/.test(String(rFail2.error || '')) &&
    /403/.test(String(rFail2.error || '')) &&
    stateRetry.sends &&
    stateRetry.sends['thank_you:20891:2026-08-11'] &&
    stateRetry.sends['thank_you:20891:2026-08-11'].send_status === 'failed'
  ) {
    ok('failed send stores provider/from detail and failed audit row');
  } else bad('failed detail/audit', { rFail2, sends: stateRetry.sends });

  phase = 'ok';
  const rRetry = await sendThankYouMission(dbRetry, env, {
    account,
    characterName: '20891',
    recipient_token: 'staff_tms:Radle',
    message: 'Thank you for believing in me this week!',
    now: new Date('2026-08-11T18:10:00.000Z'),
  });
  if (rRetry.ok && rRetry.completed && mailCalls === 2) ok('retry after failed send succeeds once');
  else bad('retry after fail', { rRetry, mailCalls });
}

globalThis.fetch = originalFetch;

console.log('\nthank-you-mission-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
