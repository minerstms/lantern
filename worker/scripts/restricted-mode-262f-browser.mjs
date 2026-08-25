/**
 * Prompt #262F browser QA.
 * Usage: node worker/scripts/restricted-mode-262f-browser.mjs http://127.0.0.1:PORT
 */
const base = (process.argv[2] || 'http://127.0.0.1:60157').replace(/\/$/, '');
const viewports = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
  { name: '320x568', width: 320, height: 568 },
];
let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }

const { chromium } = await import('../../e2e/studio-contribute/node_modules/playwright/index.mjs');
const browser = await chromium.launch();

async function rowState(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#restrictedAccessResults .restrictedAccessRow'));
    return {
      count: rows.length,
      names: rows.map((r) => (r.querySelector('.restrictedAccessRowName') || {}).textContent || ''),
      statuses: rows.map((r) => (r.querySelector('[data-restricted-status]') || {}).textContent || ''),
      actions: rows.map((r) => (r.querySelector('[data-restricted-toggle]') || {}).textContent || ''),
      counts: (document.getElementById('restrictedAccessCountsLine') || {}).textContent || '',
      protectedHasRemove: !!(document.getElementById('restrictedAccessWebAdminRow') || {}).querySelector('[data-restricted-toggle]'),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
}

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(base + '/dev/restricted-mode-262f-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HARNESS_262F__ === true);
  await page.fill('#restrictedAccessSearch', 'pac');
  let s = await rowState(page);
  if (s.count === 1 && s.names[0].indexOf('Deana Pachelli') === 0 && s.statuses[0] === 'Not allowed' && s.actions[0] === 'Allow') {
    ok(vp.name + ' search unallowed staff is one Not allowed / Allow row');
  } else bad(vp.name + ' search unallowed', s);

  await page.click('[data-restricted-toggle]');
  s = await rowState(page);
  if (s.count === 1 && s.statuses[0] === 'Allowed' && s.actions[0] === 'Remove' && /Selected Staff: 1/.test(s.counts) && /Total allowed: 2/.test(s.counts)) {
    ok(vp.name + ' Allow updates same row and counts');
  } else bad(vp.name + ' Allow in place', s);

  for (const kind of ['all', 'staff', 'allowed']) {
    await page.click('[data-restricted-kind="' + kind + '"]');
    s = await rowState(page);
    if (s.count === 1 && s.names[0].indexOf('Deana Pachelli') === 0) ok(vp.name + ' ' + kind + ' filter one Deana');
    else bad(vp.name + ' ' + kind + ' duplicate', s);
  }

  await page.click('[data-restricted-toggle]');
  s = await rowState(page);
  if (s.count === 0 || (s.count === 1 && s.statuses[0] === 'Not allowed' && s.actions[0] === 'Allow')) {
    ok(vp.name + ' Remove updates row or Allowed filter list');
  } else bad(vp.name + ' Remove', s);

  await page.click('[data-restricted-kind="all"]');
  await page.fill('#restrictedAccessSearch', 'pac');
  s = await rowState(page);
  if (s.count === 1 && s.statuses[0] === 'Not allowed' && s.actions[0] === 'Allow' && /Selected Staff: 0/.test(s.counts) && /Total allowed: 1/.test(s.counts) && !s.protectedHasRemove && !s.overflow) {
    ok(vp.name + ' Remove + All filter restores Not allowed / Allow, counts, no overflow');
  } else bad(vp.name + ' final state', s);

  await page.close();
}
await browser.close();
console.log('\n#262F browser:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
