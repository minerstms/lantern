/**
 * Prompt #249E — bounded Run Batch contracts (no production writes).
 * Usage: node worker/scripts/thumb-bounded-batch-249e-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/thumb-backfill.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app/js/lantern-thumbnail-backfill.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }

if (/id="batchBtn"/.test(html) && /Run Batch/.test(html)) ok('Run Batch control present');
else bad('missing Run Batch');
if (/id="dryBtn"/.test(html) && /id="oneBtn"/.test(html)) ok('Dry Run and Run One Item still present');
else bad('missing prior controls');
if (/class="tertiary"/.test(html) && /id="batchBtn"[^>]*disabled/.test(html)) ok('Run Batch is tertiary and starts disabled');
else bad('batch styling/disabled');
if (/max="25"/.test(html) && !/max="50"/.test(html)) ok('Max items hard cap is 25');
else bad('max cap');
if (/id="confirmPanel"/.test(html) && /Confirm Run Batch/.test(html) && /Cancel/.test(html)) {
  ok('specific confirmation + cancel present');
} else bad('confirm UI');
if (/WILL write thumbnail objects to R2/.test(html) && /Originals will NOT be deleted/.test(html)) {
  ok('confirmation states R2/D1 writes and original safety');
} else bad('confirm copy');
if (/id="progressPanel"/.test(html)) ok('progress panel present');
else bad('progress');
if (/BATCH STOPPED — REVIEW ERRORS BEFORE CONTINUING/.test(html)) ok('consecutive-failure stop copy present');
else bad('stop copy');
if (/approvedFingerprint/.test(html) && /invalidateBatchGate/.test(html)) ok('dry-run gate + input invalidation present');
else bad('gate');
if (!/next 10|nextCursor|Load next batch/i.test(html)) ok('no automatic next-batch control');
else bad('auto next');

const fetches = [];
const writes = [];
const ctx = {
  console,
  URLSearchParams,
  localStorage: { store: {}, getItem() { return null; }, setItem() {}, removeItem() {} },
  fetch(url, init) {
    const method = (init && init.method) || 'GET';
    fetches.push({ url: String(url), method });
    const pathOnly = String(url).split('?')[0];
    if (pathOnly.indexOf('/recognize') !== -1 || pathOnly === '/api/news/thumb') writes.push(String(url));
    const n = Number(new URL('http://x' + (String(url).indexOf('?') === 0 ? url : String(url).replace(/^[^?]+/, ''))).searchParams.get('max_items') || 2);
    const count = Math.min(n || 2, 10);
    const candidates = [];
    for (let i = 1; i <= count; i++) {
      candidates.push({ source_kind: 'news', source_id: 'n' + i, has_thumbnail: false, has_sidecar: false, file_url: '/x' + i });
    }
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ ok: true, dry_run: method === 'GET', candidates }),
    });
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(js, ctx);
const api = ctx.LanternThumbnailBackfill;

if (api.HARD_MAX_BATCH_ITEMS === 25) ok('HARD_MAX_BATCH_ITEMS is 25');
else bad('hard max', api.HARD_MAX_BATCH_ITEMS);
if (api.parseBoundedMaxItems('10').ok && api.parseBoundedMaxItems('10').value === 10) ok('parse 10');
else bad('parse 10');
if (!api.parseBoundedMaxItems('26').ok && api.parseBoundedMaxItems('26').error === 'max_items_too_large') ok('parse rejects 26');
else bad('parse 26');
if (!api.parseBoundedMaxItems('0').ok) ok('parse rejects 0');
else bad('parse 0');
if (!api.parseBoundedMaxItems('1.5').ok) ok('parse rejects non-integer');
else bad('parse float');

const copy = api.formatBatchConfirmCopy({ maxItems: '10', sourceKind: 'news' });
if (copy === 'Generate thumbnails for up to 10 news items?') ok('confirm copy names 10 news items');
else bad('confirm copy', copy);

const fpA = api.inputFingerprint({ maxItems: '10', sourceKind: 'news', sourceId: '' });
const fpB = api.inputFingerprint({ maxItems: '25', sourceKind: 'news', sourceId: '' });
if (fpA && fpA !== fpB) ok('input fingerprint changes when max items changes');
else bad('fingerprint');

const tooBig = await api.runBackfillBatch({ dryRun: false, maxItems: 30 });
if (!tooBig.ok && tooBig.error === 'max_items_too_large') ok('runBackfillBatch refuses >25 without fetching');
else bad('refuse large', tooBig);
if (writes.length === 0) ok('>25 issued no writes');
else bad('>25 wrote', writes);

const dry = await api.runBackfillBatch({ dryRun: true, maxItems: 10, sourceKind: 'news' });
if (dry.ok && dry.dry_run && dry.count <= 10 && dry.d1_writes === 0) ok('dry-run stays bounded and read-only');
else bad('dry', dry);

const progress = [];
const batch = await api.runBackfillBatch({
  dryRun: false,
  maxItems: 3,
  sourceKind: 'news',
  hooks: {
    recognizeExistingThumbnail: function () { return Promise.resolve({ ok: false }); },
    generateThumbnailFromUrl: function () { return Promise.resolve({ blob: { size: 12 }, size: 12 }); },
    uploadThumbnail: function () { return Promise.resolve({ ok: true, body: { size_bytes: 12 } }); },
  },
  onProgress: function (p) { progress.push(p); },
});
if (batch.ok && batch.dry_run === false && batch.completed <= 3 && batch.generated <= 3) ok('bounded batch uses one-item machinery');
else bad('batch', batch);
if (progress.length && progress.every((p) => p.total <= 3)) ok('progress stays within max items');
else bad('progress', progress);
if (batch.remaining === 0) ok('completed batch does not request another page');
else bad('remaining', batch);

const failProgress = [];
const stopped = await api.runBackfillBatch({
  dryRun: false,
  maxItems: 5,
  maxConsecutiveFailures: 3,
  hooks: {
    recognizeExistingThumbnail: function () { return Promise.resolve({ ok: false }); },
    generateThumbnailFromUrl: function () { return Promise.reject(new Error('boom')); },
    uploadThumbnail: function () { return Promise.resolve({ ok: false }); },
  },
  onProgress: function (p) { failProgress.push(p); },
});
if (stopped.stopped === true && stopped.failed >= 3) ok('consecutive failures stop the batch');
else bad('stop', stopped);
if (failProgress.some((p) => p.stopped)) ok('progress reports stopped');
else bad('stop progress');

console.log(fail ? `FAIL ${fail}  PASS ${pass}` : `PASS ${pass}`);
if (fail) process.exit(1);
