/**
 * Teacher manual sale / TMS Nugget Ledger tests — Prompt #52, superseded by Prompt #95.
 *
 * Prompt #95 replaced the old Lantern-only "Manual sale" implementation (which searched a
 * client-side, localStorage-only demo character list and deducted from a separate Lantern wallet)
 * with the real TMS Nugget Ledger, reached through the /api/tms-nuggets/* bridge. The panel/button
 * DOM ids are intentionally UNCHANGED (teacherRewardManualSalePanel, teacherRewardRecordSaleBtn,
 * teacherRewardStudentInput, teacherRewardAvail/Earned/Spent, teacherRewardSaleAmount) so the
 * existing teacher-workspace-shell-test.mjs e2e assertions keep working -- only what backs them
 * changed. Static checks below: catalog grid stays retired, and the panel is now wired to the real
 * bridge rather than the old client-only demo-character economy path.
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

if (/Redeem Nugget/.test(teacherHtml)) ok('teacher.html: Redeem Nugget button (Prompt #95 -- was "Record Sale")');
else bad('teacher.html missing Redeem Nugget button');

if (/teacherRewardAvail/.test(teacherHtml) && /teacherRewardEarned/.test(teacherHtml) && /teacherRewardSpent/.test(teacherHtml)) {
  ok('teacher.html: Available / Earned / Spent stats remain');
} else bad('teacher.html missing balance stats');

if (/teacherRewardStudentInput/.test(teacherHtml)) ok('teacher.html: student selector remains');
else bad('teacher.html missing student selector');

if (!/callManualSale|TEACHER_MANUAL_SALE|\/api\/economy\/transact|LANTERN_DATA\.ensureCharacters/.test(rewardJs)) {
  ok('reward JS: old Lantern-only manual sale / demo-character economy path fully retired (Prompt #95)');
} else bad('reward JS still references the retired Lantern-only manual sale path');

if (/'\/api\/tms-nuggets\/'/.test(rewardJs) && /postTmsNuggets\('redeem'/.test(rewardJs) && /postTmsNuggets\('ledger'/.test(rewardJs) && /postTmsNuggets\('students\/search'/.test(rewardJs)) {
  ok('reward JS: wired to the real TMS Nugget Ledger bridge (search/ledger/redeem)');
} else bad('reward JS missing TMS Nugget Ledger bridge calls');

if (/parseSaleAmount/.test(rewardJs)) ok('reward JS: amount validation helper');
else bad('reward JS missing parseSaleAmount');

if (/showRedeemConfirm/.test(rewardJs)) ok('reward JS: confirmation before redemption');
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
