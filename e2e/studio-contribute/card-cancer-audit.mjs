/**
 * One-shot: load lantern-app pages over HTTP and run LanternCanonicalEnforce.scanAllExploreCards.
 * Run with: node card-cancer-audit.mjs (serve apps/lantern-app on BASE first)
 */
import { chromium } from 'playwright';

const BASE = process.env.LANTERN_SERVE_URL || 'http://127.0.0.1:9876';
const PAGES = [
  'index.html',
  'explore.html',
  'games.html',
  'missions.html',
  'locker.html',
  'display.html',
  'verify.html',
  'contribute.html',
  'store.html',
  'news.html',
  'grades.html',
  'class-code.html',
  'thanks.html',
  'school-survival.html',
];

async function scanPage(page, path) {
  const url = `${BASE}/${path}`;
  let navigated = false;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    navigated = true;
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      if (window.LanternCanonicalEnforce && window.LanternCanonicalEnforce.scanAllExploreCards) {
        window.LanternCanonicalEnforce.scanAllExploreCards(document);
      }
    });
    const data = await page.evaluate(() => {
      const cards = document.querySelectorAll('.exploreCard');
      const report = window.__lanternCancerReport ? window.__lanternCancerReport.slice() : [];
      const fatal = !!document.getElementById('lanternBrandKillerFatal');
      const hasEnforce = !!(window.LanternCanonicalEnforce && window.LanternCanonicalEnforce.scanAllExploreCards);
      return {
        path: location.pathname.split('/').pop() || '',
        total: cards.length,
        cancerCount: report.length,
        report,
        fatal,
        hasEnforce,
      };
    });
    data.url = url;
    return data;
  } catch (e) {
    return {
      url,
      path,
      error: String(e && e.message ? e.message : e),
      total: 0,
      cancerCount: 0,
      report: [],
      fatal: false,
      hasEnforce: false,
      navigated,
    };
  }
}

function inferBuilder(sourceHint) {
  if (!sourceHint) return '(unknown)';
  return sourceHint;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

let grandTotal = 0;
let grandCancer = 0;
const allReports = [];
const byViolation = new Map();
const bySource = new Map();

for (const p of PAGES) {
  const r = await scanPage(page, p);
  if (r.error) {
    console.error('PAGE_ERR', p, r.error);
    continue;
  }
  grandTotal += r.total;
  grandCancer += r.cancerCount;
  for (const entry of r.report) {
    allReports.push({ page: p, ...entry });
    for (const reason of entry.reasons || []) {
      byViolation.set(reason, (byViolation.get(reason) || 0) + 1);
    }
    const src = entry.sourceHint || '';
    bySource.set(src, (bySource.get(src) || 0) + 1);
  }
}

await browser.close();

const out = {
  summary: {
    totalCardsScanned: grandTotal,
    totalCancerCards: grandCancer,
    pages: PAGES.length,
  },
  violationsByType: Object.fromEntries([...byViolation.entries()].sort((a, b) => b[1] - a[1])),
  violationsBySourceHint: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1])),
  cancerDetails: allReports.map((e) => ({
    page: e.page,
    cardType: e.cardType,
    reasons: e.reasons,
    domPath: e.domPath,
    sourceHint: e.sourceHint,
    builderFunction: inferBuilder(e.sourceHint),
    killTarget: e.killTarget,
  })),
};

console.log(JSON.stringify(out, null, 2));
