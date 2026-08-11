/**
 * Prompt #157 — Create/Contribute form-control typography contract.
 * Ordinary inputs share --create-control-* tokens; headline class must not invent louder type.
 * Usage: node worker/scripts/create-form-controls-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const htmlPath = path.join(root, 'app', 'contribute.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

assert(/--create-control-fs:\s*22px/.test(html), '1. --create-control-fs token is 22px');
assert(/--create-control-fw:\s*400/.test(html), '2. --create-control-fw token is 400 (ordinary weight)');
assert(/--create-control-pad-y:\s*12px/.test(html), '3. --create-control-pad-y token present');
assert(/--create-control-border:\s*1px solid var\(--line\)/.test(html), '4. --create-control-border matches ordinary 1px border');

assert(
  /input\.studioHeadlineInput[\s\S]{0,400}font-size:\s*var\(--create-control-fs\)/.test(html)
    || /#newsTitle\.studioHeadlineInput[\s\S]{0,500}font-size:\s*var\(--create-control-fs\)/.test(html),
  '5. studioHeadlineInput uses --create-control-fs (not oversized)'
);
assert(
  /input\.studioHeadlineInput[\s\S]{0,400}font-weight:\s*var\(--create-control-fw\)/.test(html)
    || /#newsTitle\.studioHeadlineInput[\s\S]{0,500}font-weight:\s*var\(--create-control-fw\)/.test(html),
  '6. studioHeadlineInput uses --create-control-fw (not bold heading weight)'
);

assert(
  !/studioHeadlineInput\{[^}]*font-size:\s*26px\s*!important/s.test(html)
    && !/#newsTitle\.studioHeadlineInput[\s\S]{0,120}font-size:\s*26px\s*!important/.test(html),
  '7. no 26px !important headline input override remains'
);
assert(
  !/studioHeadlineInput\{[^}]*font-weight:\s*800/s.test(html)
    || /studioHeadlineInput[\s\S]{0,200}font-weight:\s*var\(--create-control-fw\)/.test(html),
  '8. headline input no longer forces font-weight 800 as its own system'
);

assert(/id="newsPhotoCredit"/.test(html), '9. Photo credit field present');
assert(/id="newsTitle"[^>]*class="studioHeadlineInput"/.test(html), '10. Title/Headline uses studioHeadlineInput class');
assert(/id="pollQuestion"[^>]*class="studioHeadlineInput"/.test(html), '11. Poll question uses same headline class (shared ordinary type)');
assert(/id="shoutRecipient"/.test(html), '12. Shout-Out recipient field present');
assert(/id="pollOptionsWrap"/.test(html), '13. Poll options host present');

const typeSelect = html.match(/id="contributeTypeSelect"[\s\S]*?<\/select>/);
assert(!!typeSelect, '14. contributeTypeSelect present');
if (typeSelect) {
  const block = typeSelect[0];
  assert(/value="post"/.test(block), '14a. mode: News / Update');
  assert(/value="shoutout"/.test(block), '14b. mode: Shout-Out!');
  assert(/value="poll"/.test(block), '14c. mode: Poll');
  assert(!/value="mission"/.test(block), '14d. Prompt #186: Complete a mission absent from Create selector');
}

assert(!/I am submitting as/i.test(html), '14e. Prompt #186: I am submitting as removed');
assert(!/Why you['’]re writing/i.test(html) || /ARCHIVE:[\s\S]{0,80}Why you/.test(html), '14f. Prompt #186: Why you\'re writing not user-facing');
assert(!/<option[^>]*>Kindness</.test(html), '14g. Prompt #186: Shout-Out Kindness category option absent');
assert(!/Poll \(default\)|News style|Shout-Out! style/.test(html), '14h. Prompt #186: Poll style picker labels absent');
assert(/data-lantern-archived-feature="create_mission_picker"/.test(html), '14i. Prompt #186: Open missions picker archived');
assert(/resolveSessionAuthorType/.test(html), '14j. Prompt #186: session author type helper present');
assert(/hidden[\s\S]{0,40}id="pollFallbackSelect"[\s\S]{0,40}value="poll"/.test(html) || /id="pollFallbackSelect"[^>]*value="poll"/.test(html), '14k. Prompt #186: poll fallback defaults to poll');

assert(
  /\.wrap\.lanternContent input\[type="text"\][\s\S]{0,500}font-size:\s*var\(--create-control-fs\)/.test(html),
  '15. standard text inputs use --create-control-fs'
);
assert(
  /textarea\.studioBodyInput[\s\S]{0,300}font-size:\s*var\(--create-control-fs\)/.test(html)
    || /\.wrap\.lanternContent textarea[\s\S]{0,400}font-size:\s*var\(--create-control-fs\)/.test(html),
  '16. textareas share control font-size token'
);

assert(
  /#studioFullPreview[\s\S]{0,200}\.newsTitle\{[^}]*font-weight:\s*900/s.test(html)
    || /#studioFullPreview[\s\S]{0,400}font-size:\s*32px/.test(html),
  '17. published "When opened" preview title remains prominent (not flattened)'
);

assert(
  !/id="newsTitle"[^>]*style="[^"]*font-size:\s*26/.test(html),
  '18. newsTitle has no inline oversized font-size'
);

console.log('\ncreate-form-controls-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
