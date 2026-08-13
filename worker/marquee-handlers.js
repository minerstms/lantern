/**
 * Prompt #137 — public marquee events + SYSTEM_ADMIN inspector.
 * Inspector gate uses existing TMS SYSTEM_ADMIN via lantern-bridge staff/capabilities.
 */
import {
  collectMarqueeEvents,
  eventsToTickerSlides,
  filterMarqueeEvents,
  MARQUEE_PUBLIC_LIMIT,
  MARQUEE_INSPECTOR_LIMIT,
} from './marquee-events.js';
import { isTeacherLike } from './missions-auth.js';

function jsonResponse(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

export async function resolveSystemAdminAccess(request, env, deps) {
  const account = await deps.getPilotAccountFromRequest(request, env);
  if (!account) return { ok: false, authenticated: false, inspector: false, status: 401 };
  if (deps.pilotAccountRequiresChangePassword && deps.pilotAccountRequiresChangePassword(account)) {
    return { ok: false, authenticated: true, inspector: false, status: 403, error: 'must_change_password' };
  }
  if (!isTeacherLike(account.role)) {
    return { ok: true, authenticated: true, inspector: false, status: 200 };
  }
  const tmsStaffId = await deps.resolveTmsStaffIdForLanternAccount(env.DB, account.username);
  if (!tmsStaffId) {
    return { ok: true, authenticated: true, inspector: false, status: 200 };
  }
  const bridge = await deps.callTmsNuggetsBridge(env, 'staff/capabilities', tmsStaffId, {});
  const inspector = !!(bridge && bridge.ok && bridge.capabilities && bridge.capabilities.system_admin === true);
  return { ok: true, authenticated: true, inspector, status: 200, account };
}

export async function handleMarqueeRoutes(request, url, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  const hallway =
    url.searchParams.get('for_display') === '1' ||
    url.searchParams.get('for_display') === 'true' ||
    url.searchParams.get('surface') === 'hallway';

  async function buildEvents(limit, inspector) {
    return collectMarqueeEvents(db, {
      limit,
      inspector: !!inspector,
      forDisplay: hallway,
      hallwayNewsFilter: deps.filterNewsRowsForHallwayTv,
      hallwayRecognitionFilter: deps.filterRecognitionRowsForHallwayTv,
    });
  }

  if (request.method === 'GET' && path === '/api/marquee/access') {
    const access = await resolveSystemAdminAccess(request, env, deps);
    if (access.status === 401) {
      return jsonResponse({ ok: false, authenticated: false, inspector: false, error: 'not_authenticated' }, 401, cors);
    }
    if (access.error === 'must_change_password') {
      return jsonResponse({ ok: false, error: 'must_change_password', inspector: false }, 403, cors);
    }
    return jsonResponse({ ok: true, inspector: !!access.inspector }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/marquee/events') {
    const limit = Math.min(MARQUEE_PUBLIC_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || String(MARQUEE_PUBLIC_LIMIT), 10) || MARQUEE_PUBLIC_LIMIT));
    const events = await buildEvents(limit, false);
    const slides = eventsToTickerSlides(events);
    return jsonResponse({ ok: true, events, slides, count: events.length }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/marquee/inspector') {
    const access = await resolveSystemAdminAccess(request, env, deps);
    if (access.status === 401) {
      return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
    }
    if (access.error === 'must_change_password') {
      return jsonResponse({ ok: false, error: 'must_change_password' }, 403, cors);
    }
    if (!access.inspector) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    const limit = Math.min(
      MARQUEE_INSPECTOR_LIMIT,
      Math.max(1, parseInt(url.searchParams.get('limit') || String(MARQUEE_INSPECTOR_LIMIT), 10) || MARQUEE_INSPECTOR_LIMIT)
    );
    const raw = await buildEvents(limit, true);
    const events = filterMarqueeEvents(raw, {
      type: url.searchParams.get('type') || 'all',
      q: url.searchParams.get('q') || '',
      sort: url.searchParams.get('sort') || 'newest',
    });
    return jsonResponse(
      {
        ok: true,
        events,
        count: events.length,
        sort: url.searchParams.get('sort') || 'newest',
        readonly: true,
      },
      200,
      cors
    );
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}
