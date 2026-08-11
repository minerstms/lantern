/**
 * Missions page — unified library, identity, modal workflow (Prompt #63).
 * Usage: node worker/scripts/missions-page-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const missionsPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const missionsCss = fs.readFileSync(path.join(root, 'app/css/lantern-missions-page.css'), 'utf8');
const feedCss = fs.readFileSync(path.join(root, 'app/css/lantern-feed.css'), 'utf8');
const pilotAuthJs = fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8');
const helpJs = fs.readFileSync(path.join(root, 'app/js/lantern-help.js'), 'utf8');

if (!missionsHtml.includes('Quick Missions') && !missionsHtml.includes('quickMissionsTrack')) {
  ok('Quick Missions rail retired from missions.html');
} else bad('Quick Missions rail still present');

if (!missionsHtml.includes('Available for You') && !missionsHtml.includes('Completed Missions')) {
  ok('old giant section headings removed');
} else bad('old section headings still present');

if (!missionsHtml.includes('CARD_MODE') && !missionsHtml.includes('data-lantern-rail-host')) {
  ok('no horizontal mission rail hosts');
} else bad('rail host markup still present');

if (missionsHtml.includes('id="missionsLibraryGrid"') && missionsHtml.includes('class="feedGrid"')) {
  ok('one unified mission library grid');
} else bad('unified grid missing');

// Prompt #73 Defect 2: Available/In Progress/Completed tabs collapsed into Active/Completed so a
// submitted mission never appears to "disappear" from the default view.
if (missionsHtml.includes('id="missionsStatusTabs"') && missionsHtml.includes('data-mission-status="active"') && !missionsHtml.includes('data-mission-status="in_progress"')) {
  ok('status tabs: Active default markup, no separate In Progress tab');
} else bad('status tabs missing/outdated');

if (missionsPageJs.includes("status: 'active'") && missionsPageJs.includes('isActiveStatus') && missionsPageJs.includes('completed')) {
  ok('missions page module supports Active (available+in_progress+returned) + Completed views');
} else bad('status view logic missing');

if (/id="missionsFiltersPanel"[^>]*\shidden/.test(missionsHtml)) {
  ok('filters collapsed by default');
} else bad('filters panel not collapsed');

if (missionsHtml.includes('lantern-feed.css') && missionsHtml.includes('lantern-missions-page.css')) {
  ok('shared feed + missions page CSS linked');
} else bad('CSS links missing');

if (missionsCss.includes('280px') && missionsCss.includes('1760px')) {
  ok('canonical grid geometry in missions CSS');
} else bad('grid geometry');

if (feedCss.includes('--feed-grid-max-width: 1760px')) {
  ok('shared feed max-width token');
} else bad('feed max-width token');

if (missionsHtml.includes('guardPilotPage({ mode: \'general\' }') && missionsHtml.includes('__bootMissionsPage')) {
  ok('Missions boots after guardPilotPage callback');
} else bad('guardPilotPage boot missing');

if (missionsHtml.includes('adoptedFromPilotMe') || missionsHtml.includes('getAdopted')) {
  ok('session identity via adoptedFromPilotMe');
} else bad('session identity missing');

if (!missionsHtml.match(/Select a student in Locker/i) && !helpJs.match(/Select a student in Locker/i)) {
  ok('Locker picker copy removed from student missions UX');
} else bad('Locker dependency copy still present');

if (!missionsHtml.match(/location\.(href|replace|assign)\s*=\s*['"]contribute\.html/)) {
  ok('no contribute.html redirect for mission submit');
} else bad('contribute redirect still used');

if (missionsHtml.includes('id="missionDetailOverlay"') && missionsHtml.includes('missionDetailPanel')) {
  ok('mission detail modal DOM present');
} else bad('mission detail modal missing');

if (missionsCss.includes('min(960px') && missionsCss.includes('@media (max-width: 640px)')) {
  ok('desktop modal width + phone fullscreen rules');
} else bad('modal responsive CSS');

if (missionsHtml.includes('credentials: \'include\'') && missionsHtml.includes('/api/missions/active')) {
  ok('mission API fetches send credentials');
} else bad('credentials on mission fetches');

if (pilotAuthJs.includes("'/missions': '/missions.html'")) {
  ok('pilot-auth maps /missions to /missions.html');
} else bad('/missions route normalization');

if (missionsHtml.includes('lantern-wallet.js') && missionsPageJs.includes('fetchMyBalance')) {
  ok('wallet display uses authoritative session helper');
} else bad('wallet integration');

if (missionsPageJs.includes('specGameHubRailCard') && missionsPageJs.includes('createStudentCard')) {
  ok('reuses shared Lantern card primitives');
} else bad('card primitives');

if (/typeBadge:\s*''/.test(missionsPageJs) && /Prompt #121/.test(missionsPageJs) && !/typeBadgeFor\(/.test(missionsPageJs)) {
  ok('Prompt #121: mission cards clear typeBadge (no Quick/Teacher/Create overlays)');
} else bad('type badges still wired into mission card faces');

if (missionsPageJs.includes('rewardMeta') && /Nugget/.test(missionsPageJs) && !missionsPageJs.includes('reward: 5')) {
  ok('reward display derived from item data with Nugget label');
} else bad('hardcoded rewards in page module');

if (missionsPageJs.includes('stateBadgeFor') && /COMPLETED/.test(missionsPageJs)) {
  ok('stateBadgeFor preserves STARTED/COMPLETED-style progress chips');
} else bad('state badge helper missing');

if (missionsPageJs.includes('LanternNav.onHeaderSearch')) {
  ok('mission-scoped header search wired');
} else bad('header search');

if (helpJs.includes('Active shows everything you can still work on') && !helpJs.includes('In Progress')) {
  ok('help copy matches Active/Completed unified library (Prompt #73 Defect 2)');
} else bad('help copy outdated');

// Mock workflow: buildUnifiedMissionItems status mapping
const buildFnMatch = missionsHtml.match(/function buildUnifiedMissionItems\([\s\S]*?return items;\s*\}/);
if (buildFnMatch) {
  const sandbox = {
    todayStr: () => '2026-08-07',
    WAVE2_MISSION: {
      daily: 'perm_daily_checkin',
      firstGame: 'perm_first_game',
      grade: 'perm_grade_reflection',
      photo: 'tmission_1773676581540_qzl0kx',
      poll: 'perm_create_a_poll',
      shout: 'perm_shoutout_someone',
      thankYou: 'perm_thank_you',
    },
    DAILY_CHECKIN_CHOICES: ['Ready', 'Okay', 'Tired', 'Need a reset'],
    openDailyCheckInPicker: function () {},
    openThankYouComposer: function () {},
    callClaimDailyCheckIn: function () { return Promise.resolve({ ok: true }); },
    callSendThankYou: function () { return Promise.resolve({ ok: true }); },
    loadMissions: function () {},
    openMissionSubmitModal: function () {},
    console,
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(buildFnMatch[0], sandbox);
    const items = sandbox.buildUnifiedMissionItems(
      { daily_checkin_last: '', hidden_nugget: false, first_game: false },
      [
        {
          id: 'm1',
          title: 'Thank-You Letter',
          description: 'Write a note',
          reward_amount: 5,
          submission_type: 'text',
        },
        {
          id: 'm2',
          title: 'Photo Mission',
          description: 'Snap a photo',
          reward_amount: 3,
          submission_type: 'image_url',
        },
        {
          id: 'm3',
          title: 'Returned Mission',
          description: 'Needs a redo',
          reward_amount: 2,
          submission_type: 'text',
        },
      ],
      [{ mission_id: 'm1', status: 'pending' }, { mission_id: 'm2', status: 'accepted' }, { mission_id: 'm3', status: 'returned' }],
      {}
    );
    const avail = items.filter((i) => i.status === 'available').length;
    const prog = items.filter((i) => i.status === 'in_progress').length;
    const done = items.filter((i) => i.status === 'completed').length;
    if (avail >= 1 && prog === 2 && done >= 1) {
      ok('status derivation: pending/returned → in_progress, accepted → completed');
    } else bad('status derivation counts', { avail, prog, done, total: items.length });
    // Prompt #73 Defect 2: pending/in_progress missions carry a STARTED stateBadge (with a
    // "Waiting for teacher" statusLabel) and stay in the Active bucket rather than a separate tab.
    const pendingItem = items.find((i) => i.id === 'm1');
    if (pendingItem && pendingItem.stateBadge === 'STARTED' && /waiting for teacher/i.test(pendingItem.statusLabel)) {
      ok('pending mission carries a STARTED badge + "Waiting for teacher" label (stays visible in Active)');
    } else bad('pending mission STARTED badge/label', pendingItem);
    const returnedItem = items.find((i) => i.id === 'm3');
    if (returnedItem && returnedItem.status === 'in_progress' && returnedItem.stateBadge === 'NEEDS CHANGES') {
      ok('returned mission carries a NEEDS CHANGES badge and stays in the Active bucket (status in_progress)');
    } else bad('returned mission NEEDS CHANGES badge', returnedItem);
    const dupIds = items.map((i) => i.id);
    if (new Set(dupIds).size === dupIds.length) {
      ok('no duplicate mission IDs in unified list');
    } else bad('duplicate mission IDs');
  } catch (e) {
    bad('buildUnifiedMissionItems mock run', e.message);
  }
} else bad('buildUnifiedMissionItems not found');

console.log('\nMissions page tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
