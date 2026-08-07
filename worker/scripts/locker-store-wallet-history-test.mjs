/**
 * Locker Store wallet freshness + Nugget History tests — Prompt #53
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

const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const storeJs = fs.readFileSync(path.join(root, 'app/js/lantern-store-app.js'), 'utf8');
const helpJs = fs.readFileSync(path.join(root, 'app/js/lantern-help.js'), 'utf8');
const workerHandlers = fs.readFileSync(path.join(root, 'worker/locker-handlers.js'), 'utf8');

if (!/Leaderboard &amp; Ledgers|leaderboardCard|lbBody|storeLbRailTrack/.test(lockerHtml)) ok('locker.html: leaderboard UI removed');
else bad('locker.html still has leaderboard UI');

if (/Nugget History|storeNuggetHistoryList/.test(lockerHtml)) ok('locker.html: Nugget History section');
else bad('locker.html missing Nugget History');

if (/lantern-store-tab-activated/.test(lockerHtml)) ok('locker.html: store tab activation event');
else bad('locker.html missing store tab event');

if (/refreshStoreWallet|LanternStoreWallet/.test(storeJs)) ok('store JS: shared wallet refresh API');
else bad('store JS missing shared refresh');

if (/WALLET_REFRESH_DEDUPE_MS|lastWalletRefreshAt/.test(storeJs)) ok('store JS: wallet refresh dedupe');
else bad('store JS missing dedupe');

if (/isStoreTabActive/.test(storeJs) && /visibilitychange/.test(storeJs)) ok('store JS: visibility refresh gated to Store');
else bad('store JS missing Store-gated visibility refresh');

if (/setWalletRefreshing/.test(storeJs) && !/setBalanceLoading/.test(storeJs)) ok('store JS: subtle refresh UX');
else bad('store JS still blanks wallet on every refresh');

if (/loadNuggetHistory|formatTransactionLabel|callLockerWalletTransactions/.test(storeJs)) ok('store JS: personal history rendering');
else bad('store JS missing history helpers');

if (!/renderLeaderboard|store_leaderboard|lbSearch/.test(storeJs)) ok('store JS: leaderboard code removed');
else bad('store JS still has leaderboard code');

if (/handleStoreActivated|lantern-store-tab-activated/.test(storeJs)) ok('store JS: store activation handler');
else bad('store JS missing store activation handler');

if (/\/api\/locker\/me\/wallet\/transactions/.test(workerHandlers)) ok('worker: session-scoped wallet history endpoint');
else bad('worker missing wallet history endpoint');

if (/lockerRejectIdentityParams/.test(workerHandlers) && workerHandlers.includes('/api/locker/me/wallet/transactions')) ok('worker: history endpoint rejects identity params');
else bad('worker history endpoint missing identity guard');

if (/positionHelpPanel|getBoundingClientRect/.test(helpJs)) ok('help JS: dynamic header offset');
else bad('help JS missing dynamic positioning');

if (/overflow-y: auto/.test(helpJs) && /positionHelpPanel/.test(helpJs)) ok('help JS: constrained panel height');
else bad('help JS missing height constraint');

if (!/top: 60px/.test(helpJs)) ok('help JS: no fixed 60px top');
else bad('help JS still hardcodes 60px top');

console.log('\n--- locker-store-wallet-history-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
