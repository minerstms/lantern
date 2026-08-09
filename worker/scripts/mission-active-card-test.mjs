/**
 * REAL BROWSER TEST — Prompt #73 Defect 2 (student thinks mission disappeared).
 * Drives the ACTUAL app/missions.html in a real Chromium page through a normal
 * guardPilotPage()->loadMissions() boot with the teacher-missions/submissions endpoints
 * mocked, then asserts on real DOM: the Active tab (default) shows a never-started mission,
 * a pending mission tagged STARTED, and a returned mission tagged NEEDS CHANGES — all in the
 * SAME grid, with no separate "In Progress" tab anywhere in the tab bar.
 *
 * Usage: node worker/scripts/mission-active-card-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

const MISSION_A = { id: 'tm_active_a', title: 'Never Started Mission', description: 'Do a thing', reward_amount: 3, submission_type: 'text', allows_text: true };
const MISSION_B = { id: 'tm_active_b', title: 'Pending Review Mission', description: 'Already submitted', reward_amount: 4, submission_type: 'text', allows_text: true };
const MISSION_C = { id: 'tm_active_c', title: 'Returned Mission', description: 'Needs a redo', reward_amount: 2, submission_type: 'text', allows_text: true };
const MISSION_D = { id: 'tm_active_d', title: 'Completed Mission', description: 'All done', reward_amount: 5, submission_type: 'text', allows_text: true };

const SUBMISSIONS = [
  { id: 'msub_b', mission_id: MISSION_B.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'my answer', status: 'pending', created_at: '2026-08-08T01:00:00.000Z' },
  { id: 'msub_c', mission_id: MISSION_C.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'my other answer', status: 'returned', created_at: '2026-08-08T02:00:00.000Z' },
  { id: 'msub_d', mission_id: MISSION_D.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'done', status: 'accepted', created_at: '2026-08-08T03:00:00.000Z' },
];

async function main() {
  const results = [];
  function assert(cond, label) {
    results.push({ pass: !!cond, label });
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const okJson = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.addInitScript(() => { window.LANTERN_AVATAR_API = ''; });
  await page.route('**/api/auth/me**', okJson({
    ok: true, authenticated: true, role: 'student', username: 'testpilot', display_name: 'Test Pilot',
    economy_character_name: 'testpilot', student_character_name: 'testpilot', must_change_password: false,
  }));
  await page.route('**/api/class-access/**', okJson({ ok: true, accessState: 'none', tokenValid: true }));
  await page.route('**/api/missions/active**', okJson({ ok: true, missions: [MISSION_A, MISSION_B, MISSION_C, MISSION_D] }));
  await page.route('**/api/missions/submissions/character**', okJson({ ok: true, submissions: SUBMISSIONS }));
  await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));

  await page.goto(base + '/missions.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !!(window.LanternMissionsRuntime && window.LanternMissionsRuntime.loadMissions), { timeout: 15000 });
  await page.waitForSelector('#missionsLibraryGrid [data-lantern-card-type]', { timeout: 15000 });

  // ---------------------------------------------------------------------------
  // No separate "In Progress" tab anywhere in the tab bar.
  // ---------------------------------------------------------------------------
  const tabKeys = await page.evaluate(() => Array.from(document.querySelectorAll('#missionsStatusTabs [data-mission-status]')).map((b) => b.getAttribute('data-mission-status')));
  assert(tabKeys.length === 2 && tabKeys.includes('active') && tabKeys.includes('completed') && !tabKeys.includes('in_progress'), 'Only two student tabs exist: Active and Completed (no separate In Progress tab) — got: ' + JSON.stringify(tabKeys));
  const activeIsDefault = await page.evaluate(() => document.querySelector('#missionsStatusTabs [data-mission-status="active"]').classList.contains('is-active'));
  assert(activeIsDefault, 'Active is the default selected tab');

  // ---------------------------------------------------------------------------
  // Active tab (default view) shows A (never started), B (STARTED), C (NEEDS CHANGES).
  // ---------------------------------------------------------------------------
  function cardTitles() {
    return page.evaluate(() => Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]')).map((el) => ({
      title: (el.querySelector('.lanternCanonicalCardTitle') || {}).textContent || '',
      meta: (el.querySelector('.lanternCanonicalCardMeta') || {}).textContent || '',
      stateBadge: (el.querySelector('.lanternCanonicalCardStateBadge') || {}).textContent || '',
    })));
  }

  const activeCards = await cardTitles();
  const findCard = (title) => activeCards.find((c) => c.title.indexOf(title) !== -1);

  assert(!!findCard(MISSION_A.title), 'Active grid shows the never-started mission (A)');
  const cardB = findCard(MISSION_B.title);
  assert(!!cardB, 'Active grid shows the pending mission (B) — it did NOT disappear after being submitted');
  // Prompt #81 — status lives ONLY in the URHC state badge now; the footer metadata row must
  // never restate it (no "Waiting for teacher"/"Waiting for…" prose duplicating the badge).
  assert(cardB && cardB.stateBadge === 'STARTED', 'Pending mission (B) card carries a STARTED badge: badge=' + JSON.stringify(cardB && cardB.stateBadge));
  assert(cardB && !/waiting|start →|in progress/i.test(cardB.meta), 'Pending mission (B) footer does not repeat status/CTA prose already shown by the STARTED badge: meta=' + JSON.stringify(cardB && cardB.meta));
  const cardC = findCard(MISSION_C.title);
  assert(!!cardC, 'Active grid shows the returned mission (C)');
  assert(cardC && cardC.stateBadge === 'NEEDS CHANGES', 'Returned mission (C) card carries a NEEDS CHANGES badge: ' + JSON.stringify(cardC && cardC.stateBadge));
  assert(!findCard(MISSION_D.title), 'Active grid does NOT show the completed mission (D) — it moved to Completed, not duplicated');

  const activeCountLabel = await page.evaluate(() => document.querySelector('#missionsStatusTabs [data-mission-status="active"]').textContent);
  const activeCountNum = parseInt((activeCountLabel.match(/(\d+)/) || [])[1], 10);
  assert(activeCountNum === activeCards.length, 'Active tab count label ("' + activeCountLabel + '") matches the actual number of cards rendered in the Active grid (' + activeCards.length + ') — no misleading disappearing count');

  // ---------------------------------------------------------------------------
  // STARTED mission (B) remains clickable and opens a read-only view of the submission
  // (no accidental duplicate-submission entry point).
  // ---------------------------------------------------------------------------
  await page.evaluate((title) => {
    const cards = Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]'));
    const card = cards.find((el) => (el.querySelector('.lanternCanonicalCardTitle') || {}).textContent.indexOf(title) !== -1);
    card.click();
  }, MISSION_B.title);
  await page.waitForFunction(() => {
    const overlay = document.getElementById('lanternCardDetailOverlay');
    return overlay && overlay.classList.contains('show');
  }, { timeout: 5000 }).catch(() => null);
  const pendingOpenedSomething = await page.evaluate(() => {
    const detailOverlay = document.getElementById('lanternCardDetailOverlay');
    const missionOverlay = document.getElementById('missionDetailOverlay');
    return {
      detailOpen: !!(detailOverlay && detailOverlay.classList.contains('show')),
      detailHasSubmittedText: !!(detailOverlay && detailOverlay.textContent.indexOf('my answer') !== -1),
      missionModalOpen: !!(missionOverlay && missionOverlay.classList.contains('is-open')),
    };
  });
  assert(pendingOpenedSomething.detailOpen || pendingOpenedSomething.missionModalOpen, 'Clicking the STARTED mission card opens a detail/status view (mission stays clickable, not inert)');
  assert(!pendingOpenedSomething.missionModalOpen && pendingOpenedSomething.detailHasSubmittedText, 'STARTED mission opens a READ-ONLY view of the already-submitted content (not the editable submit modal — no accidental duplicate submission entry point)');

  // ---------------------------------------------------------------------------
  // NEEDS CHANGES mission (C) opens the EDITABLE resubmit workflow, prefilled with the
  // previous submission text (Prompt #67 ownership/security preserved — same submit modal).
  // ---------------------------------------------------------------------------
  await page.evaluate(() => document.getElementById('lanternCardDetailOverlay').classList.remove('show'));
  await page.evaluate((title) => {
    const cards = Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]'));
    const card = cards.find((el) => (el.querySelector('.lanternCanonicalCardTitle') || {}).textContent.indexOf(title) !== -1);
    card.click();
  }, MISSION_C.title);
  await page.waitForFunction(() => document.getElementById('missionDetailOverlay').classList.contains('is-open'), { timeout: 5000 });
  const resubmitState = await page.evaluate(() => ({
    contentValue: document.getElementById('missionSubmitContent').value,
    title: document.getElementById('missionDetailTitle').textContent,
  }));
  assert(resubmitState.contentValue === 'my other answer', 'NEEDS CHANGES mission opens the editable resubmit modal PREFILLED with the previous submission text: ' + JSON.stringify(resubmitState.contentValue));
  assert(/Resubmit/i.test(resubmitState.title), 'Resubmit modal title indicates this is a resubmission: "' + resubmitState.title + '"');
  await page.evaluate(() => document.getElementById('missionDetailOverlay').classList.remove('is-open'));

  // ---------------------------------------------------------------------------
  // Completed tab shows D only.
  // ---------------------------------------------------------------------------
  await page.evaluate(() => document.querySelector('#missionsStatusTabs [data-mission-status="completed"]').click());
  await page.waitForFunction(() => document.querySelector('#missionsStatusTabs [data-mission-status="completed"]').classList.contains('is-active'), { timeout: 5000 });
  const completedCards = await cardTitles();
  assert(completedCards.some((c) => c.title.indexOf(MISSION_D.title) !== -1), 'Completed tab shows the completed mission (D)');
  assert(!completedCards.some((c) => c.title.indexOf(MISSION_A.title) !== -1 || c.title.indexOf(MISSION_B.title) !== -1 || c.title.indexOf(MISSION_C.title) !== -1), 'Completed tab does NOT show the never-started/pending/returned missions');

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
