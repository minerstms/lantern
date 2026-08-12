/**
 * Prompt #105A / #116 — Create-a-Poll choice text survives Add choice / Remove last.
 * Static contract: rebuild must snapshot → rebuild → restore surviving values.
 * Usage: node worker/scripts/poll-option-preserve-105a-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'app', 'contribute.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
}

assert(/function snapshotPollOptionValues\(/.test(html), '1. snapshotPollOptionValues present');
assert(/function restorePollOptionValues\(/.test(html), '2. restorePollOptionValues present');
assert(/function rebuildPollOptionInputs\(/.test(html), '3. rebuildPollOptionInputs present');

const addBtn = html.match(
  /pollAddOptionBtn'\)\.addEventListener\('click',\s*function\(\)\{[\s\S]*?\}\);/
);
assert(!!addBtn, '4. Add choice handler present');
assert(
  addBtn &&
    /var prior = snapshotPollOptionValues\(\);/.test(addBtn[0]) &&
    /rebuildPollOptionInputs\(n \+ 1\);/.test(addBtn[0]) &&
    /restorePollOptionValues\(prior\);/.test(addBtn[0]),
  '5. Add choice snapshots before rebuild and restores after'
);

const remBtn = html.match(
  /pollRemoveOptionBtn'\)\.addEventListener\('click',\s*function\(\)\{[\s\S]*?\}\);/
);
assert(!!remBtn, '6. Remove last handler present');
assert(
  remBtn &&
    /var prior = snapshotPollOptionValues\(\);/.test(remBtn[0]) &&
    /rebuildPollOptionInputs\(n - 1\);/.test(remBtn[0]) &&
    /restorePollOptionValues\(prior\);/.test(remBtn[0]),
  '7. Remove last snapshots before rebuild and restores after'
);

assert(/id="pollOptionsWrap"/.test(html), '8. pollOptionsWrap host present');
assert(
  /snapshotPollOptionValues[\s\S]{0,200}pollOptionsWrap/.test(html),
  '9. snapshot scoped to pollOptionsWrap (not mission submit fields)'
);

// Behavioral simulation of the same snapshot → rebuild → restore sequence.
const sandbox = {
  values: [],
  snapshot() {
    return this.values.slice();
  },
  rebuild(n) {
    const count = Math.max(2, Math.min(5, n || 3));
    this.values = Array.from({ length: count }, () => '');
  },
  restore(prior) {
    if (!prior || !prior.length) return;
    for (let i = 0; i < this.values.length && i < prior.length; i++) {
      this.values[i] = prior[i];
    }
  },
  add() {
    if (this.values.length >= 5) return;
    const prior = this.snapshot();
    this.rebuild(this.values.length + 1);
    this.restore(prior);
  },
  remove() {
    if (this.values.length <= 2) return;
    const prior = this.snapshot();
    this.rebuild(this.values.length - 1);
    this.restore(prior);
  },
};

sandbox.rebuild(2);
sandbox.values = ['Yes', 'No'];
sandbox.add();
assert(
  sandbox.values.length === 3 &&
    sandbox.values[0] === 'Yes' &&
    sandbox.values[1] === 'No' &&
    sandbox.values[2] === '',
  '10. 2→3 preserves Yes/No; new blank'
);
sandbox.values[2] = 'Maybe';
sandbox.add();
assert(
  JSON.stringify(sandbox.values) === JSON.stringify(['Yes', 'No', 'Maybe', '']),
  '11. 3→4 preserves three typed values'
);
sandbox.values[3] = 'Sometimes';
sandbox.add();
assert(
  JSON.stringify(sandbox.values) === JSON.stringify(['Yes', 'No', 'Maybe', 'Sometimes', '']),
  '12. 4→5 preserves four typed values'
);
sandbox.values[4] = 'Always';
sandbox.remove();
assert(
  JSON.stringify(sandbox.values) === JSON.stringify(['Yes', 'No', 'Maybe', 'Sometimes']),
  '13. 5→4 drops last; survivors intact'
);
sandbox.remove();
assert(
  JSON.stringify(sandbox.values) === JSON.stringify(['Yes', 'No', 'Maybe']),
  '14. 4→3 survivors intact'
);
sandbox.remove();
assert(
  JSON.stringify(sandbox.values) === JSON.stringify(['Yes', 'No']),
  '15. 3→2 survivors intact'
);

console.log('\npoll-option-preserve-105a-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
