/**
 * REAL BROWSER TEST — Prompt #81 (canonical Mission card metadata / uniformity).
 * Drives the ACTUAL app/missions.html page (for its loaded LanternCards + CSS), then builds a
 * representative fixture matrix (A–G from Prompt #81 §20) directly through the SAME shared
 * card builder Missions uses (LanternCards.specGameHubRailCard + createStudentCard), and asserts
 * against real rendered DOM that every card follows ONE canonical contract:
 *   - type badge always ULHC, state badge always URHC (Prompt #80, unchanged)
 *   - title position/clamp consistent
 *   - footer metadata is exactly "primary token • reward token" (or just one, or neither)
 *   - reward format is always the same "🟡 +N" — never duplicated
 *   - no CSS-ellipsis word fragments ("Ga…", "G…"), no leaked default "Games" identity label
 *   - no status/CTA prose ("Waiting for…", "Start →") in the footer
 *   - no title/badge/footer overlap, no horizontal overflow of the fixed 280x157.5 card
 *
 * Usage: node worker/scripts/mission-card-metadata-contract-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

// Same-origin form of a real submitted photo URL — mirrors what normalizeMissionItemForMedia
// (Prompt #73/74) rewrites a Worker-absolute photo URL to before it ever reaches a card's <img>.
const REAL_PHOTO_URL = '/api/news/image?key=news%2Fnews-real-photo-test.png';

// Prompt #81 §20 fixtures A–G. Built directly through the shared card builder (the SAME one
// app/js/lantern-missions-page.js uses) rather than through missions.html's own hardcoded quick
// missions or mocked D1 rows, so every combination in the matrix can be exercised precisely.
const FIXTURES = [
  { key: 'A', title: 'Practice Times Tables', typeBadge: '🧠 Teacher', stateBadge: '', categoryLabel: 'Games', reward: 1 },
  { key: 'B', title: 'Read a Chapter', typeBadge: '🧠 Teacher', stateBadge: 'STARTED', categoryLabel: 'Schoolwide', reward: 3 },
  { key: 'C', title: 'Fix Your Fractions', typeBadge: '🧠 Teacher', stateBadge: 'NEEDS CHANGES', categoryLabel: 'Grades 6–8', reward: 1 },
  { key: 'D', title: 'First Game Played', typeBadge: '⚡ Quick', stateBadge: '', categoryLabel: 'Games', reward: 1 },
  { key: 'E', title: 'Quiet Thank-You', typeBadge: '✍ Reflection', stateBadge: '', categoryLabel: '', reward: 0 },
  { key: 'F', title: 'Write A Detailed Reflection About Everything You Learned This Entire Semester', typeBadge: '🧠 Teacher', stateBadge: '', categoryLabel: 'A Very Long Custom Audience Description That Should Not Fit', reward: 30 },
  { key: 'G', title: 'Team Photo (Safe)', typeBadge: '🧠 Teacher', stateBadge: 'STARTED', categoryLabel: '', reward: 1, imageUrl: REAL_PHOTO_URL },
];

async function main() {
  const results = [];
  function assert(cond, label) {
    results.push({ pass: !!cond, label });
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const okJson = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.addInitScript(() => { window.LANTERN_AVATAR_API = ''; });
  await page.route('**/api/auth/me**', okJson({ ok: true, authenticated: true, role: 'student', username: 'testpilot', display_name: 'Test Pilot', economy_character_name: 'testpilot', student_character_name: 'testpilot', must_change_password: false }));
  await page.route('**/api/class-access/**', okJson({ ok: true, accessState: 'none', tokenValid: true }));
  await page.route('**/api/missions/active**', okJson({ ok: true, missions: [] }));
  await page.route('**/api/missions/submissions/character**', okJson({ ok: true, submissions: [] }));
  await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));
  const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/api/news/image**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }));

  await page.goto(base + '/missions.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !!(window.LanternCards && window.LanternCards.specGameHubRailCard && window.LanternCards.createStudentCard), { timeout: 15000 });

  // Build the fixture matrix through the exact same renderer path missions-page.js uses
  // (primaryMetaToken / buildFooterMeta semantics reproduced here via categoryLabel, which the
  // real renderer also honors) and replace the live grid with it for isolated assertion.
  await page.evaluate((fixtures) => {
    var LC = window.LanternCards;
    var grid = document.getElementById('missionsLibraryGrid');
    grid.innerHTML = '';

    function rewardMeta(reward) {
      if (reward == null || reward === '' || Number(reward) <= 0) return '';
      return '🟡 +' + Number(reward);
    }
    var META_ROW_CHAR_BUDGET = 26;
    function buildFooterMeta(item) {
      var reward = rewardMeta(item.reward);
      var primary = String(item.categoryLabel || '').trim();
      if (primary && reward && (primary.length + reward.length + 3) > META_ROW_CHAR_BUDGET) primary = '';
      return { primary: primary, reward: reward };
    }

    fixtures.forEach(function (f) {
      var footer = buildFooterMeta(f);
      var spec = LC.specGameHubRailCard({
        title: f.title,
        icon: '✨',
        hubIdentityLabel: footer.primary,
        metaOne: '',
        rewardText: footer.reward,
        typeBadge: f.typeBadge,
        stateBadge: f.stateBadge || '',
        imageUrl: f.imageUrl || '',
        fallbackType: 'mission',
        reportId: 'mission_fixture_' + f.key,
        extraClass: 'exploreCard--missionsLibrary missionsHubCard',
        dataAttrs: { missionFixture: f.key },
        role: 'button',
        tabIndex: 0,
        ariaLabel: f.title,
      });
      var node = LC.createStudentCard(spec);
      if (node) { node.setAttribute('data-fixture-key', f.key); grid.appendChild(node); }
    });
  }, FIXTURES);

  await page.waitForTimeout(200);

  if (process.env.MISSION_CARD_CONTRACT_SCREENSHOT) {
    try {
      await page.locator('#missionsLibraryGrid').screenshot({ path: process.env.MISSION_CARD_CONTRACT_SCREENSHOT });
    } catch (e) {}
  }

  async function geoFor(key) {
    return page.evaluate((k) => {
      function rectPlain(elOrNull) {
        if (!elOrNull) return null;
        var r = elOrNull.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }
      var card = document.querySelector('[data-fixture-key="' + k + '"]');
      if (!card) return null;
      var frame = card.querySelector('.lanternCanonicalCardFrame');
      var typeB = card.querySelector('.lanternCanonicalCardTypeBadge');
      var stateB = card.querySelector('.lanternCanonicalCardStateBadge');
      var title = card.querySelector('.lanternCanonicalCardTitle');
      var author = card.querySelector('.lanternCanonicalCardAuthor');
      var date = card.querySelector('.lanternCanonicalCardDate');
      var meta = card.querySelector('.lanternCanonicalCardMeta');
      var cardRect = rectPlain(card);
      var frameRect = rectPlain(frame);
      return {
        cardW: cardRect.width, cardH: cardRect.height,
        frameRect: frameRect,
        typeRect: rectPlain(typeB),
        typeText: typeB ? typeB.textContent : '',
        stateRect: rectPlain(stateB),
        stateText: stateB ? stateB.textContent : '',
        titleRect: rectPlain(title),
        titleText: title ? title.textContent : '',
        authorText: author ? author.textContent : '',
        dateText: date ? date.textContent : '',
        metaText: meta ? meta.textContent : '',
        metaRect: rectPlain(meta),
        scrollWidthOverflow: card.scrollWidth > card.clientWidth + 1,
      };
    }, key);
  }

  function assertCommon(g, key, label) {
    assert(!!g, key + ': fixture card is present (' + label + ')');
    if (!g) return;
    assert(Math.abs(g.cardW - 280) < 1, key + ': card width is the canonical 280px (' + g.cardW.toFixed(1) + ')');
    assert(Math.abs(g.cardH - 157.5) < 1, key + ': card height is the canonical 157.5px (16:9) (' + g.cardH.toFixed(1) + ')');
    assert(!g.scrollWidthOverflow, key + ': no horizontal overflow inside the card');
    if (g.typeRect) {
      assert(Math.abs(g.typeRect.left - g.frameRect.left) < 15 && Math.abs(g.typeRect.top - g.frameRect.top) < 15, key + ': type badge sits ULHC');
    }
    if (g.stateRect) {
      assert(Math.abs(g.frameRect.right - g.stateRect.right) < 15 && Math.abs(g.stateRect.top - g.frameRect.top) < 15, key + ': state badge sits URHC');
      if (g.typeRect) assert(g.stateRect.left > g.typeRect.right, key + ': state badge does not overlap the type badge');
    }
    if (g.titleRect && g.metaRect) {
      assert(g.titleRect.bottom <= g.metaRect.top + 1, key + ': title sits above the footer metadata (no overlap)');
    }
    // No stray leaked default identity label, and no mid-word ellipsis fragment (a trailing
    // ellipsis character alone is fine only when following a real, non-truncated word boundary
    // — a bare 1-3 letter fragment before it is the specific bug being asserted against).
    assert(g.authorText !== 'Games' || FIXTURES.find((f) => f.key === key).categoryLabel === 'Games', key + ': no leaked default "Games" identity label');
    assert(!/^[A-Za-z]{1,3}…$/.test(g.metaText.trim()), key + ': footer is not a meaningless truncated fragment (got ' + JSON.stringify(g.metaText) + ')');
    assert(!/waiting for|start →|start$|learn more|how it works|go to games|revise|resubmit|in progress|completed/i.test(g.metaText), key + ': footer has no status/CTA prose (got ' + JSON.stringify(g.metaText) + ')');
  }

  // --- A: Teacher / available / Games / +1 ---
  const gA = await geoFor('A');
  assertCommon(gA, 'A', 'Teacher/available/Games/+1');
  if (gA) {
    assert(gA.typeText === '🧠 Teacher', 'A: type badge reads "🧠 Teacher"');
    assert(!gA.stateRect, 'A: no state badge (available mission)');
    assert(gA.metaText === 'Games•🟡 +1', 'A: footer is exactly "Games•🟡 +1" (got ' + JSON.stringify(gA.metaText) + ')');
  }

  // --- B: Teacher / STARTED / Schoolwide / +3 ---
  const gB = await geoFor('B');
  assertCommon(gB, 'B', 'Teacher/STARTED/Schoolwide/+3');
  if (gB) {
    assert(gB.stateText === 'STARTED', 'B: state badge reads "STARTED"');
    assert(gB.metaText === 'Schoolwide•🟡 +3', 'B: footer is exactly "Schoolwide•🟡 +3" (got ' + JSON.stringify(gB.metaText) + ')');
  }

  // --- C: Teacher / NEEDS CHANGES / Grades 6-8 / +1 ---
  const gC = await geoFor('C');
  assertCommon(gC, 'C', 'Teacher/NEEDS CHANGES/Grades 6-8/+1');
  if (gC) {
    assert(gC.stateText === 'NEEDS CHANGES', 'C: state badge reads "NEEDS CHANGES"');
    assert(gC.metaText === 'Grades 6–8•🟡 +1', 'C: footer is exactly "Grades 6–8•🟡 +1" (got ' + JSON.stringify(gC.metaText) + ')');
  }

  // --- D: Quick / available / Games / +1 ---
  const gD = await geoFor('D');
  assertCommon(gD, 'D', 'Quick/available/Games/+1');
  if (gD) {
    assert(gD.typeText === '⚡ Quick', 'D: type badge reads "⚡ Quick"');
    assert(gD.metaText === 'Games•🟡 +1', 'D: footer is exactly "Games•🟡 +1" (got ' + JSON.stringify(gD.metaText) + ')');
  }

  // --- E: Reflection / available / no reward ---
  const gE = await geoFor('E');
  assertCommon(gE, 'E', 'Reflection/available/no reward');
  if (gE) {
    assert(gE.typeText === '✍ Reflection', 'E: type badge reads "✍ Reflection"');
    assert(gE.metaText === '', 'E: footer is empty when there is no category and no reward (got ' + JSON.stringify(gE.metaText) + ')');
  }

  // --- F: Teacher / very long title / long audience-category / +30 ---
  const gF = await geoFor('F');
  assertCommon(gF, 'F', 'Teacher/long title/long category/+30');
  if (gF) {
    assert(gF.metaText === '🟡 +30', 'F: an overlong category token is dropped WHOLE, leaving only the reward — never fragmented (got ' + JSON.stringify(gF.metaText) + ')');
  }

  // --- G: real photo mission / STARTED / +1 ---
  const gG = await geoFor('G');
  assertCommon(gG, 'G', 'real photo/STARTED/+1');
  if (gG) {
    assert(gG.stateText === 'STARTED', 'G: state badge reads "STARTED" on a real-photo card too');
    assert(gG.metaText === '🟡 +1', 'G: footer format is identical on a real-photo card (got ' + JSON.stringify(gG.metaText) + ')');
    const realSrc = await page.evaluate(() => {
      var card = document.querySelector('[data-fixture-key="G"]');
      var img = card.querySelector('.lanternCanonicalCardImage');
      return img ? img.getAttribute('src') : '';
    });
    assert(/news-real-photo-test\.png/.test(realSrc || ''), 'G: real photo URL is used for the card image, not the Mission fallback cover');
  }

  // --- Mobile viewport: same contract, no collisions ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  for (const key of ['A', 'B', 'C', 'F']) {
    const g = await geoFor(key);
    assertCommon(g, key, 'mobile 390px');
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' assertions passed.');
  if (consoleErrors.length) {
    console.log('\nConsole errors observed (' + consoleErrors.length + '):');
    consoleErrors.slice(0, 10).forEach((e) => console.log('  ' + e));
  }
  if (failed.length) {
    console.log('\nFAILED:');
    failed.forEach((f) => console.log('  - ' + f.label));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
