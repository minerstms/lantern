/**
 * Prompt #228 — Lantern Protected Content & Traceability Layer.
 *
 * Extends existing Worker media gateways (r2-key-guards, avatar-media-gate) with:
 *   - opaque TMS trace codes (no viewer/student PII in the visible mark)
 *   - additive protected-view / delivery receipts
 *   - auth-gated student-media delivery
 *
 * This is deterrence + access restriction + audit mapping.
 * It does not disable OS screenshots, phone capture, or external photographs.
 */

import { isSafeObjectKey } from './r2-key-guards.js';

export const PROTECTION_TIER = Object.freeze({
  GENERAL: 0,
  COMMUNITY: 1,
  SENSITIVE: 2,
});

export const PROTECTED_ACTIONS = Object.freeze({
  VIEW: 'view',
  DOWNLOAD: 'download',
  PRINT: 'print',
  EXPORT: 'export',
});

/** Ambiguous 0/O/1/I omitted. */
export const TRACE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TRACE_CODE_LEN = 6;
export const TRACE_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export const SCHOOL_USE_NOTICE =
  'TMS School-Use System. Content in Lantern may include student information intended only for authorized school-community use. Do not copy, screenshot, download, print, or redistribute student information except for an authorized educational purpose.';

export function generateTraceCode() {
  const bytes = new Uint8Array(TRACE_CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < TRACE_CODE_LEN; i++) {
    out += TRACE_ALPHABET[bytes[i] % TRACE_ALPHABET.length];
  }
  return out;
}

export function normalizeTraceCode(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return TRACE_CODE_RE.test(s) ? s : '';
}

export function watermarkLabel(tier, code) {
  const prefix = Number(tier) >= PROTECTION_TIER.SENSITIVE ? 'TMS CONFIDENTIAL' : 'TMS INTERNAL';
  return prefix + ' • ' + String(code || '').trim();
}

export function visibleTraceContainsPii(label, extras) {
  const hay = String(label || '').toLowerCase();
  const list = Array.isArray(extras) ? extras : [];
  for (let i = 0; i < list.length; i++) {
    const piece = String(list[i] || '').trim().toLowerCase();
    if (piece && piece.length >= 3 && hay.includes(piece)) return true;
  }
  if (/@/.test(hay)) return true;
  if (/\b\d{5,}\b/.test(hay)) return true;
  return false;
}

export function sessionRefFromJwtPayload(payload) {
  if (!payload || payload.sub == null) return null;
  const sub = String(payload.sub).trim().toLowerCase();
  if (!sub) return null;
  const iat = payload.iat != null ? String(payload.iat) : '0';
  return 'pilot:' + sub + ':' + iat;
}

export function classifyMediaKey(raw) {
  const key = raw == null ? '' : String(raw).trim();
  if (!key || !isSafeObjectKey(key)) {
    return { protected: true, kind: 'invalid', tier: PROTECTION_TIER.COMMUNITY };
  }
  if ((key.startsWith('library/') && key !== 'library/') || (key.startsWith('default/') && key !== 'default/')) {
    return { protected: false, kind: 'school_library', tier: PROTECTION_TIER.GENERAL };
  }
  if (key.startsWith('missions/card/') && key !== 'missions/card/') {
    return { protected: false, kind: 'mission_card', tier: PROTECTION_TIER.GENERAL };
  }
  if (key.startsWith('avatars/') && key !== 'avatars/') {
    return { protected: true, kind: 'avatar', tier: PROTECTION_TIER.COMMUNITY };
  }
  if (key.startsWith('news/') && key !== 'news/') {
    return { protected: true, kind: 'news_media', tier: PROTECTION_TIER.COMMUNITY };
  }
  if (key.startsWith('missions/') && key !== 'missions/') {
    return { protected: true, kind: 'mission_media', tier: PROTECTION_TIER.COMMUNITY };
  }
  if (key.startsWith('recognition/') && key !== 'recognition/') {
    return { protected: true, kind: 'recognition_media', tier: PROTECTION_TIER.COMMUNITY };
  }
  return { protected: true, kind: 'unknown', tier: PROTECTION_TIER.COMMUNITY };
}

export function isNewsDeliveryObjectKey(raw) {
  const key = raw == null ? '' : String(raw).trim();
  if (!isSafeObjectKey(key)) return false;
  if (key.startsWith('news/video/')) return false;
  return (
    (key.startsWith('news/') && key !== 'news/') ||
    (key.startsWith('missions/') && key !== 'missions/') ||
    (key.startsWith('recognition/') && key !== 'recognition/')
  );
}

export function protectedDeliveryHeaders(contentType, extra) {
  return {
    'Content-Type': contentType || 'application/octet-stream',
    'Cache-Control': 'private, no-store',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'Content-Disposition': 'inline',
    ...(extra || {}),
  };
}

export function classifySurface(surfaceRaw) {
  const s = String(surfaceRaw || '')
    .trim()
    .toLowerCase()
    .replace(/\.html$/, '');
  const tier0 = {
    games: 1,
    play: 1,
    'school-survival': 1,
    school_survival: 1,
    'class-code': 1,
    login: 1,
    'change-password': 1,
    setup: 1,
    verify: 1,
    'fight-song': 1,
  };
  const tier2 = {
    admin: 1,
    teacher: 1,
    staff: 1,
    'feed-review': 1,
    'device-pairing': 1,
  };
  if (tier0[s]) return { surface: s, tier: PROTECTION_TIER.GENERAL };
  if (tier2[s]) return { surface: s, tier: PROTECTION_TIER.SENSITIVE };
  if (!s) return { surface: 'unknown', tier: PROTECTION_TIER.COMMUNITY };
  return { surface: s, tier: PROTECTION_TIER.COMMUNITY };
}

function clip(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max || 120);
}

/**
 * Persist a protected-access receipt. failClosed=true returns { ok:false } on insert error
 * and never invents an unmapped visible trace.
 */
export async function createProtectedAccessReceipt(db, params, opts) {
  const failClosed = !!(opts && opts.failClosed);
  if (!db) {
    return failClosed ? { ok: false, error: 'receipt_unavailable' } : { ok: false, error: 'db_unavailable' };
  }
  const action = clip(params && params.action, 32) || PROTECTED_ACTIONS.VIEW;
  const tier = Number(params && params.protectionTier);
  const protectionTier = tier === PROTECTION_TIER.SENSITIVE ? PROTECTION_TIER.SENSITIVE : PROTECTION_TIER.COMMUNITY;
  let traceCode = normalizeTraceCode(params && params.traceCode) || generateTraceCode();
  const id = 'pacr_' + crypto.randomUUID().replace(/-/g, '');
  const createdAt = (params && params.createdAt) || new Date().toISOString();
  const row = {
    id,
    trace_code: traceCode,
    viewer_username: clip(params && params.viewerUsername, 80),
    viewer_role: clip(params && params.viewerRole, 32),
    resource_type: clip(params && params.resourceType, 64),
    resource_id: clip(params && params.resourceId, 120),
    surface: clip(params && params.surface, 64),
    action,
    protection_tier: protectionTier,
    session_ref: clip(params && params.sessionRef, 160),
    authorized: params && params.authorized === 0 ? 0 : 1,
    created_at: createdAt,
  };
  try {
    await db
      .prepare(
        `INSERT INTO lantern_protected_access_receipts
          (id, trace_code, viewer_username, viewer_role, resource_type, resource_id, surface, action, protection_tier, session_ref, authorized, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        row.id,
        row.trace_code,
        row.viewer_username,
        row.viewer_role,
        row.resource_type,
        row.resource_id,
        row.surface,
        row.action,
        row.protection_tier,
        row.session_ref,
        row.authorized,
        row.created_at
      )
      .run();
    return { ok: true, receipt: row, watermark: watermarkLabel(row.protection_tier, row.trace_code) };
  } catch (err) {
    if (failClosed) return { ok: false, error: 'receipt_unavailable' };
    return { ok: false, error: 'receipt_write_failed' };
  }
}

export async function lookupProtectedAccessReceipt(db, rawCode) {
  const code = normalizeTraceCode(rawCode);
  if (!db || !code) return null;
  try {
    const row = await db
      .prepare(
        `SELECT id, trace_code, viewer_username, viewer_role, resource_type, resource_id, surface, action, protection_tier, session_ref, authorized, created_at
         FROM lantern_protected_access_receipts WHERE trace_code = ? LIMIT 1`
      )
      .bind(code)
      .first();
    return row || null;
  } catch (_) {
    return null;
  }
}

export async function handleProtectedContentRoutes(request, url, path, env, cors, deps) {
  const jsonResponse = deps.jsonResponse;
  const getPilotAccountFromRequest = deps.getPilotAccountFromRequest;
  const getPilotSessionRef = deps.getPilotSessionRef;
  const pilotAccountRequiresChangePassword = deps.pilotAccountRequiresChangePassword;

  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
  }
  if (path !== '/api/protected/view-session') {
    return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
  }

  const account = await getPilotAccountFromRequest(request, env);
  if (!account) {
    return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
  }

  let body = {};
  if (request.method === 'POST') {
    try {
      body = JSON.parse((await request.text()) || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
  }
  const surfaceRaw = (url.searchParams.get('surface') || body.surface || '').trim();
  const classified = classifySurface(surfaceRaw);
  if (classified.tier === PROTECTION_TIER.GENERAL) {
    return jsonResponse(
      {
        ok: true,
        protected: false,
        tier: PROTECTION_TIER.GENERAL,
        watermark: null,
        trace_code: null,
        notice: null,
      },
      200,
      cors
    );
  }

  const actionRaw = (url.searchParams.get('action') || body.action || PROTECTED_ACTIONS.VIEW).trim().toLowerCase();
  const action = PROTECTED_ACTIONS[actionRaw.toUpperCase()] || PROTECTED_ACTIONS.VIEW;
  const resourceType = (url.searchParams.get('resource_type') || body.resource_type || 'surface').trim();
  const resourceId = (url.searchParams.get('resource_id') || body.resource_id || classified.surface).trim();
  const sessionRef = await getPilotSessionRef(request, env);
  const failClosed = classified.tier === PROTECTION_TIER.SENSITIVE || action === PROTECTED_ACTIONS.DOWNLOAD;

  const created = await createProtectedAccessReceipt(
    env.DB,
    {
      viewerUsername: account.username,
      viewerRole: account.role,
      resourceType,
      resourceId,
      surface: classified.surface,
      action,
      protectionTier: classified.tier,
      sessionRef,
      authorized: 1,
    },
    { failClosed }
  );

  if (!created.ok) {
    return jsonResponse({ ok: false, error: created.error || 'receipt_unavailable', protected: true, tier: classified.tier }, failClosed ? 503 : 200, cors);
  }

  return jsonResponse(
    {
      ok: true,
      protected: true,
      tier: classified.tier,
      trace_code: created.receipt.trace_code,
      watermark: created.watermark,
      notice: SCHOOL_USE_NOTICE,
      action,
    },
    200,
    cors
  );
}

export async function handleAdminProtectedTraceLookup(request, url, env, cors, deps) {
  const jsonResponse = deps.jsonResponse;
  const code = url.searchParams.get('code') || url.searchParams.get('trace') || '';
  const row = await lookupProtectedAccessReceipt(env.DB, code);
  if (!row) {
    return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
  }
  return jsonResponse(
    {
      ok: true,
      receipt: {
        trace_code: row.trace_code,
        viewer_username: row.viewer_username,
        viewer_role: row.viewer_role,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        surface: row.surface,
        action: row.action,
        protection_tier: row.protection_tier,
        session_ref: row.session_ref,
        authorized: row.authorized,
        created_at: row.created_at,
      },
    },
    200,
    cors
  );
}
