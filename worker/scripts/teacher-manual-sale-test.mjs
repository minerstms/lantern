/**
 * Teacher Nuggets / TMS Nugget Ledger tests — Prompt #95 / #173.
 *
 * Prompt #173 redesigns Redeem-only UI into Student Nugget Dashboard + Earn/Spend.
 * DOM ids for search/amount/stats/button are intentionally preserved where possible.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let passed = 0;
let failed = 0;

function ok(msg) { passed++; console.log('PASS', msg); }
function bad(msg, detail) { failed++; console.log('FAIL', msg, detail != null ? detail : ''); }

const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const rewardJs = fs.readFileSync(path.join(root, 'app/js/lantern-teacher-reward-redeem.js'), 'utf8');
const workerJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

if (!/Catalog item — tap a card to select/.test(teacherHtml)) ok('teacher.html: no catalog grid label');
else bad('teacher.html still has catalog grid label');

if (!/teacherRewardCatalogGrid/.test(teacherHtml)) ok('teacher.html: no catalog grid element');
else bad('teacher.html still has catalog grid id');

if (/teacherRewardManualSalePanel/.test(teacherHtml)) ok('teacher.html: Nuggets panel present');
else bad('teacher.html missing Nuggets panel');

if (/Current Balance/.test(teacherHtml) && /Total Earned/.test(teacherHtml) && /Total Spent/.test(teacherHtml)) {
  ok('teacher.html: Current Balance / Total Earned / Total Spent labels');
} else bad('teacher.html missing dashboard labels');

if (/This Transaction/.test(teacherHtml) && /teacherRewardDirection/.test(teacherHtml) && /Earn/.test(teacherHtml) && /Spend/.test(teacherHtml)) {
  ok('teacher.html: This Transaction Earn/Spend toggle');
} else bad('teacher.html missing Earn/Spend toggle');

if (/Balance After/.test(teacherHtml) && /teacherRewardBalanceAfter/.test(teacherHtml)) {
  ok('teacher.html: Balance After preview');
} else bad('teacher.html missing Balance After');

if (/Add Nuggets/.test(teacherHtml) || /teacherRewardRecordSaleBtn/.test(teacherHtml)) {
  ok('teacher.html: primary transaction button present');
} else bad('teacher.html missing primary button');

if (!/Redeem Nugget/.test(teacherHtml) && !/Redeem a TMS Nugget/.test(teacherHtml)) {
  ok('teacher.html: Redeem-only framing removed');
} else bad('teacher.html still framed as Redeem-only');

if (/teacherRewardSaleAmount/.test(teacherHtml)) ok('teacher.html: amount input');
else bad('teacher.html missing amount input');

if (/teacherRewardAvail/.test(teacherHtml) && /teacherRewardEarned/.test(teacherHtml) && /teacherRewardSpent/.test(teacherHtml)) {
  ok('teacher.html: dashboard stat element ids preserved');
} else bad('teacher.html missing balance stats ids');

if (/teacherRewardStudentInput/.test(teacherHtml)) ok('teacher.html: student selector remains');
else bad('teacher.html missing student selector');

if (!/callManualSale|TEACHER_MANUAL_SALE|\/api\/economy\/transact|LANTERN_DATA\.ensureCharacters/.test(rewardJs)) {
  ok('reward JS: old Lantern-only manual sale path retired');
} else bad('reward JS still references retired Lantern-only path');

if (/'\/api\/tms-nuggets\/'/.test(rewardJs) && /postTmsNuggets\('redeem'/.test(rewardJs) && /postTmsNuggets\('award'/.test(rewardJs) && /postTmsNuggets\('ledger'/.test(rewardJs)) {
  ok('reward JS: wired to search/ledger/award/redeem');
} else bad('reward JS missing award/redeem/ledger bridge calls');

if (/Insufficient Nuggets/.test(rewardJs) && /updateBalanceAfterPreview/.test(rewardJs)) {
  ok('reward JS: Balance After preview + overspend guard');
} else bad('reward JS missing preview/overspend');

if (/idempotency_key/.test(rewardJs) && /reason/.test(rewardJs)) {
  ok('reward JS: reason + award idempotency');
} else bad('reward JS missing reason/idempotency');

if (/\/api\/tms-nuggets\/award/.test(workerJs) && /reason_required/.test(workerJs) && /current_balance/.test(workerJs)) {
  ok('Lantern Worker: award route + dashboard aliases + reason gate');
} else bad('Lantern Worker award/dashboard wiring missing');

if (!/selectedItemId|renderCatalogCards|callRedeem/.test(rewardJs)) ok('reward JS: catalog selection removed');
else bad('reward JS still has catalog selection code');

console.log('\nteacher-manual-sale-test:', passed, 'PASS', failed, 'FAIL');
process.exit(failed ? 1 : 0);
