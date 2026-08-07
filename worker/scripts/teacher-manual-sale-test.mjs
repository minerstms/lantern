/**
 * Teacher manual sale tests — Prompt #52
 * Static checks: catalog grid retired, manual sale UI + economy transact path.
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
const apiJs = fs.readFileSync(path.join(root, 'app/js/lantern-api.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(root, 'app/js/lantern-data.js'), 'utf8');
const workerJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

if (!/Catalog item — tap a card to select/.test(teacherHtml)) ok('teacher.html: no catalog grid label');
else bad('teacher.html still has catalog grid label');

if (!/teacherRewardCatalogGrid/.test(teacherHtml)) ok('teacher.html: no catalog grid element');
else bad('teacher.html still has catalog grid id');

if (!/teacherRewardCatalogGrid/.test(rewardJs)) ok('reward JS: no catalog grid rendering');
else bad('reward JS still references catalog grid');

if (/teacherRewardManualSalePanel/.test(teacherHtml)) ok('teacher.html: manual sale panel present');
else bad('teacher.html missing manual sale panel');

if (/teacherRewardSaleAmount/.test(teacherHtml)) ok('teacher.html: sale amount input');
else bad('teacher.html missing sale amount input');

if (/Record Sale/.test(teacherHtml)) ok('teacher.html: Record Sale button');
else bad('teacher.html missing Record Sale button');

if (/teacherRewardAvail/.test(teacherHtml) && /teacherRewardEarned/.test(teacherHtml) && /teacherRewardSpent/.test(teacherHtml)) {
  ok('teacher.html: Available / Earned / Spent stats remain');
} else bad('teacher.html missing balance stats');

if (/teacherRewardStudentInput/.test(teacherHtml)) ok('teacher.html: student selector remains');
else bad('teacher.html missing student selector');

if (/callManualSale/.test(rewardJs)) ok('reward JS: callManualSale helper');
else bad('reward JS missing callManualSale');

if (/TEACHER_MANUAL_SALE/.test(rewardJs)) ok('reward JS: manual sale source tag');
else bad('reward JS missing TEACHER_MANUAL_SALE source');

if (/\/api\/economy\/transact/.test(rewardJs)) ok('reward JS: uses economy transact endpoint');
else bad('reward JS missing economy transact');

if (/parseSaleAmount/.test(rewardJs)) ok('reward JS: amount validation helper');
else bad('reward JS missing parseSaleAmount');

if (/showSaleConfirm/.test(rewardJs)) ok('reward JS: confirmation before sale');
else bad('reward JS missing confirmation');

if (!/selectedItemId|renderCatalogCards|callRedeem/.test(rewardJs)) ok('reward JS: catalog selection removed');
else bad('reward JS still has catalog selection code');

if (/storeManualSale/.test(apiJs)) ok('lantern-api: local dev manual sale fallback');
else bad('lantern-api missing storeManualSale');

if (/DEFAULT_CATALOG/.test(dataJs)) ok('catalog data preserved in lantern-data.js');
else bad('catalog data removed from lantern-data.js');

if (!/DROP TABLE.*catalog/i.test(workerJs)) ok('worker: no catalog table drops');
else bad('worker drops catalog tables');

if (fs.existsSync(path.join(root, 'archive/teacher-catalog-ui/README.md'))) ok('archive README present');
else bad('archive README missing');

console.log('\n--- teacher-manual-sale-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
