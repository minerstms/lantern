// force deploy sync test
/**
 * Lantern API — Cloudflare Worker (Lantern-only)
 * Routes: /api/avatar, /api/economy, /api/news, /api/approvals, /api/recognition, /api/reactions
 * No MTSS / case / private student data.
 */
// SCHEMA RULE:
// All field names must match docs/archive/LANTERN_SCHEMA.md (see docs/LANTERN_SYSTEM_CONTEXT.md §14)
// Do not invent or assume column names.
// Verify against D1 before using.

/** Reusable CORS headers for all API and OPTIONS responses. Ensures preflight for X-Class-Token succeeds. */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Class-Token',
  'Access-Control-Max-Age': '86400',
};

/** After creating the Cloudflare Pages project, set to your site origin, e.g. https://my-project.pages.dev. Required for pilot login + credentialed CORS. */
const PRODUCTION_PAGES_ORIGIN = 'https://lantern-42i.pages.dev';

const ALLOWED_ORIGINS = [
  ...(PRODUCTION_PAGES_ORIGIN ? [PRODUCTION_PAGES_ORIGIN] : []),
  'http://localhost:8787',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:8787',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

/** Production + Cloudflare Pages preview hosts for this project (HTTPS only). */
function isLanternPagesOrigin(origin) {
  const o = String(origin || '').trim();
  if (!o) return false;
  if (PRODUCTION_PAGES_ORIGIN && o === PRODUCTION_PAGES_ORIGIN) return true;
  try {
    const u = new URL(o);
    if (u.protocol !== 'https:') return false;
    return (
      u.hostname === 'lantern-42i.pages.dev' || u.hostname.endsWith('.lantern-42i.pages.dev')
    );
  } catch (_) {
    return false;
  }
}

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Class-Token',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

/** CORS for pilot login/logout with cookies (cannot use wildcard origin). */
function corsForPilot(request) {
  const origin = String(request.headers.get('Origin') || '').trim();
  const allowed =
    isLanternPagesOrigin(origin) ||
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Class-Token, X-Lantern-Economy-Secret',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Extract raw base64 payload from a data URL (any `data:...;base64,`) or from a bare base64 string.
 * Strips whitespace/newlines so atob() accepts output from JSON + canvas/cropper.
 * The old /^data:image\/\w+;base64,/ strip failed for e.g. charset segments and some edge data URLs.
 */
function stripBase64Payload(dataUrlOrB64) {
  const s = String(dataUrlOrB64 || '').trim();
  if (!s) return '';
  const marker = ';base64,';
  const idx = s.indexOf(marker);
  if (idx !== -1) {
    return s.slice(idx + marker.length).replace(/\s/g, '');
  }
  return s.replace(/\s/g, '');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = String(url.pathname || '/').replace(/\/+/g, '/');
    const path = pathname.replace(/\/$/, '') || '/';
    if (request.method === 'OPTIONS') {
      let o = corsHeaders;
      if (
        path.startsWith('/api/pilot') ||
        path.startsWith('/api/auth') ||
        path.startsWith('/api/admin') ||
        path.startsWith('/api/class-access') ||
        path.startsWith('/api/economy') ||
        path.startsWith('/api/integrations') ||
        path.startsWith('/api/approvals') ||
        path === '/api/news/hide' ||
        path === '/api/news/restore' ||
        path === '/api/news/hidden' ||
        path === '/api/missions/submissions/hide' ||
        path === '/api/missions/submissions/restore' ||
        path === '/api/missions/submissions/hidden'
      ) {
        o = corsForPilot(request);
      } else if (path.startsWith('/api/setup')) o = getCorsHeaders(request);
      return new Response(null, { status: 204, headers: o });
    }
    const cors = corsHeaders;
    if (!path.startsWith('/api/')) {
      return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    }
    if (request.method === 'GET' && path === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'lantern-api',
        timestamp: new Date().toISOString(),
      }, 200, cors);
    }
    if (path.startsWith('/api/approvals')) {
      const approvalsCors = corsForPilot(request);
      try {
        return await handleApprovalsRoutes(request, url, path, env);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, approvalsCors);
      }
    }
    if (path.startsWith('/api/integrations')) {
      try {
        const integrationCors = corsForPilot(request);
        return await handleMtssIntegrationRoutes(request, url, path, env, integrationCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        const integrationCors = corsForPilot(request);
        return jsonResponse({ ok: false, error: message }, 400, integrationCors);
      }
    }
    if (path.startsWith('/api/avatar')) {
      try {
        return await handleAvatarRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/economy')) {
      try {
        const economyCors = corsForPilot(request);
        return await handleEconomyRoutes(request, url, path, env, economyCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        const economyCors = corsForPilot(request);
        return jsonResponse({ ok: false, error: message }, 400, economyCors);
      }
    }
    if (path.startsWith('/api/news')) {
      try {
        return await handleNewsRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/recognition')) {
      try {
        return await handleRecognitionRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/reactions')) {
      try {
        return await handleReactionsRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/missions')) {
      try {
        return await handleMissionsRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/report') || path.startsWith('/api/moderation')) {
      try {
        return await handleModerationRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/verify')) {
      try {
        return await handleVerifyRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/class-access')) {
      const classAccessCors = corsForPilot(request);
      try {
        return await handleClassAccessRoutes(request, url, path, env, classAccessCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, classAccessCors);
      }
    }
    if (path.startsWith('/api/beta-reports')) {
      try {
        return await handleBetaReportsRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/polls')) {
      try {
        return await handlePollsRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/media')) {
      try {
        return await handleMediaRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/bug-reports')) {
      try {
        return await handleBugReportsRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/leaderboards')) {
      try {
        return await handleLeaderboardRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/games')) {
      try {
        return await handleGamesRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/test-students')) {
      try {
        return await handleTestStudentRoutes(request, url, path, env, cors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, cors);
      }
    }
    if (path.startsWith('/api/setup')) {
      try {
        const setupCors = getCorsHeaders(request);
        return await handleSetupRoutes(request, url, path, env, setupCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, getCorsHeaders(request));
      }
    }
    if (path.startsWith('/api/auth')) {
      try {
        const pCors = corsForPilot(request);
        if (path === '/api/auth/login' && request.method === 'POST') {
          const r2 = new Request(new URL('/api/pilot/login', request.url), request);
          return await handlePilotRoutes(r2, new URL(r2.url), '/api/pilot/login', env, pCors);
        }
        if (path === '/api/auth/me' && request.method === 'GET') {
          const r2 = new Request(new URL('/api/pilot/me', request.url), request);
          return await handlePilotRoutes(r2, new URL(r2.url), '/api/pilot/me', env, pCors);
        }
        if (path === '/api/auth/logout' && request.method === 'POST') {
          const r2 = new Request(new URL('/api/pilot/logout', request.url), request);
          return await handlePilotRoutes(r2, new URL(r2.url), '/api/pilot/logout', env, pCors);
        }
        return await handleAuthRoutes(request, url, path, env, pCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    if (path.startsWith('/api/admin')) {
      try {
        return await handleAdminRoutes(request, url, path, env, corsForPilot(request));
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    if (path.startsWith('/api/pilot')) {
      try {
        const pilotCors = corsForPilot(request);
        return await handlePilotRoutes(request, url, path, env, pilotCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    return jsonResponse(
      { ok: false, error: 'Not found' },
      404,
      path.startsWith('/api/approvals') ? corsForPilot(request) : cors
    );
  },
};

/** Shared verify/demo config (teachers, students, checklist, build). Single source for cloud-backed verify. */
const VERIFY_CONFIG = {
  build: {
    phase: 'Demo hardening — cloud-backed verify and simulation',
    purpose: 'Verify/sim state in Worker + D1 so demos work across devices. Simulation only, not real auth.',
    filesChanged: 'lantern-worker: verify routes, schema-verify.sql. verify.html, teacher.html, index.html: cloud state + URL params.',
    risks: 'Reset protected by single admin password (Worker secret). Use only for demo/dev.',
    manualVerification: 'End-to-end: set identity on device A, open teacher/student on device B; reset requires password.',
  },
  teachers: [
    { teacher_id: 'teacherA', displayName: 'Ms. Frizzleton', role: 'Creative STEM mentor', greeting: "Let's launch something amazing today.", avatarPath: 'avatars/teachers/teacherA.png', theme: 'accent-gold' },
    { teacher_id: 'teacherB', displayName: 'Mr. Feenan', role: 'Steady classroom guide', greeting: "Clear expectations. Strong work. Let's go.", avatarPath: 'avatars/teachers/teacherB.png', theme: 'accent-blue' },
    { teacher_id: 'mr_radle', displayName: 'Mr. Radle', role: 'Permanent missions moderator', greeting: 'Beta missions — approve to publish.', avatarPath: 'avatars/teachers/mr_radle.png', theme: 'accent-gold' },
  ],
  students: [
    { character_name: 'zane_morrison', displayName: 'Zane Morrison', avatarPath: 'avatars/students/zane_morrison.png', role: 'student', theme: '' },
    { character_name: 'winnie_addair', displayName: 'Winnie Addair', avatarPath: 'avatars/students/winnie_addair.png', role: 'student', theme: '' },
    { character_name: 'brett_simms', displayName: 'Brett Simms', avatarPath: 'avatars/students/brett_simms.png', role: 'student', theme: '' },
    { character_name: 'kimber_pace', displayName: 'Kimber Pace', avatarPath: 'avatars/students/kimber_pace.png', role: 'student', theme: '' },
    { character_name: 'velma_voss', displayName: 'Velma Voss', avatarPath: 'avatars/students/velma_voss.png', role: 'student', theme: '' },
    { character_name: 'archie_rivers', displayName: 'Archie Rivers', avatarPath: 'avatars/students/archie_rivers.png', role: 'student', theme: '' },
    { character_name: 'raven_hart', displayName: 'Raven Hart', avatarPath: 'avatars/students/raven_hart.png', role: 'student', theme: '' },
    { character_name: 'tori_sparks', displayName: 'Tori Sparks', avatarPath: 'avatars/students/tori_sparks.png', role: 'student', theme: '' },
    { character_name: 'miles_parker', displayName: 'Miles Parker', avatarPath: 'avatars/students/miles_parker.png', role: 'student', theme: '' },
    { character_name: 'lola_luna', displayName: 'Lola Luna', avatarPath: 'avatars/students/lola_luna.png', role: 'student', theme: '' },
  ],
  checklist: [
    { section: 'Mission moderation', testName: 'Ms. Frizzleton can approve her own mission submission', why: 'Owner can moderate.', steps: 'Act as Ms. Frizzleton, open mission submissions, approve one.', expected: 'Success.', id: 'mission-owner-approve' },
    { section: 'Mission moderation', testName: "Mr. Feenan gets 403 when trying to approve Ms. Frizzleton's mission", why: 'FERPA: no cross-teacher action.', steps: 'As Teacher B, call approve on a submission belonging to Teacher A mission.', expected: '403 Not authorized.', id: 'mission-other-403' },
    { section: 'Mission moderation', testName: "Mr. Feenan does not see Ms. Frizzleton's mission submissions", why: 'FERPA: no cross-teacher visibility.', steps: 'Act as Mr. Feenan, open teacher page.', expected: 'No submissions from Teacher A missions.', id: 'mission-other-invisible' },
    { section: 'Student visibility', testName: 'Student (e.g. Zane Morrison) only sees allowed missions', why: 'Correct targeting.', steps: 'Act as Zane, open Missions.', expected: 'Only missions for that student/school.', id: 'student-missions-only' },
    { section: 'Student visibility', testName: "Students cannot see other students' private submissions", why: 'FERPA.', steps: 'Confirm explore/feed only shows approved/public content.', expected: 'No private submission leakage.', id: 'student-no-leak' },
    { section: 'Persistence', testName: 'Mission approval persists after refresh', why: 'D1 durability.', steps: 'Approve a submission, refresh teacher page.', expected: 'Submission still accepted.', id: 'persist-approval' },
    { section: 'Persistence', testName: 'Dashboard data remains correct after refresh', why: 'Worker single source of truth.', steps: 'Load teacher dashboard, refresh.', expected: 'Counts and rows match.', id: 'persist-dashboard' },
    { section: 'Moderation systems', testName: 'Mission approvals work', why: 'Core flow.', steps: 'Approve a mission submission.', expected: 'Accepted, nuggets if configured.', id: 'mod-mission' },
    { section: 'Moderation systems', testName: 'News approvals work', why: 'Dashboard consistency.', steps: 'Approve a news item.', expected: 'Approved.', id: 'mod-news' },
    { section: 'Moderation systems', testName: 'Avatar approvals work', why: 'Full pipeline.', steps: 'Approve an avatar.', expected: 'Approved.', id: 'mod-avatar' },
    { section: 'Moderation systems', testName: 'Dashboard counts match visible rows', why: 'No stale counts.', steps: 'Compare badge numbers to list length.', expected: 'Match.', id: 'mod-counts' },
    { section: 'Demo flow', testName: 'Teacher creates mission', why: 'Start of demo.', steps: 'Act as teacher, create mission.', expected: 'Mission appears in list.', id: 'demo-create' },
    { section: 'Demo flow', testName: 'Student submits', why: 'Submission.', steps: 'Act as student, submit mission.', expected: 'Submission pending.', id: 'demo-submit' },
    { section: 'Demo flow', testName: 'Teacher approves', why: 'Moderation.', steps: 'Act as same teacher, approve.', expected: 'Accepted.', id: 'demo-approve' },
    { section: 'Demo flow', testName: 'Nuggets appear', why: 'Economy.', steps: 'Check student balance after approval.', expected: 'Nuggets credited.', id: 'demo-nuggets' },
    { section: 'Demo flow', testName: 'Recognition / display updates', why: 'Hallway feed.', steps: 'Open display, confirm approved content can appear.', expected: 'Updates visible.', id: 'demo-display' },
  ],
};

const VERIFY_STATE_ID = 'global';

/** Load verify state from D1. Single source of truth for id 'global'. */
async function loadVerifyState(env) {
  const db = env.DB;
  if (!db) return {};
  const row = await db.prepare("SELECT state_json FROM lantern_verify_state WHERE id = ?").bind(VERIFY_STATE_ID).first();
  if (!row || !row.state_json) return {};
  try {
    return JSON.parse(row.state_json);
  } catch (_) {
    return {};
  }
}

async function handleVerifyRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/verify/config') {
    return jsonResponse({ ok: true, build: VERIFY_CONFIG.build, teachers: VERIFY_CONFIG.teachers, students: VERIFY_CONFIG.students, checklist: VERIFY_CONFIG.checklist }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/verify/state') {
    const state = await loadVerifyState(env);
    return jsonResponse({ ok: true, state }, 200, cors);
  }

  if ((request.method === 'PUT' || request.method === 'POST') && path === '/api/verify/state') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const current = await loadVerifyState(env);
    const updated = { ...(current || {}), ...body };
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO lantern_verify_state (id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
    ).bind(VERIFY_STATE_ID, JSON.stringify(updated), now).run();
    const verify = await loadVerifyState(env);
    return jsonResponse({ ok: true, state: verify }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/verify/reset') {
    let body = {};
    try {
      body = await request.json().catch(() => ({}));
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const password = (body.password || '').trim();
    const expected = (env.LANTERN_VERIFY_RESET_PASSWORD || '').trim();
    if (!expected || password !== expected) {
      return jsonResponse({ ok: false, error: 'Invalid or missing password' }, 401, cors);
    }
    const action = (body.action || 'reset').trim().toLowerCase();
    const now = new Date().toISOString();
    if (action === 'reseed') {
      const state = { checklist: {}, build: VERIFY_CONFIG.build };
      await db.prepare(
        'INSERT INTO lantern_verify_state (id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at'
      ).bind(VERIFY_STATE_ID, JSON.stringify(state), now).run();
      return jsonResponse({ ok: true, message: 'Reseeded verify state' }, 200, cors);
    }
    await db.prepare('DELETE FROM lantern_verify_state WHERE id = ?').bind(VERIFY_STATE_ID).run();
    return jsonResponse({ ok: true, message: 'Verify state reset' }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

/** Pilot auth — must match bootstrap hashing for lantern_pilot_accounts.password_hash (PBKDF2-SHA256). */
const PILOT_PBKDF2_ITERATIONS = 10000;
const PILOT_COOKIE_NAME = 'lantern_pilot';
const PILOT_JWT_TTL_SEC = 8 * 3600;
/** Only these usernames may be updated by POST /api/pilot/bootstrap-passwords */
const PILOT_LOCKED_USERNAMES = ['student1', 'student2', 'teacher1', 'teacher2', 'admin'];

/** Canonical primary admin (Lantern ship contract). Login ID + password enforced before verify on each login attempt. */
const LANTERN_PRIMARY_ADMIN_USERNAME = 'Rick Radle';
const LANTERN_PRIMARY_ADMIN_PASSWORD = '1606';
const LANTERN_PRIMARY_ADMIN_DISPLAY_NAME = 'Rick Radle';

function b64urlFromBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pilotHashPassword(plaintext, saltStr) {
  const saltBuffer = new TextEncoder().encode(saltStr);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plaintext),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuffer, iterations: PILOT_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function pilotRandomSaltHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ensures exactly one row for the primary admin: username Rick Radle, role admin, active, PBKDF2 hash for password 1606.
 * Invoked only on POST /api/pilot/login when the submitted username matches LANTERN_PRIMARY_ADMIN_USERNAME (trimmed).
 */
async function ensureLanternPrimaryAdminCredentials(db) {
  const salt = pilotRandomSaltHex();
  const hash = await pilotHashPassword(LANTERN_PRIMARY_ADMIN_PASSWORD, salt);
  const existing = await db
    .prepare('SELECT username FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))')
    .bind(LANTERN_PRIMARY_ADMIN_USERNAME)
    .first();
  if (existing) {
    await db
      .prepare(
        `UPDATE lantern_pilot_accounts SET
          password_hash = ?,
          password_salt = ?,
          role = 'admin',
          display_name = ?,
          is_active = 1,
          must_change_password = 0,
          password_changed_at = datetime('now'),
          updated_at = datetime('now'),
          password_reset_at = NULL,
          password_reset_by = NULL
        WHERE username = ?`
      )
      .bind(hash, salt, LANTERN_PRIMARY_ADMIN_DISPLAY_NAME, String(existing.username))
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO lantern_pilot_accounts (username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, updated_at, is_active, must_change_password, password_changed_at, password_reset_at, password_reset_by) VALUES (?, ?, 'admin', ?, ?, NULL, NULL, datetime('now'), 1, 0, datetime('now'), NULL, NULL)`
      )
      .bind(LANTERN_PRIMARY_ADMIN_USERNAME, LANTERN_PRIMARY_ADMIN_DISPLAY_NAME, hash, salt)
      .run();
  }
}

async function signPilotJwt(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = b64urlFromBytes(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64urlFromBytes(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigB64 = b64urlFromBytes(new Uint8Array(sigBuf));
  return `${data}.${sigB64}`;
}

function b64urlDecodeToString(str) {
  const s = String(str || '').replace(/\s/g, '');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

function b64urlDecodeToBytes(str) {
  const bin = b64urlDecodeToString(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyPilotJwt(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  let sigBytes;
  try {
    sigBytes = b64urlDecodeToBytes(parts[2]);
  } catch (_) {
    return null;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  let ok;
  try {
    ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  } catch (_) {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToString(parts[1]));
  } catch (_) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;
  return payload;
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader || !name) return '';
  const parts = cookieHeader.split(';');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim();
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq === -1) continue;
    const k = seg.slice(0, eq).trim();
    if (k !== name) continue;
    let v = seg.slice(eq + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch (_) {}
    return v;
  }
  return '';
}

function pilotSetCookieHeader(token, secure, maxAgeSec) {
  const parts = [
    `${PILOT_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=None',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function pilotClearCookieHeader(secure) {
  const parts = [`${PILOT_COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=None'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function timingSafeEqualStrings(a, b) {
  const enc = new TextEncoder();
  const ba = enc.encode(String(a));
  const bb = enc.encode(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.subtle.timingSafeEqual(ba, bb);
}

async function handleSetupRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/setup/status') {
    const row = await db.prepare('SELECT setup_completed_at FROM lantern_setup_state WHERE id = ?').bind('global').first();
    const completed = row && row.setup_completed_at != null && String(row.setup_completed_at).trim() !== '';
    return jsonResponse({ ok: true, setup_required: !completed }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/setup/complete') {
    const prior = await db.prepare('SELECT setup_completed_at FROM lantern_setup_state WHERE id = ?').bind('global').first();
    const already =
      prior && prior.setup_completed_at != null && String(prior.setup_completed_at).trim() !== '';
    if (already) {
      return jsonResponse({ ok: false, error: 'setup_already_completed' }, 403, cors);
    }

    const master = env.SETUP_MASTER_TOKEN;
    if (!master || String(master).trim() === '') {
      return jsonResponse({ ok: false, error: 'setup_not_configured' }, 503, cors);
    }

    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const setupToken = String(body.setup_token || '').trim();
    if (!setupToken) {
      return jsonResponse({ ok: false, error: 'setup_token_required' }, 400, cors);
    }
    if (!timingSafeEqualStrings(setupToken, String(master))) {
      return jsonResponse({ ok: false, error: 'Invalid setup token' }, 401, cors);
    }

    const passwords = body.passwords && typeof body.passwords === 'object' ? body.passwords : null;
    if (!passwords) {
      return jsonResponse({ ok: false, error: 'passwords_object_required' }, 400, cors);
    }
    for (const u of PILOT_LOCKED_USERNAMES) {
      if (!Object.prototype.hasOwnProperty.call(passwords, u) || passwords[u] === undefined || passwords[u] === null) {
        return jsonResponse({ ok: false, error: 'missing_password_for', username: u }, 400, cors);
      }
    }
    for (const k of Object.keys(passwords)) {
      if (!PILOT_LOCKED_USERNAMES.includes(k)) {
        return jsonResponse({ ok: false, error: 'unknown_username', username: k }, 400, cors);
      }
    }
    for (const u of PILOT_LOCKED_USERNAMES) {
      const pw = String(passwords[u] ?? '');
      if (!pw) {
        return jsonResponse({ ok: false, error: 'empty_password_for', username: u }, 400, cors);
      }
      const salt = pilotRandomSaltHex();
      const hash = await pilotHashPassword(pw, salt);
      const result = await db
        .prepare(
          'UPDATE lantern_pilot_accounts SET password_hash = ?, password_salt = ?, updated_at = datetime(\'now\'), must_change_password = 0, password_changed_at = datetime(\'now\') WHERE username = ?'
        )
        .bind(hash, salt, u)
        .run();
      const changes = typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
      if (!result.success || changes !== 1) {
        return jsonResponse({ ok: false, error: 'update_failed', username: u }, 500, cors);
      }
    }

    const fin = await db
      .prepare(
        'UPDATE lantern_setup_state SET setup_completed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ? AND setup_completed_at IS NULL'
      )
      .bind('global')
      .run();
    const finChanges = typeof fin.meta?.changes === 'number' ? fin.meta.changes : 0;
    if (!fin.success || finChanges !== 1) {
      return jsonResponse({ ok: false, error: 'setup_already_completed' }, 409, cors);
    }

    return jsonResponse(
      {
        ok: true,
        message: 'Setup complete. Rotate SETUP_MASTER_TOKEN in the Cloudflare dashboard for defense in depth.',
      },
      200,
      cors
    );
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

async function needsFirstAdminAccount(db) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM lantern_pilot_accounts WHERE role = 'admin' AND password_hash IS NOT NULL AND password_hash != '' AND password_salt IS NOT NULL AND password_salt != ''`
    )
    .first();
  return !row || Number(row.c) === 0;
}

async function getPilotAccountFromRequest(request, env) {
  const db = env.DB;
  if (!db) return null;
  const secret = env.PILOT_SESSION_SECRET;
  if (!secret || String(secret).trim() === '') return null;
  const token = getCookieValue(request.headers.get('Cookie') || '', PILOT_COOKIE_NAME);
  if (!token) return null;
  const payload = await verifyPilotJwt(token, secret);
  if (!payload || !payload.sub) return null;
  const row = await db
    .prepare(
      `SELECT username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, mtss_student_id, is_active, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
    )
    .bind(String(payload.sub))
    .first();
  if (!row) return null;
  const ia = row.is_active != null ? Number(row.is_active) : 1;
  if (ia === 0) return null;
  return row;
}

function pilotAccountRequiresChangePassword(row) {
  if (!row) return false;
  return row.must_change_password != null && Number(row.must_change_password) !== 0;
}

/** Session must be an active admin account (for hide/restore moderation). Returns { account } or { response }. */
async function requireAdminPilotSession(request, env, cors) {
  const account = await getPilotAccountFromRequest(request, env);
  if (!account) {
    return { response: jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors) };
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return {
      response: jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors),
    };
  }
  if (String(account.role || '').trim().toLowerCase() !== 'admin') {
    return { response: jsonResponse({ ok: false, error: 'forbidden' }, 403, cors) };
  }
  return { account };
}

function adminAuditLabel(account) {
  if (!account) return 'admin';
  const dn = account.display_name != null ? String(account.display_name).trim() : '';
  const u = account.username != null ? String(account.username).trim() : '';
  return dn || u || 'admin';
}

/** JSON clients often send numeric ids; (body.id || '').trim() throws on numbers. */
function parseModerationBodyId(body) {
  if (!body || body.id == null) return '';
  return String(body.id).trim();
}

/**
 * Wallet / economy character_name for students: prefer linked MTSS student_id, else student_character_name, else username.
 * Keeps POST /api/economy/transact (secret) and GET balance aligned when MTSS keys wallets by student_id.
 */
function pilotEconomyCharacterName(row) {
  if (!row) return '';
  const role = String(row.role || '').trim().toLowerCase();
  if (role !== 'student') return '';
  const mid = row.mtss_student_id != null && row.mtss_student_id !== undefined ? String(row.mtss_student_id).trim() : '';
  if (mid) return mid;
  const scn = row.student_character_name != null && row.student_character_name !== undefined ? String(row.student_character_name).trim() : '';
  if (scn) return scn;
  return String(row.username || '').trim();
}

async function handleAuthRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/auth/bootstrap-status') {
    const needs = await needsFirstAdminAccount(db);
    return jsonResponse({ ok: true, needs_first_admin: needs }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/auth/bootstrap-admin') {
    const needs = await needsFirstAdminAccount(db);
    if (!needs) {
      return jsonResponse({ ok: false, error: 'bootstrap_not_needed' }, 403, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const password = String(body.password || '');
    if (password.length < 8) {
      return jsonResponse({ ok: false, error: 'password_min_length', min: 8 }, 400, cors);
    }
    const displayName = String(body.display_name || 'Admin').trim() || 'Admin';
    const usernameWant = String(body.username || 'admin').trim();
    if (!usernameWant || usernameWant.length > 64) {
      return jsonResponse({ ok: false, error: 'invalid_username' }, 400, cors);
    }
    const salt = pilotRandomSaltHex();
    const hash = await pilotHashPassword(password, salt);
    const secure = url.protocol === 'https:';
    const secret = env.PILOT_SESSION_SECRET;
    if (!secret || String(secret).trim() === '') {
      return jsonResponse({ ok: false, error: 'session_not_configured' }, 503, cors);
    }

    const adminCountRow = await db.prepare(`SELECT COUNT(*) AS c FROM lantern_pilot_accounts WHERE role = 'admin'`).first();
    const ac = adminCountRow ? Number(adminCountRow.c) : 0;
    let finalUsername = usernameWant;

    if (ac === 0) {
      const ins = await db
        .prepare(
          `INSERT INTO lantern_pilot_accounts (username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, updated_at, is_active, must_change_password, password_changed_at, password_reset_at, password_reset_by) VALUES (?, ?, 'admin', ?, ?, NULL, NULL, datetime('now'), 1, 0, datetime('now'), NULL, NULL)`
        )
        .bind(usernameWant, displayName, hash, salt)
        .run();
      if (!ins.success) {
        return jsonResponse({ ok: false, error: 'insert_failed' }, 500, cors);
      }
    } else {
      const open = await db
        .prepare(
          `SELECT username FROM lantern_pilot_accounts WHERE role = 'admin' AND (password_hash IS NULL OR password_hash = '') ORDER BY username LIMIT 1`
        )
        .first();
      if (!open) {
        return jsonResponse({ ok: false, error: 'bootstrap_not_needed' }, 403, cors);
      }
      finalUsername = open.username;
      const upd = await db
        .prepare(
          `UPDATE lantern_pilot_accounts SET password_hash = ?, password_salt = ?, display_name = ?, must_change_password = 0, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE username = ? AND role = 'admin'`
        )
        .bind(hash, salt, displayName, finalUsername)
        .run();
      const ch = typeof upd.meta?.changes === 'number' ? upd.meta.changes : 0;
      if (!upd.success || ch !== 1) {
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, cors);
      }
    }

    const row = await db
      .prepare(
        `SELECT username, display_name, role, student_character_name, teacher_id, mtss_student_id FROM lantern_pilot_accounts WHERE username = ?`
      )
      .bind(finalUsername)
      .first();
    if (!row) {
      return jsonResponse({ ok: false, error: 'not_found' }, 500, cors);
    }
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      sub: row.username,
      role: row.role,
      scn: pilotEconomyCharacterName(row) || null,
      tid: row.teacher_id || null,
      iat: now,
      exp: now + PILOT_JWT_TTL_SEC,
    };
    const token = await signPilotJwt(jwtPayload, secret);

    return new Response(
      JSON.stringify({
        ok: true,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        student_character_name: row.student_character_name || null,
        mtss_student_id: row.mtss_student_id || null,
        economy_character_name:
          String(row.role || '').trim().toLowerCase() === 'student' ? pilotEconomyCharacterName(row) || null : null,
        teacher_id: row.teacher_id || null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...cors,
          'Set-Cookie': pilotSetCookieHeader(token, secure, PILOT_JWT_TTL_SEC),
        },
      }
    );
  }

  if (request.method === 'POST' && path === '/api/auth/change-password') {
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) {
      return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const newPassword = String(body.new_password || '');
    if (newPassword.length < 8) {
      return jsonResponse({ ok: false, error: 'password_min_length', min: 8 }, 400, cors);
    }
    const salt = pilotRandomSaltHex();
    const hash = await pilotHashPassword(newPassword, salt);
    const u = String(account.username || '').trim();
    await db
      .prepare(
        `UPDATE lantern_pilot_accounts SET password_hash = ?, password_salt = ?, must_change_password = 0, password_changed_at = datetime('now'), updated_at = datetime('now') WHERE username = ?`
      )
      .bind(hash, salt, u)
      .run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

async function handleAdminRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  const account = await getPilotAccountFromRequest(request, env);
  if (!account || String(account.role || '').trim().toLowerCase() !== 'admin') {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
  }

  if (request.method === 'GET' && path === '/api/admin/users') {
    const rows = await db
      .prepare(
        `SELECT username, display_name, role, student_character_name, teacher_id, mtss_student_id, is_active, updated_at, must_change_password, password_reset_at, password_reset_by FROM lantern_pilot_accounts ORDER BY username`
      )
      .all();
    return jsonResponse({ ok: true, users: rows.results || [] }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/admin/users') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const u = String(body.username || '').trim();
    const password = String(body.password || '');
    const displayName = String(body.display_name || u).trim() || u;
    const role = String(body.role || 'student').trim();
    if (!u || !password || password.length < 8) {
      return jsonResponse({ ok: false, error: 'username_and_password_required' }, 400, cors);
    }
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return jsonResponse({ ok: false, error: 'invalid_role' }, 400, cors);
    }
    const salt = pilotRandomSaltHex();
    const hash = await pilotHashPassword(password, salt);
    const scn = body.student_character_name != null ? String(body.student_character_name).trim() : null;
    const tid = body.teacher_id != null ? String(body.teacher_id).trim() : null;
    const mtssId =
      body.mtss_student_id != null && String(body.mtss_student_id).trim() !== ''
        ? String(body.mtss_student_id).trim()
        : null;
    const adminUsername = String(account.username || '').trim() || 'admin';
    const ins = await db
      .prepare(
        `INSERT INTO lantern_pilot_accounts (username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, mtss_student_id, updated_at, is_active, must_change_password, password_reset_at, password_reset_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1, 1, datetime('now'), ?)`
      )
      .bind(u, displayName, role, hash, salt, scn || null, tid || null, mtssId, adminUsername)
      .run();
    if (!ins.success) {
      return jsonResponse({ ok: false, error: 'insert_failed' }, 500, cors);
    }
    return jsonResponse({ ok: true, username: u }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/admin/users/reset-password') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const u = String(body.username || '').trim();
    const newPassword = String(body.new_password != null ? body.new_password : body.password || '');
    if (!u || !newPassword || newPassword.length < 8) {
      return jsonResponse({ ok: false, error: 'username_and_password_required', min: 8 }, 400, cors);
    }
    const existing = await db
      .prepare(`SELECT username FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`)
      .bind(u)
      .first();
    if (!existing) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
    }
    const targetUser = String(existing.username);
    const adminUsername = String(account.username || '').trim() || 'admin';
    const salt = pilotRandomSaltHex();
    const hash = await pilotHashPassword(newPassword, salt);
    await db
      .prepare(
        `UPDATE lantern_pilot_accounts SET password_hash = ?, password_salt = ?, must_change_password = 1, password_reset_at = datetime('now'), password_reset_by = ?, updated_at = datetime('now') WHERE username = ?`
      )
      .bind(hash, salt, adminUsername, targetUser)
      .run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/admin/users/update') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const u = String(body.username || '').trim();
    if (!u) {
      return jsonResponse({ ok: false, error: 'username_required' }, 400, cors);
    }
    const existing = await db
      .prepare(`SELECT username FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`)
      .bind(u)
      .first();
    if (!existing) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
    }
    const targetUser = String(existing.username);
    const newPassword = body.password != null ? String(body.password) : '';
    const adminUsername = String(account.username || '').trim() || 'admin';
    if (newPassword && newPassword.length >= 8) {
      const salt = pilotRandomSaltHex();
      const hash = await pilotHashPassword(newPassword, salt);
      await db
        .prepare(
          `UPDATE lantern_pilot_accounts SET password_hash = ?, password_salt = ?, must_change_password = 1, password_reset_at = datetime('now'), password_reset_by = ?, updated_at = datetime('now') WHERE username = ?`
        )
        .bind(hash, salt, adminUsername, targetUser)
        .run();
    } else if (newPassword && newPassword.length > 0) {
      return jsonResponse({ ok: false, error: 'password_min_length', min: 8 }, 400, cors);
    }
    if (body.force_must_change_password === true || body.must_change_next_login === true) {
      await db
        .prepare(
          `UPDATE lantern_pilot_accounts SET must_change_password = 1, password_reset_at = datetime('now'), password_reset_by = ?, updated_at = datetime('now') WHERE username = ?`
        )
        .bind(adminUsername, targetUser)
        .run();
    }
    if (body.display_name != null) {
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET display_name = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(String(body.display_name).trim(), targetUser)
        .run();
    }
    if (body.role != null) {
      const role = String(body.role).trim();
      if (!['student', 'teacher', 'admin'].includes(role)) {
        return jsonResponse({ ok: false, error: 'invalid_role' }, 400, cors);
      }
      await db.prepare(`UPDATE lantern_pilot_accounts SET role = ?, updated_at = datetime('now') WHERE username = ?`).bind(role, targetUser).run();
    }
    if (body.student_character_name !== undefined) {
      const scn = body.student_character_name == null ? null : String(body.student_character_name).trim();
      await db.prepare(`UPDATE lantern_pilot_accounts SET student_character_name = ?, updated_at = datetime('now') WHERE username = ?`).bind(scn, targetUser).run();
    }
    if (body.teacher_id !== undefined) {
      const tid = body.teacher_id == null ? null : String(body.teacher_id).trim();
      await db.prepare(`UPDATE lantern_pilot_accounts SET teacher_id = ?, updated_at = datetime('now') WHERE username = ?`).bind(tid, targetUser).run();
    }
    if (body.mtss_student_id !== undefined) {
      const mid = body.mtss_student_id == null ? null : String(body.mtss_student_id).trim() || null;
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET mtss_student_id = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(mid, targetUser)
        .run();
    }
    if (body.is_active !== undefined) {
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET is_active = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(body.is_active ? 1 : 0, targetUser)
        .run();
    }
    return jsonResponse({ ok: true }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

async function handlePilotRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  const secure = url.protocol === 'https:';

  if (path === '/api/pilot/setup') {
    if (request.method !== 'POST') {
      return jsonResponse(
        { ok: false, error: 'method_not_allowed', message: 'Use POST with JSON body' },
        405,
        cors
      );
    }
    const master = env.SETUP_MASTER_TOKEN;
    if (!master || String(master).trim() === '') {
      return jsonResponse({ ok: false, error: 'setup_not_configured' }, 503, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const setupToken = String(body.setup_token || '').trim();
    if (!setupToken || !timingSafeEqualStrings(setupToken, String(master))) {
      return jsonResponse({ ok: false, error: 'invalid_token' }, 403, cors);
    }
    const placeholders = PILOT_LOCKED_USERNAMES.map(() => '?').join(',');
    const accRows = await db
      .prepare(
        `SELECT username, password_hash, password_salt FROM lantern_pilot_accounts WHERE username IN (${placeholders})`
      )
      .bind(...PILOT_LOCKED_USERNAMES)
      .all();
    const list = accRows.results || [];
    if (list.length < PILOT_LOCKED_USERNAMES.length) {
      return jsonResponse({ ok: false, error: 'pilot_accounts_missing' }, 500, cors);
    }
    const byUser = {};
    for (const r of list) {
      byUser[r.username] = r;
    }
    let allHavePasswords = true;
    for (const u of PILOT_LOCKED_USERNAMES) {
      const row = byUser[u];
      const ph = row && row.password_hash != null ? String(row.password_hash).trim() : '';
      const ps = row && row.password_salt != null ? String(row.password_salt).trim() : '';
      if (!ph || !ps) {
        allHavePasswords = false;
        break;
      }
    }
    if (allHavePasswords) {
      return jsonResponse({ ok: false, error: 'already_initialized' }, 409, cors);
    }
    const keyMap = [
      ['student1', 'student1_password'],
      ['student2', 'student2_password'],
      ['teacher1', 'teacher1_password'],
      ['teacher2', 'teacher2_password'],
      ['admin', 'admin_password'],
    ];
    for (const [user, key] of keyMap) {
      const v = body[key];
      if (v === undefined || v === null || String(v).trim() === '') {
        return jsonResponse({ ok: false, error: 'missing_password_for', username: user }, 400, cors);
      }
    }
    for (const [user, key] of keyMap) {
      const pw = String(body[key] ?? '');
      const salt = pilotRandomSaltHex();
      const hash = await pilotHashPassword(pw, salt);
      const result = await db
        .prepare(
          'UPDATE lantern_pilot_accounts SET password_hash = ?, password_salt = ?, updated_at = datetime(\'now\'), must_change_password = 0, password_changed_at = datetime(\'now\') WHERE username = ?'
        )
        .bind(hash, salt, user)
        .run();
      const changes = typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
      if (!result.success || changes !== 1) {
        return jsonResponse({ ok: false, error: 'update_failed', username: user }, 500, cors);
      }
    }
    return jsonResponse({ ok: true }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/pilot/logout') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...cors,
        'Set-Cookie': pilotClearCookieHeader(secure),
      },
    });
  }

  if (request.method === 'GET' && path === '/api/pilot/me') {
    const secret = env.PILOT_SESSION_SECRET;
    if (!secret || String(secret).trim() === '') {
      return jsonResponse({ ok: true, authenticated: false, error: 'not_authenticated' }, 200, cors);
    }
    const rawCookie = request.headers.get('Cookie') || '';
    const token = getCookieValue(rawCookie, PILOT_COOKIE_NAME);
    if (!token) {
      return jsonResponse({ ok: true, authenticated: false, error: 'not_authenticated' }, 200, cors);
    }
    const payload = await verifyPilotJwt(token, secret);
    if (!payload || !payload.sub) {
      return jsonResponse({ ok: true, authenticated: false, error: 'not_authenticated' }, 200, cors);
    }
    const row = await db
      .prepare(
        'SELECT username, display_name, role, student_character_name, teacher_id, mtss_student_id, is_active, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))'
      )
      .bind(String(payload.sub))
      .first();
    if (!row) {
      return jsonResponse({ ok: true, authenticated: false, error: 'not_authenticated' }, 200, cors);
    }
    const ia = row.is_active != null ? Number(row.is_active) : 1;
    if (ia === 0) {
      return jsonResponse({ ok: true, authenticated: false, error: 'not_authenticated' }, 200, cors);
    }
    const mcp = row.must_change_password != null && Number(row.must_change_password) !== 0;
    const rlow = String(row.role || '').trim().toLowerCase();
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        student_character_name: row.student_character_name || null,
        mtss_student_id: row.mtss_student_id || null,
        economy_character_name: rlow === 'student' ? pilotEconomyCharacterName(row) || null : null,
        teacher_id: row.teacher_id || null,
        must_change_password: mcp,
      },
      200,
      cors
    );
  }

  if (request.method === 'POST' && path === '/api/pilot/bootstrap-passwords') {
    const stRow = await db.prepare('SELECT setup_completed_at FROM lantern_setup_state WHERE id = ?').bind('global').first();
    const setupDone =
      stRow && stRow.setup_completed_at != null && String(stRow.setup_completed_at).trim() !== '';
    if (setupDone) {
      return jsonResponse({ ok: false, error: 'setup_already_completed' }, 403, cors);
    }
    const enabled = String(env.PILOT_BOOTSTRAP_ENABLED || '').trim() === 'true';
    if (!enabled) {
      return jsonResponse({ ok: false, error: 'bootstrap_disabled' }, 403, cors);
    }
    const bootSecret = env.PILOT_BOOTSTRAP_SECRET;
    if (!bootSecret || String(bootSecret).trim() === '') {
      return jsonResponse({ ok: false, error: 'bootstrap_not_configured' }, 503, cors);
    }
    const authHeader = request.headers.get('Authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearer || bearer !== bootSecret) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const passwords = body.passwords && typeof body.passwords === 'object' ? body.passwords : null;
    if (!passwords) {
      return jsonResponse({ ok: false, error: 'passwords_object_required' }, 400, cors);
    }
    for (const u of PILOT_LOCKED_USERNAMES) {
      if (!Object.prototype.hasOwnProperty.call(passwords, u) || passwords[u] === undefined || passwords[u] === null) {
        return jsonResponse({ ok: false, error: 'missing_password_for', username: u }, 400, cors);
      }
    }
    for (const k of Object.keys(passwords)) {
      if (!PILOT_LOCKED_USERNAMES.includes(k)) {
        return jsonResponse({ ok: false, error: 'unknown_username', username: k }, 400, cors);
      }
    }
    const updated = [];
    for (const u of PILOT_LOCKED_USERNAMES) {
      const pw = String(passwords[u] ?? '');
      if (!pw) {
        return jsonResponse({ ok: false, error: 'empty_password_for', username: u }, 400, cors);
      }
      const salt = pilotRandomSaltHex();
      const hash = await pilotHashPassword(pw, salt);
      const result = await db
        .prepare(
          'UPDATE lantern_pilot_accounts SET password_hash = ?, password_salt = ?, updated_at = datetime(\'now\'), must_change_password = 0, password_changed_at = datetime(\'now\') WHERE username = ?'
        )
        .bind(hash, salt, u)
        .run();
      const changes = typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
      if (!result.success || changes !== 1) {
        return jsonResponse({ ok: false, error: 'update_failed', username: u }, 500, cors);
      }
      updated.push(u);
    }
    return jsonResponse({ ok: true, updated }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/pilot/login') {
    const secret = env.PILOT_SESSION_SECRET;
    if (!secret || String(secret).trim() === '') {
      return jsonResponse({ ok: false, error: 'Pilot session not configured' }, 503, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) {
      return jsonResponse({ ok: false, error: 'username and password required' }, 400, cors);
    }

    const normalizedUsername = (username || '').trim().toLowerCase();
    const normalizedAdmin = LANTERN_PRIMARY_ADMIN_USERNAME.toLowerCase();

    if (normalizedUsername === normalizedAdmin) {
      await ensureLanternPrimaryAdminCredentials(db);
    }

    const row = await db
      .prepare(
        'SELECT username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, mtss_student_id, is_active, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))'
      )
      .bind(username)
      .first();

    if (!row) {
      return jsonResponse({ ok: false, error: 'Invalid credentials' }, 401, cors);
    }

    const ia = row.is_active != null ? Number(row.is_active) : 1;
    if (ia === 0) {
      return jsonResponse({ ok: false, error: 'account_disabled' }, 403, cors);
    }

    const ph = row.password_hash != null ? String(row.password_hash).trim() : '';
    const ps = row.password_salt != null ? String(row.password_salt).trim() : '';
    if (!ph || !ps) {
      return jsonResponse(
        {
          ok: false,
          error: 'password_not_set',
          message: 'Password not set yet for this account',
        },
        403,
        cors
      );
    }

    const attemptHash = await pilotHashPassword(password, ps);
    if (attemptHash !== ph) {
      return jsonResponse({ ok: false, error: 'Invalid credentials' }, 401, cors);
    }

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      sub: row.username,
      role: row.role,
      scn: pilotEconomyCharacterName(row) || null,
      tid: row.teacher_id || null,
      iat: now,
      exp: now + PILOT_JWT_TTL_SEC,
    };
    const token = await signPilotJwt(jwtPayload, secret);
    const mcp = row.must_change_password != null && Number(row.must_change_password) !== 0;

    return new Response(
      JSON.stringify({
        ok: true,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        student_character_name: row.student_character_name || null,
        mtss_student_id: row.mtss_student_id || null,
        economy_character_name:
          String(row.role || '').trim().toLowerCase() === 'student' ? pilotEconomyCharacterName(row) || null : null,
        teacher_id: row.teacher_id || null,
        must_change_password: mcp,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...cors,
          'Set-Cookie': pilotSetCookieHeader(token, secure, PILOT_JWT_TTL_SEC),
        },
      }
    );
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

/** Curated school-safe two-word board codes. Short, readable, high contrast. No unrestricted generator. */
const CLASS_ACCESS_PHRASE_BANK = [
  'Blue Falcon', 'Silver Otter', 'Beacon Pine', 'River Stone', 'Golden Ridge', 'Bright Meadow', 'Clear Sky',
  'Swift Fox', 'Calm Harbor', 'Bold Eagle', 'Warm Sunset', 'Green Valley', 'Red Maple', 'White Cloud',
  'High Peak', 'Wild Rose', 'Quiet Lake', 'Brave Lion', 'True North', 'Still Pond', 'Cool Breeze', 'Deep Forest',
  'Open Road', 'Bright Star', 'Calm Sea', 'Strong Oak', 'Clear Path', 'Wide Sky', 'Tall Pine', 'Quick Brook',
  'Bold Cliff', 'Sweet Honey', 'Pure Gold', 'Flat Plain', 'Green Grass', 'Coral Reef', 'Amber Glow', 'Jade Leaf',
  'Ruby Dawn', 'Pearl Mist', 'Olive Branch', 'Cedar Lane', 'Birch Way', 'Maple Drive', 'Oak Park', 'Pine Cone',
  'Walnut Creek', 'Rowan Tree', 'Ash Grove',
];

function normalizeBoardCode(s) {
  if (typeof s !== 'string') return '';
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Allowed teacher_id values for class-access session start/end. Reuses verify config only (teacherA, teacherB, mr_radle). */
function isAllowedTeacherId(teacherId) {
  const id = (teacherId || '').trim();
  if (!id) return false;
  const list = (VERIFY_CONFIG.teachers || []).map(t => (t.teacher_id || '').trim()).filter(Boolean);
  return list.includes(id);
}

/** Monday–Thursday 8:00 AM–4:00 PM in America/Denver (Colorado). DST-aware via Intl. */
function isLockHours(env) {
  const now = new Date();
  const tz = (env.CLASS_ACCESS_LOCK_TZ || 'America/Denver').trim();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now);
    let weekday = '';
    let hour = -1;
    for (const p of parts) {
      if (p.type === 'weekday') weekday = (p.value || '').toLowerCase();
      if (p.type === 'hour') hour = parseInt(p.value, 10);
    }
    if (weekday === 'sat' || weekday === 'sun') return false;
    if (weekday === 'fri') return false;
    return hour >= 8 && hour < 16;
  } catch (_) {
    return false;
  }
}

/**
 * If the request carries a valid pilot JWT for an active student account, returns the DB row; else null.
 * Same validation pattern as GET /api/pilot/me (cookie + JWT + lantern_pilot_accounts).
 */
async function getPilotActiveStudentForClassAccess(request, env, db) {
  const secret = env.PILOT_SESSION_SECRET;
  if (!secret || String(secret).trim() === '') return null;
  const rawCookie = request.headers.get('Cookie') || '';
  const jwt = getCookieValue(rawCookie, PILOT_COOKIE_NAME);
  if (!jwt) return null;
  const payload = await verifyPilotJwt(jwt, secret);
  if (!payload || !payload.sub) return null;
  const row = await db
    .prepare(
      'SELECT username, role, is_active, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))'
    )
    .bind(String(payload.sub))
    .first();
  if (!row) return null;
  const ia = row.is_active != null ? Number(row.is_active) : 1;
  if (ia === 0) return null;
  if (String(row.role || '').trim().toLowerCase() !== 'student') return null;
  if (pilotAccountRequiresChangePassword(row)) return null;
  return row;
}

async function handleClassAccessRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  async function getVerifyState() {
    return loadVerifyState(env);
  }

  if (request.method === 'POST' && path === '/api/class-access/session/start') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const teacherId = (body.teacher_id || 'teacher').trim();
    if (!isAllowedTeacherId(teacherId)) return jsonResponse({ ok: false, error: 'Not authorized to start class access' }, 403, cors);
    const now = new Date().toISOString();
    const existing = await db.prepare(
      'SELECT id, access_code, starts_at, expires_at FROM class_access_sessions WHERE teacher_id = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = \'\') AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
    ).bind(teacherId, now).first();
    if (existing) {
      return jsonResponse({
        ok: true,
        existing: true,
        session_id: existing.id,
        access_code: existing.access_code,
        starts_at: existing.starts_at,
        expires_at: existing.expires_at,
      }, 200, cors);
    }
    const durationMinutes = Math.min(480, Math.max(5, parseInt(body.duration_minutes, 10) || 60));
    const nowDate = new Date();
    const expiresAt = new Date(nowDate.getTime() + durationMinutes * 60 * 1000);
    const idx = Math.floor(Math.random() * CLASS_ACCESS_PHRASE_BANK.length);
    const phrase = CLASS_ACCESS_PHRASE_BANK[idx];
    const normalized = normalizeBoardCode(phrase);
    const sessionId = 'cas_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const startsAt = nowDate.toISOString();
    const expiresAtStr = expiresAt.toISOString();
    await db.prepare(
      'INSERT INTO class_access_sessions (id, teacher_id, access_code, access_code_normalized, starts_at, expires_at, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    ).bind(sessionId, teacherId, phrase, normalized, startsAt, expiresAtStr, startsAt).run();
    return jsonResponse({
      ok: true,
      session_id: sessionId,
      access_code: phrase,
      access_code_normalized: normalized,
      starts_at: startsAt,
      expires_at: expiresAtStr,
      duration_minutes: durationMinutes,
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/session/end') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const teacherId = (body.teacher_id || 'teacher').trim();
    if (!isAllowedTeacherId(teacherId)) return jsonResponse({ ok: false, error: 'Not authorized to end class access' }, 403, cors);
    const now = new Date().toISOString();
    const rows = await db.prepare(
      'SELECT id FROM class_access_sessions WHERE teacher_id = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = \'\') AND expires_at > ?'
    ).bind(teacherId, now).all();
    const sessions = (rows.results || []);
    for (const row of sessions) {
      await db.prepare('UPDATE class_access_sessions SET is_active = 0, revoked_at = ? WHERE id = ?').bind(now, row.id).run();
      await db.prepare('UPDATE class_access_tokens SET revoked_at = ? WHERE session_id = ?').bind(now, row.id).run();
    }
    return jsonResponse({ ok: true, ended: sessions.length }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/session/status') {
    const teacherId = (url.searchParams.get('teacher_id') || 'teacher').trim();
    if (!isAllowedTeacherId(teacherId)) return jsonResponse({ ok: true, active: false }, 200, cors);
    const now = new Date().toISOString();
    const row = await db.prepare(
      'SELECT id, access_code, starts_at, expires_at, is_active FROM class_access_sessions WHERE teacher_id = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = \'\') AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
    ).bind(teacherId, now).first();
    if (!row) return jsonResponse({ ok: true, active: false }, 200, cors);
    return jsonResponse({
      ok: true,
      active: true,
      session_id: row.id,
      access_code: row.access_code,
      starts_at: row.starts_at,
      expires_at: row.expires_at,
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/join') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const codeRaw = (body.code || '').trim();
    const codeNorm = normalizeBoardCode(codeRaw);
    if (!codeNorm) return jsonResponse({ ok: false, error: 'Enter the class code' }, 400, cors);
    const now = new Date().toISOString();
    const sessionRow = await db.prepare(
      'SELECT id, access_code, expires_at FROM class_access_sessions WHERE access_code_normalized = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = \'\') AND expires_at > ?'
    ).bind(codeNorm, now).first();
    if (!sessionRow) return jsonResponse({ ok: false, error: 'Invalid or expired code' }, 400, cors);
    const token = 'cat_' + crypto.randomUUID().replace(/-/g, '');
    const issuedAt = now;
    const tokenExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await db.prepare(
      'INSERT INTO class_access_tokens (id, session_id, token, issued_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('tok_' + Date.now(), sessionRow.id, token, issuedAt, tokenExpiresAt, issuedAt).run();
    return jsonResponse({
      ok: true,
      token,
      expires_at: tokenExpiresAt,
      access_code_display: sessionRow.access_code,
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/validate') {
    const token = (request.headers.get('X-Class-Token') || url.searchParams.get('token') || '').trim();
    const now = new Date().toISOString();
    if (!token) {
      return jsonResponse({ ok: true, valid: false, accessState: 'live_locked_no_session' }, 200, cors);
    }
    const tokenRow = await db.prepare(
      'SELECT t.id, t.session_id, t.expires_at, t.revoked_at, s.is_active, s.revoked_at AS session_revoked FROM class_access_tokens t JOIN class_access_sessions s ON s.id = t.session_id WHERE t.token = ?'
    ).bind(token).first();
    if (!tokenRow) return jsonResponse({ ok: true, valid: false, accessState: 'live_token_expired' }, 200, cors);
    if (tokenRow.revoked_at || tokenRow.session_revoked || tokenRow.is_active !== 1) {
      return jsonResponse({ ok: true, valid: false, accessState: 'live_session_revoked' }, 200, cors);
    }
    if (tokenRow.expires_at <= now) {
      return jsonResponse({ ok: true, valid: false, accessState: 'live_token_expired' }, 200, cors);
    }
    return jsonResponse({ ok: true, valid: true, accessState: 'live_student_has_valid_access', expires_at: tokenRow.expires_at }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/state') {
    const verifyState = await getVerifyState();
    const sim = verifyState.class_access_simulation || {};
    const mode = sim.mode === 'simulation' ? 'simulation' : 'live';

    if (mode === 'simulation') {
      const conditionRaw = (sim.condition || sim.state || '').trim();
      const simCondition = conditionRaw || 'locked_no_session';
      const stateMap = {
        unlocked: 'live_outside_school_hours',
        locked_no_session: 'live_locked_no_session',
        locked_no_active_class: 'live_locked_no_session',
        locked_waiting_code: 'live_locked_session_available',
        valid_student_session: 'live_student_has_valid_access',
        unlocked_valid_session: 'live_student_has_valid_access',
        session_expired: 'live_token_expired',
        locked_session_expired: 'live_token_expired',
        session_revoked: 'live_session_revoked',
        locked_session_revoked: 'live_session_revoked',
      };
      const accessState = stateMap[simCondition] || simCondition;
      const tokenValid = accessState === 'live_student_has_valid_access';
      return jsonResponse({
        ok: true,
        mode: 'simulation',
        simCondition,
        accessState,
        tokenValid,
        message: 'Demo Mode: ' + (simCondition.replace(/_/g, ' ') || 'Simulated'),
      }, 200, cors);
    }

    const token = (request.headers.get('X-Class-Token') || url.searchParams.get('token') || '').trim();
    const locked = isLockHours(env);
    if (!locked) {
      return jsonResponse({
        ok: true,
        mode: 'live',
        accessState: 'live_outside_school_hours',
        tokenValid: true,
      }, 200, cors);
    }

    const now = new Date().toISOString();
    const hasActiveSession = await db.prepare(
      'SELECT id FROM class_access_sessions WHERE is_active = 1 AND (revoked_at IS NULL OR revoked_at = \'\') AND expires_at > ? LIMIT 1'
    ).bind(now).first();

    if (!token) {
      const studentRow = await getPilotActiveStudentForClassAccess(request, env, db);
      if (studentRow) {
        return jsonResponse(
          {
            ok: true,
            mode: 'live',
            accessState: 'live_student_login_access',
            tokenValid: true,
          },
          200,
          cors
        );
      }
      return jsonResponse({
        ok: true,
        mode: 'live',
        accessState: hasActiveSession ? 'live_locked_session_available' : 'live_locked_no_session',
        tokenValid: false,
      }, 200, cors);
    }

    const tokenRow = await db.prepare(
      'SELECT t.expires_at, t.revoked_at, s.is_active, s.revoked_at AS session_revoked FROM class_access_tokens t JOIN class_access_sessions s ON s.id = t.session_id WHERE t.token = ?'
    ).bind(token).first();
    if (!tokenRow || tokenRow.revoked_at || tokenRow.session_revoked || tokenRow.is_active !== 1 || tokenRow.expires_at <= now) {
      const studentRow = await getPilotActiveStudentForClassAccess(request, env, db);
      if (studentRow) {
        return jsonResponse(
          {
            ok: true,
            mode: 'live',
            accessState: 'live_student_login_access',
            tokenValid: true,
          },
          200,
          cors
        );
      }
      const accessState = (tokenRow && (tokenRow.revoked_at || tokenRow.session_revoked)) ? 'live_session_revoked' : 'live_token_expired';
      return jsonResponse({
        ok: true,
        mode: 'live',
        accessState,
        tokenValid: false,
      }, 200, cors);
    }
    return jsonResponse({
      ok: true,
      mode: 'live',
      accessState: 'live_student_has_valid_access',
      tokenValid: true,
      expires_at: tokenRow.expires_at,
    }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

/** Lantern avatars */
async function handleAvatarRoutes(request, url, path, env, cors) {
  const origin = url.origin || '';
  const db = env.DB;
  const bucket = env.AVATAR_BUCKET;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  if (!bucket) return jsonResponse({ ok: false, error: 'Avatar bucket not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/avatar/image') {
    const key = (url.searchParams.get('key') || '').trim();
    if (!key) return jsonResponse({ ok: false, error: 'Missing key' }, 400, cors);
    const obj = await bucket.get(key);
    if (!obj) return new Response('Not Found', { status: 404, headers: cors });
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=86400',
        ...cors,
      },
    });
  }

  if (request.method === 'POST' && path === '/api/avatar/upload') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const characterName = (body.character_name || '').trim();
    const imageData = body.image;
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    if (!imageData || typeof imageData !== 'string') return jsonResponse({ ok: false, error: 'Missing image' }, 400, cors);
    const base64 = stripBase64Payload(imageData);
    if (!base64) return jsonResponse({ ok: false, error: 'Missing image payload' }, 400, cors);
    let bytes;
    try { bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid base64 image' }, 400, cors); }
    const id = 'av-' + crypto.randomUUID();
    const key = 'avatars/' + id + '.png';
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO lantern_avatar_submissions (id, character_name, image_key, status, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, characterName, key, 'pending', now).run();
    const approvalId = 'approval-' + crypto.randomUUID();
    await db.prepare(
      'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(approvalId, 'avatar', id, 'pending', null, characterName, null, now).run();
    const imageUrl = origin + '/api/avatar/image?key=' + encodeURIComponent(key);
    return jsonResponse({ ok: true, id, image_url: imageUrl, status: 'pending', created_at: now }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/avatar/status') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    const profile = await db.prepare('SELECT current_avatar_key, updated_at FROM lantern_avatar_profiles WHERE character_name = ?').bind(characterName).first();
    const pending = await db.prepare('SELECT id, image_key, created_at FROM lantern_avatar_submissions WHERE character_name = ? AND status = ? ORDER BY created_at DESC LIMIT 1').bind(characterName, 'pending').first();
    const activeImage = profile
      ? (origin + '/api/avatar/image?key=' + encodeURIComponent(profile.current_avatar_key))
      : null;
    const pendingImage = pending ? (origin + '/api/avatar/image?key=' + encodeURIComponent(pending.image_key)) : null;
    return jsonResponse({
      ok: true,
      status: {
        active_image: activeImage,
        has_pending: !!pending,
        pending_id: pending?.id ?? null,
        pending_image: pendingImage,
        pending_created_at: pending?.created_at ?? null,
      },
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/avatar/pending') {
    const rows = await db.prepare(
      'SELECT id, character_name, image_key, created_at FROM lantern_avatar_submissions WHERE status = ? ORDER BY created_at ASC'
    ).bind('pending').all();
    const list = (rows.results || []).map(r => ({
      id: r.id,
      character_name: r.character_name,
      image_url: origin + '/api/avatar/image?key=' + encodeURIComponent(r.image_key),
      created_at: r.created_at,
    }));
    return jsonResponse({ ok: true, pending: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/avatar/approve') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db.prepare('SELECT id, character_name, image_key, status FROM lantern_avatar_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Submission not found' }, 404, cors);
    if (row.status !== 'pending') return jsonResponse({ ok: false, error: 'Submission not pending' }, 400, cors);
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE lantern_avatar_submissions SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?'
    ).bind('approved', now, (body.approved_by || 'teacher').trim() || 'teacher', id).run();
    await db.prepare(
      'INSERT INTO lantern_avatar_profiles (character_name, current_avatar_key, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET current_avatar_key = ?, updated_at = ?'
    ).bind(row.character_name, row.image_key, now, row.image_key, now).run();
    return jsonResponse({ ok: true, id, character_name: row.character_name }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/avatar/reject') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db.prepare('SELECT id, status FROM lantern_avatar_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Submission not found' }, 404, cors);
    if (row.status !== 'pending') return jsonResponse({ ok: false, error: 'Submission not pending' }, 400, cors);
    const now = new Date().toISOString();
    const reason = (body.reason || '').trim();
    await db.prepare(
      'UPDATE lantern_avatar_submissions SET status = ?, rejected_at = ?, rejected_by = ?, rejected_reason = ? WHERE id = ?'
    ).bind('rejected', now, (body.rejected_by || 'teacher').trim() || 'teacher', reason, id).run();
    return jsonResponse({ ok: true, id }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Shared secret for server-to-server POST /api/economy/transact (set LANTERN_ECONOMY_SECRET in env). */
function getEconomyTransactSecretFromRequest(request) {
  const x = request.headers.get('X-Lantern-Economy-Secret');
  if (x && String(x).trim()) return String(x).trim();
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

/** Shared secret for MTSS roster upsert (set LANTERN_MTSS_INTEGRATION_SECRET in env). */
function getMtssIntegrationSecretFromRequest(request) {
  const x = request.headers.get('X-Lantern-Mtss-Secret');
  if (x && String(x).trim()) return String(x).trim();
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

const MTSS_ROSTER_MAX_BATCH = 100;
const MTSS_STUDENT_ID_MAX_LEN = 256;

/**
 * Server-to-server: upsert lantern_student_identities by MTSS student_id (character_name) + display_name.
 * Does not require a pilot login; never deletes wallet rows. Optional link when lantern_pilot_accounts.mtss_student_id matches.
 */
async function handleMtssIntegrationRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  if (request.method !== 'POST' || path !== '/api/integrations/mtss/roster-upsert') {
    return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
  }
  const configured = (env.LANTERN_MTSS_INTEGRATION_SECRET || '').trim();
  if (!configured) {
    return jsonResponse({ ok: false, error: 'mtss_integration_not_configured' }, 503, cors);
  }
  const provided = getMtssIntegrationSecretFromRequest(request);
  if (!provided || !timingSafeEqualStrings(configured, provided)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors);
  }
  const text = await request.text();
  let body;
  try {
    body = JSON.parse(text || '{}');
  } catch (_) {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
  }
  let items = [];
  if (Array.isArray(body.students)) {
    items = body.students;
  } else if (body.student_id != null && String(body.student_id).trim() !== '') {
    items = [{ student_id: body.student_id, display_name: body.display_name }];
  } else {
    return jsonResponse({ ok: false, error: 'missing_student_id' }, 400, cors);
  }
  if (items.length > MTSS_ROSTER_MAX_BATCH) {
    return jsonResponse({ ok: false, error: 'batch_too_large', max: MTSS_ROSTER_MAX_BATCH }, 400, cors);
  }
  const now = new Date().toISOString();
  const results = [];
  for (const item of items) {
    const sid = String(item.student_id != null ? item.student_id : '').trim();
    if (!sid) {
      results.push({ student_id: sid, ok: false, error: 'empty_student_id' });
      continue;
    }
    if (sid.length > MTSS_STUDENT_ID_MAX_LEN) {
      results.push({ student_id: sid, ok: false, error: 'student_id_too_long' });
      continue;
    }
    const dnRaw = item.display_name;
    const dn = dnRaw == null ? null : String(dnRaw).trim() || null;
    await db
      .prepare(
        `INSERT INTO lantern_student_identities (character_name, display_name, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(character_name) DO UPDATE SET display_name = excluded.display_name`
      )
      .bind(sid, dn, now)
      .run();
    const pilotRow = await db
      .prepare(
        `SELECT username FROM lantern_pilot_accounts WHERE mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?)) AND lower(trim(role)) = 'student' LIMIT 1`
      )
      .bind(sid)
      .first();
    results.push({
      student_id: sid,
      ok: true,
      identity_upserted: true,
      linked_pilot_username: pilotRow && pilotRow.username ? String(pilotRow.username) : null,
    });
  }
  return jsonResponse({ ok: true, results, count: results.length }, 200, cors);
}

/**
 * Allows transact if: (1) X-Lantern-Economy-Secret or Bearer matches env.LANTERN_ECONOMY_SECRET, or
 * (2) valid pilot session: teacher/admin any character_name; student only own wallet (see pilotEconomyCharacterName).
 */
function economyTransactAllowed(env, request, characterName, pilotAccount) {
  const configured = (env.LANTERN_ECONOMY_SECRET || '').trim();
  const provided = getEconomyTransactSecretFromRequest(request);
  if (configured && provided && timingSafeEqualStrings(configured, provided)) {
    return { ok: true };
  }
  if (!pilotAccount) {
    return { ok: false, code: 401, error: 'not_authenticated' };
  }
  const role = String(pilotAccount.role || '').trim().toLowerCase();
  if (role === 'teacher' || role === 'admin') {
    return { ok: true };
  }
  if (role === 'student') {
    const allowed = pilotEconomyCharacterName(pilotAccount) || '';
    if (allowed && characterName === allowed) {
      return { ok: true };
    }
    return { ok: false, code: 403, error: 'forbidden' };
  }
  return { ok: false, code: 403, error: 'forbidden' };
}

/** Lantern economy */
async function handleEconomyRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/economy/balance') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    const row = await db.prepare('SELECT balance, updated_at FROM lantern_wallets WHERE character_name = ?').bind(characterName).first();
    const balance = row ? (Number(row.balance) || 0) : 0;
    const sums = await db.prepare(
      'SELECT SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) AS earned, SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) AS spent FROM lantern_transactions WHERE character_name = ?'
    ).bind(characterName).first();
    const earned = sums && sums.earned != null ? Number(sums.earned) || 0 : 0;
    const spent = sums && sums.spent != null ? Number(sums.spent) || 0 : 0;
    const recent = await db.prepare(
      'SELECT id, character_name, delta, kind, source, note, created_at, meta_json FROM lantern_transactions WHERE character_name = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(characterName).all();
    const recent_transactions = (recent.results || []).map(r => ({
      id: r.id,
      character_name: r.character_name,
      delta: r.delta,
      kind: r.kind || '',
      source: r.source || '',
      note: r.note || '',
      created_at: r.created_at,
      meta: r.meta_json ? (() => { try { return JSON.parse(r.meta_json); } catch (_) { return {}; } })() : {},
    }));
    return jsonResponse({
      ok: true,
      character_name: characterName,
      balance,
      earned,
      spent,
      available: balance,
      recent_transactions: recent_transactions,
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/economy/transact') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const characterName = (body.character_name || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    const pilotAccount = await getPilotAccountFromRequest(request, env);
    const authz = economyTransactAllowed(env, request, characterName, pilotAccount);
    if (!authz.ok) {
      return jsonResponse({ ok: false, error: authz.error }, authz.code || 403, cors);
    }
    const delta = Math.floor(Number(body.delta));
    if (delta === 0) return jsonResponse({ ok: false, error: 'delta must be non-zero' }, 400, cors);
    const kind = String(body.kind || '').trim() || 'misc';
    const source = String(body.source || '').trim() || '';
    const note = String(body.note || '').trim() || '';
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const now = new Date().toISOString();
    const displayName = String(body.display_name ?? '').trim();
    if (displayName) {
      await db.prepare(
        `INSERT INTO lantern_student_identities (character_name, display_name, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(character_name) DO UPDATE SET display_name = excluded.display_name`
      ).bind(characterName, displayName, now).run();
    }

    const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(characterName).first();
    const currentBalance = walletRow ? (Number(walletRow.balance) || 0) : 0;
    if (delta < 0 && currentBalance + delta < 0) {
      return jsonResponse({ ok: false, error: 'insufficient', need: -delta, available: currentBalance }, 400, cors);
    }

    const txId = 'tx-' + crypto.randomUUID();
    await db.prepare(
      'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(txId, characterName, delta, kind, source, note, now, JSON.stringify(meta)).run();
    await db.prepare(
      'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
    ).bind(characterName, currentBalance + delta, now, delta, now).run();

    return jsonResponse({
      ok: true,
      id: txId,
      character_name: characterName,
      delta,
      balance_after: currentBalance + delta,
    }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Lantern news */
async function handleNewsRoutes(request, url, path, env, cors) {
  const origin = url.origin || '';
  const db = env.DB;
  const bucket = env.NEWS_BUCKET || env.AVATAR_BUCKET;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  if (request.method === 'POST' && path === '/api/news/upload-image') {
    if (!bucket) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, cors);
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const imageData = body.image;
    if (!imageData || typeof imageData !== 'string') return jsonResponse({ ok: false, error: 'Missing image' }, 400, cors);
    const base64 = stripBase64Payload(imageData);
    if (!base64) return jsonResponse({ ok: false, error: 'Missing image payload' }, 400, cors);
    let bytes;
    try { bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid base64 image' }, 400, cors); }
    const maxSize = 5 * 1024 * 1024;
    if (bytes.length > maxSize) return jsonResponse({ ok: false, error: 'Image too large (max 5MB)' }, 400, cors);
    const mime = (body.mime_type || 'image/png').trim().toLowerCase();
    const allowedMime = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!allowedMime.includes(mime)) return jsonResponse({ ok: false, error: 'Invalid mime type' }, 400, cors);
    const ext = mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpg' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'png';
    const fileName = (body.file_name || '').trim() || 'image.' + ext;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const id = 'news-' + crypto.randomUUID();
    const key = 'news/' + id + (safeName.includes('.') ? '' : '.' + ext);
    await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    return jsonResponse({
      ok: true,
      image_r2_key: key,
      image_file_name: safeName,
      image_mime_type: mime,
      image_file_size: bytes.length,
    }, 200, cors);
  }

  const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
  const VIDEO_ALLOWED_MIME = ['video/mp4', 'video/webm'];
  if (request.method === 'POST' && path === '/api/news/upload-video') {
    if (!bucket) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, cors);
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const videoData = body.video;
    if (!videoData || typeof videoData !== 'string') return jsonResponse({ ok: false, error: 'Missing video' }, 400, cors);
    const base64 = stripBase64Payload(videoData);
    if (!base64) return jsonResponse({ ok: false, error: 'Missing video payload' }, 400, cors);
    let bytes;
    try { bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid base64 video' }, 400, cors); }
    if (bytes.length > VIDEO_MAX_BYTES) return jsonResponse({ ok: false, error: 'Video too large (max 25MB)' }, 400, cors);
    const mime = (body.mime_type || 'video/mp4').trim().toLowerCase();
    if (!VIDEO_ALLOWED_MIME.includes(mime)) return jsonResponse({ ok: false, error: 'Only MP4 and WebM are supported' }, 400, cors);
    const ext = mime === 'video/webm' ? 'webm' : 'mp4';
    const fileName = (body.file_name || '').trim() || 'video.' + ext;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const id = 'news-' + crypto.randomUUID();
    const key = 'news/video/' + id + (safeName.includes('.') ? '' : '.' + ext);
    await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    return jsonResponse({
      ok: true,
      video_r2_key: key,
      video_file_name: safeName,
      video_mime_type: mime,
      video_file_size: bytes.length,
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/news/create') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const title = (body.title || '').trim();
    const articleBody = (body.body || '').trim();
    const actorId = (body.actor_id || '').trim();
    const authorName = (body.author_name || '').trim();
    const authorType = (body.author_type || 'student').trim().toLowerCase();
    const imageR2Key = (body.image_r2_key || '').trim() || null;
    const fullImageR2Key = (body.full_image_r2_key || '').trim() || null;
    const imageFileName = (body.image_file_name || '').trim() || null;
    const imageMimeType = (body.image_mime_type || '').trim() || null;
    const imageFileSize = body.image_file_size != null ? Math.max(0, parseInt(body.image_file_size, 10)) : null;
    const photoCredit = (body.photo_credit || '').trim() || null;
    const videoR2Key = (body.video_r2_key || '').trim() || null;
    const videoFileName = (body.video_file_name || '').trim() || null;
    const videoMimeType = (body.video_mime_type || '').trim() || null;
    const videoFileSize = body.video_file_size != null ? Math.max(0, parseInt(body.video_file_size, 10)) : null;
    let linkUrl = (body.link_url || '').trim() || null;
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) linkUrl = null;
    if (linkUrl) linkUrl = linkUrl.slice(0, 2000);
    const category = (body.category != null && String(body.category).trim() !== '') ? String(body.category).trim().slice(0, 200) : null;
    if (!title) return jsonResponse({ ok: false, error: 'Missing title' }, 400, cors);
    if (!authorName) return jsonResponse({ ok: false, error: 'Missing author_name' }, 400, cors);
    const id = 'news-' + crypto.randomUUID();
    const now = new Date().toISOString();
    const isTeacherLike = ['teacher', 'staff', 'admin'].includes(authorType);
    const status = isTeacherLike ? 'approved' : 'pending';
    const reviewedAt = isTeacherLike ? now : null;
    const reviewedBy = isTeacherLike ? (authorName || 'Teacher') : null;
    await db.prepare(
      'INSERT INTO lantern_news_submissions (id, title, body, actor_id, author_name, author_type, image_r2_key, full_image_r2_key, image_file_name, image_mime_type, image_file_size, photo_credit, video_r2_key, video_file_name, video_mime_type, video_file_size, link_url, category, status, created_at, reviewed_at, reviewed_by_staff_id, reviewed_by_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, title, articleBody, actorId || null, authorName, authorType, imageR2Key, fullImageR2Key, imageFileName, imageMimeType, imageFileSize, photoCredit, videoR2Key, videoFileName, videoMimeType, videoFileSize, linkUrl, category, status, now, reviewedAt, null, reviewedBy).run();
    if (!isTeacherLike) {
      const approvalId = 'approval-' + crypto.randomUUID();
      await db.prepare(
        'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(approvalId, 'news', id, 'pending', actorId || null, authorName, null, now).run();
    }
    return jsonResponse({ ok: true, id, status, created_at: now }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/news/resubmit') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db.prepare('SELECT id, status, category FROM lantern_news_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    if ((row.status || '') !== 'returned') return jsonResponse({ ok: false, error: 'Can only resubmit returned articles' }, 400, cors);
    const title = (body.title || '').trim();
    const articleBody = (body.body || '').trim();
    const now = new Date().toISOString();
    let categoryNext = row.category != null ? String(row.category).trim().slice(0, 200) || null : null;
    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      categoryNext = String(body.category || '').trim().slice(0, 200) || null;
    }
    if (title && articleBody) {
      await db.prepare(
        'UPDATE lantern_news_submissions SET title = ?, body = ?, category = ?, status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
      ).bind(title, articleBody, categoryNext, 'pending', null, null, null, null, id).run();
    } else {
      await db.prepare(
        'UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
      ).bind('pending', null, null, null, null, id).run();
    }
    const approvalRow = await db.prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?').bind('news', id).first();
    if (approvalRow) {
      await db.prepare(
        'UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ?, assigned_to_staff_id = ?, assigned_to_staff_name = ? WHERE id = ?'
      ).bind('pending', null, null, null, null, null, null, approvalRow.id).run();
    }
    return jsonResponse({ ok: true, id, status: 'pending' }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/news/approved') {
    const rows = await db.prepare(
      "SELECT id, title, body, actor_id, author_name, author_type, image_r2_key, full_image_r2_key, image_file_name, image_mime_type, image_file_size, photo_credit, video_r2_key, video_file_name, video_mime_type, video_file_size, link_url, category, status, created_at, reviewed_at FROM lantern_news_submissions WHERE status = 'approved' AND (hidden_at IS NULL OR hidden_at = '') ORDER BY reviewed_at DESC, created_at DESC"
    ).all();
    const rawResults = rows.results || [];
    console.log('[GET /api/news/approved] row count:', rawResults.length);
    const list = rawResults.map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category != null && String(r.category).trim() !== '' ? String(r.category).trim() : null,
      author_name: r.author_name,
      author_type: r.author_type,
      image_r2_key: r.image_r2_key,
      image_url: r.image_r2_key ? origin + '/api/news/image?key=' + encodeURIComponent(r.image_r2_key) : null,
      full_image_url: (r.full_image_r2_key && String(r.full_image_r2_key).trim()) ? origin + '/api/news/image?key=' + encodeURIComponent(r.full_image_r2_key) : null,
      image_file_name: r.image_file_name,
      photo_credit: r.photo_credit,
      video_r2_key: r.video_r2_key || null,
      video_url: r.video_r2_key ? origin + '/api/news/video?key=' + encodeURIComponent(r.video_r2_key) : null,
      link_url: (r.link_url && /^https?:\/\//i.test(String(r.link_url).trim())) ? String(r.link_url).trim().slice(0, 2000) : null,
      status: r.status,
      created_at: r.created_at,
      approved_at: r.reviewed_at,
    }));
    return jsonResponse({ ok: true, news: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/news/hide') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors); }
    const id = parseModerationBodyId(body);
    const hiddenBy = adminAuditLabel(gate.account);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id, status FROM lantern_news_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    const now = new Date().toISOString();
    await db.prepare('UPDATE lantern_news_submissions SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, hiddenBy, id).run();
    return jsonResponse({ ok: true, id, hidden_at: now }, 200, pilotCors);
  }

  if (request.method === 'POST' && path === '/api/news/restore') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors); }
    const id = parseModerationBodyId(body);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id FROM lantern_news_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    await db.prepare('UPDATE lantern_news_submissions SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true, id }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/news/hidden') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const rows = await db.prepare(
      'SELECT id, title, body, author_name, author_type, status, created_at, reviewed_at, hidden_at, hidden_by FROM lantern_news_submissions WHERE hidden_at IS NOT NULL AND hidden_at != ? ORDER BY hidden_at DESC'
    ).bind('').all();
    const list = (rows.results || []).map(r => ({
      id: r.id,
      title: r.title,
      body: (r.body || '').slice(0, 300),
      author_name: r.author_name,
      author_type: r.author_type,
      status: r.status,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at,
      hidden_at: r.hidden_at,
      hidden_by: r.hidden_by,
    }));
    return jsonResponse({ ok: true, news: list }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/news/mine') {
    const authorName = (url.searchParams.get('author_name') || '').trim();
    if (!authorName) return jsonResponse({ ok: true, news: [] }, 200, cors);
    const rows = await db.prepare(
      'SELECT id, title, body, actor_id, author_name, author_type, image_r2_key, full_image_r2_key, video_r2_key, link_url, category, status, created_at, reviewed_at, decision_note FROM lantern_news_submissions WHERE author_name = ? ORDER BY created_at DESC'
    ).bind(authorName).all();
    const list = (rows.results || []).map(r => ({
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category != null && String(r.category).trim() !== '' ? String(r.category).trim() : null,
      author_name: r.author_name,
      author_type: r.author_type,
      status: r.status,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at,
      decision_note: r.decision_note,
      image_url: r.image_r2_key ? origin + '/api/news/image?key=' + encodeURIComponent(r.image_r2_key) : null,
      full_image_url: (r.full_image_r2_key && String(r.full_image_r2_key).trim()) ? origin + '/api/news/image?key=' + encodeURIComponent(r.full_image_r2_key) : null,
      video_url: r.video_r2_key ? origin + '/api/news/video?key=' + encodeURIComponent(r.video_r2_key) : null,
      link_url: (r.link_url && /^https?:\/\//i.test(String(r.link_url).trim())) ? String(r.link_url).trim().slice(0, 2000) : null,
    }));
    return jsonResponse({ ok: true, news: list }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/news/image') {
    const key = (url.searchParams.get('key') || '').trim();
    if (!key) return jsonResponse({ ok: false, error: 'Missing key' }, 400, cors);
    const bucketForImage = env.NEWS_BUCKET || env.AVATAR_BUCKET;
    if (!bucketForImage) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, cors);
    const obj = await bucketForImage.get(key);
    if (!obj) return new Response('Not Found', { status: 404, headers: cors });
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=86400',
        ...cors,
      },
    });
  }

  if (request.method === 'GET' && path === '/api/news/video') {
    const key = (url.searchParams.get('key') || '').trim();
    if (!key) return jsonResponse({ ok: false, error: 'Missing key' }, 400, cors);
    const bucketForVideo = env.NEWS_BUCKET || env.AVATAR_BUCKET;
    if (!bucketForVideo) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, cors);
    const obj = await bucketForVideo.get(key);
    if (!obj) return new Response('Not Found', { status: 404, headers: cors });
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'video/mp4',
        'Cache-Control': 'public, max-age=86400',
        ...cors,
      },
    });
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Lantern approvals */
async function handleApprovalsRoutes(request, url, path, env) {
  const approvalsCors = corsForPilot(request);
  const origin = url.origin || '';
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, approvalsCors);

  if (request.method === 'GET' && path === '/api/approvals/pending') {
    const staffId = (url.searchParams.get('staff_id') || '').trim();
    const filter = (url.searchParams.get('filter') || 'mine,unassigned').trim().toLowerCase();
    const typeFilter = (url.searchParams.get('type') || '').trim().toLowerCase();
    let rows;
    const baseSql = 'SELECT a.id, a.item_type, a.item_id, a.status, a.submitted_by_actor_id, a.submitted_by_actor_name, a.assigned_to_staff_id, a.assigned_to_staff_name, a.suggested_staff_id, a.suggested_staff_name, a.created_at FROM lantern_approvals a WHERE a.status = ?';
    if (typeFilter === 'news') {
      rows = await db.prepare(baseSql + ' AND a.item_type = ? ORDER BY a.created_at ASC').bind('pending', 'news').all();
    } else if (typeFilter === 'avatar') {
      rows = await db.prepare(baseSql + ' AND a.item_type = ? ORDER BY a.created_at ASC').bind('pending', 'avatar').all();
    } else if (typeFilter === 'poll') {
      rows = await db.prepare(baseSql + ' AND a.item_type = ? ORDER BY a.created_at ASC').bind('pending', 'poll_contribution').all();
    } else {
      rows = await db.prepare(baseSql + ' ORDER BY a.created_at ASC').bind('pending').all();
    }
    let list = rows.results || [];
    const filters = filter.split(',').map(f => f.trim()).filter(Boolean);
    if (staffId && (filters.includes('mine') || filters.includes('unassigned'))) {
      const mine = filters.includes('mine');
      const unassigned = filters.includes('unassigned');
      list = list.filter(a => {
        const assigned = (a.assigned_to_staff_id || '').trim();
        const suggested = (a.suggested_staff_id || '').trim();
        if (mine && assigned === staffId) return true;
        if (mine && suggested === staffId) return true;
        if (unassigned && !assigned) return true;
        return false;
      });
    }
    const out = [];
    for (const a of list) {
      let title = '';
      let submitter = a.submitted_by_actor_name || '';
      let preview_url = null;
      if (a.item_type === 'news') {
        const newsRow = await db.prepare('SELECT id, title, body, author_name, image_r2_key, video_r2_key, link_url, category FROM lantern_news_submissions WHERE id = ?').bind(a.item_id).first();
        if (newsRow) {
          title = newsRow.title || '';
          preview_url = newsRow.image_r2_key ? origin + '/api/news/image?key=' + encodeURIComponent(newsRow.image_r2_key) : null;
          const videoUrl = newsRow.video_r2_key ? origin + '/api/news/video?key=' + encodeURIComponent(newsRow.video_r2_key) : null;
          const linkUrl = (newsRow.link_url && /^https?:\/\//i.test(String(newsRow.link_url).trim())) ? String(newsRow.link_url).trim().slice(0, 2000) : null;
          const cat = newsRow.category != null && String(newsRow.category).trim() !== '' ? String(newsRow.category).trim() : null;
          out.push({
            id: a.id,
            item_type: a.item_type,
            item_id: a.item_id,
            status: a.status,
            title,
            submitter: submitter,
            created_at: a.created_at,
            assigned_to_staff_id: a.assigned_to_staff_id,
            assigned_to_staff_name: a.assigned_to_staff_name,
            suggested_staff_id: a.suggested_staff_id,
            suggested_staff_name: a.suggested_staff_name,
            preview_url,
            video_url: videoUrl,
            link_url: linkUrl,
            body: newsRow.body || '',
            author_name: newsRow.author_name || submitter,
            category: cat,
          });
          continue;
        }
      } else if (a.item_type === 'avatar') {
        title = 'Avatar submission';
        const avatarRow = await db.prepare('SELECT image_key FROM lantern_avatar_submissions WHERE id = ?').bind(a.item_id).first();
        if (avatarRow && avatarRow.image_key) preview_url = origin + '/api/avatar/image?key=' + encodeURIComponent(avatarRow.image_key);
      } else if (a.item_type === 'poll_contribution') {
        let pc = null;
        try {
          pc = await db.prepare('SELECT question, choices_json, image_url, fallback_key FROM lantern_poll_contributions WHERE id = ?').bind(a.item_id).first();
        } catch (_) {}
        if (pc) {
          title = pc.question || 'Poll';
          let ch = [];
          try { ch = JSON.parse(pc.choices_json || '[]'); } catch (_) {}
          preview_url = (pc.image_url && String(pc.image_url).trim()) ? String(pc.image_url).trim() : null;
          if (!preview_url && pc.fallback_key) {
            const fk = ['poll', 'news', 'creation', 'generic', 'shoutout', 'explain'].includes(String(pc.fallback_key)) ? String(pc.fallback_key) : 'poll';
            const DEF = { poll: 'default/default_poll.png', news: 'default/default_news.png', creation: 'default/default_creation.png', generic: 'default/default_generic_stem.png', shoutout: 'default/default_shoutout.png', explain: 'default/default_explain.png' };
            preview_url = origin + '/api/media/image?key=' + encodeURIComponent(DEF[fk] || DEF.poll);
          }
          out.push({
            id: a.id,
            item_type: a.item_type,
            item_id: a.item_id,
            status: a.status,
            title,
            submitter: submitter,
            created_at: a.created_at,
            assigned_to_staff_id: a.assigned_to_staff_id,
            assigned_to_staff_name: a.assigned_to_staff_name,
            suggested_staff_id: a.suggested_staff_id,
            suggested_staff_name: a.suggested_staff_name,
            preview_url,
            poll_choices: ch,
            poll_question: pc.question || '',
          });
          continue;
        }
      } else {
        title = a.item_type + ' #' + (a.item_id || '').slice(0, 8);
      }
      out.push({
        id: a.id,
        item_type: a.item_type,
        item_id: a.item_id,
        status: a.status,
        title,
        submitter: submitter,
        created_at: a.created_at,
        assigned_to_staff_id: a.assigned_to_staff_id,
        assigned_to_staff_name: a.assigned_to_staff_name,
        suggested_staff_id: a.suggested_staff_id,
        suggested_staff_name: a.suggested_staff_name,
        preview_url,
      });
    }
    return jsonResponse({ ok: true, pending: out }, 200, approvalsCors);
  }

  if (request.method === 'GET' && path === '/api/approvals/history') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const rows = await db.prepare(
      'SELECT a.id, a.item_type, a.item_id, a.status, a.submitted_by_actor_name, a.reviewed_at, a.reviewed_by_staff_name, a.decision_note FROM lantern_approvals a WHERE a.status IN (?, ?, ?) ORDER BY a.reviewed_at DESC LIMIT ?'
    ).bind('approved', 'returned', 'rejected', limit).all();
    const list = (rows.results || []).map(a => {
      let title = a.item_id;
      if (a.item_type === 'news') title = a.item_id;
      return {
        id: a.id,
        item_type: a.item_type,
        item_id: a.item_id,
        status: a.status,
        title,
        submitter: a.submitted_by_actor_name || '',
        decision: a.status,
        decision_note: a.decision_note || '',
        reviewed_by: a.reviewed_by_staff_name || '',
        reviewed_at: a.reviewed_at || '',
      };
    });
    for (const it of list) {
      if (it.item_type === 'news') {
        const newsRow = await db.prepare('SELECT title FROM lantern_news_submissions WHERE id = ?').bind(it.item_id).first();
        if (newsRow) it.title = newsRow.title || '';
      }
    }
    return jsonResponse({ ok: true, history: list }, 200, approvalsCors);
  }

  if (request.method === 'POST' && path === '/api/approvals/approve') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, approvalsCors); }
    const id = (body.id || body.approval_id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, approvalsCors);
    const staffName = (body.reviewed_by_staff_name || body.staff_name || 'Teacher').trim();
    const staffId = (body.reviewed_by_staff_id || body.staff_id || '').trim();
    const approval = await db.prepare('SELECT id, item_type, item_id, status FROM lantern_approvals WHERE id = ?').bind(id).first();
    if (!approval) return jsonResponse({ ok: false, error: 'Approval not found' }, 404, approvalsCors);
    if ((approval.status || '') !== 'pending') return jsonResponse({ ok: false, error: 'Already reviewed' }, 400, approvalsCors);
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
    ).bind('approved', now, staffId || null, staffName, null, id).run();
    if (approval.item_type === 'news') {
      await db.prepare(
        'UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ? WHERE id = ?'
      ).bind('approved', now, staffId || null, staffName, approval.item_id).run();
    } else if (approval.item_type === 'avatar') {
      const row = await db.prepare('SELECT id, character_name, image_key, status FROM lantern_avatar_submissions WHERE id = ?').bind(approval.item_id).first();
      if (row && row.status === 'pending') {
        await db.prepare(
          'UPDATE lantern_avatar_submissions SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?'
        ).bind('approved', now, staffName, approval.item_id).run();
        await db.prepare(
          'INSERT INTO lantern_avatar_profiles (character_name, current_avatar_key, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET current_avatar_key = ?, updated_at = ?'
        ).bind(row.character_name, row.image_key, now, row.image_key, now).run();
      }
    } else if (approval.item_type === 'poll_contribution') {
      try {
        const pc = await db.prepare('SELECT id, character_name, question, choices_json, image_url, fallback_key, status FROM lantern_poll_contributions WHERE id = ?').bind(approval.item_id).first();
        if (pc && (pc.status || '') === 'pending') {
          let ch = [];
          try { ch = JSON.parse(pc.choices_json || '[]'); } catch (_) {}
          ch = (ch || []).map(c => String(c).trim().slice(0, 200)).filter(Boolean).slice(0, 5);
          if (ch.length >= 2 && pc.question) {
            const pollId = 'poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
            const choicesJson = JSON.stringify(ch);
            let pollImageUrl = (pc.image_url && String(pc.image_url).trim().slice(0, 500)) || null;
            if (!pollImageUrl && pc.fallback_key) {
              const fk = ['poll', 'news', 'creation', 'generic', 'shoutout', 'explain'].includes(String(pc.fallback_key)) ? String(pc.fallback_key) : 'poll';
              const DEF = { poll: 'default/default_poll.png', news: 'default/default_news.png', creation: 'default/default_creation.png', generic: 'default/default_generic_stem.png', shoutout: 'default/default_shoutout.png', explain: 'default/default_explain.png' };
              pollImageUrl = origin + '/api/media/image?key=' + encodeURIComponent(DEF[fk] || DEF.poll);
            }
            const subId = 'contrib:' + pc.id;
            try {
              await db.prepare(
                'INSERT INTO lantern_polls (id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
              ).bind(pollId, subId, String(pc.question).trim().slice(0, 500), choicesJson, pollImageUrl, pc.character_name || '', now, now).run();
            } catch (e2) {
              // If the image_url column doesn't exist yet, fall back to the older insert shape.
              // This lets the approve flow keep working while migrations are being rolled out.
              try {
                await db.prepare(
                  'INSERT INTO lantern_polls (id, mission_submission_id, question, choices_json, character_name, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).bind(pollId, subId, String(pc.question).trim().slice(0, 500), choicesJson, pc.character_name || '', now, now).run();
              } catch (e3) {
                return jsonResponse({ ok: false, error: 'Poll image persistence requires DB migration 034 (add image_url to lantern_polls)' }, 503, approvalsCors);
              }
            }
            await db.prepare(
              'UPDATE lantern_poll_contributions SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?'
            ).bind('approved', now, staffName, pc.id).run();
          }
        }
      } catch (e) { /* table missing until migration */ }
    }
    return jsonResponse({ ok: true, id, status: 'approved' }, 200, approvalsCors);
  }

  if (request.method === 'POST' && path === '/api/approvals/return') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, approvalsCors); }
    const id = (body.id || body.approval_id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, approvalsCors);
    const decisionNote = (body.decision_note || body.reason || '').trim();
    const staffName = (body.reviewed_by_staff_name || body.staff_name || 'Teacher').trim();
    const staffId = (body.reviewed_by_staff_id || body.staff_id || '').trim();
    const approval = await db.prepare('SELECT id, item_type, item_id, status FROM lantern_approvals WHERE id = ?').bind(id).first();
    if (!approval) return jsonResponse({ ok: false, error: 'Approval not found' }, 404, approvalsCors);
    if ((approval.status || '') !== 'pending') return jsonResponse({ ok: false, error: 'Already reviewed' }, 400, approvalsCors);
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
    ).bind('returned', now, staffId || null, staffName, decisionNote, id).run();
    if (approval.item_type === 'news') {
      await db.prepare(
        'UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
      ).bind('returned', now, staffId || null, staffName, decisionNote, approval.item_id).run();
    } else if (approval.item_type === 'poll_contribution') {
      try {
        await db.prepare(
          'UPDATE lantern_poll_contributions SET status = ?, reviewed_at = ?, reviewed_by = ?, decision_note = ? WHERE id = ?'
        ).bind('returned', now, staffName, decisionNote, approval.item_id).run();
      } catch (_) {}
    }
    return jsonResponse({ ok: true, id, status: 'returned' }, 200, approvalsCors);
  }

  if (request.method === 'POST' && path === '/api/approvals/reject') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, approvalsCors); }
    const id = (body.id || body.approval_id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, approvalsCors);
    const staffName = (body.reviewed_by_staff_name || body.staff_name || 'Teacher').trim();
    const staffId = (body.reviewed_by_staff_id || body.staff_id || '').trim();
    const approval = await db.prepare('SELECT id, item_type, item_id, status FROM lantern_approvals WHERE id = ?').bind(id).first();
    if (!approval) return jsonResponse({ ok: false, error: 'Approval not found' }, 404, approvalsCors);
    if ((approval.status || '') !== 'pending') return jsonResponse({ ok: false, error: 'Already reviewed' }, 400, approvalsCors);
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
    ).bind('rejected', now, staffId || null, staffName, (body.decision_note || body.reason || '').trim() || null, id).run();
    if (approval.item_type === 'news') {
      await db.prepare(
        'UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ? WHERE id = ?'
      ).bind('rejected', now, staffId || null, staffName, approval.item_id).run();
    } else if (approval.item_type === 'avatar') {
      await db.prepare(
        'UPDATE lantern_avatar_submissions SET status = ?, rejected_at = ?, rejected_by = ?, rejected_reason = ? WHERE id = ?'
      ).bind('rejected', now, staffName, (body.decision_note || body.reason || '').trim() || null, approval.item_id).run();
    } else if (approval.item_type === 'poll_contribution') {
      try {
        await db.prepare(
          'UPDATE lantern_poll_contributions SET status = ?, reviewed_at = ?, reviewed_by = ?, decision_note = ? WHERE id = ?'
        ).bind('rejected', now, staffName, (body.decision_note || body.reason || '').trim() || null, approval.item_id).run();
      } catch (_) {}
    }
    return jsonResponse({ ok: true, id, status: 'rejected' }, 200, approvalsCors);
  }

  if (request.method === 'POST' && path === '/api/approvals/take') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, approvalsCors); }
    const id = (body.id || body.approval_id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, approvalsCors);
    const staffId = (body.staff_id || '').trim();
    const staffName = (body.staff_name || 'Teacher').trim();
    if (!staffId && !staffName) return jsonResponse({ ok: false, error: 'staff_id or staff_name required' }, 400, approvalsCors);
    const approval = await db.prepare('SELECT id, status FROM lantern_approvals WHERE id = ?').bind(id).first();
    if (!approval) return jsonResponse({ ok: false, error: 'Approval not found' }, 404, approvalsCors);
    if ((approval.status || '') !== 'pending') return jsonResponse({ ok: false, error: 'Already reviewed' }, 400, approvalsCors);
    await db.prepare(
      'UPDATE lantern_approvals SET assigned_to_staff_id = ?, assigned_to_staff_name = ? WHERE id = ?'
    ).bind(staffId || null, staffName, id).run();
    return jsonResponse({ ok: true, id }, 200, approvalsCors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, approvalsCors);
}

/** Moderation: report/flag (user) and flagged list (teacher) */
async function handleModerationRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'POST' && path === '/api/report') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const itemType = (body.item_type || '').trim();
    const itemId = (body.item_id || '').trim();
    const reportedBy = (body.reported_by || '').trim();
    const reason = (body.reason || '').trim().slice(0, 500);
    if (!itemType || !itemId) return jsonResponse({ ok: false, error: 'Missing item_type or item_id' }, 400, cors);
    if (!reportedBy) return jsonResponse({ ok: false, error: 'Missing reported_by' }, 400, cors);
    const allowedTypes = ['news', 'mission_submission'];
    if (!allowedTypes.includes(itemType)) return jsonResponse({ ok: false, error: 'Invalid item_type' }, 400, cors);
    const id = 'flag-' + crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.prepare(
        'INSERT INTO lantern_content_flags (id, item_type, item_id, reported_by, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, itemType, itemId, reportedBy, reason || null, now).run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Report failed' }, 500, cors);
    }
    return jsonResponse({ ok: true, id, created_at: now }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/moderation/flagged') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const rows = await db.prepare(
      'SELECT id, item_type, item_id, reported_by, reason, created_at FROM lantern_content_flags ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();
    const list = (rows.results || []).map(r => ({
      id: r.id,
      item_type: r.item_type,
      item_id: r.item_id,
      reported_by: r.reported_by,
      reason: r.reason,
      created_at: r.created_at,
    }));
    return jsonResponse({ ok: true, flags: list }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Lantern missions — teacher-created missions and student submissions. D1 only.
 * Intended visibility: Approved mission submissions (status=accepted) MUST appear in Profile / My Creations.
 * They MAY also appear in Explore when GET /api/missions/submissions/approved is merged into the explore feed.
 * No separate publish table: visibility is by query (submissions/character for profile, submissions/approved for explore). */
async function handleMissionsRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  function missionRowToJson(r) {
    let target = undefined;
    if (r.target_character_names) {
      try { target = JSON.parse(r.target_character_names); } catch (_) {}
    }
    return {
      id: r.id,
      title: r.title || '',
      description: r.description || '',
      reward_amount: Number(r.reward_amount) || 3,
      submission_type: r.submission_type || 'text',
      created_by_teacher_id: r.teacher_id || 'teacher',
      created_by_teacher_name: r.teacher_name || 'Teacher',
      audience: r.audience || 'school_mission',
      target_character_names: target,
      featured: !!r.featured,
      active: r.active !== 0,
      site_eligible: !!r.site_eligible,
      allows_text: r.allows_text !== undefined && r.allows_text !== null ? !!r.allows_text : true,
      allows_image: !!(r.allows_image),
      allows_video: !!(r.allows_video),
      allows_link: !!(r.allows_link),
      min_characters: r.min_characters !== undefined && r.min_characters !== null ? Math.max(0, Math.floor(Number(r.min_characters)) || 200) : 200,
      created_at: r.created_at || '',
    };
  }

  if (request.method === 'GET' && path === '/api/missions/active') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    const rows = await db.prepare(
      'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE active = 1 ORDER BY featured DESC, created_at DESC'
    ).all();
    let list = (rows.results || []).map(r => missionRowToJson(r));
    list = list.filter(m => {
      const aud = (m.audience || 'school_mission').trim();
      if (aud === 'school_mission') return true;
      if (aud === 'my_students') return true;
      if (aud === 'selected_students') {
        const t = m.target_character_names;
        return Array.isArray(t) && t.indexOf(characterName) >= 0;
      }
      return true;
    });
    return jsonResponse({ ok: true, missions: list }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/missions/teacher') {
    const teacherId = (url.searchParams.get('teacher_id') || 'teacher').trim();
    const rows = await db.prepare(
      'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE teacher_id = ? ORDER BY created_at DESC'
    ).bind(teacherId).all();
    const list = (rows.results || []).map(r => missionRowToJson(r));
    return jsonResponse({ ok: true, missions: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const title = (body.title || '').trim().slice(0, 200);
    if (!title) return jsonResponse({ ok: false, error: 'Missing title' }, 400, cors);
    const teacherId = (body.created_by_teacher_id || body.teacher_id || 'teacher').trim();
    const teacherName = (body.created_by_teacher_name || body.teacher_name || 'Teacher').trim();
    const description = (body.description || '').trim().slice(0, 1000);
    const rewardAmount = Math.max(1, Math.min(99, Math.floor(Number(body.reward_amount) || 3)));
    const submissionType = ['text', 'link', 'image_url', 'confirmation', 'poll', 'bug_report'].includes((body.submission_type || 'text').trim()) ? (body.submission_type || 'text').trim() : 'text';
    const audience = ['my_students', 'selected_students', 'school_mission'].includes((body.audience || 'school_mission').trim()) ? (body.audience || 'school_mission').trim() : 'school_mission';
    const targetNames = audience === 'selected_students' && Array.isArray(body.target_character_names) ? body.target_character_names : null;
    const featured = !!(body.featured);
    const active = body.active !== false;
    const siteEligible = !!(body.site_eligible);
    const allowsText = body.allows_text !== false;
    const allowsImage = !!(body.allows_image);
    const allowsVideo = !!(body.allows_video);
    const allowsLink = !!(body.allows_link);
    let minChars = Math.max(0, Math.floor(Number(body.min_characters)));
    if (!Number.isFinite(minChars)) {
      minChars = submissionType === 'bug_report' ? 0 : 200;
    }
    const id = 'tmission_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO lantern_missions (id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, teacherId, teacherName, title, description, rewardAmount, submissionType, audience, targetNames ? JSON.stringify(targetNames) : null, featured ? 1 : 0, active ? 1 : 0, siteEligible ? 1 : 0, allowsText ? 1 : 0, allowsImage ? 1 : 0, allowsVideo ? 1 : 0, allowsLink ? 1 : 0, minChars, now).run();
    const mission = { id, title, description, reward_amount: rewardAmount, submission_type: submissionType, created_by_teacher_id: teacherId, created_by_teacher_name: teacherName, audience, target_character_names: targetNames || undefined, featured, active, site_eligible: siteEligible, allows_text: allowsText, allows_image: allowsImage, allows_video: allowsVideo, allows_link: allowsLink, min_characters: minChars, created_at: now };
    return jsonResponse({ ok: true, id, mission }, 200, cors);
  }

  const missionIdMatch = path.match(/^\/api\/missions\/([^/]+)$/);
  if (request.method === 'PATCH' && missionIdMatch) {
    const id = missionIdMatch[1];
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const row = await db.prepare('SELECT id FROM lantern_missions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    const updates = [];
    const bindings = [];
    if (body.active !== undefined) { updates.push('active = ?'); bindings.push(body.active ? 1 : 0); }
    if (body.title !== undefined) { updates.push('title = ?'); bindings.push(String(body.title).trim().slice(0, 200)); }
    if (body.description !== undefined) { updates.push('description = ?'); bindings.push(String(body.description).trim().slice(0, 1000)); }
    if (body.reward_amount !== undefined) { updates.push('reward_amount = ?'); bindings.push(Math.max(1, Math.min(99, Math.floor(Number(body.reward_amount) || 1)))); }
    if (body.featured !== undefined) { updates.push('featured = ?'); bindings.push(body.featured ? 1 : 0); }
    if (body.site_eligible !== undefined) { updates.push('site_eligible = ?'); bindings.push(body.site_eligible ? 1 : 0); }
    if (body.audience !== undefined) { updates.push('audience = ?'); bindings.push(['my_students', 'selected_students', 'school_mission'].includes(String(body.audience).trim()) ? String(body.audience).trim() : 'school_mission'); }
    if (body.target_character_names !== undefined) { updates.push('target_character_names = ?'); bindings.push(Array.isArray(body.target_character_names) ? JSON.stringify(body.target_character_names) : null); }
    if (body.allows_text !== undefined) { updates.push('allows_text = ?'); bindings.push(body.allows_text ? 1 : 0); }
    if (body.allows_image !== undefined) { updates.push('allows_image = ?'); bindings.push(body.allows_image ? 1 : 0); }
    if (body.allows_video !== undefined) { updates.push('allows_video = ?'); bindings.push(body.allows_video ? 1 : 0); }
    if (body.allows_link !== undefined) { updates.push('allows_link = ?'); bindings.push(body.allows_link ? 1 : 0); }
    if (body.min_characters !== undefined) {
      const mc = Math.max(0, Math.floor(Number(body.min_characters)));
      updates.push('min_characters = ?');
      bindings.push(Number.isFinite(mc) ? mc : 200);
    }
    if (updates.length === 0) {
      const m = await db.prepare('SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE id = ?').bind(id).first();
      return jsonResponse({ ok: true, mission: m ? missionRowToJson(m) : null }, 200, cors);
    }
    bindings.push(id);
    await db.prepare('UPDATE lantern_missions SET ' + updates.join(', ') + ' WHERE id = ?').bind(...bindings).run();
    const m = await db.prepare('SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE id = ?').bind(id).first();
    return jsonResponse({ ok: true, mission: m ? missionRowToJson(m) : null }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submit') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const missionId = (body.mission_id || '').trim();
    const characterName = (body.character_name || '').trim();
    if (!missionId || !characterName) return jsonResponse({ ok: false, error: 'Missing mission_id or character_name' }, 400, cors);
    const mission = await db.prepare('SELECT id, title, reward_amount, submission_type, active FROM lantern_missions WHERE id = ?').bind(missionId).first();
    if (!mission) return jsonResponse({ ok: false, error: 'Mission not found' }, 404, cors);
    if (mission.active === 0) return jsonResponse({ ok: false, error: 'Mission is not active' }, 400, cors);
    const submissionTypeRaw = (body.submission_type || mission.submission_type || 'text').trim();
    const submissionType = ['text', 'link', 'image_url', 'video', 'confirmation', 'poll', 'bug_report'].includes(submissionTypeRaw) ? submissionTypeRaw : 'text';
    const contentMax = submissionType === 'poll' ? 4000 : 2000;
    const content = String(body.submission_content || '').trim().slice(0, contentMax);
    const finalContent = submissionType === 'confirmation' ? (content || 'confirmed') : content;
    const id = 'msub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO lantern_mission_submissions (id, mission_id, character_name, submission_type, submission_content, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, missionId, characterName, submissionType, finalContent, 'pending', now).run();
    return jsonResponse({ ok: true, id, mission: { id: mission.id, title: mission.title, reward_amount: mission.reward_amount, submission_type: mission.submission_type } }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/teacher') {
    const teacherId = (url.searchParams.get('teacher_id') || 'teacher').trim();
    const missionRows = await db.prepare('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions WHERE teacher_id = ?').bind(teacherId).all();
    const missionIds = (missionRows.results || []).map(m => m.id);
    if (missionIds.length === 0) return jsonResponse({ ok: true, submissions: [] }, 200, cors);
    const placeholders = missionIds.map(() => '?').join(',');
    const subRows = await db.prepare(
      'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at FROM lantern_mission_submissions WHERE mission_id IN (' + placeholders + ') AND status = ? ORDER BY created_at ASC'
    ).bind(...missionIds, 'pending').all();
    const byMission = {};
    (missionRows.results || []).forEach(m => { byMission[m.id] = { title: m.title, reward_amount: m.reward_amount, teacher_id: m.teacher_id || '', teacher_name: m.teacher_name || 'Teacher' }; });
    const list = (subRows.results || []).map(s => {
      const m = byMission[s.mission_id] || {};
      const content = s.submission_content || '';
      const isVideo = (s.submission_type || '') === 'video';
      const isImage = (s.submission_type || '') === 'image_url';
      let image_url = null;
      if (isImage && content) image_url = String(content).trim().slice(0, 2000);
      return {
        id: s.id,
        mission_id: s.mission_id,
        character_name: s.character_name,
        submission_type: s.submission_type,
        submission_content: content,
        status: s.status,
        created_at: s.created_at,
        mission_title: m.title || '',
        mission_reward: m.reward_amount != null ? m.reward_amount : 1,
        created_by_teacher_id: m.teacher_id || '',
        created_by_teacher_name: m.teacher_name || 'Teacher',
        image_url: image_url || undefined,
        video_url: isVideo && content ? content.trim().slice(0, 2000) : undefined,
      };
    });
    return jsonResponse({ ok: true, submissions: list }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/approved') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const subRows = await db.prepare(
      'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by FROM lantern_mission_submissions WHERE status = ? AND (hidden_at IS NULL OR hidden_at = ?) ORDER BY reviewed_at DESC, created_at DESC LIMIT ?'
    ).bind('accepted', '', limit).all();
    const missionIds = [...new Set((subRows.results || []).map(s => s.mission_id))];
    let byMission = {};
    if (missionIds.length > 0) {
      const placeholders = missionIds.map(() => '?').join(',');
      const mRows = await db.prepare('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions WHERE id IN (' + placeholders + ')').bind(...missionIds).all();
      (mRows.results || []).forEach(m => { byMission[m.id] = { title: m.title, reward_amount: m.reward_amount, teacher_id: m.teacher_id || '', teacher_name: m.teacher_name || 'Teacher' }; });
    }
    const list = (subRows.results || []).map(s => {
      const m = byMission[s.mission_id] || {};
      let caption = '';
      let image_url = null;
      if (s.submission_type === 'image_url' && s.submission_content) {
        image_url = String(s.submission_content).trim().slice(0, 1000);
      } else if (s.submission_type === 'text' && s.submission_content) {
        try {
          const parsed = typeof s.submission_content === 'string' ? JSON.parse(s.submission_content) : s.submission_content;
          caption = (parsed.text || parsed.content || parsed.body || '').trim().slice(0, 200) || '';
          if (parsed.image_url || parsed.image) image_url = String(parsed.image_url || parsed.image || '').trim().slice(0, 1000);
        } catch (_) {
          caption = String(s.submission_content).trim().slice(0, 200);
        }
      }
      const isVideo = (s.submission_type || '') === 'video';
      const video_url = isVideo && s.submission_content ? String(s.submission_content).trim().slice(0, 2000) : undefined;
      return {
        id: s.id,
        mission_id: s.mission_id,
        character_name: s.character_name,
        submission_type: s.submission_type,
        submission_content: s.submission_content || '',
        status: s.status,
        created_at: s.created_at,
        reviewed_at: s.reviewed_at,
        reviewed_by: s.reviewed_by || '',
        mission_title: m.title || '',
        mission_reward: m.reward_amount != null ? m.reward_amount : 1,
        created_by_teacher_name: m.teacher_name || 'Teacher',
        caption,
        image_url: image_url || undefined,
        video_url: video_url || undefined,
      };
    });
    return jsonResponse({ ok: true, submissions: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/hide') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors); }
    const id = parseModerationBodyId(body);
    const hiddenBy = adminAuditLabel(gate.account);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id, status FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    const now = new Date().toISOString();
    await db.prepare('UPDATE lantern_mission_submissions SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, hiddenBy, id).run();
    return jsonResponse({ ok: true, id, hidden_at: now }, 200, pilotCors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/restore') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors); }
    const id = parseModerationBodyId(body);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    await db.prepare('UPDATE lantern_mission_submissions SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true, id }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/hidden') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const subRows = await db.prepare(
      'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by, hidden_at, hidden_by FROM lantern_mission_submissions WHERE hidden_at IS NOT NULL AND hidden_at != ? ORDER BY hidden_at DESC LIMIT ?'
    ).bind('', limit).all();
    const missionIds = [...new Set((subRows.results || []).map(s => s.mission_id))];
    let byMission = {};
    if (missionIds.length > 0) {
      const placeholders = missionIds.map(() => '?').join(',');
      const mRows = await db.prepare('SELECT id, title FROM lantern_missions WHERE id IN (' + placeholders + ')').bind(...missionIds).all();
      (mRows.results || []).forEach(m => { byMission[m.id] = { title: m.title || '' }; });
    }
    const list = (subRows.results || []).map(s => ({
      id: s.id,
      mission_id: s.mission_id,
      character_name: s.character_name,
      submission_type: s.submission_type,
      submission_content: (s.submission_content || '').slice(0, 500),
      status: s.status,
      created_at: s.created_at,
      reviewed_at: s.reviewed_at,
      hidden_at: s.hidden_at,
      hidden_by: s.hidden_by,
      mission_title: (byMission[s.mission_id] || {}).title || '',
    }));
    return jsonResponse({ ok: true, submissions: list }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/character') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    const subRows = await db.prepare(
      'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by, returned_reason, returned_at FROM lantern_mission_submissions WHERE character_name = ? ORDER BY created_at DESC'
    ).bind(characterName).all();
    const missionIds = [...new Set((subRows.results || []).map(s => s.mission_id))];
    let byMission = {};
    if (missionIds.length > 0) {
      const placeholders = missionIds.map(() => '?').join(',');
      const mRows = await db.prepare('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions WHERE id IN (' + placeholders + ')').bind(...missionIds).all();
      (mRows.results || []).forEach(m => { byMission[m.id] = { title: m.title, reward_amount: m.reward_amount, teacher_id: m.teacher_id || '', teacher_name: m.teacher_name || 'Teacher' }; });
    }
    const list = (subRows.results || []).map(s => {
      const m = byMission[s.mission_id] || {};
      let image_url = null;
      if (s.submission_type === 'image_url' && s.submission_content) {
        image_url = String(s.submission_content).trim().slice(0, 1000);
      } else if (s.submission_type === 'text' && s.submission_content) {
        try {
          const parsed = typeof s.submission_content === 'string' ? JSON.parse(s.submission_content) : s.submission_content;
          if (parsed.image_url || parsed.image) image_url = String(parsed.image_url || parsed.image || '').trim().slice(0, 1000);
        } catch (_) {}
      }
      const isVideo = (s.submission_type || '') === 'video';
      const video_url = isVideo && s.submission_content ? String(s.submission_content).trim().slice(0, 2000) : undefined;
      return {
        id: s.id,
        mission_id: s.mission_id,
        character_name: s.character_name,
        submission_type: s.submission_type,
        submission_content: s.submission_content || '',
        status: s.status,
        created_at: s.created_at,
        reviewed_at: s.reviewed_at || null,
        reviewed_by: s.reviewed_by || '',
        returned_reason: (s.returned_reason && String(s.returned_reason).trim()) ? String(s.returned_reason).trim() : null,
        returned_at: s.returned_at || null,
        mission_title: m.title || '',
        mission_reward: m.reward_amount != null ? m.reward_amount : 1,
        created_by_teacher_name: m.teacher_name || 'Teacher',
        image_url: image_url || undefined,
        video_url: video_url || undefined,
      };
    });
    return jsonResponse({ ok: true, submissions: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/approve') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const acceptedBy = (body.accepted_by || 'Teacher').trim();
    const row = await db.prepare('SELECT id, mission_id, character_name, status, submission_type, submission_content FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    if ((row.status || '') !== 'pending') return jsonResponse({ ok: false, error: 'Can only approve pending submissions' }, 400, cors);
    const mission = await db.prepare('SELECT reward_amount, teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
    const teacherId = (body.teacher_id || '').trim();
    if (teacherId && mission && String(mission.teacher_id || '').trim() !== teacherId) return jsonResponse({ ok: false, error: 'Not authorized to approve this submission' }, 403, cors);
    const reward = mission ? Math.max(1, Math.min(99, Number(mission.reward_amount) || 1)) : 1;
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
    ).bind('accepted', acceptedBy, now, id).run();
    try { console.log('[missions] approved id=' + id + ' teacher_id=' + (teacherId || '') + ' result=ok'); } catch (_) {}
    if ((row.submission_type || '').trim() === 'poll' && row.submission_content) {
      let pollData;
      try { pollData = JSON.parse(row.submission_content); } catch (_) { pollData = null; }
      if (pollData && typeof pollData.question === 'string' && Array.isArray(pollData.choices) && pollData.choices.length >= 2 && pollData.choices.length <= 5) {
        const pollId = 'poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        const choicesJson = JSON.stringify(pollData.choices.map(c => String(c).trim().slice(0, 200)));
        const pollImageUrl = (pollData.image_url && String(pollData.image_url).trim().slice(0, 500)) || (pollData.image && String(pollData.image).trim().slice(0, 500)) || null;
        try {
          await db.prepare(
            'INSERT INTO lantern_polls (id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(pollId, id, String(pollData.question).trim().slice(0, 500), choicesJson, pollImageUrl, row.character_name || '', now, now).run();
        } catch (e) {
          // If the image_url column doesn't exist yet, fall back to the older insert shape.
          try {
            await db.prepare(
              'INSERT INTO lantern_polls (id, mission_submission_id, question, choices_json, character_name, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(pollId, id, String(pollData.question).trim().slice(0, 500), choicesJson, row.character_name || '', now, now).run();
          } catch (e2) {
            return jsonResponse({ ok: false, error: 'Poll image persistence requires DB migration 034 (add image_url to lantern_polls)' }, 503, cors);
          }
        }
      }
    }
    if ((row.submission_type || '').trim() === 'bug_report' && row.submission_content) {
      let bugData;
      try { bugData = typeof row.submission_content === 'string' ? JSON.parse(row.submission_content) : row.submission_content; } catch (_) { bugData = { description: row.submission_content }; }
      const desc = (bugData.description || String(row.submission_content || '')).trim().slice(0, 2000);
      const imgUrl = (bugData.image_url || bugData.image || '').trim().slice(0, 500) || null;
      const bugId = 'bug_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      try {
        await db.prepare(
          'INSERT INTO lantern_bug_reports (id, character_name, description, image_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(bugId, row.character_name || '', desc, imgUrl, 'approved', now).run();
      } catch (e) { /* table may not exist yet */ }
    }
    return jsonResponse({ ok: true, nuggets: reward, character_name: row.character_name }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/reject') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db.prepare('SELECT id, mission_id, status FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    const teacherId = (body.teacher_id || '').trim();
    if (teacherId) {
      const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
      if (mission && String(mission.teacher_id || '').trim() !== teacherId) return jsonResponse({ ok: false, error: 'Not authorized to reject this submission' }, 403, cors);
    }
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
    ).bind('rejected', 'Teacher', now, id).run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/return') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const reason = (body.reason || body.decision_note || '').trim().slice(0, 500);
    const returnedBy = (body.returned_by || 'Teacher').trim();
    const row = await db.prepare('SELECT id, mission_id, status FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    const teacherId = (body.teacher_id || '').trim();
    if (teacherId) {
      const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
      if (mission && String(mission.teacher_id || '').trim() !== teacherId) return jsonResponse({ ok: false, error: 'Not authorized to return this submission' }, 403, cors);
    }
    if ((row.status || '') !== 'pending') return jsonResponse({ ok: false, error: 'Can only return pending submissions' }, 400, cors);
    const now = new Date().toISOString();
    await db.prepare(
      'UPDATE lantern_mission_submissions SET status = ?, returned_reason = ?, returned_by = ?, returned_at = ? WHERE id = ?'
    ).bind('returned', reason, returnedBy, now, id).run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/resubmit') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db.prepare('SELECT id, status, submission_type FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    if ((row.status || '') !== 'returned') return jsonResponse({ ok: false, error: 'Can only resubmit returned submissions' }, 400, cors);
    const stRes = (row.submission_type) ? String(row.submission_type).trim() : '';
    const contentMaxRes = (stRes === 'poll' || stRes === 'bug_report') ? 4000 : 2000;
    const content = String(body.submission_content || '').trim().slice(0, contentMaxRes);
    await db.prepare(
      'UPDATE lantern_mission_submissions SET submission_content = ?, status = ?, returned_reason = ?, returned_by = ?, returned_at = ? WHERE id = ?'
    ).bind(content, 'pending', null, null, null, id).run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Polls — Contribute flow + legacy mission path; vote and one-time voter nugget. */
async function handlePollsRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  const origin = url.origin || '';

  if (request.method === 'POST' && path === '/api/polls/contribute') {
    let body;
    try { body = JSON.parse(await request.text() || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const characterName = (body.character_name || '').trim();
    const question = (body.question || '').trim().slice(0, 500);
    let choices = Array.isArray(body.choices) ? body.choices.map(c => String(c).trim().slice(0, 200)).filter(Boolean) : [];
    choices = choices.slice(0, 5);
    const imageUrl = (body.image_url || '').trim().slice(0, 500) || null;
    const fallbackKeyRaw = (body.fallback_key || '').trim();
    const ALLOWED_FB = ['poll', 'news', 'creation', 'generic', 'shoutout', 'explain'];
    if (!characterName) return jsonResponse({ ok: false, error: 'character_name required' }, 400, cors);
    if (!question) return jsonResponse({ ok: false, error: 'question required' }, 400, cors);
    if (choices.length < 2 || choices.length > 5) return jsonResponse({ ok: false, error: 'Provide 2–5 answer choices' }, 400, cors);
    if (!imageUrl && (!fallbackKeyRaw || !ALLOWED_FB.includes(fallbackKeyRaw))) {
      return jsonResponse({ ok: false, error: 'Add a poll image or pick a fallback picture' }, 400, cors);
    }
    const contribId = 'pcontrib_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const approvalId = 'appr_poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const choicesJson = JSON.stringify(choices);
    const fb = imageUrl ? null : fallbackKeyRaw;
    try {
      await db.prepare(
        'INSERT INTO lantern_poll_contributions (id, character_name, question, choices_json, image_url, fallback_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(contribId, characterName, question, choicesJson, imageUrl, fb, 'pending', now).run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Poll submissions require DB migration 029 (lantern_poll_contributions)' }, 503, cors);
    }
    await db.prepare(
      'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(approvalId, 'poll_contribution', contribId, 'pending', characterName, characterName, null, now).run();
    return jsonResponse({ ok: true, id: contribId, status: 'pending', message: 'Submitted for teacher approval.' }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/polls/contributions') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'character_name required' }, 400, cors);
    const statusParam = (url.searchParams.get('status') || 'all').trim().toLowerCase();
    const validStatus = ['pending', 'approved', 'returned'].includes(statusParam);
    const filterByStatus = validStatus ? statusParam : null;
    try {
      console.log('[poll-contributions] request', {
        character_name: characterName,
        status_param: statusParam,
        filter_status: filterByStatus || 'all'
      });
    } catch (_) {}
    let rows;
    try {
      if (filterByStatus) {
        rows = await db.prepare(
          'SELECT id, character_name, question, choices_json, image_url, fallback_key, status, decision_note, reviewed_at, created_at FROM lantern_poll_contributions WHERE character_name = ? AND status = ? ORDER BY created_at DESC LIMIT 100'
        ).bind(characterName, filterByStatus).all();
      } else {
        rows = await db.prepare(
          'SELECT id, character_name, question, choices_json, image_url, fallback_key, status, decision_note, reviewed_at, created_at FROM lantern_poll_contributions WHERE character_name = ? ORDER BY created_at DESC LIMIT 100'
        ).bind(characterName).all();
      }
    } catch (e) {
      return jsonResponse({ ok: false, error: 'DB error', contributions: [] }, 503, cors);
    }
    const list = (rows.results || []).map(r => {
      let choices = [];
      try { choices = JSON.parse(r.choices_json || '[]'); } catch (_) {}
      return {
        id: r.id,
        question: r.question || '',
        choices,
        image_url: r.image_url || null,
        fallback_key: r.fallback_key || null,
        status: r.status || '',
        decision_note: r.decision_note || null,
        reviewed_at: r.reviewed_at || null,
        created_at: r.created_at || '',
      };
    });
    try {
      const pendingCount = list.filter(item => String(item.status || '').toLowerCase() === 'pending').length;
      const approvedCount = list.filter(item => String(item.status || '').toLowerCase() === 'approved').length;
      const returnedCount = list.filter(item => String(item.status || '').toLowerCase() === 'returned').length;
      console.log('[poll-contributions] response', {
        character_name: characterName,
        filter_status: filterByStatus || 'all',
        total_count: list.length,
        pending_count: pendingCount,
        approved_count: approvedCount,
        returned_count: returnedCount,
        ids: list.map(item => item.id)
      });
    } catch (_) {}
    return jsonResponse({ ok: true, contributions: list }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/polls/returned') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'character_name required' }, 400, cors);
    let rows;
    try {
      rows = await db.prepare(
        'SELECT id, character_name, question, choices_json, image_url, fallback_key, status, decision_note, reviewed_at, created_at FROM lantern_poll_contributions WHERE character_name = ? AND status = ? ORDER BY reviewed_at DESC, created_at DESC LIMIT 50'
      ).bind(characterName, 'returned').all();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'DB error', returned: [] }, 503, cors);
    }
    const list = (rows.results || []).map(r => {
      let choices = [];
      try { choices = JSON.parse(r.choices_json || '[]'); } catch (_) {}
      return {
        id: r.id,
        question: r.question || '',
        choices,
        image_url: r.image_url || null,
        fallback_key: r.fallback_key || null,
        decision_note: r.decision_note || null,
        reviewed_at: r.reviewed_at || null,
        created_at: r.created_at || '',
      };
    });
    return jsonResponse({ ok: true, returned: list }, 200, cors);
  }

  const pollContribIdMatch = path.match(/^\/api\/polls\/contributions\/([^/]+)$/);
  if (request.method === 'GET' && pollContribIdMatch) {
    const contribId = pollContribIdMatch[1];
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'character_name required' }, 400, cors);
    const row = await db.prepare(
      'SELECT id, character_name, question, choices_json, image_url, fallback_key, status, decision_note FROM lantern_poll_contributions WHERE id = ? AND character_name = ? AND status = ?'
    ).bind(contribId, characterName, 'returned').first();
    if (!row) return jsonResponse({ ok: false, error: 'Contribution not found or not returned' }, 404, cors);
    let choices = [];
    try { choices = JSON.parse(row.choices_json || '[]'); } catch (_) {}
    return jsonResponse({
      ok: true,
      contribution: {
        id: row.id,
        question: row.question || '',
        choices,
        image_url: row.image_url || null,
        fallback_key: row.fallback_key || null,
        decision_note: row.decision_note || null,
      },
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/polls/resubmit') {
    let body;
    try { body = JSON.parse(await request.text() || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const contribId = (body.id || '').trim();
    const characterName = (body.character_name || '').trim();
    const question = (body.question || '').trim().slice(0, 500);
    let choices = Array.isArray(body.choices) ? body.choices.map(c => String(c).trim().slice(0, 200)).filter(Boolean) : [];
    choices = choices.slice(0, 5);
    const imageUrl = (body.image_url || '').trim().slice(0, 500) || null;
    const fallbackKeyRaw = (body.fallback_key || '').trim();
    const ALLOWED_FB = ['poll', 'news', 'creation', 'generic', 'shoutout', 'explain'];
    if (!contribId || !characterName) return jsonResponse({ ok: false, error: 'id and character_name required' }, 400, cors);
    if (!question) return jsonResponse({ ok: false, error: 'question required' }, 400, cors);
    if (choices.length < 2 || choices.length > 5) return jsonResponse({ ok: false, error: 'Provide 2–5 answer choices' }, 400, cors);
    if (!imageUrl && (!fallbackKeyRaw || !ALLOWED_FB.includes(fallbackKeyRaw))) {
      return jsonResponse({ ok: false, error: 'Add a poll image or pick a fallback picture' }, 400, cors);
    }
    const row = await db.prepare('SELECT id, status FROM lantern_poll_contributions WHERE id = ? AND character_name = ?').bind(contribId, characterName).first();
    if (!row) return jsonResponse({ ok: false, error: 'Contribution not found' }, 404, cors);
    if ((row.status || '') !== 'returned') return jsonResponse({ ok: false, error: 'Can only resubmit returned polls' }, 400, cors);
    const now = new Date().toISOString();
    const choicesJson = JSON.stringify(choices);
    const fb = imageUrl ? null : fallbackKeyRaw;
    await db.prepare(
      'UPDATE lantern_poll_contributions SET question = ?, choices_json = ?, image_url = ?, fallback_key = ?, status = ?, decision_note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?'
    ).bind(question, choicesJson, imageUrl, fb, 'pending', null, null, null, contribId).run();
    const approvalId = 'appr_poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    await db.prepare(
      'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(approvalId, 'poll_contribution', contribId, 'pending', characterName, characterName, null, now).run();
    return jsonResponse({ ok: true, id: contribId, status: 'pending', message: 'Resubmitted for teacher approval.' }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/polls') {
    let rows;
    try {
      rows = await db.prepare(
        'SELECT id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 50'
      ).all();
    } catch (e) {
      rows = await db.prepare(
        'SELECT id, mission_submission_id, question, choices_json, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 50'
      ).all();
    }
    const list = (rows.results || []).map(r => {
      let choices = [];
      try { choices = JSON.parse(r.choices_json || '[]'); } catch (_) {}
      return {
        id: r.id,
        question: r.question || '',
        choices,
        image_url: r.image_url || null,
        character_name: r.character_name || '',
        created_at: r.created_at || '',
      };
    });
    return jsonResponse({ ok: true, polls: list }, 200, cors);
  }

  const pollIdMatch = path.match(/^\/api\/polls\/([^/]+)$/);
  if (request.method === 'GET' && pollIdMatch) {
    const pollId = pollIdMatch[1];
    const characterName = (url.searchParams.get('character_name') || '').trim();
    let row;
    try {
      row = await db.prepare('SELECT id, question, choices_json, image_url, character_name, created_at FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL').bind(pollId).first();
    } catch (e) {
      row = await db.prepare('SELECT id, question, choices_json, character_name, created_at FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL').bind(pollId).first();
    }
    if (!row) return jsonResponse({ ok: false, error: 'Poll not found' }, 404, cors);
    let choices = [];
    try { choices = JSON.parse(row.choices_json || '[]'); } catch (_) {}
    const voteRow = characterName ? await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ?').bind(pollId, characterName).first() : null;
    const hasVoted = !!voteRow;
    let results = null;
    if (hasVoted) {
      const voteRows = await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ?').bind(pollId).all();
      const counts = {};
      (voteRows.results || []).forEach(v => { counts[v.choice_index] = (counts[v.choice_index] || 0) + 1; });
      const total = (voteRows.results || []).length;
      results = choices.map((c, i) => ({ choice: c, count: counts[i] || 0, percentage: total > 0 ? Math.round(((counts[i] || 0) / total) * 100) : 0 }));
    }
    return jsonResponse({
      ok: true,
      poll: { id: row.id, question: row.question, choices, image_url: row.image_url || null, character_name: row.character_name, created_at: row.created_at },
      has_voted: hasVoted,
      results,
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/polls/vote') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const pollId = (body.poll_id || '').trim();
    const characterName = (body.character_name || '').trim();
    const choiceIndex = Math.floor(Number(body.choice_index));
    if (!pollId || !characterName) return jsonResponse({ ok: false, error: 'Missing poll_id or character_name' }, 400, cors);
    const poll = await db.prepare('SELECT id, choices_json FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL').bind(pollId).first();
    if (!poll) return jsonResponse({ ok: false, error: 'Poll not found' }, 404, cors);
    let choices = [];
    try { choices = JSON.parse(poll.choices_json || '[]'); } catch (_) {}
    if (choiceIndex < 0 || choiceIndex >= choices.length) return jsonResponse({ ok: false, error: 'Invalid choice' }, 400, cors);
    const existing = await db.prepare('SELECT id FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ?').bind(pollId, characterName).first();
    if (existing) return jsonResponse({ ok: false, error: 'Already voted' }, 400, cors);
    const now = new Date().toISOString();
    const voteId = 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    await db.prepare('INSERT INTO lantern_poll_votes (id, poll_id, character_name, choice_index, created_at) VALUES (?, ?, ?, ?, ?)').bind(voteId, pollId, characterName, choiceIndex, now).run();
    let voterNuggets = 0;
    const rewardRow = await db.prepare('SELECT id FROM lantern_poll_voter_rewards WHERE poll_id = ? AND character_name = ?').bind(pollId, characterName).first();
    if (!rewardRow) {
      const rewardId = 'pvr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      await db.prepare('INSERT INTO lantern_poll_voter_rewards (id, poll_id, character_name, created_at) VALUES (?, ?, ?, ?)').bind(rewardId, pollId, characterName, now).run();
      voterNuggets = 1;
      const txId = 'tx-' + crypto.randomUUID();
      await db.prepare(
        'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(txId, characterName, 1, 'poll_vote', 'POLL', 'Poll participation', now, JSON.stringify({ poll_id: pollId })).run();
      const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(characterName).first();
      const currentBalance = walletRow ? (Number(walletRow.balance) || 0) : 0;
      await db.prepare(
        'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
      ).bind(characterName, currentBalance + 1, now, 1, now).run();
    }
    const voteRows = await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ?').bind(pollId).all();
    const counts = {};
    (voteRows.results || []).forEach(v => { counts[v.choice_index] = (counts[v.choice_index] || 0) + 1; });
    const total = (voteRows.results || []).length;
    const results = choices.map((c, i) => ({ choice: c, count: counts[i] || 0, percentage: total > 0 ? Math.round(((counts[i] || 0) / total) * 100) : 0 }));
    return jsonResponse({ ok: true, results, voted_choice_index: choiceIndex, voter_nuggets: voterNuggets }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Media — approved image library (curated); default images; serve from R2. Keys: default/<filename>, library/<category>/<filename>. */
const MEDIA_LIBRARY_CATEGORIES = {
  robotics: [{ key: 'library/robotics/robotics_1.png' }, { key: 'library/robotics/robotics_2.png' }, { key: 'library/robotics/robotics_3.png' }],
  coding: [{ key: 'library/coding/coding_1.png' }, { key: 'library/coding/coding_2.png' }, { key: 'library/coding/coding_3.png' }],
  ai: [{ key: 'library/ai/ai_1.png' }, { key: 'library/ai/ai_2.png' }, { key: 'library/ai/ai_3.png' }],
  engineering: [{ key: 'library/engineering/engineering_1.png' }, { key: 'library/engineering/engineering_2.png' }, { key: 'library/engineering/engineering_3.png' }],
  art: [{ key: 'library/art/art_1.png' }, { key: 'library/art/art_2.png' }, { key: 'library/art/art_3.png' }],
  'school-life': [{ key: 'library/school-life/school-life_1.png' }, { key: 'library/school-life/school-life_2.png' }, { key: 'library/school-life/school-life_3.png' }],
  abstract: [{ key: 'library/abstract/abstract_1.png' }, { key: 'library/abstract/abstract_2.png' }, { key: 'library/abstract/abstract_3.png' }],
};
const DEFAULT_IMAGES = {
  poll: 'default/default_poll.png',
  news: 'default/default_news.png',
  creation: 'default/default_creation.png',
  explain: 'default/default_explain.png',
  shoutout: 'default/default_shoutout.png',
  generic: 'default/default_generic_stem.png',
};
async function handleMediaRoutes(request, url, path, env, cors) {
  const origin = url.origin || '';

  if (request.method === 'GET' && path === '/api/media/library') {
    const categories = {};
    for (const [cat, items] of Object.entries(MEDIA_LIBRARY_CATEGORIES)) {
      categories[cat] = items.map(it => ({
        key: it.key,
        url: origin + '/api/media/image?key=' + encodeURIComponent(it.key),
      }));
    }
    return jsonResponse({ ok: true, categories, defaults: DEFAULT_IMAGES }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/media/image') {
    const key = (url.searchParams.get('key') || '').trim();
    if (!key) return jsonResponse({ ok: false, error: 'Missing key' }, 400, cors);
    const bucket = env.NEWS_BUCKET || env.AVATAR_BUCKET;
    if (!bucket) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, cors);
    const obj = await bucket.get(key);
    if (!obj) return new Response('Not Found', { status: 404, headers: cors });
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=604800, immutable',
        ...cors,
      },
    });
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Bug reports — approved Report a Bug mission submissions; listed on Verify. */
async function handleBugReportsRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/bug-reports') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    let rows;
    try {
      rows = await db.prepare('SELECT id, character_name, description, image_url, status, created_at FROM lantern_bug_reports ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    } catch (e) {
      return jsonResponse({ ok: true, reports: [] }, 200, cors);
    }
    const list = (rows.results || []).map(r => ({
      id: r.id,
      character_name: r.character_name || '',
      description: r.description || '',
      image_url: r.image_url || null,
      status: r.status || 'approved',
      created_at: r.created_at || '',
    }));
    return jsonResponse({ ok: true, reports: list }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Test students — temporary tester identities. Create and list only; no auth. */
async function handleTestStudentRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  const now = new Date().toISOString();

  if (request.method === 'POST' && path === '/api/test-students') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const displayName = (body.display_name || '').trim().slice(0, 120);
    if (!displayName) return jsonResponse({ ok: false, error: 'Missing display_name' }, 400, cors);
    const durationDays = [1, 7].includes(parseInt(body.duration_days, 10)) ? parseInt(body.duration_days, 10) : 1;
    const id = 'ts_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const characterName = 'test_' + id.replace('ts_', '');
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    try {
      await db.prepare(
        'INSERT INTO lantern_test_students (id, character_name, display_name, mode, created_at, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(id, characterName, displayName, 'test', now, expiresAt, 1)
        .run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Failed to create test student' }, 500, cors);
    }
    return jsonResponse({
      ok: true,
      id,
      character_name: characterName,
      display_name: displayName,
      mode: 'test',
      created_at: now,
      expires_at: expiresAt,
      is_active: true,
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/test-students') {
    let rows;
    try {
      rows = await db.prepare(
        'SELECT id, character_name, display_name, mode, created_at, expires_at, is_active FROM lantern_test_students WHERE is_active = 1 AND expires_at > ? ORDER BY created_at DESC LIMIT 100'
      )
        .bind(now)
        .all();
    } catch (e) {
      return jsonResponse({ ok: true, test_students: [] }, 200, cors);
    }
    const list = (rows.results || []).map((r) => ({
      id: r.id,
      character_name: r.character_name,
      display_name: r.display_name || r.character_name,
      mode: r.mode || 'test',
      created_at: r.created_at,
      expires_at: r.expires_at,
      is_active: !!r.is_active,
    }));
    return jsonResponse({ ok: true, test_students: list }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/test-students/validate') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    if (!characterName.startsWith('test_')) return jsonResponse({ ok: true, valid: false, reason: 'not_test' }, 200, cors);
    const row = await db.prepare(
      'SELECT id, expires_at, is_active FROM lantern_test_students WHERE character_name = ?'
    )
      .bind(characterName)
      .first();
    if (!row) return jsonResponse({ ok: true, valid: false, reason: 'not_found' }, 200, cors);
    const valid = !!row.is_active && row.expires_at > now;
    return jsonResponse({ ok: true, valid, expires_at: row.expires_at }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

/** Games — culture/identity endpoints. FERPA-safe: public character list for Avatar Match only. */
async function handleGamesRoutes(request, url, path, env, cors) {
  const origin = url.origin || '';
  if (request.method === 'GET' && path === '/api/games/characters') {
    const students = (VERIFY_CONFIG && VERIFY_CONFIG.students) ? VERIFY_CONFIG.students : [];
    let avatarByChar = {};
    if (env.DB) {
      try {
        const profiles = await env.DB.prepare('SELECT character_name, current_avatar_key FROM lantern_avatar_profiles').all();
        (profiles.results || []).forEach((p) => {
          if (p.character_name && p.current_avatar_key) avatarByChar[p.character_name] = p.current_avatar_key;
        });
      } catch (_) {}
    }
    const list = students.map((s) => {
      const charName = (s.character_name || '').trim();
      const uploadedKey = avatarByChar[charName];
      const avatarUrl = (uploadedKey && origin)
        ? origin + '/api/avatar/image?key=' + encodeURIComponent(uploadedKey)
        : (s.avatarPath && origin)
          ? origin + '/api/avatar/image?key=' + encodeURIComponent(s.avatarPath)
          : null;
      return {
        character_name: charName,
        display_name: s.displayName || s.character_name || charName,
        avatar_url: avatarUrl,
      };
    });
    return jsonResponse({ ok: true, characters: list }, 200, cors);
  }
  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

/** Leaderboards — daily (24h), weekly (7d), monthly (30d), school year (Aug 1 – May 31). */
async function handleLeaderboardRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'POST' && path === '/api/leaderboards/record') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const gameName = (body.game_name || '').trim().slice(0, 100);
    const characterName = (body.character_name || '').trim();
    const score = Math.floor(Number(body.score));
    if (!gameName || !characterName) return jsonResponse({ ok: false, error: 'Missing game_name or character_name' }, 400, cors);
    const scoreDisplay = (body.score_display || '').trim().slice(0, 100) || null;
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const now = new Date().toISOString();
    const id = 'lb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try {
      await db.prepare(
        'INSERT INTO lantern_leaderboard_entries (id, game_name, character_name, score, score_display, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, gameName, characterName, score, scoreDisplay, JSON.stringify(meta), now).run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Leaderboard table not ready' }, 503, cors);
    }
    return jsonResponse({ ok: true, id }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/leaderboards') {
    const period = (url.searchParams.get('period') || 'weekly').trim();
    const gameName = (url.searchParams.get('game_name') || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const now = new Date();
    let since;
    let until = null;
    if (period === 'daily') {
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    } else if (period === 'weekly') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (period === 'monthly') {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (period === 'school_year') {
      const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
      since = new Date(startYear, 7, 1).toISOString();
      const endYear = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
      until = new Date(endYear, 4, 31, 23, 59, 59, 999).toISOString();
    } else {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    const LOWER_IS_BETTER = ['Reaction Tap', 'Nugget Hunt'];
    const lowerBetter = gameName && LOWER_IS_BETTER.includes(gameName);
    const agg = lowerBetter ? 'MIN(score)' : 'MAX(score)';
    const orderBy = lowerBetter ? 'ORDER BY score ASC' : 'ORDER BY score DESC';
    let rows;
    try {
      if (gameName) {
        if (until) {
          rows = await db.prepare(
            `SELECT character_name, ${agg} AS score FROM lantern_leaderboard_entries WHERE game_name = ? AND created_at >= ? AND created_at <= ? GROUP BY character_name ${orderBy} LIMIT ?`
          ).bind(gameName, since, until, limit).all();
        } else {
          rows = await db.prepare(
            `SELECT character_name, ${agg} AS score FROM lantern_leaderboard_entries WHERE game_name = ? AND created_at >= ? GROUP BY character_name ${orderBy} LIMIT ?`
          ).bind(gameName, since, limit).all();
        }
      } else {
        if (until) {
          rows = await db.prepare(
            'SELECT character_name, MAX(score) AS score FROM lantern_leaderboard_entries WHERE created_at >= ? AND created_at <= ? GROUP BY character_name ORDER BY score DESC LIMIT ?'
          ).bind(since, until, limit).all();
        } else {
          rows = await db.prepare(
            'SELECT character_name, MAX(score) AS score FROM lantern_leaderboard_entries WHERE created_at >= ? GROUP BY character_name ORDER BY score DESC LIMIT ?'
          ).bind(since, limit).all();
        }
      }
    } catch (e) {
      return jsonResponse({ ok: true, period, entries: [] }, 200, cors);
    }
    const entries = (rows.results || []).map((r, i) => ({
      rank: i + 1,
      character_name: r.character_name || '',
      game_name: gameName || '',
      score: Number(r.score) || 0,
      score_display: r.score_display != null ? r.score_display : String(Number(r.score) || 0),
    }));
    return jsonResponse({ ok: true, period, entries }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Beta reports — simple bug/issue reports from testers. Stored in D1; listed on Verify page. */
async function handleBetaReportsRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'POST' && path === '/api/beta-reports') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const description = (body.description || '').trim().slice(0, 2000);
    if (!description) return jsonResponse({ ok: false, error: 'Missing description' }, 400, cors);
    const reporterName = (body.reporter_name || '').trim().slice(0, 200) || 'Anonymous';
    const page = ['Explore', 'News', 'Games', 'Store', 'Profile', 'Missions', 'Other'].includes(String(body.page || '').trim()) ? String(body.page).trim() : 'Other';
    const screenshotUrl = (body.screenshot_url || '').trim().slice(0, 500) || null;
    const id = 'br-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO beta_reports (id, created_at, reporter_name, page, description, screenshot_url) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, now, reporterName, page, description, screenshotUrl).run();
    return jsonResponse({ ok: true, id, created_at: now }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/beta-reports') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const rows = await db.prepare(
      'SELECT id, created_at, reporter_name, page, description, screenshot_url FROM beta_reports ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();
    const list = (rows.results || []).map(r => ({
      id: r.id,
      created_at: r.created_at,
      reporter_name: r.reporter_name || '',
      page: r.page || 'Other',
      description: r.description || '',
      screenshot_url: r.screenshot_url || null,
    }));
    return jsonResponse({ ok: true, reports: list }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

function parseShoutOutRecipientFromNews(body, title) {
  const b = String(body || '');
  const m = b.match(/Recognizing:\s*([^\n\r]+)/i);
  if (m) return m[1].trim();
  const t = String(title || '').match(/^Shout-out:\s*(.+)$/i);
  return t ? t[1].trim() : '';
}
function extractShoutOutMessageFromNews(body) {
  const s = String(body || '');
  const re = /\n\nRecognizing:\s*[^\n\r]+\n\n([\s\S]*)$/i;
  const m = s.match(re);
  if (m && m[1]) return m[1].trim();
  const parts = s.split(/\n\n+/);
  if (parts.length >= 3) return parts.slice(2).join('\n\n').trim();
  return s.replace(/^Shout-out\s*\([^)]*\)\s*\n*/i, '').replace(/Recognizing:\s*[^\n\r]+\n*/i, '').trim();
}
function shoutOutRecipientMatchesCharacter(recipient, characterName) {
  const r = String(recipient || '').trim().toLowerCase();
  const c = String(characterName || '').trim().toLowerCase();
  if (!r || !c) return false;
  if (r === c) return true;
  if (c.replace(/_/g, ' ') === r) return true;
  if (r.replace(/\s+/g, '_') === c) return true;
  return false;
}

/** Lantern teacher recognition — teacher-authored positive recognition. No moderation queue. */
async function handleRecognitionRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'POST' && path === '/api/recognition/create') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const characterName = (body.character_name || '').trim();
    const message = (body.message || '').trim().slice(0, 250);
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    if (!message) return jsonResponse({ ok: false, error: 'Missing message' }, 400, cors);
    const category = (body.category || '').trim() || null;
    const createdByTeacherId = (body.created_by_teacher_id || '').trim() || null;
    const createdByTeacherName = (body.created_by_teacher_name || 'Teacher').trim();
    const id = 'rec-' + crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO lantern_teacher_recognition (id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, characterName, message, category, now, createdByTeacherId, createdByTeacherName).run();
    return jsonResponse({
      ok: true,
      id,
      character_name: characterName,
      message,
      category,
      created_at: now,
      created_by_teacher_name: createdByTeacherName,
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/recognition/list') {
    const origin = url.origin || '';
    const characterName = (url.searchParams.get('character_name') || '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const fetchCap = characterName ? Math.min(100, limit + 40) : limit;
    let rows;
    if (characterName) {
      rows = await db.prepare(
        'SELECT id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name FROM lantern_teacher_recognition WHERE character_name = ? ORDER BY created_at DESC LIMIT ?'
      ).bind(characterName, fetchCap).all();
    } else {
      rows = await db.prepare(
        'SELECT id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name FROM lantern_teacher_recognition ORDER BY created_at DESC LIMIT ?'
      ).bind(limit).all();
    }
    const profiles = await db.prepare('SELECT character_name, current_avatar_key FROM lantern_avatar_profiles').all();
    const avatarByChar = {};
    (profiles.results || []).forEach(p => {
      if (p.character_name && p.current_avatar_key) avatarByChar[p.character_name] = p.current_avatar_key;
    });
    let list = (rows.results || []).map(r => {
      const key = avatarByChar[r.character_name];
      return {
        id: r.id,
        character_name: r.character_name,
        message: r.message,
        category: r.category || '',
        created_at: r.created_at,
        created_by_teacher_name: r.created_by_teacher_name || '',
        avatar_image: key ? origin + '/api/avatar/image?key=' + encodeURIComponent(key) : null,
      };
    });
    if (characterName) {
      const newsRows = await db.prepare(
        "SELECT id, title, body, author_name, reviewed_at, created_at FROM lantern_news_submissions WHERE status = 'approved' AND (hidden_at IS NULL OR hidden_at = '') AND (body LIKE 'Shout-out%' OR body LIKE '%Recognizing:%') ORDER BY COALESCE(reviewed_at, created_at) DESC LIMIT 80"
      ).all();
      for (const nr of newsRows.results || []) {
        const recip = parseShoutOutRecipientFromNews(nr.body, nr.title);
        if (!shoutOutRecipientMatchesCharacter(recip, characterName)) continue;
        const msg = extractShoutOutMessageFromNews(nr.body).slice(0, 500);
        const author = (nr.author_name || '').trim() || 'Classmate';
        const keyAuth = avatarByChar[author];
        list.push({
          id: 'shoutout-news-' + nr.id,
          character_name: characterName,
          message: msg || 'Shout-out',
          category: 'Peer shout-out',
          created_at: nr.reviewed_at || nr.created_at,
          created_by_teacher_name: author + ' · Shout-out',
          avatar_image: keyAuth ? origin + '/api/avatar/image?key=' + encodeURIComponent(keyAuth) : null,
        });
      }
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      list = list.slice(0, limit);
    }
    return jsonResponse({ ok: true, recognition: list }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Allowed reaction types (system-controlled vocabulary). */
const REACTION_TYPES = ['heart', 'star', 'lightbulb', 'teamwork', 'thumbsup', 'creative', 'fire'];
/** Allowed item types for reactions (approved public content only). */
const REACTION_ITEM_TYPES = ['news', 'recognition'];

/** Feature flags (env). Default false. */
function isEarlyEncouragerEnabled(env) { return (env.ENABLE_EARLY_ENCOURAGER_REWARD || '').toString().toLowerCase() === 'true'; }
function isReactionBreakdownEnabled(env) { return (env.ENABLE_REACTION_BREAKDOWN || '').toString().toLowerCase() === 'true'; }
function isInclusionBoostEnabled(env) { return (env.ENABLE_INCLUSION_BOOST || '').toString().toLowerCase() === 'true'; }

/** Grant one nugget for early encourager (called after reaction insert). Daily cap 3 per character. First 5 reactors per item eligible. */
async function maybeGrantEarlyEncouragerReward(db, characterName, itemType, itemId, now) {
  const EARLY_CAP = 5;
  const DAILY_CAP = 3;
  const reactorOrder = await db.prepare(
    'SELECT character_name, created_at FROM lantern_reactions WHERE item_type = ? AND item_id = ? ORDER BY created_at ASC'
  ).bind(itemType, itemId).all();
  const ordered = (reactorOrder.results || []).map((r, i) => ({ character_name: r.character_name, created_at: r.created_at }));
  const firstFive = ordered.slice(0, EARLY_CAP).map(r => r.character_name);
  if (!firstFive.includes(characterName)) return { granted: false };
  const existing = await db.prepare(
    'SELECT id FROM lantern_early_encourager_rewards WHERE character_name = ? AND item_type = ? AND item_id = ?'
  ).bind(characterName, itemType, itemId).first();
  if (existing) return { granted: false, already: true };
  const today = now.slice(0, 10);
  const todayRewards = await db.prepare(
    "SELECT id FROM lantern_early_encourager_rewards WHERE character_name = ? AND date(rewarded_at) = date(?)"
  ).bind(characterName, now).all();
  const todayCount = (todayRewards.results || []).length;
  if (todayCount >= DAILY_CAP) return { granted: false, cap: true };
  const rewardId = 'eer-' + crypto.randomUUID();
  await db.prepare(
    'INSERT INTO lantern_early_encourager_rewards (id, character_name, item_type, item_id, rewarded_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(rewardId, characterName, itemType, itemId, now).run();
  const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(characterName).first();
  const currentBalance = walletRow ? (Number(walletRow.balance) || 0) : 0;
  const txId = 'tx-' + crypto.randomUUID();
  await db.prepare(
    'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(txId, characterName, 1, 'early_encourager', 'reaction', 'Early encouragement', now, JSON.stringify({ item_type: itemType, item_id: itemId })).run();
  await db.prepare(
    'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
  ).bind(characterName, currentBalance + 1, now, 1, now).run();
  return { granted: true, nuggets: 1 };
}

/** Lantern student reactions — only on approved public content. No comments; icons only. */
async function handleReactionsRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'POST' && path === '/api/reactions/add') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const itemType = (body.item_type || '').trim().toLowerCase();
    const itemId = (body.item_id || '').trim();
    const reactionType = (body.reaction_type || '').trim().toLowerCase();
    const characterName = (body.character_name || '').trim();
    if (!REACTION_ITEM_TYPES.includes(itemType)) return jsonResponse({ ok: false, error: 'Invalid item_type' }, 400, cors);
    if (!itemId) return jsonResponse({ ok: false, error: 'Missing item_id' }, 400, cors);
    if (!REACTION_TYPES.includes(reactionType)) return jsonResponse({ ok: false, error: 'Invalid reaction_type' }, 400, cors);
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);

    if (itemType === 'news') {
      const row = await db.prepare('SELECT id, status FROM lantern_news_submissions WHERE id = ?').bind(itemId).first();
      if (!row || (row.status || '').toLowerCase() !== 'approved') return jsonResponse({ ok: false, error: 'Item not approved or not found' }, 400, cors);
    } else if (itemType === 'recognition') {
      const row = await db.prepare('SELECT id FROM lantern_teacher_recognition WHERE id = ?').bind(itemId).first();
      if (!row) return jsonResponse({ ok: false, error: 'Item not found' }, 400, cors);
    }

    const id = 'react-' + crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.prepare(
        'INSERT INTO lantern_reactions (id, item_type, item_id, reaction_type, character_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, itemType, itemId, reactionType, characterName, now).run();
    } catch (e) {
      if (e && (e.message || '').includes('UNIQUE')) return jsonResponse({ ok: true, already: true, id }, 200, cors);
      throw e;
    }
    let earlyReward = null;
    if (isEarlyEncouragerEnabled(env)) {
      try { earlyReward = await maybeGrantEarlyEncouragerReward(db, characterName, itemType, itemId, now); } catch (_) { earlyReward = { granted: false }; }
    }
    return jsonResponse({
      ok: true,
      id,
      item_type: itemType,
      item_id: itemId,
      reaction_type: reactionType,
      early_encourager_reward: earlyReward && earlyReward.granted ? { nuggets: earlyReward.nuggets } : undefined,
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/reactions/counts') {
    const itemType = (url.searchParams.get('item_type') || '').trim().toLowerCase();
    const itemIdsParam = (url.searchParams.get('item_ids') || '').trim();
    if (!REACTION_ITEM_TYPES.includes(itemType) || !itemIdsParam) return jsonResponse({ ok: false, error: 'Missing item_type or item_ids' }, 400, cors);
    const itemIds = itemIdsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
    if (itemIds.length === 0) return jsonResponse({ ok: true, counts: {} }, 200, cors);
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = await db.prepare(
      `SELECT item_id, reaction_type, COUNT(*) AS c FROM lantern_reactions WHERE item_type = ? AND item_id IN (${placeholders}) GROUP BY item_id, reaction_type`
    ).bind(itemType, ...itemIds).all();
    const counts = {};
    itemIds.forEach(id => { counts[id] = {}; });
    (rows.results || []).forEach(r => {
      if (counts[r.item_id]) counts[r.item_id][r.reaction_type] = r.c;
    });
    return jsonResponse({ ok: true, counts }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/reactions/mine') {
    const itemType = (url.searchParams.get('item_type') || '').trim().toLowerCase();
    const itemIdsParam = (url.searchParams.get('item_ids') || '').trim();
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!REACTION_ITEM_TYPES.includes(itemType) || !itemIdsParam) return jsonResponse({ ok: false, error: 'Missing item_type or item_ids' }, 400, cors);
    const itemIds = itemIdsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
    if (itemIds.length === 0) return jsonResponse({ ok: true, mine: {} }, 200, cors);
    const placeholders = itemIds.map(() => '?').join(',');
    let rows;
    if (characterName) {
      rows = await db.prepare(
        `SELECT item_id, reaction_type FROM lantern_reactions WHERE item_type = ? AND item_id IN (${placeholders}) AND character_name = ?`
      ).bind(itemType, ...itemIds, characterName).all();
    } else {
      rows = { results: [] };
    }
    const mine = {};
    itemIds.forEach(id => { mine[id] = []; });
    (rows.results || []).forEach(r => {
      if (mine[r.item_id] && !mine[r.item_id].includes(r.reaction_type)) mine[r.item_id].push(r.reaction_type);
    });
    return jsonResponse({ ok: true, mine }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/reactions/breakdown') {
    if (!isReactionBreakdownEnabled(env)) return jsonResponse({ ok: false, error: 'Not enabled' }, 404, cors);
    const itemType = (url.searchParams.get('item_type') || '').trim().toLowerCase();
    const itemId = (url.searchParams.get('item_id') || '').trim();
    const viewerCharacterName = (url.searchParams.get('viewer_character_name') || '').trim();
    const viewerIsTeacher = (url.searchParams.get('viewer_is_teacher') || '').toString().toLowerCase() === 'true';
    if (!REACTION_ITEM_TYPES.includes(itemType) || !itemId) return jsonResponse({ ok: false, error: 'Missing item_type or item_id' }, 400, cors);
    const rows = await db.prepare(
      'SELECT reaction_type, COUNT(*) AS c FROM lantern_reactions WHERE item_type = ? AND item_id = ? GROUP BY reaction_type'
    ).bind(itemType, itemId).all();
    const total = (rows.results || []).reduce((sum, r) => sum + (r.c || 0), 0);
    if (total < 5) return jsonResponse({ ok: false, error: 'Minimum 5 reactions required' }, 400, cors);
    let allowed = false;
    if (itemType === 'news') {
      const newsRow = await db.prepare('SELECT author_name FROM lantern_news_submissions WHERE id = ?').bind(itemId).first();
      const authorName = (newsRow && newsRow.author_name || '').trim();
      allowed = viewerIsTeacher || (viewerCharacterName && authorName && viewerCharacterName === authorName);
    } else if (itemType === 'recognition') {
      const recRow = await db.prepare('SELECT character_name FROM lantern_teacher_recognition WHERE id = ?').bind(itemId).first();
      const recCharacterName = (recRow && recRow.character_name || '').trim();
      allowed = viewerIsTeacher || (viewerCharacterName && recCharacterName && viewerCharacterName === recCharacterName);
    }
    if (!allowed) return jsonResponse({ ok: false, error: 'Not authorized' }, 403, cors);
    const breakdown = (rows.results || []).map(r => ({
      reaction_type: r.reaction_type,
      count: r.c,
      percentage: total > 0 ? Math.round((r.c / total) * 100) : 0,
    })).sort((a, b) => (b.count || 0) - (a.count || 0));
    return jsonResponse({ ok: true, total, breakdown }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/reactions/need-encouragement') {
    if (!isInclusionBoostEnabled(env)) return jsonResponse({ ok: false, error: 'Not enabled' }, 404, cors);
    const itemType = (url.searchParams.get('item_type') || 'news').trim().toLowerCase();
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)));
    const excludeParam = (url.searchParams.get('exclude_item_ids') || '').trim();
    const excludeIds = excludeParam ? excludeParam.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (itemType !== 'news') return jsonResponse({ ok: true, items: [] }, 200, cors);
    const approved = await db.prepare(
      'SELECT id, title, author_name FROM lantern_news_submissions WHERE status = ? ORDER BY reviewed_at DESC, created_at DESC LIMIT ?'
    ).bind('approved', 100).all();
    const approvedById = {};
    (approved.results || []).forEach(r => { approvedById[r.id] = r; });
    const approvedIds = Object.keys(approvedById);
    const placeholders = approvedIds.length ? approvedIds.map(() => '?').join(',') : '';
    const countRows = placeholders
      ? await db.prepare(
          `SELECT item_id, COUNT(*) AS c FROM lantern_reactions WHERE item_type = ? AND item_id IN (${placeholders}) GROUP BY item_id`
        ).bind('news', ...approvedIds).all()
      : { results: [] };
    const countByItem = {};
    (countRows.results || []).forEach(r => { countByItem[r.item_id] = r.c || 0; });
    const needEncouragementIds = approvedIds
      .filter(id => !excludeIds.includes(id) && (countByItem[id] || 0) <= 1)
      .sort((a, b) => (countByItem[a] || 0) - (countByItem[b] || 0))
      .slice(0, limit);
    const items = needEncouragementIds.map(id => {
      const r = approvedById[id];
      return r ? { id: r.id, title: r.title || '', author_name: r.author_name || '' } : null;
    }).filter(Boolean);
    return jsonResponse({ ok: true, items }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/reactions/praise-preferences') {
    const characterName = (url.searchParams.get('character_name') || '').trim();
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    const row = await db.prepare('SELECT reaction_types FROM lantern_praise_preferences WHERE character_name = ?').bind(characterName).first();
    let reactionTypes = [];
    if (row && row.reaction_types) {
      try { reactionTypes = JSON.parse(row.reaction_types); } catch (_) { reactionTypes = []; }
    }
    if (!Array.isArray(reactionTypes)) reactionTypes = [];
    reactionTypes = reactionTypes.filter(t => REACTION_TYPES.includes(t));
    return jsonResponse({ ok: true, reaction_types: reactionTypes }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/reactions/praise-preferences') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const characterName = (body.character_name || '').trim();
    let reactionTypes = body.reaction_types;
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    if (!Array.isArray(reactionTypes)) reactionTypes = [];
    reactionTypes = reactionTypes.filter(t => REACTION_TYPES.includes(String(t).trim().toLowerCase())).slice(0, 7);
    const now = new Date().toISOString();
    const json = JSON.stringify(reactionTypes);
    await db.prepare(
      'INSERT INTO lantern_praise_preferences (character_name, reaction_types, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET reaction_types = ?, updated_at = ?'
    ).bind(characterName, json, now, json, now).run();
    return jsonResponse({ ok: true, reaction_types: reactionTypes }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/reactions/summary') {
    const itemType = (url.searchParams.get('item_type') || '').trim().toLowerCase();
    const itemId = (url.searchParams.get('item_id') || '').trim();
    if (!REACTION_ITEM_TYPES.includes(itemType) || !itemId) return jsonResponse({ ok: false, error: 'Missing item_type or item_id' }, 400, cors);
    const rows = await db.prepare(
      'SELECT reaction_type, COUNT(*) AS c FROM lantern_reactions WHERE item_type = ? AND item_id = ? GROUP BY reaction_type ORDER BY c DESC'
    ).bind(itemType, itemId).all();
    const top = (rows.results || []).slice(0, 5).map(r => ({ type: r.reaction_type, count: r.c }));
    return jsonResponse({ ok: true, top }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/reactions/feature-flags') {
    return jsonResponse({
      ok: true,
      ENABLE_EARLY_ENCOURAGER_REWARD: isEarlyEncouragerEnabled(env),
      ENABLE_REACTION_BREAKDOWN: isReactionBreakdownEnabled(env),
      ENABLE_INCLUSION_BOOST: isInclusionBoostEnabled(env),
    }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}
