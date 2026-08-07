/**
 * Immutable finalized Lantern feed reactions — authoritative storage separate from lantern_reactions.
 */
import { isApprovedFeedItem } from './feed-handlers.js';

export const FINAL_REACTION_TYPES = ['heart', 'star', 'lightbulb', 'teamwork', 'fire'];

export function finalReactionPercents(rows) {
  const counts = {};
  FINAL_REACTION_TYPES.forEach((t) => { counts[t] = 0; });
  let total = 0;
  (rows || []).forEach((r) => {
    const t = String(r.reaction_type || '').trim().toLowerCase();
    if (FINAL_REACTION_TYPES.includes(t)) {
      counts[t] = (counts[t] || 0) + 1;
      total += 1;
    }
  });
  const results = FINAL_REACTION_TYPES.map((t) => ({
    reaction_type: t,
    percentage: total > 0 ? Math.round((counts[t] / total) * 100) : 0,
  }));
  return { total_responses: total, results };
}

export async function fetchFinalizedRow(db, itemType, itemId, reactorUsername) {
  return db.prepare(
    'SELECT id, reaction_type, finalized_at FROM lantern_final_reaction_responses WHERE item_type = ? AND item_id = ? AND lower(trim(reactor_username)) = lower(trim(?))'
  ).bind(itemType, itemId, reactorUsername).first();
}

export async function fetchAggregateRows(db, itemType, itemId) {
  const rows = await db.prepare(
    'SELECT reaction_type FROM lantern_final_reaction_responses WHERE item_type = ? AND item_id = ?'
  ).bind(itemType, itemId).all();
  return rows.results || [];
}

export async function handleFinalReactionRoutes(request, url, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return deps.jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  const getPilotAccountFromRequest = deps.getPilotAccountFromRequest;
  const pilotEconomyCharacterName = deps.pilotEconomyCharacterName;
  const pilotAccountRequiresChangePassword = deps.pilotAccountRequiresChangePassword;
  const jsonResponse = deps.jsonResponse;

  async function requireAuthedAccount() {
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) {
      return { error: jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors) };
    }
    if (pilotAccountRequiresChangePassword(account)) {
      return {
        error: jsonResponse(
          { ok: false, error: 'must_change_password', redirect: '/change-password.html' },
          403,
          cors
        ),
      };
    }
    return { account };
  }

  if (request.method === 'GET' && path === '/api/reactions/finalized-status') {
    const itemType = (url.searchParams.get('item_type') || '').trim().toLowerCase();
    const itemId = (url.searchParams.get('item_id') || '').trim();
    if (itemType !== 'feed' || !itemId) {
      return jsonResponse({ ok: false, error: 'Invalid item_type or item_id' }, 400, cors);
    }
    const auth = await requireAuthedAccount();
    if (auth.error) return auth.error;
    const username = String(auth.account.username || '').trim();
    if (!username) return jsonResponse({ ok: false, error: 'no_username' }, 403, cors);

    const row = await fetchFinalizedRow(db, itemType, itemId, username);
    if (!row) {
      return jsonResponse({ ok: true, finalized: false, reaction_type: null }, 200, cors);
    }
    const agg = finalReactionPercents(await fetchAggregateRows(db, itemType, itemId));
    return jsonResponse({
      ok: true,
      finalized: true,
      reaction_type: row.reaction_type,
      finalized_at: row.finalized_at,
      results: agg.results,
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/reactions/finalize') {
    const auth = await requireAuthedAccount();
    if (auth.error) return auth.error;
    const account = auth.account;
    const username = String(account.username || '').trim();
    if (!username) return jsonResponse({ ok: false, error: 'no_username' }, 403, cors);

    let body;
    try {
      body = JSON.parse(await request.text() || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }

    const itemType = (body.item_type || '').trim().toLowerCase();
    const itemId = (body.item_id || '').trim();
    const reactionType = (body.reaction_type || '').trim().toLowerCase();

    if (itemType !== 'feed' || !itemId) {
      return jsonResponse({ ok: false, error: 'Invalid item_type or item_id' }, 400, cors);
    }
    if (!FINAL_REACTION_TYPES.includes(reactionType)) {
      return jsonResponse({ ok: false, error: 'Invalid reaction_type' }, 400, cors);
    }

    const approved = await isApprovedFeedItem(db, itemId);
    if (!approved) {
      return jsonResponse({ ok: false, error: 'Item not approved or not found' }, 400, cors);
    }

    const existing = await fetchFinalizedRow(db, itemType, itemId, username);
    if (existing) {
      return jsonResponse({
        ok: false,
        error: 'reaction_already_finalized',
        finalized: true,
        reaction_type: existing.reaction_type,
      }, 409, cors);
    }

    const id = 'lfr-' + crypto.randomUUID();
    const now = new Date().toISOString();
    const charSnap = pilotEconomyCharacterName(account) || String(account.student_character_name || '').trim() || null;

    try {
      await db.prepare(
        'INSERT INTO lantern_final_reaction_responses (id, item_type, item_id, reaction_type, reactor_username, reactor_character_name, finalized_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, itemType, itemId, reactionType, username, charSnap, now).run();
    } catch (e) {
      if (e && (e.message || '').includes('UNIQUE')) {
        const again = await fetchFinalizedRow(db, itemType, itemId, username);
        return jsonResponse({
          ok: false,
          error: 'reaction_already_finalized',
          finalized: true,
          reaction_type: again ? again.reaction_type : reactionType,
        }, 409, cors);
      }
      throw e;
    }

    const agg = finalReactionPercents(await fetchAggregateRows(db, itemType, itemId));
    return jsonResponse({
      ok: true,
      finalized: true,
      reaction_type: reactionType,
      finalized_at: now,
      results: agg.results,
    }, 200, cors);
  }

  return null;
}
