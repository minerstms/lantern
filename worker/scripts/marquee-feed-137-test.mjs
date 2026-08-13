/**
 * Prompt #137 — public marquee event feed + SYSTEM_ADMIN inspector.
 * Usage: node worker/scripts/marquee-feed-137-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  collectMarqueeEvents,
  detectLeaderboardEntryTransition,
  eventsToTickerSlides,
  filterMarqueeEvents,
  isExcludedMissionCompletion,
  isInternalConfirmationContent,
  marqueeEventId,
  publicTextLooksUnsafe,
  sanitizePublicMarqueeText,
  withBoardEntryMeta,
  MARQUEE_BOARD_ENTRY_META_KEY,
  MARQUEE_PUBLIC_LIMIT,
  MARQUEE_INSPECTOR_LIMIT,
  MARQUEE_LEADERBOARD_PERIOD,
  MARQUEE_LEADERBOARD_RANK_SIZE,
} from '../marquee-events.js';
import { handleMarqueeRoutes, resolveSystemAdminAccess } from '../marquee-handlers.js';
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function makeDb(tables) {
  const sqlLog = [];
  tables = tables || {};
  return {
    sqlLog,
    prepare(sql) {
      const s = String(sql);
      sqlLog.push(s);
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
            let rows = tables.leaderboard || [];
            if (s.includes('marquee_board_entry')) {
              rows = rows.filter((r) => {
                try {
                  const m = typeof r.meta_json === 'string' ? JSON.parse(r.meta_json) : r.meta_json || {};
                  return m.marquee_board_entry === true || m.marquee_board_entry === 1;
                } catch (_) {
                  return false;
                }
              });
            }
            return { results: rows };
          }
          if (s.includes('FROM lantern_pilot_accounts') && s.includes("'student'")) return { results: tables.students || [] };
          if (s.includes('FROM lantern_pilot_accounts')) return { results: tables.staff || [] };
          if (s.includes('FROM tms_identity_links')) return { results: tables.links || [] };
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

const STAFF_VEZZANI = {
  username: 'kvezzani',
  display_name: 'Kristina Vezzani',
  first_name: 'Kristina',
  last_name: 'Vezzani',
  honorific: 'Mrs.',
  role: 'teacher',
  staff_id: 12,
  teacher_id: 'T12',
};

function fixtureTables(extra) {
  return {
    staff: [STAFF_VEZZANI],
    students: [{ username: '20889', display_name: 'Lucas Reed', student_character_name: 'Lucas', mtss_student_id: '20889', identity_display: 'Lucas R.', role: 'student' }],
    links: [{ lantern_username: 'kvezzani', tms_staff_id: 'kvezzani', is_primary: 1 }],
    people: [
      {
        content_kind: 'news',
        content_id: 'news_shout_1',
        person_kind: 'staff',
        person_key: 'kvezzani',
        relationship: 'recognized',
        display_label: 'Kristina Vezzani',
      },
    ],
    polls: [
      {
        id: 'poll_1',
        question: 'What part of summer went by the fastest?',
        character_name: 'Lucas',
        created_at: '2026-08-12T10:00:00.000Z',
        approved_at: '2026-08-12T10:00:00.000Z',
      },
    ],
    missions: [
      {
        id: 'mission_1',
        title: 'Photo Walk',
        teacher_id: 'T12',
        teacher_name: 'Kristina Vezzani',
        created_at: '2026-08-12T11:00:00.000Z',
        active: 1,
        archived: 0,
      },
    ],
    submissions: [
      {
        id: 'sub_1',
        mission_id: 'mission_1',
        character_name: 'Lucas',
        submission_type: 'text',
        submission_content: 'Done',
        status: 'accepted',
        created_at: '2026-08-12T12:00:00.000Z',
        reviewed_at: '2026-08-12T12:01:00.000Z',
        reviewed_by: 'kvezzani',
        mission_title: 'Photo Walk',
      },
    ],
    news: [
      {
        id: 'news_shout_1',
        title: 'Shout-out: Kristina Vezzani',
        body: 'Recognizing: Kristina Vezzani',
        actor_id: 'kvezzani',
        author_name: 'Kristina Vezzani',
        author_type: 'teacher',
        category: 'shout_out',
        created_at: '2026-08-12T13:00:00.000Z',
        reviewed_at: '2026-08-12T13:00:00.000Z',
        status: 'approved',
        hidden_at: null,
      },
      {
        id: 'news_1',
        title: 'Band concert Friday',
        body: 'Come hear the band.',
        actor_id: 'kvezzani',
        author_name: 'Kristina Vezzani',
        author_type: 'teacher',
        category: 'news',
        created_at: '2026-08-12T14:00:00.000Z',
        reviewed_at: '2026-08-12T14:00:00.000Z',
        status: 'approved',
        hidden_at: null,
      },
    ],
    recognition: [],
    leaderboard: [
      {
        id: 'lb_enter_1',
        game_name: 'Avatar Match',
        character_name: 'Lucas',
        score: 90,
        score_display: '90',
        meta_json: JSON.stringify({ marquee_board_entry: true }),
        created_at: '2026-08-12T15:00:00.000Z',
      },
    ],
    ...(extra || {}),
  };
}

async function collect(extra) {
  return collectMarqueeEvents(makeDb(fixtureTables(extra)));
}

/* ---------- helpers / public safety ---------- */
assert(marqueeEventId('poll_created', 'poll_1') === 'poll_created:poll_1', 'deterministic event id');
assert(marqueeEventId('poll_created', 'poll_1') === marqueeEventId('poll_created', 'poll_1'), 'retried id is identical');
assert(isInternalConfirmationContent('confirmed:poll:abc'), '8/9 confirmed:poll: is internal');
assert(isInternalConfirmationContent('confirmed:daily_checkin:x'), 'confirmed:* is internal');
assert(!isInternalConfirmationContent('I voted in the poll'), 'ordinary poll text is not internal');
assert(
  isExcludedMissionCompletion({
    submission_type: 'confirmation',
    reviewed_by: 'system',
    status: 'accepted',
    submission_content: 'confirmed:poll:xyz',
  }),
  '8. system confirmation marker excluded'
);
assert(
  isExcludedMissionCompletion({
    submission_type: 'text',
    status: 'accepted',
    submission_content: 'confirmed:poll:xyz',
  }),
  '9. confirmed:poll: content excluded'
);
assert(
  isExcludedMissionCompletion({ status: 'rejected', submission_type: 'text', submission_content: 'ok' }),
  'rejected completion excluded'
);
assert(
  !isExcludedMissionCompletion({ status: 'accepted', submission_type: 'text', submission_content: 'photo walk done' }),
  '5. legitimate completion not excluded'
);
assert(detectLeaderboardEntryTransition([], ['Lucas'], 'Lucas') === true, '14. empty board → enter');
assert(detectLeaderboardEntryTransition(['Ava', 'Sam'], ['Ava', 'Lucas', 'Sam'], 'Lucas') === true, '14. newly enters');
assert(detectLeaderboardEntryTransition(['Lucas', 'Ava'], ['Lucas', 'Ava'], 'Lucas') === false, '15. already on board');
assert(detectLeaderboardEntryTransition(['Ava', 'Sam'], ['Ava', 'Sam'], 'Lucas') === false, '13. does not enter');
assert(withBoardEntryMeta({}, true)[MARQUEE_BOARD_ENTRY_META_KEY] === true, 'board-entry meta flag set');
assert(withBoardEntryMeta({ marquee_board_entry: true }, false)[MARQUEE_BOARD_ENTRY_META_KEY] == null, 'board-entry meta cleared');
assert(publicTextLooksUnsafe('hi staff:kvezzani'), '24. staff: token unsafe');
assert(publicTextLooksUnsafe('user@school.org said hi'), '24. email unsafe');
assert(publicTextLooksUnsafe('confirmed:poll:abc'), '24. confirmed:poll unsafe');
assert(sanitizePublicMarqueeText('hello@x.com', 'Lantern update') === 'Lantern update', '24. unsafe text replaced');
assert(formatPublicStaffName(STAFF_VEZZANI) === 'Mrs. Vezzani', '25. professional staff formatter');
assert(MARQUEE_LEADERBOARD_PERIOD === 'weekly' && MARQUEE_LEADERBOARD_RANK_SIZE === 8, 'leaderboard period weekly top-8');
assert(MARQUEE_PUBLIC_LIMIT === 40 && MARQUEE_INSPECTOR_LIMIT === 200, 'public 40 / inspector 200 caps');

/* ---------- collect families ---------- */
{
  const events = await collect();
  const byType = {};
  events.forEach((e) => {
    byType[e.type] = (byType[e.type] || []).concat(e);
  });
  assert((byType.poll_created || []).length === 1, '1. new poll → one marquee event', byType.poll_created);
  assert((byType.poll_created || [])[0] && /New poll:/.test(byType.poll_created[0].public_text), 'poll public text uses question');
  assert((byType.mission_created || []).length === 1, '4. new published mission → one event');
  assert((byType.mission_completed || []).length === 1, '5. legitimate completion → event');
  assert((byType.shout_out || []).length === 1, '10. published Shout-Out → event');
  assert(
    (byType.shout_out || [])[0] && /Mrs\. Vezzani/.test(byType.shout_out[0].public_text) && !/Kristina Vezzani/.test(byType.shout_out[0].public_text),
    '11. professional recognized-staff label used',
    byType.shout_out && byType.shout_out[0] && byType.shout_out[0].public_text
  );
  assert((byType.news || []).length === 1, '12. published News → event');
  assert((byType.leaderboard_entry || []).length === 1, '14. flagged leaderboard entry → event');
  const blob = events.map((e) => e.public_text).join('\n');
  assert(!/@/.test(blob) && !/staff:/.test(blob) && !/confirmed:/.test(blob) && !/kvezzani/.test(blob), '24. public text has no usernames/emails/tokens', blob);
  assert(!/20889/.test(blob), '26. numeric student id not in public text', blob);
}

{
  const db = makeDb(fixtureTables());
  await collectMarqueeEvents(db);
  const joined = db.sqlLog.join('\n');
  assert(!/lantern_poll_votes/.test(joined), '2. poll vote table never queried for marquee');
}

{
  const events = await collect({
    polls: [
      { id: 'poll_1', question: 'Q', approved_at: '2026-08-12T10:00:00.000Z', created_at: '2026-08-12T10:00:00.000Z' },
      { id: 'poll_1', question: 'Q', approved_at: '2026-08-12T10:00:00.000Z', created_at: '2026-08-12T10:00:00.000Z' },
    ],
  });
  const polls = events.filter((e) => e.type === 'poll_created');
  assert(polls.length === 1 && polls[0].id === 'poll_created:poll_1', '3. retried poll create / duplicate row → one event');
}

{
  const events = await collect({
    submissions: [
      {
        id: 'sub_1',
        mission_id: 'mission_1',
        character_name: 'Lucas',
        submission_type: 'text',
        submission_content: 'first',
        status: 'accepted',
        created_at: '2026-08-12T12:00:00.000Z',
        reviewed_at: '2026-08-12T12:01:00.000Z',
        mission_title: 'Photo Walk',
      },
      {
        id: 'sub_2',
        mission_id: 'mission_1',
        character_name: 'Lucas',
        submission_type: 'text',
        submission_content: 'repeat later',
        status: 'accepted',
        created_at: '2026-08-12T16:00:00.000Z',
        reviewed_at: '2026-08-12T16:01:00.000Z',
        mission_title: 'Photo Walk',
      },
      {
        id: 'sub_1',
        mission_id: 'mission_1',
        character_name: 'Lucas',
        submission_type: 'text',
        submission_content: 'retry same id',
        status: 'accepted',
        created_at: '2026-08-12T12:00:00.000Z',
        reviewed_at: '2026-08-12T12:01:00.000Z',
        mission_title: 'Photo Walk',
      },
      {
        id: 'msub_evt_confirmed',
        mission_id: 'perm_create_a_poll',
        character_name: 'Lucas',
        submission_type: 'confirmation',
        submission_content: 'confirmed:poll:poll_1',
        status: 'accepted',
        reviewed_by: 'system',
        created_at: '2026-08-12T12:02:00.000Z',
        mission_title: 'Create a Poll',
      },
    ],
  });
  const comps = events.filter((e) => e.type === 'mission_completed');
  assert(comps.length === 2, '6/7. repeat completion is a new event; retry of same id is not', comps.map((e) => e.id));
  assert(
    comps.every((e) => e.id !== 'mission_completed:msub_evt_confirmed') && comps.every((e) => !/confirmed:/.test(e.public_text)),
    '8/9. system marker never surfaces'
  );
}

{
  const events = await collect({
    leaderboard: [
      {
        id: 'lb_improve',
        game_name: 'Avatar Match',
        character_name: 'Lucas',
        score: 99,
        meta_json: JSON.stringify({ run_id: 'r2' }),
        created_at: '2026-08-12T15:30:00.000Z',
      },
    ],
  });
  assert(events.filter((e) => e.type === 'leaderboard_entry').length === 0, '15. improvement without entry flag → no event');
}

{
  const events = [
    { id: 'a', type: 'poll_created', type_label: 'Poll Created', public_text: 'New poll: Zebra', source_title: 'Zebra', created_at: '2026-08-12T18:00:00.000Z' },
    { id: 'b', type: 'news', type_label: 'News', public_text: 'Alpha news', source_title: 'Alpha news', created_at: '2026-08-12T10:00:00.000Z' },
    { id: 'c', type: 'mission_completed', type_label: 'Mission Completed', public_text: 'Lucas completed Photo Walk', source_title: 'Photo Walk', created_at: '2026-08-12T14:00:00.000Z' },
  ];
  const newest = filterMarqueeEvents(events, { sort: 'newest' });
  assert(newest[0].id === 'a', '20. newest-first default');
  const oldest = filterMarqueeEvents(events, { sort: 'oldest' });
  assert(oldest[0].id === 'b', '20b. oldest-first');
  const polls = filterMarqueeEvents(events, { type: 'poll' });
  assert(polls.length === 1 && polls[0].type === 'poll_created', '21. filter Poll');
  const q = filterMarqueeEvents(events, { q: 'photo walk' });
  assert(q.length === 1 && q[0].id === 'c', '21. search public text / title');
  const byType = filterMarqueeEvents(events, { sort: 'type' });
  assert(byType[0].type_label <= byType[1].type_label, '21. sort by type');
}

{
  const slides = eventsToTickerSlides([
    { id: 'poll_created:1', type: 'poll_created', type_label: 'Poll Created', public_text: 'New poll: Q', created_at: '2026-08-12T10:00:00.000Z', source_id: '1' },
  ]);
  assert(slides[0] && slides[0].type === 'poll' && slides[0].title === 'New poll: Q', '27. ticker slides still render from events');
}

/* ---------- inspector auth ---------- */
function jsonResponseLike(res) {
  return res;
}

async function marqueeCall(path, deps, db) {
  const url = new URL('https://tmslantern.org' + path);
  const request = new Request(url.toString(), { method: 'GET' });
  return handleMarqueeRoutes(request, url, url.pathname, { DB: db || makeDb(fixtureTables()) }, {}, deps);
}

function depsFor(account, caps) {
  return {
    async getPilotAccountFromRequest() {
      return account || null;
    },
    pilotAccountRequiresChangePassword(a) {
      return !!(a && a.must_change_password);
    },
    async resolveTmsStaffIdForLanternAccount() {
      if (!account || account.role === 'student') return null;
      return account.username === 'rradle' ? 'tms-rradle' : 'tms-teacher';
    },
    async callTmsNuggetsBridge(_env, sub) {
      if (sub !== 'staff/capabilities') return { ok: false };
      return { ok: true, capabilities: caps || { system_admin: false } };
    },
    async filterNewsRowsForHallwayTv(_db, rows) {
      return rows;
    },
    async filterRecognitionRowsForHallwayTv(_db, rows) {
      return rows;
    },
  };
}

{
  const admin = { username: 'rradle', role: 'teacher', display_name: 'Rick Radle' };
  const teacher = { username: 'kvezzani', role: 'teacher', display_name: 'Kristina Vezzani' };
  const student = { username: '20889', role: 'student', display_name: 'Lucas Reed' };

  const adminAccess = await resolveSystemAdminAccess(new Request('https://tmslantern.org/api/marquee/access'), {}, depsFor(admin, { system_admin: true }));
  assert(adminAccess.inspector === true, '17. SYSTEM_ADMIN inspector access');

  const teacherAccess = await resolveSystemAdminAccess(new Request('https://tmslantern.org/api/marquee/access'), {}, depsFor(teacher, { system_admin: false }));
  assert(teacherAccess.inspector === false, '18. ordinary teacher cannot inspect');

  const studentAccess = await resolveSystemAdminAccess(new Request('https://tmslantern.org/api/marquee/access'), {}, depsFor(student, { system_admin: true }));
  assert(studentAccess.inspector === false, '19. student cannot inspect even if bridge lies');

  const adminRes = await marqueeCall('/api/marquee/inspector', depsFor(admin, { system_admin: true }));
  const adminJson = await adminRes.json();
  assert(adminRes.status === 200 && adminJson.ok && adminJson.readonly === true && Array.isArray(adminJson.events), '17. SYSTEM_ADMIN can load inspector', adminJson.error);

  const teacherRes = await marqueeCall('/api/marquee/inspector', depsFor(teacher, { system_admin: false }));
  const teacherJson = await teacherRes.json();
  assert(teacherRes.status === 403 && teacherJson.ok === false, '18. ordinary teacher inspector 403');

  const studentRes = await marqueeCall('/api/marquee/inspector', depsFor(student, { system_admin: true }));
  const studentJson = await studentRes.json();
  assert(studentRes.status === 403 && studentJson.ok === false, '19. student inspector 403');

  const accessTeacher = await marqueeCall('/api/marquee/access', depsFor(teacher, { system_admin: false }));
  const accessTeacherJson = await accessTeacher.json();
  assert(accessTeacherJson.inspector === false, 'access endpoint hides inspector from teacher');

  const eventsRes = await marqueeCall('/api/marquee/events?limit=40', depsFor(student, { system_admin: false }));
  const eventsJson = await eventsRes.json();
  assert(eventsRes.status === 200 && eventsJson.ok && eventsJson.events.length <= 40, '27. public ticker endpoint still returns events');

  const hallway = await marqueeCall('/api/marquee/events?for_display=1', depsFor(null, {}));
  const hallwayJson = await hallway.json();
  assert(hallway.status === 200 && hallwayJson.ok, '28. Hallway TV for_display still loads shared ticker source');
}

/* ---------- inspector UI / read-only / Power Scroller ---------- */
{
  const explore = read('app/explore.html');
  const nav = read('app/js/lantern-nav.js');
  const inspector = read('app/js/lantern-marquee-inspector.js');
  const powerJs = read('app/js/lantern-power-list.js');
  const powerCss = read('app/css/lantern-power-list.css');
  const ticker = read('app/js/lantern-ticker.js');
  const display = read('app/display.html');
  const workerIndex = read('worker/index.js');
  const handlers = read('worker/marquee-handlers.js');
  const eventsSrc = read('worker/marquee-events.js');

  assert(/id="marqueeFeedBtn"/.test(nav) && /hidden/.test(nav.match(/id="marqueeFeedBtn"[^>]*/)[0]), '10. Explore toolbar Marquee Feed is hidden by default');
  assert(/lantern-marquee-inspector\.js/.test(explore) && /lantern-power-list\.js/.test(explore), '16. Explore loads inspector + Power Scroller');
  assert(/marqueeFeedInspector/.test(explore), 'inspector overlay mounted on Explore');
  assert(/LanternPowerList\.create/.test(inspector) && /lanternPowerList--marquee/.test(inspector), '16. inspector reuses LanternPowerList');
  assert(/lanternPowerList--marquee/.test(powerCss), '16. Power Scroller marquee column template');
  assert(!/Delete|Replay|Reorder|Force Publish|Restore|purge/i.test(inspector), '23. inspector source is read-only (no mutating actions)');
  assert(/\/api\/marquee\/access/.test(inspector) && !/username ===/.test(inspector), '10. no username authorization');
  assert(/renderExpanded/.test(inspector) && /Public sentence/.test(inspector), '22. compact/expand diagnostic details');
  assert(/defaultSort:\s*\{\s*key:\s*'date',\s*dir:\s*'desc'/.test(inspector), '20. newest-first default sort');
  assert(/\/api\/marquee\/events/.test(ticker) && /for_display=1/.test(ticker), '27/28. ticker consumes /api/marquee/events; Hallway passes for_display');
  assert(!/fallbackRecognitionNews/.test(ticker) && !/var recognitionUrl/.test(ticker), '20. ticker fail-closed; no recognition/news fallback');
  assert(/Eligible public ticker events only/.test(inspector), '21. inspector default is eligible public events');
  assert(/page-marquee-only/.test(display) && /lantern-ticker\.js/.test(display), '28. Hallway TV still uses lantern-ticker');
  assert(/detectLeaderboardEntryTransition/.test(workerIndex) && /withBoardEntryMeta/.test(workerIndex), '8. POST record flags entry transition only');
  const getLbIdx = workerIndex.indexOf("request.method === 'GET' && path === '/api/leaderboards'");
  const getLbSlice = getLbIdx >= 0 ? workerIndex.slice(getLbIdx, getLbIdx + 3500) : '';
  assert(getLbIdx >= 0 && !/marquee_board_entry/.test(getLbSlice), '29. GET leaderboard ranking does not depend on marquee flag');
  assert(/formatPublicStaffName/.test(eventsSrc) && /overlayNewsRowRecognizedStaff/.test(eventsSrc), '25. #135 formatter reused');
  assert(!/CREATE TABLE/.test(eventsSrc) && !/migrations\//.test(handlers), 'no-schema confirmation');
  assert(/staff\/capabilities/.test(handlers), 'inspector uses existing TMS SYSTEM_ADMIN capability');
  assert(powerJs.includes('function create(') && /lanternPowerListSearch/.test(powerJs), 'Power Scroller search/filter/sort still present');
}

/* ---------- worker identity stays server-derived on leaderboard POST ---------- */
{
  const workerIndex = read('worker/index.js');
  const sliceStart = workerIndex.indexOf("path === '/api/leaderboards/record'");
  const slice = workerIndex.slice(sliceStart, sliceStart + 9000);
  assert(/resolveEconomyGamePlayTransact/.test(slice) || /characterName/.test(slice), '16. leaderboard identity remains server-derived');
  assert(/delete meta.character_name/.test(slice) && /delete meta.username/.test(slice), '16. client identity fields stripped from meta');
}

/* ---------- ticker still builds items ---------- */
{
  const sandbox = {
    console,
    document: {
      getElementById: function () {
        return null;
      },
      body: { classList: { contains: function () { return false; } } },
      addEventListener: function () {},
    },
    location: { pathname: '/explore.html' },
    fetch: async function () {
      return { json: async function () { return { ok: false }; } };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('app/js/lantern-ticker.js'), sandbox);
  const slides = [
    { type: 'poll', title: 'New poll: Q', subtitle: 'Poll Created', meta: {} },
    { type: 'student_news', title: 'Band concert Friday', subtitle: 'News', meta: {} },
    { type: 'arcade_leader', title: 'Lucas joined the Avatar Match leaderboard', subtitle: 'Leaderboard Entry', meta: {} },
  ];
  const items = sandbox.LanternTicker.buildDisplayTickerItems(slides);
  assert(items.length === 3, '27. current marquee still renders poll/news/leaderboard slides', items.length);
  const heroes = sandbox.LanternTicker.getHeroCandidates(slides);
  assert(heroes.length === 3, 'getHeroCandidates includes poll + arcade_leader');
}

void jsonResponseLike;

if (fail) {
  console.error('\nFAILED', fail, 'passed', pass);
  process.exit(1);
}
console.log('\nOK', pass, 'checks');
