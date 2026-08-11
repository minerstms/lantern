/**
 * Prompt #186 — Create simplification + session-authoritative news + Missions front door.
 * Usage: node worker/scripts/create-simplify-186-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const missions = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

const typeSel = contribute.match(/id="contributeTypeSelect"[\s\S]*?<\/select>/);
assert(!!typeSel, '1. contributeTypeSelect present');
assert(typeSel && !/value="mission"/.test(typeSel[0]), '2. Complete a mission absent from selector');
assert(typeSel && /News \/ Update/.test(typeSel[0]), '3. News / Update present');
assert(typeSel && /Shout-Out!/.test(typeSel[0]), '4. Shout-Out! present');
assert(typeSel && /value="poll"/.test(typeSel[0]), '5. Poll present');

assert(!/>\s*I am submitting as/i.test(contribute), '6. I am submitting as label absent');
assert(/data-lantern-archived-feature="submit_as"/.test(contribute), '7. submit_as archived marker');
assert(/resolveSessionAuthorType/.test(contribute), '8. resolveSessionAuthorType helper');
assert(/resolveSessionAuthorName/.test(contribute), '9. resolveSessionAuthorName helper');

assert(!/id="newsCategorySelect"[\s\S]{0,200}<option/.test(contribute), '10. Why-writing options absent');
assert(/data-lantern-archived-feature="why_writing"/.test(contribute), '11. why_writing archived');
assert(/contributeDerivedCategory[\s\S]{0,40}School News/.test(contribute), '12. default news category School News');

assert(!/What kind of Shout-Out/.test(contribute), '13. Shout category picker absent');
assert(!/<option[^>]*>Kindness</.test(contribute), '14. Kindness option absent');
assert(!/<option[^>]*>Effort</.test(contribute), '15. Effort option absent');
assert(/Recognizing:/.test(contribute), '16. Shout body still prefixes recipient');

assert(!/Poll \(default\)/.test(contribute), '17. Poll style Poll (default) absent');
assert(!/News style/.test(contribute), '18. Poll News style absent');
assert(!/Shout-Out! style/.test(contribute), '19. Poll Shout-Out style absent');
assert(/id="pollFallbackSelect"[^>]*value="poll"/.test(contribute), '20. Hidden poll fallback = poll');

assert(/data-lantern-archived-feature="create_mission_picker"/.test(contribute), '21. Open missions archived in Create');
assert(/tp === 'mission'[\s\S]{0,80}missions\.html/.test(contribute), '22. ?type=mission redirects to Missions');
assert(/LANTERN_STUDIO_MISSION_OPEN[\s\S]{0,120}missions\.html/.test(contribute), '23. studio mission open redirects to Missions');
assert(/tp === 'photo'[\s\S]{0,120}contributeDerivedCategory[\s\S]{0,80}'Photo'/.test(contribute), '24. ?type=photo sets Photo category');

assert(/Prompt #186[\s\S]{0,200}getPilotAccountFromRequest/.test(worker), '25. news/create uses session');
assert(/NEWS_PUBLISHER_ROLES/.test(worker), '26. news publisher roles local set');
assert(/clientClaim[\s\S]{0,120}forbidden/.test(worker), '27. student cannot claim staff author_type');
assert(/fallbackResolved[\s\S]{0,200}'poll'/.test(worker), '28. poll contribute defaults fallback to poll');

assert(/contribute\.html\?type=poll/.test(missions), '29. Poll mission → Contribute poll');
assert(/contribute\.html\?type=shoutout/.test(missions), '30. Shout mission → Contribute shoutout');
assert(/contribute\.html\?type=photo/.test(missions), '31. Photo mission → Contribute photo');
assert(/openMissionSubmitModal/.test(missions), '32. Manual mission modal preserved');
assert(/openDailyCheckInPicker/.test(missions), '33. Daily Check-In remains automatic UI');
assert(/games\.html/.test(missions), '34. First Game routes to Games');

assert(!/id="shoutOutCategory"/.test(teacher), '35. Teacher shout category input removed');
assert(/category:\s*null/.test(teacher), '36. Teacher shout posts category null');

console.log('\ncreate-simplify-186-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
