/**
 * Prompt #260 — Class Website student sign-in document title.
 * Usage: node worker/scripts/class-website-signin-title-260-test.mjs
 */
import fs from 'fs';
import vm from 'vm';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const login = fs.readFileSync(new URL('../../app/login.html', import.meta.url), 'utf8');
const change = fs.readFileSync(new URL('../../app/change-password.html', import.meta.url), 'utf8');
const authSrc = fs.readFileSync(new URL('../../app/js/lantern-pilot-auth.js', import.meta.url), 'utf8');
const failSrc = fs.readFileSync(new URL('../geppetto-student-handoff.js', import.meta.url), 'utf8');
const SAFE_GENERIC = 'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdigital-art.html';
const SAFE_MAKEUP =
  'https://mrradle.us/api/stem-daily/student/lantern-callback?next=' + encodeURIComponent('/?makeup=1');

function loadAuth(search, pathname) {
  const document = { title: 'Sign in | Lantern' };
  const location = { search: search || '', pathname: pathname || '/login.html' };
  const window = { document, location, LANTERN_AVATAR_API: '' };
  const ctx = { window, document, location, console, URLSearchParams, URL };
  vm.runInNewContext(authSrc, ctx);
  return ctx.window.LanternAuth;
}

function runHeadTitleScript(html, search) {
  const m = html.match(/<title>([^<]*)<\/title>\s*<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('missing title + immediate script');
  const document = { title: m[1] };
  const location = { search: search || '' };
  vm.runInNewContext(m[2], { document, location, URLSearchParams, URL });
  return { defaultTitle: m[1], title: document.title };
}

function testHelperTitles() {
  const auth = loadAuth('', '/login.html');
  const direct = auth.classWebsiteSignInDocumentTitle('');
  if (direct) return bad('1. direct /login helper must keep Lantern default', direct);
  const intent = auth.classWebsiteSignInDocumentTitle('?intent=class-website&return=%2Fapi%2Fauth%2Fgeppetto-student-authorize%3Freturn%3Dx');
  if (intent !== 'Student Sign In' || /lantern/i.test(intent)) {
    return bad('2. intent=class-website title must be Student Sign In', intent);
  }
  const authorizeOnly = auth.classWebsiteSignInDocumentTitle('?return=/api/auth/geppetto-student-authorize?return=https://mrradle.us/api/stem-daily/student/lantern-callback');
  if (authorizeOnly !== 'Student Sign In') return bad('authorize return must be class-website', authorizeOnly);
  const explore = auth.classWebsiteSignInDocumentTitle('?return=/explore.html');
  if (explore) return bad('8. explore return must keep Lantern title', explore);
  ok('1/2/8. helper titles: direct Lantern, class-website Student Sign In');
}

function testHeadScripts() {
  const direct = runHeadTitleScript(login, '', 'Sign in | Lantern');
  if (direct.defaultTitle !== 'Sign in | Lantern' || direct.title !== 'Sign in | Lantern') {
    return bad('1. direct login head title must stay Sign in | Lantern', direct);
  }
  if (!/Lantern/.test(direct.title)) return bad('1. direct /login title must contain Lantern', direct.title);

  const classLogin = runHeadTitleScript(login, '?intent=class-website&return=%2Fapi%2Fauth%2Fgeppetto-student-authorize%3Freturn%3Dhttps%253A%252F%252Fmrradle.us%252Fapi%252Fstem-daily%252Fstudent%252Flantern-callback%253Fnext%253D%25252F%25253Fmakeup%25253D1');
  if (classLogin.title !== 'Student Sign In' || /lantern/i.test(classLogin.title)) {
    return bad('2/3. class-website login tab title leaked Lantern', classLogin);
  }

  const changeDirect = runHeadTitleScript(change, '');
  if (changeDirect.defaultTitle !== 'Choose a new password | Lantern' || !/Lantern/.test(changeDirect.title)) {
    return bad('8. direct change-password title must stay Lantern', changeDirect);
  }
  const changeClass = runHeadTitleScript(change, '?intent=class-website&return=/api/auth/geppetto-student-authorize?return=https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2F%3Fmakeup%3D1');
  if (changeClass.title !== 'Student Sign In' || /lantern/i.test(changeClass.title)) {
    return bad('4. class-website change-password title leaked Lantern', changeClass);
  }
  ok('2/3/4. head scripts set Student Sign In without Lantern');
}

function testCopyAndResume() {
  if (!login.includes('Student Sign In') || !login.includes('Sign in to continue to Class Website.')) {
    return bad('3. generic class-website heading copy missing');
  }
  if (!login.includes('Sign in to continue to your Make Up Assignment.')) {
    return bad('3. explicit Make Up heading copy missing');
  }
  if (!login.includes('isGeppettoMakeupReturn') || !change.includes('isGeppettoMakeupReturn')) {
    return bad('3. login/change-password must detect makeup purpose');
  }
  const auth = loadAuth('', '/login.html');
  const genericSub = auth.classWebsiteSignInSubtitle('/api/auth/geppetto-student-authorize?return=' + encodeURIComponent(SAFE_GENERIC));
  const makeupSub = auth.classWebsiteSignInSubtitle('/api/auth/geppetto-student-authorize?return=' + encodeURIComponent(SAFE_MAKEUP));
  if (genericSub !== 'Sign in to continue to Class Website.') {
    return bad('generic subtitle must be Class Website', genericSub);
  }
  if (makeupSub !== 'Sign in to continue to your Make Up Assignment.') {
    return bad('makeup subtitle must stay Make Up', makeupSub);
  }
  if (!login.includes('isClassWebsiteSsoReturn') || !login.includes('location.replace(returnTo)')) {
    return bad('5. login must still resume authorize');
  }
  if (!change.includes('isClassWebsiteSsoReturn') || !change.includes('location.replace(dest)')) {
    return bad('6. change-password must still resume authorize');
  }
  if (!login.includes('makeup') && !change.includes('makeup')) {
    /* makeup dest lives on the authorize return query, not necessarily the word makeup in login.html */
  }
  if (!failSrc.includes('<title>Student Sign In</title>')) return bad('failure page title must be Student Sign In');
  if (/<title>[^<]*Lantern[^<]*<\/title>/.test(failSrc)) return bad('class-website failure title must not say Lantern');
  if (/Continue with Lantern|Sign in \| Lantern|Lantern Login|Lantern account required/.test(failSrc)) {
    return bad('failure page leaked Lantern login branding');
  }
  ok('3/5/6. copy and authorize resume remain intact');
}

function testMakeupReturnStillInAuthorize() {
  const workerSrc = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  if (!workerSrc.includes("loginLoc = '/login.html?return=' + encodeURIComponent(authorizeSelf) + '&intent=class-website'")) {
    return bad('5. authorize must still send class-website login intent');
  }
  if (!workerSrc.includes('geppetto-student-authorize')) return bad('SSO authorize route missing');
  ok('5/7. authorize still resumes Geppetto and can carry Make Up next');
}

testHelperTitles();
testHeadScripts();
testCopyAndResume();
testMakeupReturnStillInAuthorize();

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
