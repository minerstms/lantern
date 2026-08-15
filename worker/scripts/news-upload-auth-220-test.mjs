/**
 * Prompt #220 — news image/video uploads require a valid pilot session
 * before payload handling or R2 writes.
 * Usage: node worker/scripts/news-upload-auth-220-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function signTestJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sigBuf))}`;
}
async function cookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: account.username,
    role: account.role,
    scn: account.student_character_name || null,
    tid: account.teacher_id || null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.puts = [];
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 1 } }; },
    };
    return api;
  }
  const bucket = {
    async put(key, bytes, opts) {
      state.puts.push({ key, size: bytes && bytes.length, contentType: opts && opts.httpMetadata && opts.httpMetadata.contentType });
      return { key };
    },
  };
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    NEWS_BUCKET: bucket,
    AVATAR_BUCKET: bucket,
  };
}

async function postUpload(env, pathName, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example' + pathName, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  }), env);
  return { status: res.status, json: await res.json() };
}

const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
if (/requireAuthenticatedNewsUpload/.test(indexSrc)) ok('news upload auth helper present');
else bad('news upload auth helper');
if (
  /upload-image[\s\S]{0,250}requireAuthenticatedNewsUpload/.test(indexSrc) &&
  /upload-video[\s\S]{0,250}requireAuthenticatedNewsUpload/.test(indexSrc)
) {
  ok('image and video routes authorize before payload/R2');
} else bad('auth-before-payload wiring');
if (/Image too large \(max 5MB\)/.test(indexSrc) && /Video too large \(max 25MB\)/.test(indexSrc)) {
  ok('existing size limits remain');
} else bad('size limits');

const student = {
  username: '20889',
  display_name: 'Lucas',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
  is_active: 1,
  must_change_password: 0,
};
const mcp = {
  ...student,
  username: '20890',
  display_name: 'Pat',
  student_character_name: 'Pat',
  mtss_student_id: '20890',
  must_change_password: 1,
};
const teacher = {
  username: 'ms_carter',
  display_name: 'Ms. Carter',
  role: 'teacher',
  staff_id: 10,
  is_active: 1,
  must_change_password: 0,
};

const state = { accounts: { '20889': student, '20890': mcp, ms_carter: teacher } };
const env = makeEnv(state);
const studentCookie = await cookieFor(student);
const mcpCookie = await cookieFor(mcp);
const teacherCookie = await cookieFor(teacher);

for (const route of ['/api/news/upload-image', '/api/news/upload-video']) {
  const label = route.includes('image') ? 'image' : 'video';
  const before = state.puts.length;
  const anon = await postUpload(env, route, null, {});
  if (anon.status === 401 && anon.json.error === 'not_authenticated' && state.puts.length === before) {
    ok('anonymous ' + label + ' → 401 and zero R2 puts');
  } else bad('anonymous ' + label, { anon, puts: state.puts.length });

  const mcpRes = await postUpload(env, route, mcpCookie, route.includes('image')
    ? { image: TINY_PNG_B64, mime_type: 'image/png' }
    : { video: TINY_PNG_B64, mime_type: 'video/mp4' });
  if (mcpRes.status === 403 && mcpRes.json.error === 'must_change_password' && state.puts.length === before) {
    ok('MCP ' + label + ' blocked before R2');
  } else bad('mcp ' + label, { mcpRes, puts: state.puts.length });

  const missing = await postUpload(env, route, studentCookie, {});
  if (missing.status === 400 && state.puts.length === before) {
    ok('authenticated ' + label + ' reaches payload validation without R2 write');
  } else bad('validated ' + label, { missing, puts: state.puts.length });
}

const imageOk = await postUpload(env, '/api/news/upload-image', studentCookie, {
  image: TINY_PNG_B64,
  mime_type: 'image/png',
  file_name: 'tiny.png',
});
if (imageOk.status === 200 && imageOk.json.ok && imageOk.json.image_r2_key && state.puts.length === 1) {
  ok('valid authenticated student can upload a news image');
} else bad('student image upload', { imageOk, puts: state.puts });

const tooBig = 'A'.repeat(8 * 1024 * 1024);
const big = await postUpload(env, '/api/news/upload-image', studentCookie, {
  image: tooBig,
  mime_type: 'image/png',
});
if (big.status === 400 && /too large/i.test(String(big.json.error || '')) && state.puts.length === 1) {
  ok('existing 5MB image size limit still enforced after auth');
} else bad('size limit runtime', big);

const videoMissing = await postUpload(env, '/api/news/upload-video', teacherCookie, {});
if (videoMissing.status === 400 && videoMissing.json.error === 'Missing video') {
  ok('authenticated teacher reaches the existing video validation path');
} else bad('teacher video validation', videoMissing);

console.log('\nnews-upload-auth-220-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
