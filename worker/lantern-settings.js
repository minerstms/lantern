/**
 * Lantern Settings — Prompt #110.
 *
 * ONE canonical settings store (`lantern_settings`, additive migration 055). No generic
 * settings/config table existed before this (lantern_setup_state is a narrow one-time-setup
 * flag, not general config) — this is now THE settings architecture; do not create a second one.
 *
 * First setting: marquee/ticker canonical scroll speed, in pixels per second. Every page that
 * renders #lanternTicker (Explore, Missions, Games, Locker, Contribute, Teacher, Staff, Display)
 * must resolve this ONE value — see app/js/lantern-ticker.js, which turns it into a per-page
 * animation-duration using that page's own measured ticker content width (distance / speed =
 * duration), so the configured PHYSICAL speed — not the animation duration string — is what
 * stays constant across pages/viewports/content lengths.
 */

export const MARQUEE_SPEED_SETTING_KEY = 'marquee_speed_px_per_second';

/**
 * Default chosen from a live-content measurement (Prompt #110 audit), not picked arbitrarily:
 * the existing fixed-360s-duration ticker, rendered with a realistic production news volume
 * (14 approved items, 0 recognition, at 1440px viewport), scrolled at an implied ~13 px/sec —
 * consistent with the prior code comment "Higher [duration] = calmer/readable". 15 px/sec is the
 * closest clean value to that measured current appearance, rather than the prompt's example 60
 * px/sec (which would be ~4-6x faster than what the team has actually been running).
 */
export const MARQUEE_SPEED_DEFAULT_PX_PER_SEC = 15;

/** Bounded range enforced both client-side (slider) and server-side (authoritative). */
export const MARQUEE_SPEED_MIN_PX_PER_SEC = 10;
export const MARQUEE_SPEED_MAX_PX_PER_SEC = 120;
export const MARQUEE_SPEED_STEP_PX_PER_SEC = 5;

/**
 * Pure validator — no DB/network. Rejects 0, negative, NaN, non-finite, absurdly high, and
 * arbitrary strings that don't parse cleanly to a number. Returns { ok, value } or { ok, error }.
 */
export function validateMarqueeSpeedPxPerSecond(raw) {
  if (raw == null || raw === '') {
    return { ok: false, error: 'missing_value' };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, error: 'not_a_number' };
  }
  if (n < MARQUEE_SPEED_MIN_PX_PER_SEC || n > MARQUEE_SPEED_MAX_PX_PER_SEC) {
    return { ok: false, error: 'out_of_range' };
  }
  // Round to the nearest whole px/sec — the setting is conceptually a slider/int value, never
  // a fractional pixel rate.
  return { ok: true, value: Math.round(n) };
}

/**
 * Reads the canonical marquee speed from D1. Any failure (missing row, missing table before
 * migration runs, DB error) falls back to the ONE shared default constant above — every page
 * uses this same function, so there is exactly one fallback, never a per-page choice.
 */
export async function getMarqueeSpeedPxPerSecond(db) {
  try {
    const row = await db
      .prepare('SELECT value FROM lantern_settings WHERE key = ?')
      .bind(MARQUEE_SPEED_SETTING_KEY)
      .first();
    if (!row || row.value == null) return MARQUEE_SPEED_DEFAULT_PX_PER_SEC;
    const parsed = validateMarqueeSpeedPxPerSecond(row.value);
    return parsed.ok ? parsed.value : MARQUEE_SPEED_DEFAULT_PX_PER_SEC;
  } catch (_err) {
    return MARQUEE_SPEED_DEFAULT_PX_PER_SEC;
  }
}

export async function setMarqueeSpeedPxPerSecond(db, pxPerSecond, updatedBy) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(MARQUEE_SPEED_SETTING_KEY, String(pxPerSecond), now, updatedBy || null)
    .run();
  return now;
}

/**
 * GET /api/settings/marquee-speed — public read (any signed-in Lantern surface needs this to
 * render the ticker at the canonical speed; no admin gate on read).
 * PATCH /api/settings/marquee-speed — admin-only write, via the shared requireAdminPilotSession
 * gate (same authorization already used by Feed visibility / other admin.html tools).
 */
export async function handleSettingsRoutes(request, url, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return deps.jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/settings/marquee-speed') {
    const pxPerSecond = await getMarqueeSpeedPxPerSecond(db);
    return deps.jsonResponse(
      {
        ok: true,
        px_per_second: pxPerSecond,
        min: MARQUEE_SPEED_MIN_PX_PER_SEC,
        max: MARQUEE_SPEED_MAX_PX_PER_SEC,
        step: MARQUEE_SPEED_STEP_PX_PER_SEC,
        default: MARQUEE_SPEED_DEFAULT_PX_PER_SEC,
      },
      200,
      cors
    );
  }

  if (request.method === 'PATCH' && path === '/api/settings/marquee-speed') {
    const gate = await deps.requireAdminPilotSession(request, env, cors);
    if (gate.response) return gate.response;
    let body;
    try {
      body = JSON.parse((await request.text()) || '{}');
    } catch (_err) {
      return deps.jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const validated = validateMarqueeSpeedPxPerSecond(body && body.px_per_second);
    if (!validated.ok) {
      return deps.jsonResponse(
        {
          ok: false,
          error: validated.error,
          min: MARQUEE_SPEED_MIN_PX_PER_SEC,
          max: MARQUEE_SPEED_MAX_PX_PER_SEC,
        },
        400,
        cors
      );
    }
    const updatedBy = deps.adminAuditLabel ? deps.adminAuditLabel(gate.account) : '';
    const updatedAt = await setMarqueeSpeedPxPerSecond(db, validated.value, updatedBy);
    return deps.jsonResponse(
      { ok: true, px_per_second: validated.value, updated_at: updatedAt },
      200,
      cors
    );
  }

  return deps.jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}
