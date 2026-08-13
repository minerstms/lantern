/**
 * Prompt #146 — hidden/quarantined content cannot enter public marquee, ticker, or Hallway TV.
 * Usage: node worker/scripts/marquee-hidden-lockdown-146-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  collectMarqueeEvents,
  isExcludedMissionCompletion,
  isHiddenAtSet,
  isMissionPubliclyListed,
} from '../marquee-events.js';
import { handleMarqueeRoutes } from '../marquee-handlers.js';
import { formatPublicStaffName } from '../staff-public-name.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

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

function makeDb(tables) {
  tables = tables || {};
  return {
    prepare(sql) {
      const s = String(sql);
      const api = {
        bind() {
          return api;
        },
        async all() {
          if (s.includes('FROM lantern_polls')) return { results: tables.polls || [] };
          if (s.includes('FROM lantern_mission_submissions')) return { results: tables.submissions || [] };
          if (s.includes('FROM lantern_missions')) return { results: tables.missions || [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: tables.news || [] };
          if (s.includes('FROM lantern_teacher_recognition')) return { results: tables.recognition || [] };
          if (s.includes('FROM lantern_leaderboard_entries')) {
            return {
              results: (tables.leaderboard || []).filter((r) => {
                try {
                  const m = typeof r.meta_json === 'string' ? JSON.parse(r.meta_json) : r.meta_json || {};
                  return m.marquee_board_entry === true || m.marquee_board_entry === 1;
                } catch (_) {
                  return false;
                }
              }),
            };
          }
          if (s.includes('FROM lantern_pilot_accounts')) return { results: tables.staff || [] };
          if (s.includes('FROM lantern_content_people')) return { results: tables.people || [] };
          return { results: [] };
        },
        async first() {
          return null;
        },
      };
      return api;
    },
  };
}

const visible = {
  polls: [
    {
      id: 'poll_live',
      question: 'Visible poll?',
      approved_at: '2026-08-12T10:00:00.000Z',
      created_at: '2026-08-12T10:00:00.000Z',
      hidden_at: null,
    },
    {
      id: 'poll_hidden',
      question: 'Hidden poll?',
      approved_at: '2026-08-12T10:00:00.000Z',
      created_at: '2026-08-12T10:00:00.000Z',
      hidden_at: '2026-08-12T18:00:00.000Z',
    },
  ],
  missions: [
    {
      id: 'mission_live',
      title: 'Live Mission',
      teacher_id: 'T1',
      teacher_name: 'Teacher',
      created_at: '2026-08-12T11:00:00.000Z',
      active: 1,
      archived: 0,
    },
    {
      id: 'mission_hidden_paused',
      title: 'Paused Mission',
      created_at: '2026-08-12T11:01:00.000Z',
      active: 0,
      archived: 0,
    },
    {
      id: 'mission_archived',
      title: 'Archived Mission',
      created_at: '2026-08-12T11:02:00.000Z',
      active: 0,
      archived: 1,
    },
  ],
  submissions: [
    {
      id: 'sub_live',
      mission_id: 'mission_live',
      character_name: 'Lucas',
      submission_type: 'text',
      submission_content: 'Done',
      status: 'accepted',
      created_at: '2026-08-12T12:00:00.000Z',
      reviewed_at: '2026-08-12T12:01:00.000Z',
      hidden_at: null,
      mission_title: 'Live Mission',
      mission_active: 1,
      mission_archived: 0,
    },
    {
      id: 'sub_hidden',
      mission_id: 'mission_live',
      character_name: 'Lucas',
      submission_type: 'text',
      submission_content: 'secret',
      status: 'accepted',
      created_at: '2026-08-12T12:02:00.000Z',
      reviewed_at: '2026-08-12T12:03:00.000Z',
      hidden_at: '2026-08-12T18:00:00.000Z',
      mission_title: 'Live Mission',
      mission_active: 1,
      mission_archived: 0,
    },
    {
      id: 'sub_confirm',
      mission_id: 'mission_live',
      character_name: 'system',
      submission_type: 'confirmation',
      submission_content: 'confirmed:poll:xyz',
      status: 'accepted',
      reviewed_by: 'system',
      created_at: '2026-08-12T12:04:00.000Z',
      hidden_at: null,
      mission_title: 'Live Mission',
      mission_active: 1,
      mission_archived: 0,
    },
  ],
  news: [
    {
      id: 'news_live',
      title: 'Visible News',
      body: 'ok',
      author_name: 'Teacher',
      author_type: 'teacher',
      category: 'news',
      status: 'approved',
      created_at: '2026-08-12T14:00:00.000Z',
      reviewed_at: '2026-08-12T14:00:00.000Z',
      hidden_at: null,
    },
    {
      id: 'news_hidden',
      title: 'Hidden News',
      body: 'nope',
      author_name: 'Teacher',
      author_type: 'teacher',
      category: 'news',
      status: 'approved',
      created_at: '2026-08-12T14:01:00.000Z',
      reviewed_at: '2026-08-12T14:01:00.000Z',
      hidden_at: '2026-08-12T18:00:00.000Z',
    },
    {
      id: 'shout_live',
      title: 'Shout-out: Visible',
      body: 'Recognizing: Visible',
      author_name: 'Teacher',
      author_type: 'teacher',
      category: 'shout_out',
      status: 'approved',
      created_at: '2026-08-12T13:00:00.000Z',
      reviewed_at: '2026-08-12T13:00:00.000Z',
      hidden_at: null,
    },
    {
      id: 'shout_hidden',
      title: 'Shout-out: Hidden',
      body: 'Recognizing: Hidden',
      author_name: 'Teacher',
      author_type: 'teacher',
      category: 'shout_out',
      status: 'approved',
      created_at: '2026-08-12T13:01:00.000Z',
      reviewed_at: '2026-08-12T13:01:00.000Z',
      hidden_at: '2026-08-12T18:00:00.000Z',
    },
  ],
  recognition: [
    {
      id: 'rec_live',
      character_name: 'Lucas',
      message: 'Nice work',
      created_at: '2026-08-12T16:00:00.000Z',
      created_by_teacher_name: 'Teacher',
    },
  ],
  leaderboard: [
    {
      id: 'lb_enter_1',
      game_name: 'Avatar Match',
      character_name: 'Lucas',
      score: 90,
      meta_json: JSON.stringify({ marquee_board_entry: true }),
      created_at: '2026-08-12T15:00:00.000Z',
    },
  ],
  staff: [],
  people: [],
};

assert(isHiddenAtSet({ hidden_at: '2026-08-12T18:00:00.000Z' }) === true, 'hidden_at helper detects hide');
assert(isHiddenAtSet({ hidden_at: null }) === false, 'null hidden_at is visible');
assert(isMissionPubliclyListed({ active: 1, archived: 0 }) === true, '4. visible mission listed');
assert(isMissionPubliclyListed({ active: 0, archived: 0 }) === false, '6. paused/inactive mission not listed');
assert(isMissionPubliclyListed({ active: 0, archived: 1 }) === false, '6. archived mission not listed');
assert(isExcludedMissionCompletion({ status: 'accepted', hidden_at: 'x', submission_content: 'ok' }) === true, '8. hidden completion excluded');
assert(isExcludedMissionCompletion({ status: 'accepted', submission_content: 'confirmed:poll:x' }) === true, '10. confirmed:poll excluded');
assert(
  isExcludedMissionCompletion({
    submission_type: 'confirmation',
    reviewed_by: 'system',
    status: 'accepted',
    submission_content: 'ok',
  }) === true,
  '9. system confirmation excluded'
);

const events = await collectMarqueeEvents(makeDb(visible));
const ids = events.map((e) => e.source_id);
const types = {};
events.forEach((e) => {
  types[e.type] = (types[e.type] || []).concat(e);
});

assert((types.poll_created || []).some((e) => e.source_id === 'poll_live'), '1. visible poll → marquee event');
assert(!(types.poll_created || []).some((e) => e.source_id === 'poll_hidden'), '2. hidden poll → NO marquee event');
assert(!ids.includes('poll_hidden'), '18. public marquee contains zero hidden poll IDs');
assert((types.mission_created || []).some((e) => e.source_id === 'mission_live'), '4. visible mission → event');
assert(!(types.mission_created || []).some((e) => e.source_id === 'mission_hidden_paused'), '5. inactive mission → NO event');
assert(!(types.mission_created || []).some((e) => e.source_id === 'mission_archived'), '6. archived mission → NO event');
assert((types.mission_completed || []).some((e) => e.source_id === 'sub_live'), '7. accepted visible completion → event');
assert(!(types.mission_completed || []).some((e) => e.source_id === 'sub_hidden'), '8. hidden completion → NO event');
assert(!(types.mission_completed || []).some((e) => e.source_id === 'sub_confirm'), '9/10. system confirmation / confirmed:poll → NO event');
assert((types.shout_out || []).some((e) => e.source_id === 'shout_live'), '11. visible Shout-Out → event');
assert(!(types.shout_out || []).some((e) => e.source_id === 'shout_hidden'), '12. hidden Shout-Out → NO event');
assert((types.news || []).some((e) => e.source_id === 'news_live'), '13. visible News → event');
assert(!(types.news || []).some((e) => e.source_id === 'news_hidden'), '14. hidden News → NO event');
assert((types.recognition || []).some((e) => e.source_id === 'rec_live'), '15. visible recognition → event');
assert((types.leaderboard_entry || []).some((e) => e.source_id === 'lb_enter_1'), '17. leaderboard entry still emitted');
assert(events.every((e) => e.eligible !== false), '21. default collect is eligible-only');
assert(
  !ids.includes('poll_hidden') &&
    !ids.includes('news_hidden') &&
    !ids.includes('shout_hidden') &&
    !ids.includes('sub_hidden'),
  '18. public marquee endpoint source ids exclude hidden rows'
);

{
  let hallwaySawHidden = false;
  const hallwayEvents = await collectMarqueeEvents(makeDb(visible), {
    forDisplay: true,
    hallwayNewsFilter: async (_db, rows) => {
      if ((rows || []).some((r) => r.id === 'news_hidden' || r.id === 'shout_hidden')) hallwaySawHidden = true;
      return rows;
    },
    hallwayRecognitionFilter: async (_db, rows) => rows,
  });
  assert(hallwaySawHidden === false, '19. Hallway filter never receives hidden news/shout-outs');
  const hid = hallwayEvents.map((e) => e.source_id);
  assert(
    !hid.includes('poll_hidden') && !hid.includes('news_hidden') && !hid.includes('sub_hidden'),
    '19. Hallway TV receives zero hidden events'
  );
}

{
  const deps = {
    getPilotAccountFromRequest: async () => ({ username: 'admin', role: 'admin' }),
    pilotAccountRequiresChangePassword: () => false,
    resolveTmsStaffIdForLanternAccount: async () => '1',
    callTmsNuggetsBridge: async () => ({ ok: true, capabilities: { system_admin: true } }),
    filterNewsRowsForHallwayTv: async (_db, rows) => rows,
    filterRecognitionRowsForHallwayTv: async (_db, rows) => rows,
  };
  const env = { DB: makeDb(visible) };
  const pub = await handleMarqueeRoutes(
    new Request('https://tmslantern.org/api/marquee/events'),
    new URL('https://tmslantern.org/api/marquee/events'),
    '/api/marquee/events',
    env,
    {},
    deps
  );
  const pubJson = await pub.json();
  const pubIds = (pubJson.events || []).map((e) => e.source_id);
  assert(pub.ok && pubJson.ok && !pubIds.includes('poll_hidden') && !pubIds.includes('news_hidden'), '18. GET /api/marquee/events has zero hidden IDs');

  const insp = await handleMarqueeRoutes(
    new Request('https://tmslantern.org/api/marquee/inspector'),
    new URL('https://tmslantern.org/api/marquee/inspector'),
    '/api/marquee/inspector',
    env,
    {},
    deps
  );
  const inspJson = await insp.json();
  const inspIds = (inspJson.events || []).map((e) => e.source_id);
  assert(
    insp.status === 200 &&
      inspJson.ok &&
      !inspIds.includes('poll_hidden') &&
      !inspIds.includes('news_hidden') &&
      !inspIds.includes('sub_hidden'),
    '21. inspector Eligible list contains zero hidden events'
  );
}

const ticker = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
assert(!/fallbackRecognitionNews/.test(ticker) && !/var recognitionUrl/.test(ticker), '20. ticker does not use unsafe fallback');
assert(/emptySafeState/.test(ticker) && /Fail closed/.test(ticker), '20. ticker fail-closed empty state');

const eventsSrc = fs.readFileSync(path.join(root, 'worker/marquee-events.js'), 'utf8');
assert(!/WHERE approved_at IS NOT NULL ORDER BY approved_at DESC/.test(eventsSrc), 'poll fetch no longer fail-opens without hidden_at');
assert(!/lantern_poll_votes/.test(eventsSrc), '3. poll vote → NO marquee event (votes table never queried)');
assert(/s\.hidden_at/.test(eventsSrc), 'completion query selects hidden_at');
assert(!/FROM lantern_teacher_recognition[\s\S]{0,400}hidden_at/.test(eventsSrc), '16. recognition has no hide field; none invented');
assert(/isHiddenAtSet/.test(eventsSrc) && /isMissionPubliclyListed/.test(eventsSrc), 'canonical visibility helpers present');

const hideNews = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
assert(/\/api\/news\/restore/.test(hideNews), '23. Restore still exists for hidden news');
assert(/\/api\/polls\/hidden/.test(hideNews) && /\/api\/news\/hidden/.test(hideNews), '22. staff hidden list endpoints unchanged');

const rick = {
  username: 'rick.radle',
  display_name: 'Rick Radle',
  first_name: 'Rick',
  last_name: 'Radle',
  honorific: 'Mr.',
  role: 'teacher',
};
assert(formatPublicStaffName(rick) === 'Mr. Radle', '24. professional staff-name formatter unchanged');
assert(!/kvezzani/.test(JSON.stringify(events.map((e) => e.public_text))), '25. public privacy fields still omit staff usernames');

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
assert(/not Teacher Tools → Moderation/.test(adminHtml), 'Feed Visibility copy distinguishes Moderation vs hide/restore lists');

if (fail) {
  console.error('\nFAILED', fail, 'passed', pass);
  process.exit(1);
}
console.log('\nOK', pass, 'checks');
