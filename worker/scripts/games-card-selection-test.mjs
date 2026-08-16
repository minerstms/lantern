/**
 * Prompt #151 — Games card click opens selection/pregame (does not silently no-op).
 * Usage: node worker/scripts/games-card-selection-test.mjs [baseUrl]
 * Requires static app server (default http://127.0.0.1:8765).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

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

// Static source checks (no browser)
const pageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');

if (pageJs.includes('wasDisabled') && pageJs.includes("open game. Try again")) {
  ok('proxyPlay no longer silently no-ops on missing/disabled triggers');
} else bad('proxyPlay silent-no-op guard');

if (/playBtn\.disabled\s*=\s*false/.test(gamesHtml) && !/playBtn\.disabled\s*=\s*n\s*<\s*minCost/.test(gamesHtml)) {
  ok('balance refresh does not disable off-DOM play triggers');
} else bad('play trigger disable on balance');

if ((gamesHtml.includes('done(false)') || gamesHtml.includes('done(false,')) && playerJs.includes('ok === false')) {
  ok('failed Start charge re-enables Start (done(false))');
} else bad('Start failure re-enable');

if (pageJs.includes('wireLibraryProxyClicks') && pageJs.includes('data-games-proxy-play')) {
  ok('shared library proxy click wiring present');
} else bad('shared proxy wiring');

// Every catalog playable game must have a matching trigger id in games.html
const catalogMatch = catalogJs.match(/playBtnId:\s*'([^']+)'/g) || [];
const playBtnIds = catalogMatch.map((s) => s.replace(/playBtnId:\s*'([^']+)'/, '$1'));
let allTriggers = true;
playBtnIds.forEach((id) => {
  if (!gamesHtml.includes('id="' + id + '"')) allTriggers = false;
});
if (playBtnIds.length >= 8 && allTriggers) {
  ok('every catalog playBtnId has a games.html trigger target (' + playBtnIds.length + ')');
} else bad('catalog→trigger coverage', playBtnIds.join(','));

async function browserChecks() {
  const browser = await chromium.launch();
  const okJson = (body) => (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  async function boot(available) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => {
      window.LANTERN_AVATAR_API = '';
      window.__lanternEconomyTransactHits = 0;
    });
    await page.route('**/api/auth/me**', okJson({
      ok: true,
      authenticated: true,
      role: 'student',
      username: 'testpilot',
      display_name: 'Test Pilot',
      economy_character_name: 'testpilot',
      student_character_name: 'testpilot',
      must_change_password: false,
    }));
    await page.route('**/api/class-access/**', okJson({ ok: true, accessState: 'none', tokenValid: true }));
    await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));
    await page.route('**/api/economy/balance**', okJson({
      ok: true,
      earned: available,
      spent: 0,
      available,
      character_name: 'testpilot',
    }));
    await page.route('**/api/economy/transact**', async (route) => {
      await page.evaluate(() => {
        window.__lanternEconomyTransactHits = (window.__lanternEconomyTransactHits || 0) + 1;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'insufficient', available }),
      });
    });
    await page.route('**/api/leaderboards**', okJson({ ok: true, entries: [] }));
    await page.route('**/api/games/**', okJson({ ok: true, characters: [] }));
    await page.route('**/api/feed/**', okJson({ ok: true, items: [] }));
    await page.route('**/api/trivia/live**', okJson({
      ok: true,
      questions: [
        {
          question: 'Test Q?',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 0,
          explanation: 'Because A',
        },
      ],
    }));
    await page.goto(base + '/games.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), {
      timeout: 20000,
    });
    await page.waitForSelector('#gamesLibraryGrid .gamesHubPlayCard[data-games-proxy-play]', { timeout: 20000 });
    await page.waitForTimeout(600);
    return page;
  }

  // Zero balance: arcade card must still open pregame (selection ≠ spend)
  {
    const page = await boot(0);
    await page.locator('#gamesPremiumGrid .gamesHubPlayCard[data-game-id="reaction"], #gamesLibraryGrid .gamesHubPlayCard[data-game-id="reaction"]').click({ force: true });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      overlayHidden: document.getElementById('lanternGamePlayerOverlay').hidden,
      phase: window.LanternGamePlayer && window.LanternGamePlayer.getPhase(),
      toast: (document.getElementById('toast') || {}).textContent || '',
    }));
    if (!r.overlayHidden && r.phase === 'pregame') {
      ok('zero-balance Reaction card opens pregame (no silent no-op)');
    } else bad('zero-balance Reaction selection', JSON.stringify(r));

    // Start should not spend; stay on pregame with Start re-enabled + persistent status (#163)
    await page.click('#lanternGamePlayerStartBtn');
    await page.waitForTimeout(700);
    const afterStart = await page.evaluate(() => {
      const status = document.getElementById('lanternGamePlayerPregameStatus');
      const cost = document.getElementById('lanternGamePlayerPregameCost');
      return {
        phase: window.LanternGamePlayer && window.LanternGamePlayer.getPhase(),
        startDisabled: document.getElementById('lanternGamePlayerStartBtn').disabled,
        startText: document.getElementById('lanternGamePlayerStartBtn').textContent,
        toast: (document.getElementById('toast') || {}).textContent || '',
        statusText: (status && status.textContent) || '',
        statusHidden: !status || status.hidden,
        costText: (cost && cost.textContent) || '',
        transactHits: window.__lanternEconomyTransactHits || 0,
      };
    });
    if (
      afterStart.phase === 'pregame' &&
      afterStart.startDisabled === false &&
      afterStart.startText === 'Start' &&
      afterStart.transactHits === 0 &&
      !afterStart.statusHidden &&
      /You need 1 Nugget to play/i.test(afterStart.statusText)
    ) {
      ok('zero-balance Start shows persistent insufficient message (no silent flash-back)');
    } else bad('zero-balance Start gate', JSON.stringify(afterStart));
    await page.close();
  }

  // All registered playable cards open pregame
  {
    const page = await boot(25);
    const gameIds = await page.evaluate(() =>
      [...document.querySelectorAll('#gamesPremiumGrid .gamesHubPlayCard[data-games-proxy-play], #gamesLibraryGrid .gamesHubPlayCard[data-games-proxy-play]')].map((c) =>
        c.getAttribute('data-game-id')
      )
    );
    let allOpen = true;
    const failures = [];
    for (const id of gameIds) {
      await page.evaluate(() => {
        if (window.LanternGamePlayer && window.LanternGamePlayer.isOpen()) {
          window.LanternGamePlayer.close({ skipExit: true, force: true });
        }
      });
      await page.locator('#gamesPremiumGrid .gamesHubPlayCard[data-game-id="' + id + '"], #gamesLibraryGrid .gamesHubPlayCard[data-game-id="' + id + '"]').click({ force: true });
      await page.waitForTimeout(350);
      const st = await page.evaluate(() => ({
        hidden: document.getElementById('lanternGamePlayerOverlay').hidden,
        phase: window.LanternGamePlayer && window.LanternGamePlayer.getPhase(),
      }));
      if (st.hidden || st.phase !== 'pregame') {
        allOpen = false;
        failures.push(id + ':' + JSON.stringify(st));
      }
    }
    if (allOpen && gameIds.length >= 8) {
      ok('all visible library cards open shared pregame (' + gameIds.length + ')');
    } else bad('library card selection coverage', failures.join(' | ') || 'count=' + gameIds.length);

    // Keyboard activation on focused card
    await page.evaluate(() => {
      if (window.LanternGamePlayer && window.LanternGamePlayer.isOpen()) {
        window.LanternGamePlayer.close({ skipExit: true, force: true });
      }
      const card = document.querySelector('#gamesLibraryGrid .gamesHubPlayCard[data-game-id="memory"]');
      if (card) card.focus();
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    const kb = await page.evaluate(() => ({
      hidden: document.getElementById('lanternGamePlayerOverlay').hidden,
      phase: window.LanternGamePlayer && window.LanternGamePlayer.getPhase(),
    }));
    if (!kb.hidden && kb.phase === 'pregame') ok('keyboard Enter on card opens pregame');
    else bad('keyboard card activation', JSON.stringify(kb));

    await page.close();
  }

  await browser.close();
}

await browserChecks().catch((e) => {
  bad('browser suite', String(e));
});

console.log('\ngames-card-selection-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
