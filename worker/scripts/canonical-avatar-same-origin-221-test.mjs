/**
 * Prompt #221 — same-origin LANTERN_AVATAR_API='' must resolve real Locker avatars (not skip fetch).
 * Usage: node worker/scripts/canonical-avatar-same-origin-221-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const avatarJs = fs.readFileSync(path.join(root, 'app/js/lantern-avatar.js'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const feedExplore = fs.readFileSync(path.join(root, 'app/js/lantern-feed-explore.js'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

assert(/base === null/.test(avatarJs) && !/if\s*\(\s*!base\s*\|\|/.test(avatarJs), '1. empty-string API base is allowed (not !base)');
assert(/getAvatarApiBase/.test(avatarJs) && /LANTERN_AVATAR_API === null/.test(avatarJs), '2. null/undefined still means API off');
assert(/toSameOriginAvatarUrl|lantern-api\.mrradle\.workers\.dev/.test(avatarJs), '3. worker absolute avatar URLs rewritten same-origin');
assert(/authorAvatarKey/.test(avatarJs) && /authorId/.test(avatarJs), '4. durable keys preferred over display name');
assert(/credentials:\s*'same-origin'/.test(avatarJs), '5. avatar status fetch uses same-origin credentials');
assert(/LANTERN_AVATAR_API === null/.test(tickerJs) || /LANTERN_AVATAR_API == null/.test(tickerJs), '6. ticker treats empty string as same-origin');
assert(/authorAvatarKey \|\| it\.author_avatar_key \|\| it\.authorId/.test(feedExplore), '7. explore prefers durable avatar keys');
assert(/getAdoptedAccountKey/.test(contribute) && /attachCanonicalAvatarsToItems/.test(contribute), '8. Create mock cards attach canonical avatars via account key');

const fetches = [];
const sandbox = {
  console,
  fetch(url, opts) {
    fetches.push({ url: String(url), opts: opts || {} });
    if (String(url).indexOf('character_name=rick.radle') >= 0) {
      return Promise.resolve({
        json() {
          return Promise.resolve({
            ok: true,
            status: {
              active_image:
                'https://lantern-api.mrradle.workers.dev/api/avatar/image?key=avatars%2Fav-rick.png&v=1',
            },
          });
        },
      });
    }
    if (String(url).indexOf('character_name=Rick') >= 0) {
      return Promise.resolve({
        json() {
          return Promise.resolve({ ok: true, status: { active_image: null } });
        },
      });
    }
    return Promise.resolve({
      json() {
        return Promise.resolve({ ok: true, status: { active_image: null } });
      },
    });
  },
  window: undefined,
};
sandbox.window = sandbox;
sandbox.LANTERN_AVATAR_API = ''; // production Pages same-origin
vm.createContext(sandbox);
vm.runInContext(avatarJs, sandbox);
const LA = sandbox.LanternAvatar;

assert(typeof LA.getAvatarApiBase === 'function' && LA.getAvatarApiBase() === '', '9. getAvatarApiBase returns empty string when API is ""');

await LA.getCanonicalAvatar('rick.radle').then(function (r) {
  assert(r && r.imageUrl && r.imageUrl.indexOf('/api/avatar/image') === 0, '10. same-origin fetch returns image URL', r);
  assert(r.imageUrl.indexOf('lantern-api.mrradle.workers.dev') < 0, '11. image URL rewritten off workers.dev host', r.imageUrl);
});

assert(fetches.some((f) => f.url === '/api/avatar/status?character_name=rick.radle'), '12. fetched /api/avatar/status on same origin');

await LA.attachCanonicalAvatarsToItems([
  {
    authorDisplayName: 'Rick Radle',
    authorAvatarKey: 'rick.radle',
    authorId: 'rick.radle',
    character_name: 'rick.radle',
  },
]).then(function (list) {
  const a = list[0]._canonicalAvatar;
  assert(a && a.imageUrl && a.imageUrl.indexOf('/api/avatar/image') === 0, '13. attach resolves real avatar for rick.radle', a);
  assert(!(a && a.emoji === '🌟' && !a.imageUrl), '14. fallback emoji not used when image exists');
});

/* Display-name-only key still works via separate lookup, but durable key is preferred. */
sandbox.LANTERN_AVATAR_API = null;
assert(LA.getAvatarApiBase() === null, '15. null API base means off');
await LA.getCanonicalAvatar('rick.radle').then(function (r) {
  assert(r && !r.imageUrl && r.emoji === '🌟', '16. API-off returns fallback emoji only', r);
});

console.log('\ncanonical-avatar-same-origin-221-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
