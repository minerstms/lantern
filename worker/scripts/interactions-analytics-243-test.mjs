/**
 * Prompt #243 — Interactions Analytics Denver day, finalized reactions, collapsible admin.
 * Usage: node worker/scripts/interactions-analytics-243-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildInteractionsAnalytics,
  rangeCutoff,
  toSqlTimestamp,
} from '../interactions-analytics.js';
import { denverLocalDateYYYYMMDD } from '../school-schedule.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
}

function inRange(iso, since) {
  if (!since) return true;
  const norm = String(iso || '').replace('T', ' ').slice(0, 19);
  return norm >= since;
}

function makeDb(seed) {
  const polls = seed.polls || [];
  const reactions = seed.reactions || [];
  const missions = seed.missions || [];
  const txs = seed.txs || [];

  function all(sql, binds) {
    const s = String(sql);
    const since = binds[0] || null;
    if (s.includes('FROM lantern_transactions') && s.includes('character_name, delta')) {
      return { results: txs.filter((t) => inRange(t.created_at, since)) };
    }
    if (s.includes('FROM lantern_poll_votes') && s.includes('COUNT(*)')) {
      const rows = polls.filter((p) => inRange(p.created_at, since));
      return { results: [{ c: rows.length, u: new Set(rows.map((r) => r.character_name)).size }] };
    }
    if (s.includes('FROM lantern_final_reaction_responses') && s.includes('COUNT(*)')) {
      const rows = reactions.filter((r) => inRange(r.finalized_at, since));
      const keys = new Set(rows.map((r) => r.reactor_character_name || r.reactor_username));
      return { results: [{ c: rows.length, u: keys.size }] };
    }
    if (s.includes('FROM lantern_mission_submissions') && s.includes('GROUP BY status') && !s.includes('mission_id')) {
      const rows = missions.filter((m) => inRange(m.created_at, since));
      const by = {};
      rows.forEach((m) => {
        const st = m.status || 'unknown';
        if (!by[st]) by[st] = { status: st, c: 0, users: new Set() };
        by[st].c += 1;
        if (m.character_name) by[st].users.add(m.character_name);
      });
      return { results: Object.values(by).map((b) => ({ status: b.status, c: b.c, u: b.users.size })) };
    }
    if (s.includes('FROM lantern_mission_submissions') && s.includes('GROUP BY mission_id')) {
      return { results: [] };
    }
    if (s.includes("kind = 'game_play'") && s.includes('COUNT(*)')) {
      const rows = txs.filter((t) => t.kind === 'game_play' && inRange(t.created_at, since));
      return { results: [{ c: rows.length, u: new Set(rows.map((r) => r.character_name)).size }] };
    }
    if (s.includes('FROM lantern_poll_votes') && s.includes('DISTINCT character_name')) {
      return {
        results: [...new Set(polls.filter((p) => inRange(p.created_at, since)).map((p) => p.character_name))]
          .filter(Boolean)
          .map((character_name) => ({ character_name })),
      };
    }
    if (s.includes('FROM lantern_final_reaction_responses') && s.includes('DISTINCT')) {
      return {
        results: [
          ...new Set(
            reactions
              .filter((r) => inRange(r.finalized_at, since))
              .map((r) => r.reactor_character_name || r.reactor_username)
          ),
        ]
          .filter(Boolean)
          .map((character_name) => ({ character_name })),
      };
    }
    if (s.includes('FROM lantern_mission_submissions') && s.includes('DISTINCT character_name')) {
      return {
        results: [...new Set(missions.filter((m) => inRange(m.created_at, since)).map((m) => m.character_name))]
          .filter(Boolean)
          .map((character_name) => ({ character_name })),
      };
    }
    if (s.includes('FROM lantern_reactions')) {
      throw new Error('legacy lantern_reactions must not be queried');
    }
    return { results: [] };
  }

  return {
    prepare(sql) {
      const binds = [];
      return {
        bind(...args) {
          binds.push(...args);
          return this;
        },
        all: () => all(sql, binds),
        first: () => (all(sql, binds).results || [])[0] || null,
      };
    },
  };
}

const now = new Date('2026-08-20T03:28:00.000Z');
const today = rangeCutoff('today', now);
assert(denverLocalDateYYYYMMDD(now) === '2026-08-19', '7. fixture instant is still America/Denver Aug 19');
assert(today.since === '2026-08-19 06:00:00', '7. Today cutoff is Denver midnight as UTC', today.since);
assert(today.timezone === 'America/Denver' && today.local_date === '2026-08-19', '7. Today reports Denver timezone + local date');
assert(!toSqlTimestamp(now).includes('T'), 'cutoffs stay SQLite-format UTC');

const seven = rangeCutoff('7d', now);
const thirty = rangeCutoff('30d', now);
const all = rangeCutoff('all', now);
assert(seven.since === toSqlTimestamp(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)), '8. 7 Days is a rolling 7×24h window');
assert(thirty.since === toSqlTimestamp(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)), '8. 30 Days is a rolling 30×24h window');
assert(all.since == null && all.label === 'All Time', '8. All Time has no cutoff');

const db = makeDb({
  polls: [
    { character_name: '20889', created_at: '2026-08-19T14:00:00.000Z' },
    { character_name: '20889', created_at: '2026-08-19T15:00:00.000Z' },
    { character_name: '20901', created_at: '2026-08-19T05:59:59.000Z' },
  ],
  reactions: [
    { reactor_username: '20890', reactor_character_name: '20890', finalized_at: '2026-08-19T16:00:00.000Z' },
    { reactor_username: 'mr_radle', reactor_character_name: 'staff:mr_radle', finalized_at: '2026-08-19T17:00:00.000Z' },
  ],
  missions: [
    { character_name: '20891', status: 'submitted', created_at: '2026-08-19T18:00:00.000Z' },
  ],
  txs: [
    { character_name: '20889', delta: -1, kind: 'game_play', source: 'games', note: 'Avatar Match', created_at: '2026-08-19T19:00:00.000Z' },
    { character_name: '20889', delta: 1, kind: 'hidden_nugget', source: 'DISCOVERY', note: 'Hidden Nugget', created_at: '2026-08-19T19:05:00.000Z' },
    { character_name: '20891', delta: 3, kind: 'lantern_mission_reward', source: 'mission', note: 'accepted', created_at: '2026-08-19T19:10:00.000Z' },
    { character_name: '20889', delta: -2, kind: 'cosmetic', source: 'store', note: 'frame', created_at: '2026-08-19T20:00:00.000Z' },
    { character_name: '20899', delta: 1, kind: 'hidden_nugget', source: 'DISCOVERY', note: 'Reveal replay', created_at: '2026-08-19T21:00:00.000Z' },
  ],
});

const todayReport = await buildInteractionsAnalytics(db, 'today', now);
assert(todayReport.summary.poll_votes === 2, '1. poll votes in Denver Today contribute', todayReport.summary);
assert(todayReport.summary.reactions === 2, '2. finalized reactions contribute');
assert(todayReport.summary.game_plays === 1, '3. game plays contribute');
assert(todayReport.summary.mission_submissions === 1, '4. mission submissions contribute');
assert(todayReport.summary.total_interactions === 6, 'total = polls + reactions + plays + missions', todayReport.summary.total_interactions);
assert(
  todayReport.summary.unique_participants === 4,
  '5/6. unique users dedupe across types; staff and student keys both count',
  todayReport.summary.unique_participants
);
assert(todayReport.summary.poll_votes !== 3, '7. pre-Denver-midnight poll is excluded from Today');

const earnSum = (todayReport.earnings || []).reduce((n, r) => n + Number(r.nuggets || 0), 0);
const spendSum = (todayReport.spending || []).reduce((n, r) => n + Number(r.nuggets || 0), 0);
assert(earnSum === todayReport.summary.nuggets_earned && todayReport.summary.nuggets_earned === 5, '9. earnings breakdown equals headline', { earnSum, earned: todayReport.summary.nuggets_earned });
assert(spendSum === todayReport.summary.nuggets_spent && todayReport.summary.nuggets_spent === 3, '9b. spending breakdown equals headline', { spendSum, spent: todayReport.summary.nuggets_spent });

const beforeReveal = todayReport.summary.total_interactions;
const dbReveal = makeDb({
  polls: [{ character_name: '20889', created_at: '2026-08-19T14:00:00.000Z' }],
  reactions: [],
  missions: [],
  txs: [
    { character_name: '20889', delta: 1, kind: 'hidden_nugget', source: 'DISCOVERY', note: 'Hidden Nugget', created_at: '2026-08-19T19:05:00.000Z' },
  ],
});
const revealReport = await buildInteractionsAnalytics(dbReveal, 'today', now);
assert(
  revealReport.summary.total_interactions === 1 &&
    revealReport.summary.poll_votes === 1 &&
    revealReport.summary.reactions === 0 &&
    revealReport.summary.hidden_nuggets_found === 1,
  '10. Hidden Nugget Reveal/Replay ledger row is not an extra interaction',
  revealReport.summary
);
assert(beforeReveal === 6, '10b. mixed fixture total unchanged by reveal-shaped rows');

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
assert(
  /<details class="card teacherCollapsibleList" id="adminInteractionsAnalyticsCard">/.test(adminHtml) &&
    /teacherCollapsibleListHd/.test(adminHtml) &&
    /iaCollapsedSummary/.test(adminHtml),
  '11. System Admin analytics uses the standard collapsible'
);
assert(
  /id="iaEngageSection"/.test(adminHtml) &&
    /id="iaEconomySection"/.test(adminHtml) &&
    /id="iaDetailSection"/.test(adminHtml) &&
    /Engagement breakdown/.test(adminHtml) &&
    /Nugget economy/.test(adminHtml),
  '12. internal subsections exist and are nested details'
);
assert(
  /overflow-x:\s*auto/.test(adminHtml) &&
    /@media \(max-width:640px\)/.test(adminHtml) &&
    /iaSummary\{grid-template-columns:1fr;/.test(adminHtml.replace(/\s+/g, '')),
  '13. phone layout stacks overview cards and allows table scroll'
);
assert(!/lantern-result-reveal/.test(adminHtml), 'admin still does not mount race UI');
assert(!/FROM lantern_reactions/.test(fs.readFileSync(path.join(root, 'worker/interactions-analytics.js'), 'utf8')), 'legacy reaction table is no longer the analytics source');

console.log('\ninteractions-analytics-243-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
