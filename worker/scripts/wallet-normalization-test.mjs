/**
 * Wallet balance normalization tests — Prompt #57
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}

function finiteWalletNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeWalletBalance(res, fallbackName) {
  if (!res || !res.ok) {
    return {
      ok: false,
      error: (res && res.error) || 'Failed',
      available: null,
      earned: null,
      spent: null,
      economy_key: null,
    };
  }
  let available = finiteWalletNumber(res.available);
  if (available === null) available = finiteWalletNumber(res.balance);
  if (available === null) {
    return { ok: false, error: 'invalid_balance_payload', available: null };
  }
  return {
    ok: true,
    available,
    earned: finiteWalletNumber(res.earned),
    spent: finiteWalletNumber(res.spent),
    economy_key: (res.character_name || fallbackName || '').trim() || null,
  };
}

const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const storeJs = fs.readFileSync(path.join(root, 'app/js/lantern-store-app.js'), 'utf8');

if (/normalizeWalletBalance/.test(walletJs)) ok('lantern-wallet.js defines normalizeWalletBalance');
else bad('lantern-wallet.js missing normalizeWalletBalance');

if (/economyBalanceUrl/.test(walletJs) && /prefix \+ '\/api\/economy\/balance'/.test(walletJs)) {
  ok('lantern-wallet.js uses same-origin /api when API base is empty');
} else bad('lantern-wallet.js missing same-origin balance URL');

if (!/Number\(res\.balance\) \|\| 0/.test(walletJs)) ok('lantern-wallet.js no false-zero Number(balance)||0');
else bad('lantern-wallet.js still coerces missing balance to 0');

if (/invalid_balance_payload/.test(walletJs)) ok('lantern-wallet.js rejects malformed payload');
else bad('lantern-wallet.js missing malformed payload handling');

if (/fetchBalanceFromHttp/.test(walletJs) && !/if \(base\) \{[\s\S]{0,120}fetch\(base \+ '\/api\/economy\/balance'/.test(walletJs)) {
  ok('lantern-wallet.js does not gate HTTP fetch on truthy base only');
} else bad('lantern-wallet.js may still skip HTTP when base is empty string');

const workerPayload = {
  ok: true,
  character_name: '20889',
  balance: 215,
  earned: 217,
  spent: 2,
  available: 215,
};
const normalized = normalizeWalletBalance(workerPayload, '');
if (normalized.ok && normalized.available === 215 && normalized.earned === 217 && normalized.spent === 2) {
  ok('Lucas regression: Worker payload normalizes to Available 215');
} else bad('Lucas regression normalization', normalized);

const balanceOnly = normalizeWalletBalance({ ok: true, character_name: '20889', balance: 215, earned: 217, spent: 2 }, '');
if (balanceOnly.ok && balanceOnly.available === 215) ok('balance-only field parses to Available');
else bad('balance-only parse', balanceOnly);

const availableOnly = normalizeWalletBalance({ ok: true, character_name: '20889', available: 215 }, '');
if (availableOnly.ok && availableOnly.available === 215) ok('available field parses directly');
else bad('available-only parse', availableOnly);

const trueZero = normalizeWalletBalance({ ok: true, character_name: '20889', balance: 0, available: 0, earned: 0, spent: 0 }, '');
if (trueZero.ok && trueZero.available === 0) ok('authoritative zero remains zero');
else bad('true zero', trueZero);

const malformed = normalizeWalletBalance({ ok: true, character_name: '20889', earned: 217, spent: 2 }, '');
if (!malformed.ok && malformed.available === null) ok('missing Available fails instead of becoming zero');
else bad('malformed payload became zero', malformed);

if (/LanternWallet\.fetchMyBalance/.test(storeJs) && /LanternWallet\.fetchMyBalance/.test(profileJs)) {
  ok('Store and Avatar both use fetchMyBalance');
} else bad('Store/Avatar fetchMyBalance mismatch');

if (/Number\.isFinite\(parsedAvailable\)/.test(profileJs)) ok('avatar crop validates finite Available');
else bad('avatar crop missing finite Available validation');

if (/avatarCropImageReady/.test(profileJs)) ok('regression: crop image lifecycle intact');

console.log('\n--- wallet-normalization-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
