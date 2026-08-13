/**
 * Prompt #161 — marquee / ticker uses each account's current approved avatar.
 * Usage: node worker/scripts/marquee-canonical-avatars-161-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  collectMarqueeEvents,
  eventsToTickerSlides,
  resolveMarqueeActorIdentity,
  avatarProfileKeyForAccountRow,
} from '../marquee-events.js';
import { buildStaffPublicNameIndex } from '../staff-public-name.js';
import { collectMarqueeEvents as collect146 } from '../marquee-events.js';

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
          if (s.includes('FROM lantern_pilot_accounts') && s.includes("'student'") && s.includes("'teacher'")) {
            return { results: [].concat(tables.staff || [], tables.students || []) };
          }
          if (s.includes('FROM lantern_pilot_accounts') && s.includes("'student'")) return { results: tables.students || [] };
          if (s.includes('FROM lantern_pilot_accounts')) return { results: tables.staff || [] };
          if (s.includes('FROM tms_identity_links')) return { results: tables.links || [] };
          if (s.includes('FROM lantern_content_people')) return { results: tables.people || [] };
          if (s.includes('FROM lantern_avatar_profiles')) return { results: tables.profiles || [] };
          if (s.includes('FROM lantern_avatar_submissions')) return { results: tables.submissionsAvatar || [] };
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
  public_display_name: 'Lucas R.',
  first_name: 'Lucas',
  last_name: 'Reed',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
};
const NOAVATAR = {
  username: 'no.avatar',
  display_name: 'No Avatar',
  public_display_name: 'Ms. None',
  first_name: 'No',
  last_name: 'None',
  honorific: 'Ms.',
  role: 'teacher',
  staff_id: 99,
  teacher_id: 'T99',
};

function fixtureTables(extra) {
  return {
    staff: [RICK, BEGANO, COLORADO, NOAVATAR],
    students: [LUCAS],
    links: [{ lantern_username: 'rick.radle', tms_staff_id: 'Radle', is_primary: 1 }],
    people: [
      {
        content_kind: 'news',
        content_id: 'shout_begano_colorado',
        person_kind: 'staff',
        person_key: 'eric.colorado',
        relationship: 'recognized',
        display_label: 'Mr. Colorado',
      },
    ],
    polls: [
      {
        id: 'poll_rick',
        question: 'Best hallway snack?',
        character_name: 'rick.radle',
        created_at: '2026-08-13T10:00:00.000Z',
        approved_at: '2026-08-13T10:00:00.000Z',
      },
    ],
    missions: [
      {
        id: 'mission_rick',
        title: 'Photo Walk',
        teacher_id: 'T4',
        teacher_name: 'Rick Radle',
        created_at: '2026-08-13T11:00:00.000Z',
        active: 1,
        archived: 0,
      },
    ],
    submissions: [
      {
        id: 'sub_lucas',
        mission_id: 'mission_rick',
        character_name: '20889',
        submission_type: 'text',
        submission_content: 'Done',
        status: 'accepted',
        created_at: '2026-08-13T12:00:00.000Z',
        reviewed_at: '2026-08-13T12:01:00.000Z',
        mission_title: 'Photo Walk',
      },
    ],
    news: [
      {
        id: 'news_rick',
        title: 'Band concert Friday',
        body: 'Come hear the band.',
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
        id: 'shout_begano_colorado',
        title: 'Shout-out: Mr. Colorado',
        body: 'Recognizing: Mr. Colorado',
        actor_id: 'frank.begano',
        author_name: 'Frank Begano',
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
        id: 'lb_lucas',
        game_name: 'Avatar Match',
        character_name: '20889',
        score: 90,
        score_display: '90',
        meta_json: JSON.stringify({ marquee_board_entry: true }),
        created_at: '2026-08-13T15:00:00.000Z',
      },
    ],
    ...(extra || {}),
  };
}

const staffIndex = buildStaffPublicNameIndex([RICK, BEGANO, COLORADO, NOAVATAR, LUCAS], [
  { lantern_username: 'rick.radle', tms_staff_id: 'Radle', is_primary: 1 },
]);

assert(avatarProfileKeyForAccountRow(RICK) === 'rick.radle', 'staff avatar PK is username');
assert(avatarProfileKeyForAccountRow(LUCAS) === '20889', 'student avatar PK is economy/MTSS key');

const fuzzy = resolveMarqueeActorIdentity(staffIndex, ['Mr. Radle', 'Rick Radle']);
assert(!fuzzy.author_avatar_key, '16. no fuzzy display-name avatar lookup', fuzzy);

const rickActor = resolveMarqueeActorIdentity(staffIndex, ['rick.radle']);
assert(rickActor.author_avatar_key === 'rick.radle' && rickActor.public_display_name === 'Mr. Radle', '9. name + avatar from same durable account');

const unknown = resolveMarqueeActorIdentity(staffIndex, ['not.a.real.account']);
assert(!unknown.author_avatar_key, '6. unknown account uses empty key (renderer fallback)');

const events = await collectMarqueeEvents(makeDb(fixtureTables()));
const byType = {};
events.forEach((e) => {
  byType[e.type] = (byType[e.type] || []).concat(e);
});

const poll = (byType.poll_created || [])[0];
assert(poll && poll.author_avatar_key === 'rick.radle', '10. poll-created uses creator avatar key', poll);
assert(poll && poll.public_display_name === 'Mr. Radle', '10b. poll public_display_name is Mr. Radle');

const news = (byType.news || [])[0];
assert(news && news.author_avatar_key === 'rick.radle', '11. News uses author avatar key', news);

const shout = (byType.shout_out || [])[0];
assert(shout && shout.author_avatar_key === 'eric.colorado', '14. Shout-Out chip is recognized person when durable key exists', shout);
assert(shout && shout.public_display_name === 'Mr. Colorado', '14b. Shout-Out name is recognized account');
assert(shout && /Mr\. Colorado/.test(shout.public_text) && /Mr\. Begano/.test(shout.public_text), '14c. sentence still names both people');

const mission = (byType.mission_created || [])[0];
assert(mission && mission.author_avatar_key === 'rick.radle', '12. Mission created uses creator avatar', mission);

const completed = (byType.mission_completed || [])[0];
assert(completed && completed.author_avatar_key === '20889', '13. Mission completed uses celebrated student', completed);
assert(completed && completed.public_display_name === 'Lucas R.', '13b. completion name from same student account');

const lb = (byType.leaderboard_entry || [])[0];
assert(lb && lb.author_avatar_key === '20889', '15. leaderboard event uses player avatar key', lb);
assert(lb && lb.public_display_name === 'Lucas R.', '15b. leaderboard name from same player account');

const slides = eventsToTickerSlides(events);
const pollSlide = slides.find((s) => s.meta && s.meta.marquee_type === 'poll_created');
assert(pollSlide && pollSlide.meta.author_avatar_key === 'rick.radle', '1. ticker slide carries durable author_avatar_key');
assert(pollSlide && pollSlide.meta.public_display_name === 'Mr. Radle', '1b. slide public_display_name matches account');

const shoutNoKey = await collectMarqueeEvents(
  makeDb(
    fixtureTables({
      people: [],
      news: [
        {
          id: 'shout_free_text',
          title: 'Shout-out: Mr. Colorado',
          body: 'Recognizing: Mr. Colorado',
          actor_id: 'frank.begano',
          author_name: 'Frank Begano',
          author_type: 'teacher',
          category: 'shout_out',
          created_at: '2026-08-13T13:00:00.000Z',
          reviewed_at: '2026-08-13T13:00:00.000Z',
          status: 'approved',
          hidden_at: null,
        },
      ],
    })
  )
);
const shoutFree = shoutNoKey.find((e) => e.type === 'shout_out');
assert(shoutFree && !shoutFree.author_avatar_key, '14d. Shout-Out without durable recognized key does not use sender avatar', shoutFree);
assert(shoutFree && shoutFree.author_avatar_key !== 'eric.colorado', '14e. does not guess Colorado from display text');
assert(
  shoutFree && /Mr\. Colorado/.test(shoutFree.public_text) && /Mr\. Begano/.test(shoutFree.public_text),
  '14f. recipient + sender labels still appear without fuzzy account match',
  shoutFree && shoutFree.public_text
);

const ghostPoll = await collectMarqueeEvents(
  makeDb(
    fixtureTables({
      polls: [
        {
          id: 'poll_ghost',
          question: 'Anyone there?',
          character_name: 'ghost.account',
          created_at: '2026-08-13T10:00:00.000Z',
          approved_at: '2026-08-13T10:00:00.000Z',
        },
      ],
    })
  )
);
const ghost = ghostPoll.find((e) => e.source_id === 'poll_ghost');
assert(ghost && !ghost.author_avatar_key, '6b. unlinked poll author has no avatar key');

const db = makeDb(fixtureTables());
await collectMarqueeEvents(db);
const sql = db.sqlLog.join('\n');
assert(!/lantern_avatar_submissions/.test(sql), '3/4. pending/rejected submission table never queried');
assert(!/status = 'pending'|status = 'rejected'/.test(sql), '3b. pending/rejected statuses never selected for marquee');
assert(!/r2\.dev|r2\.cloudflarestorage|AVATAR_BUCKET/.test(sql), '17. no raw R2 access in marquee collect');

events.forEach((e) => {
  const blob = JSON.stringify(e);
  assert(!/r2\.dev|r2\.cloudflarestorage/.test(blob), '17b. event payload has no raw R2 URL', e.id);
  assert(!/author_avatar_url|avatar_image/.test(blob) || !e.author_avatar_url, '8. no content snapshot avatar field on event');
});

const hidden = await collect146(
  makeDb({
    staff: [RICK],
    students: [LUCAS],
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
    missions: [{ id: 'mission_hidden', title: 'Hidden', teacher_id: 'T4', active: 0, archived: 0, created_at: '2026-08-13T11:00:00.000Z' }],
    submissions: [
      {
        id: 'sub_hidden',
        mission_id: 'mission_rick',
        character_name: '20889',
        status: 'accepted',
        submission_content: 'x',
        hidden_at: '2026-08-13T18:00:00.000Z',
        mission_title: 'Photo Walk',
        mission_active: 1,
        mission_archived: 0,
      },
    ],
    news: [
      {
        id: 'news_hidden',
        title: 'Hidden News',
        actor_id: 'rick.radle',
        author_name: 'Rick Radle',
        author_type: 'teacher',
        category: 'news',
        status: 'approved',
        hidden_at: '2026-08-13T18:00:00.000Z',
        created_at: '2026-08-13T14:00:00.000Z',
        reviewed_at: '2026-08-13T14:00:00.000Z',
      },
      {
        id: 'shout_hidden',
        title: 'Hidden Shout',
        actor_id: 'frank.begano',
        author_name: 'Frank Begano',
        author_type: 'teacher',
        category: 'shout_out',
        status: 'approved',
        hidden_at: '2026-08-13T18:00:00.000Z',
        created_at: '2026-08-13T13:00:00.000Z',
        reviewed_at: '2026-08-13T13:00:00.000Z',
      },
    ],
    recognition: [],
    leaderboard: [],
    people: [],
  })
);
assert(
  !hidden.some((e) => /hidden/i.test(String(e.source_id))),
  '18-21. hidden poll/news/shout/mission stay excluded even when accounts have avatars',
  hidden.map((e) => e.id)
);

const tickerSrc = read('app/js/lantern-ticker.js');
const avatarSrc = read('app/js/lantern-avatar.js');
const cardsSrc = read('app/js/lantern-cards.js');
const eventsSrc = read('worker/marquee-events.js');
const displaySrc = read('app/display.html');
const handlersSrc = read('worker/marquee-handlers.js');

assert(/author_avatar_key/.test(eventsSrc) && /resolveMarqueeActorIdentity/.test(eventsSrc), 'backend serializes durable author_avatar_key');
assert(!/byDisplayName/.test(eventsSrc), '16b. marquee actor resolver does not use display-name index');
assert(/Mr\. Radle/.test(eventsSrc) === false || !/guess/.test(eventsSrc), '16c. no name-guess comments that imply fuzzy match');
assert(/getDefaultAvatarImageUrl|svgDefaultAvatarDataUri/.test(tickerSrc), '7/22. ticker uses #149 placeholder helper');
assert(!/lanternTickerItemAvatar--emoji/.test(tickerSrc) || !/🌟/.test(tickerSrc.match(/function itemToHtml[\s\S]+?function /)[0]), '2. ticker person chip no longer hard-codes sun fallback');
assert(/author_avatar_key \|\| n\.actor_id/.test(tickerSrc), 'ticker still prefers author_avatar_key/actor_id');
assert(!/addName\(n\.author_name/.test(tickerSrc) && !/pick\(\[n\.author_avatar_key, n\.actor_id, n\.author_name/.test(tickerSrc), '8b. ticker does not look up avatars by author_name');
assert(/getDefaultAvatarImageUrl/.test(displaySrc) && /svgDefaultAvatarDataUri/.test(displaySrc), '24. Hallway uses same canonical placeholder');
assert(/eventsToTickerSlides/.test(handlersSrc) && /for_display/.test(handlersSrc), '24b. Hallway still consumes shared /api/marquee/events');
assert(/\/api\/avatar\/status/.test(avatarSrc) && /\/api\/avatar\/image\?key=/.test(read('worker/index.js')), 'canonical serving path preserved');
assert(!/r2\.dev|r2\.cloudflarestorage/.test(tickerSrc + displaySrc), '17c. frontend emits no raw R2');
assert(fs.existsSync(path.join(root, 'worker/scripts/canonical-avatar-identity-149-test.mjs')), '25. #149 test file remains');
assert(fs.existsSync(path.join(root, 'worker/scripts/public-display-identity-147-test.mjs')), '26. #147 test file remains');
assert(fs.existsSync(path.join(root, 'worker/scripts/marquee-hidden-lockdown-146-test.mjs')), '22b. #146 test file remains');
assert(/filterOutDemoPersonas/.test(eventsSrc), '23. demo/test persona filter preserved');
assert(!/lantern_avatar_profiles/.test(eventsSrc), '8c. marquee does not snapshot current_avatar_key into event rows');

const sandbox = {
  console,
  document: {
    getElementById: function () {
      return null;
    },
    body: { classList: { contains: function () { return false; } }, contains: function () { return true; } },
    addEventListener: function () {},
    createElement: function () {
      return { style: {}, classList: { add: function () {} }, setAttribute: function () {}, appendChild: function () {} };
    },
  },
  location: { pathname: '/explore.html' },
  LANTERN_AVATAR_API: '',
  addEventListener: function () {},
  requestAnimationFrame: function (fn) { if (typeof fn === 'function') fn(); },
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

const LT = sandbox.LanternTicker;
const LA = sandbox.LanternAvatar;
const LC = sandbox.LanternCards;
assert(typeof LA.svgDefaultAvatarDataUri === 'function', '22c. LanternAvatar exports #149 placeholder');
assert(typeof LC.getDefaultAvatarImageUrl === 'function', '22d. LanternCards placeholder still exported');

const slideA = {
  type: 'poll',
  title: 'New poll: Best hallway snack?',
  subtitle: 'Poll Created',
  meta: {
    author_avatar_key: 'rick.radle',
    public_display_name: 'Mr. Radle',
    author_avatar_url: 'https://example.com/stale-snapshot.png',
    avatar_image: 'https://example.com/stale-snapshot.png',
    _canonicalAvatar: { imageUrl: '/api/avatar/image?key=avatar_A&v=1' },
  },
};
const itemsA = LT.buildDisplayTickerItems([slideA]);
assert(itemsA[0] && /avatar_A/.test(itemsA[0].avatarUrl || ''), '1c. approved current avatar used in ticker item');
assert(itemsA[0] && !/stale-snapshot/.test(JSON.stringify(itemsA[0])), '8d. stale content snapshot cannot override current avatar');

const htmlA = LT.buildDisplayTickerItems([slideA]).map(function () {
  return null;
});
void htmlA;
const renderedA = (function () {
  var html = '';
  var orig = sandbox.document.getElementById;
  void orig;
  var container = { querySelector: function () { return null; }, style: {} };
  sandbox.document.getElementById = function () { return container; };
  try {
    /* itemToHtml is not exported — render through build + inspect avatarUrl, then reconstruct via public render path */
  } finally {
    sandbox.document.getElementById = orig;
  }
  return html;
})();
void renderedA;

slideA.meta._canonicalAvatar = { imageUrl: '/api/avatar/image?key=avatar_B&v=2' };
const itemsB = LT.buildDisplayTickerItems([slideA]);
assert(itemsB[0] && /avatar_B/.test(itemsB[0].avatarUrl || ''), '7. replacing current avatar changes render without rewriting the event');
assert(itemsB[0] && !/avatar_A/.test(itemsB[0].avatarUrl || ''), '7b. previous avatar A is gone after current key changes');

const noImg = {
  type: 'poll',
  title: 'Band concert Friday · Mr. Radle',
  subtitle: 'News',
  meta: { author_avatar_key: 'no.avatar', public_display_name: 'Ms. None', _canonicalAvatar: { imageUrl: '' } },
};
const itemsFb = LT.buildDisplayTickerItems([noImg]);
assert(itemsFb[0] && !itemsFb[0].avatarUrl, '5. no approved image → empty avatarUrl so renderer uses #149 placeholder');

const container = {
  querySelector: function () { return null; },
  style: {},
  innerHTML: '',
};
sandbox.document.getElementById = function (id) {
  return id === 'lanternTicker' ? container : null;
};
LT.render('lanternTicker', itemsA);
assert(/avatar_A/.test(container.innerHTML), '2b. rendered ticker HTML uses approved avatar URL');
assert(!/🌟/.test(container.innerHTML) || /lanternTickerItemIcon/.test(container.innerHTML), '2c. sun is not the person chip');
assert(!/stale-snapshot/.test(container.innerHTML), '8e. snapshot URL not in ticker HTML');

LT.render('lanternTicker', itemsFb);
assert(
  /default_avatar|data:image\/svg\+xml/.test(container.innerHTML),
  '5b. missing approved avatar uses #149 placeholder image',
  container.innerHTML.slice(0, 400)
);
assert(!/>🌟</.test(container.innerHTML), '5c. placeholder is not the sun emoji');

const pendingSlide = {
  type: 'student_news',
  title: 'News · Mr. Radle',
  subtitle: 'News',
  meta: {
    author_avatar_key: 'rick.radle',
    pending_avatar_url: '/api/avatar/image?key=pending_raw',
    rejected_avatar_url: '/api/avatar/image?key=rejected_raw',
    _canonicalAvatar: { imageUrl: '/api/avatar/image?key=avatar_A&v=1' },
  },
};
LT.render('lanternTicker', LT.buildDisplayTickerItems([pendingSlide]));
assert(/avatar_A/.test(container.innerHTML), '3c. current approved used when pending/rejected fields exist');
assert(!/pending_raw|rejected_raw/.test(container.innerHTML), '3/4. pending/rejected URLs never rendered');

assert(/filterOutDemoPersonas/.test(eventsSrc) && /isHiddenAtSet/.test(eventsSrc), '23b. eligibility helpers unchanged');

console.log('\nmarquee-canonical-avatars-161-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
