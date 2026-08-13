/**
 * Prompt #160 — Trinidad History Mission is sponsored/free; direct Local History stays paid.
 * Usage: node worker/scripts/trinidad-mission-sponsored-160-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  EDUCATIONAL_TRIVIA_MISSIONS,
  EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
  resolveEducationalTriviaMissionForGame,
} from '../educational-trivia-missions.js';
import { LOCAL_HISTORY_TRIVIA_BANK, HANDBOOK_TRIVIA_BANK } from '../educational-trivia-banks.js';
import { LANTERN_LEADERBOARD_GAMES } from '../lantern-game-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const clientSrc = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const missionsPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const eduSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');

const sandbox = { window: {}, crypto: { randomUUID: () => 'uuid-test' }, URLSearchParams };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(clientSrc, sandbox);
const EDU = sandbox.window.LANTERN_EDU_TRIVIA;

const loc = (search) => ({ search: search });

if (EDU.SPONSORED_FREE_MISSION_ID === 'perm_local_history_trivia') ok('1. exact Mission ID recognized');
else bad('1 mission id');

if (EDU.SPONSORED_FREE_GAME_ID === 'local-history-trivia') ok('2. exact game ID recognized');
else bad('2 game id');

if (EDU.isSponsoredFreePair('perm_local_history_trivia', 'local-history-trivia') && EDU.isSponsoredFreeLaunch(loc('?game=local-history-trivia&mission=perm_local_history_trivia'), 'Local History Trivia')) {
  ok('3. correct Mission/game pairing is free');
} else bad('3 pairing');

if (!EDU.isSponsoredFreeLaunch(loc('?game=local-history-trivia'), 'Local History Trivia') && !EDU.isSponsoredFreeLaunch(loc(''), 'Local History Trivia')) {
  ok('4. direct Local History play is not sponsored');
} else bad('4 direct not sponsored');

if (!EDU.isSponsoredFreeLaunch(loc('?game=local-history-trivia&mission=fake_mission'), 'Local History Trivia')) {
  ok('5. fake mission ID does not bypass charge');
} else bad('5 fake mission');

if (!EDU.isSponsoredFreeLaunch(loc('?game=handbook-trivia&mission=perm_local_history_trivia'), 'Handbook Trivia')) {
  ok('6. valid Mission + wrong game does not bypass charge');
} else bad('6 wrong game');

if (
  !EDU.isSponsoredFreeLaunch(loc('?game=reaction&mission=perm_local_history_trivia'), 'Reaction Tap') &&
  !EDU.isSponsoredFreeLaunch(loc('?game=clickrush&mission=perm_local_history_trivia'), 'Nugget Click Rush') &&
  !EDU.isSponsoredFreeLaunch(loc('?mission=perm_local_history_trivia'), 'Handbook Trivia')
) {
  ok('7. query-string manipulation cannot make another game free');
} else bad('7 query bypass');

if (
  gamesHtml.includes('isSponsoredFreeLaunch') &&
  gamesHtml.includes('if (sponsored)') &&
  gamesHtml.includes('LanternGamesPaidStart.startPaidGame')
) {
  ok('8/9. sponsored start skips charge; other starts still call startPaidGame');
} else bad('8/9 charge skip');

if (
  missionsPageJs.includes("item.id === 'perm_local_history_trivia'") &&
  missionsPageJs.includes("return 'FREE · +1 Nugget'") &&
  missionsPageJs.includes('assets/icons/nugget.png') &&
  missionsPageJs.includes("return '🟡 +1 Nugget'")
) {
  ok('10/11. Mission card shows +1 Nugget with canonical icon and FREE; other cards keep 🟡 +1 Nugget');
} else bad('10/11 card copy');

if (
  playerJs.includes('sponsoredFreeMission') &&
  playerJs.includes('FREE TO PLAY') &&
  playerJs.includes('assets/icons/nugget.png') &&
  playerJs.includes('+1 Nugget') &&
  playerJs.includes('setSponsoredMissionPregameCost') &&
  playerJs.includes("cost + ' Nugget = 1 Play'")
) {
  ok('12/13/14/15. mission pregame FREE + icon reward; direct pregame keeps paid copy');
} else bad('12-15 pregame');

if (EDUCATIONAL_TRIVIA_REWARD_NUGGETS === 1 && eduSrc.includes('completeMissionByEvent') && eduSrc.includes('creditMissionApprovalReward') === false) {
  ok('17. reward remains exactly +1 via existing mission completion path');
} else if (EDUCATIONAL_TRIVIA_REWARD_NUGGETS === 1 && eduSrc.includes('completeMissionByEvent')) {
  ok('17. reward remains exactly +1 via existing mission completion path');
} else bad('17 reward path');

if (
  EDU.launchUrl('perm_local_history_trivia', { replay: true }).indexOf('mission=perm_local_history_trivia') !== -1 &&
  EDU.launchUrl('perm_handbook_trivia', { replay: true }).indexOf('mission=') === -1
) {
  ok('19. Trinidad replay stays in Mission context; Handbook replay unchanged');
} else bad('19 replay urls', {
  tr: EDU.launchUrl('perm_local_history_trivia', { replay: true }),
  hb: EDU.launchUrl('perm_handbook_trivia', { replay: true }),
});

if (LOCAL_HISTORY_TRIVIA_BANK.length === 50 && !/Tobago|Caribbean|Port of Spain|West Indies/.test(contentSrc)) {
  ok('21. Trinidad bank remains 50 with no Tobago content');
} else bad('21 bank');

if (LOCAL_HISTORY_TRIVIA_BANK.length === 50 && contentSrc.includes('What bluff overlooks Trinidad from the north?')) {
  ok('22. client bank still matches approved Q1');
} else bad('22 parity smoke');

if (HANDBOOK_TRIVIA_BANK.length === 50 && catalogSrc.includes("id: 'handbook-trivia'") && /play_cost:\s*1/.test(catalogSrc)) {
  ok('23/24. Handbook and other game costs unaffected');
} else bad('23/24 handbook/costs');

if (
  workerIndex.includes('findPaidGamePlayByRunId') &&
  workerIndex.includes('evaluatePaidGamePlayRun') &&
  gamesHtml.includes('getLastRunId') &&
  gamesHtml.includes('generateMissionRunId') &&
  !gamesHtml.includes('startPaidGame') === false
) {
  ok('25. #159 paid-run proof remains; free Mission does not invent a game_play');
} else bad('25 #159');

if (missionsHtml.includes('public_display_name') || fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8').includes('public_display_name')) {
  ok('26. #151 identity helpers still present');
} else bad('26 identity');

if (!eduSrc.includes('CREATE TABLE') && !clientSrc.includes('localStorage') && paidStartJs.includes("kind: 'game_play'")) {
  ok('27. no parallel wallet added');
} else bad('27 wallet');

if (resolveEducationalTriviaMissionForGame('perm_local_history_trivia', 'reaction') == null) {
  ok('pairing helper still rejects wrong game');
} else bad('server pairing');

const otherIds = LANTERN_LEADERBOARD_GAMES.filter((g) => g.id !== 'local-history-trivia').map((g) => g.id);
if (otherIds.every((id) => !EDU.isSponsoredFreePair('perm_local_history_trivia', id))) {
  ok('other catalog games cannot be sponsored by Trinidad Mission');
} else bad('other games sponsored');

if (
  gamesHtml.includes("if (!mission.sponsored_free) clearMissionQuery()") &&
  gamesHtml.includes('if (start && start.already_completed && !mission.sponsored_free) clearMissionQuery()')
) {
  ok('Trinidad in-game replay keeps Mission context');
} else bad('in-game replay query');

if (playerJs.includes('1 Nugget = 1 Play') || playerJs.includes("cost + ' Nugget = 1 Play'")) {
  ok('direct pregame paid copy still in Game Player');
} else bad('direct paid copy');

console.log('\nTrinidad sponsored Mission #160:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
