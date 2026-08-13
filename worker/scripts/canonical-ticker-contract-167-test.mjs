/**
 * Prompt #167 — canonical Lantern ticker contract.
 * Usage: node worker/scripts/canonical-ticker-contract-167-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  collectMarqueeEvents,
  eventsToTickerSlides,
  resolveMarqueeActorIdentity,
} from '../marquee-events.js';
import {
  TICKER_ICONS,
  TICKER_PRIMARY_ROLE,
  formatTickerCopy,
  looksLikeSystemLogTickerCopy,
  tickerDestinationForEvent,
  tickerIconForType,
  tickerNameAndRest,
} from '../marquee-ticker-contract.js';
import { buildStaffPublicNameIndex } from '../staff-public-name.js';

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
          if (s.includes('FROM lantern_pilot_accounts') && s.includes("'student'") && s.includes("'teacher'")) {
            return { results: [].concat(tables.staff || [], tables.students || []) };
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

const RICK = {
  username: 'rick.radle',
  display_name: 'Rick Radle',
  public_display_name: 'Mr. Radle',
  first_name: 'Rick',
  last_name: 'Radle',
  honorific: 'Mr.',
  role: 'teacher',
  staff_id: 4,
  teacher_id: 'T4',
};
const BEGANO = {
  username: 'frank.begano',
  display_name: 'Frank Begano',
  public_display_name: 'Mr. Begano',
  first_name: 'Frank',
  last_name: 'Begano',
  honorific: 'Mr.',
  role: 'teacher',
  staff_id: 8,
  teacher_id: 'T8',
};
const COLORADO = {
  username: 'eric.colorado',
  display_name: 'Eric Colorado',
  public_display_name: 'Mr. Colorado',
  first_name: 'Eric',
  last_name: 'Colorado',
  honorific: 'Mr.',
  role: 'teacher',
  staff_id: 13,
  teacher_id: 'T13',
};
const LUCAS = {
  username: '20889',
  display_name: 'Lucas Reed',
  public_display_name: 'Lucas',
  first_name: 'Lucas',
  last_name: 'Reed',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
};

function fixtureTables(extra) {
  return {
    staff: [RICK, BEGANO, COLORADO],
    students: [LUCAS],
    links: [{ lantern_username: 'rick.radle', tms_staff_id: 'Radle', is_primary: 1 }],
    people: [
      {
        content_kind: 'news',
        content_id: 'shout_1',
        person_kind: 'staff',
        person_key: 'eric.colorado',
        relationship: 'recognized',
        display_label: 'Mr. Colorado',
      },
    ],
    polls: [
      {
        id: 'poll_1',
        question: 'Best school lunch?',
        character_name: 'frank.begano',
        created_at: '2026-08-13T10:00:00.000Z',
        approved_at: '2026-08-13T10:00:00.000Z',
      },
    ],
    missions: [
      {
        id: 'mission_1',
        title: 'STEM Today',
        teacher_id: 'T4',
        teacher_name: 'Rick Radle',
        created_at: '2026-08-13T11:00:00.000Z',
        active: 1,
        archived: 0,
      },
    ],
    submissions: [
      {
        id: 'sub_1',
        mission_id: 'mission_1',
        character_name: '20889',
        submission_type: 'text',
        submission_content: 'Done',
        status: 'accepted',
        created_at: '2026-08-13T12:00:00.000Z',
        reviewed_at: '2026-08-13T12:01:00.000Z',
        mission_title: 'Student Handbook Challenge',
      },
    ],
    news: [
      {
        id: 'news_1',
        title: 'Field Day Friday',
        body: 'Bring water.',
        actor_id: 'rick.radle',
        author_name: 'Rick Radle',
        author_type: 'teacher',
        category: 'news',
        created_at: '2026-08-13T14:00:00.000Z',
        reviewed_at: '2026-08-13T14:00:00.000Z',
        status: 'approved',
        hidden_at: null,
      },
      {
        id: 'shout_1',
        title: 'Shout-out: Mr. Colorado',
        body: 'Recognizing: Mr. Colorado',
        actor_id: 'rick.radle',
        author_name: 'Rick Radle',
        author_type: 'teacher',
        category: 'shout_out',
        created_at: '2026-08-13T13:00:00.000Z',
        reviewed_at: '2026-08-13T13:00:00.000Z',
        status: 'approved',
        hidden_at: null,
      },
    ],
    recognition: [],
    leaderboard: [
      {
        id: 'lb_1',
        game_name: 'Avatar Match',
        character_name: '20889',
        score: 90,
        score_display: '90',
        meta_json: JSON.stringify({ marquee_board_entry: true, rank: 3 }),
        created_at: '2026-08-13T15:00:00.000Z',
      },
    ],
    ...(extra || {}),
  };
}

function loadTicker() {
  const sandbox = {
    console,
    document: {
      getElementById: function () {
        return null;
      },
      body: { classList: { contains: function () { return false; } }, contains: function () { return true; } },
      addEventListener: function () {},
    },
    location: { pathname: '/explore.html' },
    LANTERN_AVATAR_API: '',
    addEventListener: function () {},
    requestAnimationFrame: function (fn) {
      if (typeof fn === 'function') fn();
    },
    innerWidth: 1024,
    fetch: async function () {
      return { json: async function () { return { ok: false }; } };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('app/js/lantern-avatar.js'), sandbox);
  vm.runInNewContext(read('app/js/lantern-cards.js'), sandbox);
  vm.runInNewContext(read('app/js/lantern-ticker.js'), sandbox);
  return sandbox;
}

/* ---------- formatter / icons ---------- */
assert(tickerIconForType('mission_created') === '🎯' && tickerIconForType('mission_completed') === '🎯', 'M. Missions use 🎯');
assert(tickerIconForType('poll_created') === '📊', 'N. Polls use 📊');
assert(tickerIconForType('shout_out') === '⭐' && tickerIconForType('recognition') === '⭐', 'O. Shout-Outs use ⭐');
assert(tickerIconForType('news') === '📰', 'P. News uses 📰');
assert(tickerIconForType('leaderboard_entry') === '🏆', 'Q. leaderboard uses 🏆');
assert(TICKER_ICONS.mission_created !== '🏆', 'L. 🏆 is not used for Mission Created');
assert(TICKER_PRIMARY_ROLE.mission_created === 'creator', 'A. Mission Created primary = creator');
assert(TICKER_PRIMARY_ROLE.mission_completed === 'completer', 'A. Mission Completed primary = completer');
assert(TICKER_PRIMARY_ROLE.poll_created === 'creator', 'A. Poll Created primary = creator');
assert(TICKER_PRIMARY_ROLE.shout_out === 'recipient' && TICKER_PRIMARY_ROLE.recognition === 'recipient', 'I. Shout-Out primary = recipient');
assert(TICKER_PRIMARY_ROLE.news === 'author', 'A. News primary = author');
assert(TICKER_PRIMARY_ROLE.leaderboard_entry === 'player', 'A. Leaderboard primary = player');

assert(
  formatTickerCopy({ type: 'mission_created', primary_name: 'Mr. Radle', object_title: 'STEM Today' }) ===
    'Mr. Radle created a mission: STEM Today',
  'F. Mission Created copy'
);
assert(
  formatTickerCopy({ type: 'mission_completed', primary_name: 'Lucas', object_title: 'Student Handbook Challenge' }) ===
    'Lucas completed Student Handbook Challenge',
  'G. Mission Completed copy'
);
assert(
  formatTickerCopy({ type: 'poll_created', primary_name: 'Mrs. Glorioso', object_title: 'Best school lunch?' }) ===
    'Mrs. Glorioso created a poll: Best school lunch?',
  'H. Poll Created copy'
);
assert(
  formatTickerCopy({ type: 'shout_out', primary_name: 'Lucas', secondary_name: 'Mr. Radle' }) ===
    'Lucas got a Shout-Out from Mr. Radle',
  'J. Shout-Out copy'
);
assert(
  formatTickerCopy({ type: 'news', primary_name: 'Mrs. Russett', object_title: 'Field Day Friday' }) ===
    'Mrs. Russett posted: Field Day Friday',
  'K. News copy'
);
assert(
  formatTickerCopy({ type: 'leaderboard_entry', primary_name: 'Lucas', object_title: 'Stack Lab', rank: '3' }) ===
    'Lucas reached #3 in Stack Lab',
  '35. ranked leaderboard wording'
);
assert(
  formatTickerCopy({ type: 'leaderboard_entry', primary_name: 'Lucas', object_title: 'Stack Lab' }) ===
    'Lucas reached the Stack Lab leaderboard',
  '35b. unranked leaderboard wording'
);
assert(looksLikeSystemLogTickerCopy('Mission Created — New mission from Teacher: STEM Today'), 'system-log detector');
assert(!looksLikeSystemLogTickerCopy('Mr. Radle created a mission: STEM Today'), 'canonical copy is not system-log');

const split = tickerNameAndRest('Mr. Radle created a mission: Random Act of Kindness', 'Mr. Radle');
assert(split.name === 'Mr. Radle' && /created a mission:/.test(split.rest), '54. name split preserves full name');

assert(tickerDestinationForEvent('mission_created') === 'missions.html', '58. Mission destination');
assert(tickerDestinationForEvent('mission_completed') === 'missions.html', '58b. Mission completed destination');
assert(tickerDestinationForEvent('poll_created') === 'explore.html', '59. Poll destination');
assert(tickerDestinationForEvent('news') === 'explore.html', '60. News destination');
assert(tickerDestinationForEvent('shout_out') === 'explore.html', '61. Shout-Out destination');
assert(tickerDestinationForEvent('leaderboard_entry', { game_name: 'Avatar Match' }) === 'games.html?game=avatar-match', '62. leaderboard destination');
assert(tickerDestinationForEvent('unknown_type') === '', '63. unknown type is not linked');

/* ---------- collect live families ---------- */
const events = await collectMarqueeEvents(makeDb(fixtureTables()));
const byType = {};
events.forEach((e) => {
  byType[e.type] = (byType[e.type] || []).concat(e);
});
const mission = (byType.mission_created || [])[0];
const completed = (byType.mission_completed || [])[0];
const poll = (byType.poll_created || [])[0];
const shout = (byType.shout_out || [])[0];
const news = (byType.news || [])[0];
const lb = (byType.leaderboard_entry || [])[0];

assert(mission && mission.ticker_icon === '🎯', '1. Mission Created icon');
assert(mission && mission.ticker_primary_role === 'creator', '2. creator is primary');
assert(mission && mission.author_avatar_key === 'rick.radle', '3. creator avatar key');
assert(mission && mission.public_display_name === 'Mr. Radle', '4. canonical creator name');
assert(mission && mission.public_text === 'Mr. Radle created a mission: STEM Today', '5. Mission Created sentence', mission && mission.public_text);
assert(mission && !/Mission Created\s*—/.test(mission.public_text) && !/New mission from Teacher:/.test(mission.public_text), '6/7. no system-log Mission Created wording');
assert(mission && mission.destination === 'missions.html', '58c. collected Mission destination');

assert(completed && completed.ticker_icon === '🎯', '8. Mission Completed icon');
assert(completed && completed.ticker_primary_role === 'completer', '9. completer primary');
assert(completed && completed.author_avatar_key === '20889', '10. completer avatar key');
assert(completed && completed.public_display_name === 'Lucas', '11. completer name');
assert(completed && completed.public_text === 'Lucas completed Student Handbook Challenge', '12. Mission Completed sentence', completed && completed.public_text);

assert(poll && poll.ticker_icon === '📊', '13. Poll icon');
assert(poll && poll.author_avatar_key === 'frank.begano', '14. poll creator avatar');
assert(poll && poll.public_display_name === 'Mr. Begano', '15. poll creator name');
assert(poll && poll.public_text === 'Mr. Begano created a poll: Best school lunch?', '16. Poll sentence', poll && poll.public_text);

assert(shout && shout.ticker_icon === '⭐', '18. Shout-Out icon');
assert(shout && shout.ticker_primary_role === 'recipient', '19. recipient primary role');
assert(shout && shout.author_avatar_key === 'eric.colorado', '20. recipient avatar — not sender');
assert(shout && shout.author_avatar_key !== 'rick.radle', '24. sender avatar is not primary');
assert(shout && shout.public_display_name === 'Mr. Colorado', '21. recipient canonical name');
assert(shout && shout.secondary_display_name === 'Mr. Radle', '22. sender canonical name');
assert(shout && shout.public_text === 'Mr. Colorado got a Shout-Out from Mr. Radle', '23. Shout-Out sentence', shout && shout.public_text);

assert(news && news.ticker_icon === '📰', '25. News icon');
assert(news && news.author_avatar_key === 'rick.radle', '26. author avatar');
assert(news && news.public_display_name === 'Mr. Radle', '27. author name');
assert(news && news.public_text === 'Mr. Radle posted: Field Day Friday', '28. News sentence', news && news.public_text);

assert(lb && lb.ticker_icon === '🏆', '30. leaderboard icon');
assert(lb && lb.author_avatar_key === '20889', '31. player avatar');
assert(lb && lb.public_display_name === 'Lucas', '32. player name');
assert(lb && /Avatar Match/.test(lb.public_text) && !/avatar-match/.test(lb.public_text), '34. human game title');
assert(lb && lb.public_text === 'Lucas reached #3 in Avatar Match', '35c. collected rank wording', lb && lb.public_text);

events.forEach((e) => {
  if (!e.public_display_name) return;
  assert(
    !e.author_avatar_key || e.public_display_name,
    '36. name present when avatar key present'
  );
});
assert(
  mission.author_avatar_key === 'rick.radle' && mission.public_display_name === 'Mr. Radle',
  '36b. Mission name + avatar from same account'
);
assert(
  shout.author_avatar_key === 'eric.colorado' && shout.public_display_name === 'Mr. Colorado',
  '36c. Shout-Out name + avatar from same account'
);

/* ---------- historical re-resolve ---------- */
const renamed = { ...RICK, public_display_name: 'Coach Radle' };
const renamedEvents = await collectMarqueeEvents(makeDb(fixtureTables({ staff: [renamed, BEGANO, COLORADO] })));
const renamedMission = renamedEvents.find((e) => e.type === 'mission_created');
assert(renamedMission && renamedMission.public_display_name === 'Coach Radle', '37. changed public name updates historical render');
assert(renamedMission && renamedMission.public_text === 'Coach Radle created a mission: STEM Today', '37b. copy uses current name');
assert(renamedMission && renamedMission.author_avatar_key === 'rick.radle', '38. durable avatar key stays the account, not a snapshot image');

const staffIndex = buildStaffPublicNameIndex([RICK, BEGANO, COLORADO, LUCAS], []);
assert(!resolveMarqueeActorIdentity(staffIndex, ['Mr. Radle', 'Rick Radle']).author_avatar_key, '43. no fuzzy name match');
assert(!resolveMarqueeActorIdentity(staffIndex, ['Teacher', 'Student', 'Staff']).author_avatar_key, '43b. role labels are not accounts');

/* ---------- hidden content ---------- */
const hiddenEvents = await collectMarqueeEvents(
  makeDb(
    fixtureTables({
      polls: [
        {
          id: 'poll_hidden',
          question: 'Hidden?',
          character_name: 'rick.radle',
          approved_at: '2026-08-13T10:00:00.000Z',
          created_at: '2026-08-13T10:00:00.000Z',
          hidden_at: '2026-08-13T18:00:00.000Z',
        },
      ],
      missions: [
        {
          id: 'mission_archived',
          title: 'Gone',
          teacher_id: 'T4',
          created_at: '2026-08-13T11:00:00.000Z',
          active: 0,
          archived: 1,
        },
      ],
      submissions: [],
      news: [
        {
          id: 'news_hidden',
          title: 'Hidden News',
          body: 'nope',
          actor_id: 'rick.radle',
          author_type: 'teacher',
          category: 'news',
          status: 'approved',
          created_at: '2026-08-13T14:00:00.000Z',
          reviewed_at: '2026-08-13T14:00:00.000Z',
          hidden_at: '2026-08-13T18:00:00.000Z',
        },
        {
          id: 'shout_hidden',
          title: 'Shout-out: Hidden',
          body: 'Recognizing: Hidden',
          actor_id: 'rick.radle',
          author_type: 'teacher',
          category: 'shout_out',
          status: 'approved',
          created_at: '2026-08-13T13:00:00.000Z',
          reviewed_at: '2026-08-13T13:00:00.000Z',
          hidden_at: '2026-08-13T18:00:00.000Z',
        },
      ],
      leaderboard: [],
      people: [],
    })
  )
);
assert(!hiddenEvents.some((e) => e.source_id === 'mission_archived'), '47. hidden/archived Mission absent');
assert(!hiddenEvents.some((e) => e.source_id === 'poll_hidden'), '48. hidden Poll absent');
assert(!hiddenEvents.some((e) => e.source_id === 'shout_hidden'), '49. hidden Shout-Out absent');
assert(!hiddenEvents.some((e) => e.source_id === 'news_hidden'), '50. hidden News absent');
assert(hiddenEvents.every((e) => e.destination), '51. remaining events still have destinations only when emitted');

/* ---------- slides + client renderer ---------- */
const slides = eventsToTickerSlides(events);
const missionSlide = slides.find((s) => s.meta && s.meta.marquee_type === 'mission_created');
assert(missionSlide && missionSlide.subtitle === '', '70. slides do not carry type_label as subtitle prefix');
assert(missionSlide && missionSlide.meta.ticker_icon === '🎯', '1b. slide icon');
assert(missionSlide && missionSlide.meta.destination === 'missions.html', '58d. slide destination');
assert(missionSlide && missionSlide.meta.public_display_name === 'Mr. Radle', '4b. slide name');

const sandbox = loadTicker();
const LT = sandbox.LanternTicker;
const CTC = sandbox.LanternTickerContract;
assert(CTC && CTC.formatTickerCopy({ type: 'mission_created', primary_name: 'Mr. Radle', object_title: 'X' }) === 'Mr. Radle created a mission: X', 'X. client shares canonical formatter');
assert(CTC.tickerIconForType('mission_created') === '🎯', 'X. client icon map matches');

function withAvatar(slide, url) {
  const s = JSON.parse(JSON.stringify(slide));
  s.meta = s.meta || {};
  s.meta._canonicalAvatar = { imageUrl: url };
  return s;
}

const items = LT.buildDisplayTickerItems(
  slides.map((s) => withAvatar(s, s.meta.author_avatar_key ? '/api/avatar/image?key=' + s.meta.author_avatar_key + '&v=1' : ''))
);
const missionItem = items.find((it) => it.primaryName === 'Mr. Radle' && /created a mission:/.test(it.rest || it.text || ''));
assert(missionItem && missionItem.icon === '🎯', '1c. rendered Mission icon');
assert(missionItem && missionItem.primaryName === 'Mr. Radle', '54b. rendered name is not truncated in JS');
assert(missionItem && /created a mission: STEM Today/.test(missionItem.rest), '5b. rendered rest is the action/object');
assert(missionItem && /avatar\/image\?key=rick\.radle/.test(missionItem.avatarUrl), '3b. current approved avatar URL');
assert(missionItem && missionItem.href === 'missions.html', '58e. rendered Mission link');
assert(!looksLikeSystemLogTickerCopy(missionItem.ariaLabel), '6b. rendered label is not system-log');

const shoutItem = items.find((it) => it.primaryName === 'Mr. Colorado');
assert(shoutItem && shoutItem.icon === '⭐', '18b. rendered Shout-Out icon');
assert(shoutItem && /got a Shout-Out from Mr\. Radle/.test(shoutItem.rest), '23b. rendered Shout-Out rest');
assert(shoutItem && /key=eric\.colorado/.test(shoutItem.avatarUrl), '20b. recipient avatar rendered');
assert(shoutItem && !/key=rick\.radle/.test(shoutItem.avatarUrl), '24b. sender avatar not on Shout-Out chip');

const lbItem = items.find((it) => it.icon === '🏆');
assert(lbItem && lbItem.primaryName === 'Lucas', '32b. leaderboard name');
assert(items.filter((it) => it.icon === '🏆').length === 1, 'L. only leaderboard uses 🏆 among these families');

const staleSlide = withAvatar(missionSlide, '/api/avatar/image?key=avatar_NOW&v=9');
staleSlide.meta.author_avatar_url = 'https://pub-xxxx.r2.dev/old.png';
staleSlide.meta.avatar_image = 'https://example.com/stale-snapshot.png';
const staleItem = LT.buildDisplayTickerItems([staleSlide])[0];
assert(/avatar_NOW/.test(staleItem.avatarUrl), '38. current approved avatar wins');
assert(!/stale-snapshot|r2\.dev/.test(JSON.stringify(staleItem)), '41/42. stale snapshot and raw R2 are not authoritative');

const pendingSlide = withAvatar(missionSlide, '/api/avatar/image?key=avatar_NOW&v=9');
pendingSlide.meta.pending_avatar_url = '/api/avatar/image?key=pending_raw';
pendingSlide.meta.rejected_avatar_url = '/api/avatar/image?key=rejected_raw';
const pendingItem = LT.buildDisplayTickerItems([pendingSlide])[0];
assert(/avatar_NOW/.test(pendingItem.avatarUrl), '39/40. pending/rejected never selected');
assert(!/pending_raw|rejected_raw/.test(pendingItem.avatarUrl), '39b. pending URL unused');

const noAvatarSlide = JSON.parse(JSON.stringify(missionSlide));
noAvatarSlide.meta._canonicalAvatar = { imageUrl: '' };
const noAvatarItems = LT.buildDisplayTickerItems([noAvatarSlide]);
assert(noAvatarItems[0] && !noAvatarItems[0].avatarUrl, '44. no approved avatar → empty avatarUrl (generic person at render)');

const container = { querySelector: function () { return null; }, style: {}, innerHTML: '' };
sandbox.document.getElementById = function (id) {
  return id === 'lanternTicker' ? container : null;
};
LT.render('lanternTicker', noAvatarItems);
assert(
  /default_avatar|data:image\/svg\+xml/.test(container.innerHTML),
  '44b/V. generic person silhouette used when approved avatar missing',
  container.innerHTML.slice(0, 280)
);
assert(/lanternTickerItemName/.test(container.innerHTML) && /Mr\. Radle/.test(container.innerHTML), '54c. name class preserved');
assert(/lanternTickerItemRest/.test(container.innerHTML), '55. object/title is the rest span');

LT.render('lanternTicker', [LT.FALLBACK_TICKER_ITEM]);
assert(!/lanternTickerItemAvatar/.test(container.innerHTML), '45/W. system fallback has no person silhouette');
assert(/Lantern — News/.test(container.innerHTML), '45b. system fallback copy');

LT.render('lanternTicker', [missionItem]);
assert(/aria-label="Mr\. Radle created a mission: STEM Today"/.test(container.innerHTML), 'a11y label is the public sentence');
assert(/alt=""/.test(container.innerHTML), 'avatar is decorative beside the name');
assert(/href="missions.html"/.test(container.innerHTML), '58f. clickable Mission destination');

const noDest = Object.assign({}, missionItem, { href: '' });
LT.render('lanternTicker', [noDest]);
assert(!/<a class="lanternTickerItemLink"/.test(container.innerHTML), '63b. unavailable destination not linked');

const css = read('app/css/lantern-ticker.css');
assert(/lanternTickerItemName\{[\s\S]*flex-shrink:\s*0/.test(css.replace(/\s+/g, '')), '54. CSS keeps name from shrinking');
assert(/lanternTickerItemRest\{[\s\S]*text-overflow:ellipsis/.test(css.replace(/\s+/g, '')), '55. object/title ellipsis first');
assert(/white-space:\s*nowrap/.test(css), '56. desktop ticker stays one line');
assert(/max-width:\s*640px[\s\S]*lanternTickerItemAvatar\{[\s\S]*flex-shrink:\s*0/.test(css.replace(/\s+/g, '')), '57. narrow width keeps avatar');

const tickerSrc = read('app/js/lantern-ticker.js');
const eventsSrc = read('worker/marquee-events.js');
assert(/marquee_type/.test(tickerSrc) && /LanternTickerContract/.test(tickerSrc), 'X. one client contract');
assert(/formatTickerCopy/.test(eventsSrc) && /marquee-ticker-contract/.test(eventsSrc), 'X. worker uses shared formatter');
assert(!/byDisplayName/.test(eventsSrc), '43c. no display-name avatar index');
assert(!/r2\.dev|r2\.cloudflarestorage/.test(tickerSrc), '42. no raw R2 in ticker');
assert(/author_avatar_key \|\| n\.actor_id/.test(tickerSrc), 'Y. #161 canonical avatar lookup preserved');
assert(!/fallbackRecognitionNews/.test(tickerSrc) && /Fail closed/.test(tickerSrc), 'T. #146 fail-closed preserved');

const pages = ['app/admin.html', 'app/explore.html', 'app/teacher.html', 'app/games.html', 'app/missions.html', 'app/display.html'];
pages.forEach((p) => {
  const html = read(p);
  assert(/js\/lantern-ticker\.js/.test(html), '64-69. ' + p + ' uses shared ticker');
  assert(/css\/lantern-ticker\.css/.test(html), '64-69. ' + p + ' uses shared ticker CSS');
});
assert(/\/api\/marquee\/events/.test(read('app/js/lantern-ticker.js')), '70. Display/headers share /api/marquee/events');
assert(/for_display/.test(read('app/js/lantern-ticker.js')), '70b. Hallway Display uses same feed with for_display');

console.log('\ncanonical-ticker-contract-167-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
