/**
 * Prompt #249C — thumbnail backfill page contracts (no production writes).
 * Usage: node worker/scripts/thumb-backfill-ui-249c-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const htmlPath = path.join(root, 'app/thumb-backfill.html');
const jsPath = path.join(root, 'app/js/lantern-thumbnail-backfill.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }

if (/THUMBNAIL BACKFILL/.test(html)) ok('page heading THUMBNAIL BACKFILL');
else bad('missing heading');
if (/id="dryBtn"/.test(html) && />Dry Run</.test(html)) ok('Dry Run control present');
else bad('dry run control');
if (/id="maxItems"/.test(html)) ok('Max items input present');
else bad('max items');
if (/id="sourceKind"/.test(html) && /id="sourceId"/.test(html)) ok('optional source kind/id present');
else bad('source filters');
if (/id="oneBtn"/.test(html) && /Run One Item/.test(html)) ok('Run One Item control present');
else bad('one item');
if (/id="out"/.test(html) && /id="authStatus"/.test(html)) ok('auth status and result log present');
else bad('status/log');
if (/NO D1 WRITES/.test(html) && /NO R2 WRITES/.test(html)) ok('explicit dry-run no-write warning');
else bad('write warning');
if (/id="errorPanel"/.test(html) && /id="deniedPanel"/.test(html)) ok('error and student-denial panels present');
else bad('error/denied panels');
if (/lantern-pilot-auth-pending/.test(html) && /classList\.remove\('lantern-pilot-auth-pending'\)/.test(html)) {
  ok('page removes auth-pending hide after session resolve');
} else bad('pending class never removed');
if (/auth\.fetchMe\(/.test(html)) ok('reuses LanternAuth.fetchMe');
else bad('missing session helper');
if (/role === 'teacher' \|\| role === 'admin'/.test(html)) ok('staff gate is teacher/admin only');
else bad('staff gate');
if (!/runBackfillBatch\(/.test(html.replace(/oneBtn\.onclick[\s\S]*$/, '').replace(/dryBtn\.onclick[\s\S]*$/, ''))) {
  ok('page load does not start backfill (writes only on click handlers)');
} else {
  const boot = html.split('dryBtn.onclick')[0];
  if (!/runBackfillBatch\(/.test(boot)) ok('page load does not start backfill');
  else bad('auto backfill on load', boot.slice(-200));
}

const writes = [];
const fetches = [];
const ctx = {
  console,
  URLSearchParams,
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; },
  },
  fetch(url, init) {
    fetches.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body });
    var pathOnly = String(url).split('?')[0];
    if (pathOnly.indexOf('/api/news/thumbs/recognize') !== -1 || pathOnly === '/api/news/thumb') {
      writes.push(String(url));
    }
    const dry = String(url).indexOf('dry_run=1') !== -1;
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        dry_run: dry,
        candidates: [
          { source_kind: 'news', source_id: 'n1', has_thumbnail: false, has_sidecar: false },
          { source_kind: 'poll', source_id: 'p1', has_thumbnail: true, has_sidecar: true },
        ],
      }),
    });
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(js, ctx);

const api = ctx.LanternThumbnailBackfill;
if (api && typeof api.formatDryRunReport === 'function' && typeof api.runBackfillBatch === 'function') {
  ok('backfill module exposes dry-run formatter');
} else bad('module missing');

const report = api.formatDryRunReport({
  ok: true,
  candidates: [
    { source_kind: 'news', source_id: 'n1', has_thumbnail: false },
    { source_kind: 'poll', source_id: 'p1', has_thumbnail: true },
  ],
}, { maxItems: 5 });
if (
  /NO D1 WRITES/.test(report) &&
  /NO R2 WRITES/.test(report) &&
  /Candidates found: 2/.test(report) &&
  /Already thumbnailed \/ skipped: 1/.test(report) &&
  /news=1/.test(report) &&
  /Max items applied: 5/.test(report)
) ok('dry-run report includes counts, kinds, max items, no-write lines');
else bad('dry-run report', report);

const dry = await api.runBackfillBatch({ dryRun: true, maxItems: 2 });
if (dry.ok && dry.dry_run === true && dry.d1_writes === 0 && dry.r2_writes === 0 && dry.writes === 'none') {
  ok('dry-run batch is read-only');
} else bad('dry-run batch', dry);
if (writes.length === 0) ok('dry-run issued no recognize/upload writes');
else bad('dry-run wrote', writes);
if (fetches.every((f) => f.method === 'GET' && /dry_run=1/.test(f.url))) ok('dry-run only GET candidates?dry_run=1');
else bad('dry-run fetches', fetches);

if (/do not call write paths/i.test(js) || /Dry-run is GET-only/.test(js)) ok('module documents dry-run GET-only');
else bad('module comment');

console.log(fail ? `FAIL ${fail}  PASS ${pass}` : `PASS ${pass}`);
if (fail) process.exit(1);
