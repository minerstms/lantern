/**
 * Prompt #119 — Power Scroller + Moderation contracts.
 * Usage: node worker/scripts/moderation-power-list-119-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');

function loadBrowserIife(relPath) {
  const code = fs.readFileSync(path.join(root, relPath), 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    window: {},
    document: {
      createElement: function () {
        return {
          className: '',
          style: {},
          setAttribute: function () {},
          appendChild: function () {},
          addEventListener: function () {},
          querySelectorAll: function () {
            return [];
          },
          querySelector: function () {
            return null;
          },
          innerHTML: '',
          textContent: '',
          value: '',
        };
      },
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

const powerSb = loadBrowserIife('app/js/lantern-power-list.js');
const modSb = loadBrowserIife('app/js/lantern-moderation-list.js');
// moderation list needs LanternPowerList on same global — reload both in one sandbox
const both = {
  console,
  window: {},
  document: powerSb.document,
  globalThis: null,
};
both.globalThis = both;
both.window = both;
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-power-list.js'), 'utf8'), both);
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-moderation-list.js'), 'utf8'), both);

const Power = both.LanternPowerList;
const Mod = both.LanternModerationList;

const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const powerCss = fs.readFileSync(path.join(root, 'app/css/lantern-power-list.css'), 'utf8');
const powerJs = fs.readFileSync(path.join(root, 'app/js/lantern-power-list.js'), 'utf8');
const modJs = fs.readFileSync(path.join(root, 'app/js/lantern-moderation-list.js'), 'utf8');

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

assert(!!Power && typeof Power.sortItems === 'function', 'PowerList exported');
assert(!!Mod && typeof Mod.buildModerationItems === 'function', 'ModerationList exported');

const sample = [
  { id: 'a', title: 'Zebra', author: 'Amy', typeLabel: 'Poll', dateMs: 100, body: 'summer poll', reason: '', statusKey: 'live', statusLabel: 'Live', typeKey: 'poll', contentId: 'a' },
  { id: 'b', title: 'Apple', author: 'Zack', typeLabel: 'News', dateMs: 300, body: 'hello', reason: 'spam', statusKey: 'quarantine', statusLabel: 'REPORTED — HIDDEN PENDING REVIEW', typeKey: 'news', contentId: 'b' },
  { id: 'c', title: 'Mango', author: 'Bob', typeLabel: 'Mission', dateMs: 200, body: 'mission text', reason: '', statusKey: 'hidden', statusLabel: 'Hidden', typeKey: 'mission', contentId: 'c' },
];

const byDateDesc = Power.sortItems(sample, { key: 'date', dir: 'desc' }, (it, k) => (k === 'date' ? it.dateMs : it[k]));
assert(byDateDesc[0].id === 'b' && byDateDesc[2].id === 'a', '1 default newest-first date sort');

const byDateAsc = Power.sortItems(sample, { key: 'date', dir: 'asc' }, (it, k) => (k === 'date' ? it.dateMs : it[k]));
assert(byDateAsc[0].id === 'a' && byDateAsc[2].id === 'b', '2 date sort toggles oldest-first');

const byTitleAsc = Power.sortItems(sample, { key: 'title', dir: 'asc' }, (it, k) => it[k]);
assert(byTitleAsc.map((x) => x.id).join('') === 'bca', '3 title A–Z');

const byAuthorAsc = Power.sortItems(sample, { key: 'author', dir: 'asc' }, (it, k) => it[k]);
assert(byAuthorAsc.map((x) => x.id).join('') === 'acb', '4 author A–Z');

const byTypeAsc = Power.sortItems(sample, { key: 'typeLabel', dir: 'asc' }, (it, k) => it[k]);
assert(byTypeAsc[0].typeLabel === 'Mission', '5 type sort deterministic');

const searchTitle = Power.filterItems(sample, 'Apple', (it) => [it.title, it.author, it.typeLabel, it.body, it.reason].join(' '), {}, () => true);
assert(searchTitle.length === 1 && searchTitle[0].id === 'b', '6 search filters rows');

const statusReported = Power.filterItems(
  sample,
  '',
  (it) => it.title,
  { status: 'reported' },
  (it, fid, v) => {
    if (fid === 'status' && v === 'reported') return it.statusKey === 'reported' || it.statusKey === 'quarantine';
    return true;
  }
);
assert(statusReported.length === 1 && statusReported[0].id === 'b', '7 status filtering Reported');

const typeNews = Power.filterItems(
  sample,
  '',
  (it) => it.title,
  { type: 'news' },
  (it, fid, v) => (fid === 'type' ? it.typeKey === v : true)
);
assert(typeNews.length === 1 && typeNews[0].typeKey === 'news', '8 content-type filtering');

assert(powerJs.includes('Prefer only ONE expanded') || powerJs.includes('state.expandedId') || powerJs.includes('other.open = false'), '9/10 one expanded row preference in source');
assert(modJs.includes('/api/news/restore') && modJs.includes('/api/polls/restore') && modJs.includes('/api/missions/submissions/restore'), '13 Restore uses existing paths');
assert(modJs.includes('/api/news/hide') && modJs.includes('/api/polls/hide'), '14 Hide uses existing paths');
assert(!/delete\s*\(|\/api\/.*delete/i.test(modJs) || !modJs.includes('Delete'), '15 no destructive Delete action in moderation list');
assert(powerCss.includes('overflow: visible') && powerCss.includes('max-height: none'), '16 no nested-scroll clipping in Power List CSS');

assert(!/teacherSidebarLabel">Missions</.test(teacher), '17 sidebar Missions absent');
assert(!/teacherSidebarLabel">Shout-Out!/.test(teacher), '17b sidebar Shout-Out absent');
assert(teacher.includes('data-workspace="missions"') && teacher.includes('data-workspace="shoutout"'), '18 underlying Mission/Shout-Out workspaces remain');
assert(teacher.includes('moderationPowerListMount') && teacher.includes('lantern-power-list.js'), 'Moderation mounts Power Scroller');
assert(teacher.includes('lantern-moderation-list.js'), 'Moderation list script included');
assert(!teacher.includes('moderationLiveEl') && !teacher.includes('moderationFlaggedEl'), 'Old nested moderation panels removed');

const built = Mod.buildModerationItems({
  liveNews: [{ id: 'n1', title: 'Hello', author_name: 'A', body: 'x', created_at: '2026-08-12T12:00:00.000Z' }],
  livePolls: [{ id: 'p1', question: 'Q?', character_name: 'B', created_at: '2026-08-11T12:00:00.000Z' }],
  liveMissions: [],
  hiddenNews: [],
  hiddenMissions: [],
  hiddenPolls: [],
  flags: [
    {
      id: 'f1',
      item_type: 'poll',
      item_id: 'p1',
      reason: 'rude',
      reported_by: 'student1',
      created_at: '2026-08-12T18:00:00.000Z',
      quarantine_pending: true,
      status_label: 'REPORTED — HIDDEN PENDING REVIEW',
    },
  ],
});
const pollRow = built.find((r) => r.contentId === 'p1');
assert(!!pollRow && pollRow.statusKey === 'quarantine', '12 reported/quarantined visible on unified row');
assert(Mod.restoreUrl('', 'poll').endsWith('/api/polls/restore'), 'Restore poll path');
assert(Mod.hideUrl('', 'news').endsWith('/api/news/hide'), 'Hide news path');
assert(Power.sortIndicator('date', { key: 'date', dir: 'desc' }) === '▼', 'sort indicator desc');
assert(Power.sortIndicator('date', { key: 'title', dir: 'asc' }) === '', 'sort indicator inactive');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
