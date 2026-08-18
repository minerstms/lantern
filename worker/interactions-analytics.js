/**
 * Prompt #225 — Web Admin Interactions Analytics (read-only aggregates).
 * Uses existing D1 tables. No new indexes or migrations.
 */

function rangeCutoff(range) {
  const r = String(range || '7d').trim().toLowerCase();
  const now = Date.now();
  if (r === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { key: 'today', since: d.toISOString(), label: 'Today' };
  }
  if (r === '30d' || r === '30') {
    return { key: '30d', since: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), label: '30 Days' };
  }
  if (r === 'all' || r === 'all_time') {
    return { key: 'all', since: null, label: 'All Time' };
  }
  return { key: '7d', since: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), label: '7 Days' };
}

function dateClause(column, since) {
  if (!since) return { sql: '', binds: [] };
  return { sql: ` AND ${column} >= ?`, binds: [since] };
}

export function classifyEarnKind(kind, source, note) {
  const hay = [kind, source, note].map((v) => String(v || '').toLowerCase()).join(' ');
  if (/fight.?song|stand.?up.?and.?cheer/.test(hay)) return 'Fight Song';
  if (/\bsrp\b|standard response/.test(hay)) return 'SRP';
  if (/handbook/.test(hay)) return 'Handbook';
  if (/seven.?habits|7.?habits/.test(hay)) return '7 Habits';
  if (/local.?history|trinidad/.test(hay)) return 'Local History';
  if (/mission|lantern_mission_reward|approval/.test(hay)) return 'Missions';
  if (/daily_checkin|daily check/.test(hay)) return 'Daily Check-In';
  if (/hidden_nugget|hidden nugget/.test(hay)) return 'Hidden Nugget';
  if (/game_win|first_game/.test(hay)) return 'Games';
  if (/content_creation|poll/.test(hay)) return 'Content / Polls';
  if (/staff_starter|testing|seed|manual|admin/.test(hay)) return 'Other / Unclassified';
  return 'Other / Unclassified';
}

export function classifySpendKind(kind, source, note) {
  const hay = [kind, source, note].map((v) => String(v || '').toLowerCase()).join(' ');
  if (/game_play|game play/.test(hay) || kind === 'game_play') return 'Games';
  if (/cosmetic|store/.test(hay)) return 'Store / Cosmetics';
  if (/avatar/.test(hay)) return 'Avatar';
  return 'Other / Unclassified';
}

async function safeAll(db, sql, binds) {
  try {
    const res = await db.prepare(sql).bind(...binds).all();
    return res.results || [];
  } catch (_) {
    return [];
  }
}

export async function buildInteractionsAnalytics(db, rangeKey) {
  const period = rangeCutoff(rangeKey);
  const txSince = dateClause('created_at', period.since);
  const pollSince = dateClause('created_at', period.since);
  const rxSince = dateClause('created_at', period.since);
  const missSince = dateClause('created_at', period.since);

  const txRows = await safeAll(
    db,
    `SELECT character_name, delta, kind, source, note, created_at
     FROM lantern_transactions
     WHERE 1=1${txSince.sql}`,
    txSince.binds
  );

  let earned = 0;
  let spent = 0;
  const earnBuckets = {};
  const spendBuckets = {};
  const gameSpend = {};
  txRows.forEach((row) => {
    const delta = Number(row.delta) || 0;
    if (delta > 0) {
      earned += delta;
      const cat = classifyEarnKind(row.kind, row.source, row.note);
      earnBuckets[cat] = (earnBuckets[cat] || 0) + delta;
    } else if (delta < 0) {
      const amt = -delta;
      spent += amt;
      const cat = classifySpendKind(row.kind, row.source, row.note);
      spendBuckets[cat] = (spendBuckets[cat] || 0) + amt;
      if (String(row.kind || '') === 'game_play') {
        const name = String(row.note || row.source || 'Game').trim() || 'Game';
        if (!gameSpend[name]) gameSpend[name] = { game: name, nuggets_spent: 0, plays: 0 };
        gameSpend[name].nuggets_spent += amt;
        gameSpend[name].plays += 1;
      }
    }
  });

  const pollVotes = await safeAll(
    db,
    `SELECT COUNT(*) AS c, COUNT(DISTINCT character_name) AS u FROM lantern_poll_votes WHERE 1=1${pollSince.sql}`,
    pollSince.binds
  );
  const reactions = await safeAll(
    db,
    `SELECT COUNT(*) AS c, COUNT(DISTINCT character_name) AS u FROM lantern_reactions WHERE 1=1${rxSince.sql}`,
    rxSince.binds
  );
  const missions = await safeAll(
    db,
    `SELECT status, COUNT(*) AS c, COUNT(DISTINCT character_name) AS u
     FROM lantern_mission_submissions WHERE 1=1${missSince.sql}
     GROUP BY status`,
    missSince.binds
  );
  const missionById = await safeAll(
    db,
    `SELECT mission_id, status, COUNT(*) AS c, COUNT(DISTINCT character_name) AS u
     FROM lantern_mission_submissions WHERE 1=1${missSince.sql}
     GROUP BY mission_id, status`,
    missSince.binds
  );
  const gamePlays = await safeAll(
    db,
    `SELECT COUNT(*) AS c, COUNT(DISTINCT character_name) AS u
     FROM lantern_transactions WHERE kind = 'game_play'${txSince.sql}`,
    txSince.binds
  );

  const pollCount = Number((pollVotes[0] && pollVotes[0].c) || 0);
  const pollUsers = Number((pollVotes[0] && pollVotes[0].u) || 0);
  const rxCount = Number((reactions[0] && reactions[0].c) || 0);
  const rxUsers = Number((reactions[0] && reactions[0].u) || 0);
  const playCount = Number((gamePlays[0] && gamePlays[0].c) || 0);
  const playUsers = Number((gamePlays[0] && gamePlays[0].u) || 0);

  let missionSubmitted = 0;
  let missionAccepted = 0;
  let missionParticipants = 0;
  const missionStatus = {};
  missions.forEach((row) => {
    const st = String(row.status || 'unknown');
    const c = Number(row.c) || 0;
    const u = Number(row.u) || 0;
    missionStatus[st] = { events: c, unique_participants: u };
    missionSubmitted += c;
    if (st === 'accepted' || st === 'approved' || st === 'completed') missionAccepted += c;
    missionParticipants += u;
  });

  const uniqueKeys = new Set();
  txRows.forEach((r) => {
    if (r.character_name) uniqueKeys.add(String(r.character_name));
  });
  const pollNames = await safeAll(
    db,
    `SELECT DISTINCT character_name FROM lantern_poll_votes WHERE character_name IS NOT NULL AND TRIM(character_name) != ''${pollSince.sql}`,
    pollSince.binds
  );
  const rxNames = await safeAll(
    db,
    `SELECT DISTINCT character_name FROM lantern_reactions WHERE character_name IS NOT NULL AND TRIM(character_name) != ''${rxSince.sql}`,
    rxSince.binds
  );
  const missNames = await safeAll(
    db,
    `SELECT DISTINCT character_name FROM lantern_mission_submissions WHERE character_name IS NOT NULL AND TRIM(character_name) != ''${missSince.sql}`,
    missSince.binds
  );
  const interactionKeys = new Set();
  [pollNames, rxNames, missNames].forEach((rows) => {
    rows.forEach((r) => {
      if (r.character_name) interactionKeys.add(String(r.character_name));
    });
  });
  txRows.forEach((r) => {
    if (String(r.kind || '') === 'game_play' && r.character_name) interactionKeys.add(String(r.character_name));
  });
  const uniqueStudentLike = [...interactionKeys].filter((k) => !/^staff:/i.test(k)).length;
  const missionUnique = missNames.length;

  const learningHints = [];
  missionById.forEach((row) => {
    const id = String(row.mission_id || '');
    const st = String(row.status || '');
    if (!(st === 'accepted' || st === 'approved' || st === 'completed')) return;
    let label = id;
    if (/handbook/i.test(id)) label = 'Handbook';
    else if (/srp/i.test(id)) label = 'SRP';
    else if (/fight|cheer/i.test(id)) label = 'Fight Song';
    else if (/seven_habits|seven-habits/i.test(id)) label = '7 Habits';
    else if (/local_history|local-history/i.test(id)) label = 'Local History';
    else if (/perm_/.test(id)) label = id.replace(/^perm_/, '').replace(/_/g, ' ');
    learningHints.push({
      key: id,
      label,
      completions: Number(row.c) || 0,
      unique_participants: Number(row.u) || 0,
    });
  });

  const interaction =
    pollCount + rxCount + playCount + missionSubmitted;

  return {
    ok: true,
    period: period,
    interaction_definition:
      'One persisted student action: a poll vote, a reaction, a game_play transaction, or a mission submission created in the selected period. Client rerenders are not counted.',
    summary: {
      total_interactions: interaction,
      unique_participants: interactionKeys.size,
      unique_student_like_participants: uniqueStudentLike,
      unique_transaction_participants: uniqueKeys.size,
      unique_mission_participants: missionUnique,
      nuggets_earned: earned,
      nuggets_spent: spent,
      nuggets_net: earned - spent,
      poll_votes: pollCount,
      poll_unique_participants: pollUsers,
      reactions: rxCount,
      reaction_unique_participants: rxUsers,
      game_plays: playCount,
      game_play_unique_participants: playUsers,
      mission_submissions: missionSubmitted,
      mission_completions: missionAccepted,
    },
    earnings: Object.keys(earnBuckets)
      .sort()
      .map((k) => ({ category: k, nuggets: earnBuckets[k] })),
    spending: Object.keys(spendBuckets)
      .sort()
      .map((k) => ({ category: k, nuggets: spendBuckets[k] })),
    game_spending: Object.keys(gameSpend)
      .map((k) => gameSpend[k])
      .sort((a, b) => b.nuggets_spent - a.nuggets_spent),
    mission_status: missionStatus,
    learning: learningHints.sort((a, b) => b.completions - a.completions).slice(0, 40),
    limitations: [
      'Nugget totals come from lantern_transactions (Lantern mirror of TMS-applied events). TMS is the spendable authority; this dashboard does not query TMS directly.',
      'Earn/spend categories use kind, source, and note. Incomplete historical metadata is grouped as Other / Unclassified.',
      'Unique participants are distinct character_name / economy keys, not a guaranteed student-id census.',
    ],
  };
}

export function handleInteractionsAnalytics(url, db, cors, jsonResponse) {
  const range = url.searchParams.get('range') || '7d';
  return buildInteractionsAnalytics(db, range).then((payload) => jsonResponse(payload, 200, cors));
}
