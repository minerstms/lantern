/**
 * Prompt #97 — known demo/fake persona names must never surface in production-facing
 * feeds/tickers as though they were real school content. These accounts predate the current
 * production data model (created while building the app) and left real, approved rows behind
 * in lantern_news_submissions / lantern_teacher_recognition (confirmed against the live
 * database, not just source code — see CURSOR REPLY #97 §8). This is a display-time filter, not
 * a deletion: the underlying historical rows are left intact per the "do not destructively
 * delete" instruction, and a teacher/admin with direct DB access can still audit them.
 *
 * Kept in its own module (rather than inline in worker/index.js) so every production list route
 * — the ticker's /api/news/approved and /api/recognition/list, and the unified Explore feed's
 * collectApprovedFeed() — shares exactly one exclusion list instead of drifting independently.
 */
export const KNOWN_DEMO_PERSONA_NAMES = [
  'Alex Adventure',
  'Sam Star',
  'Casey Cool',
  'Jordan Joy',
  'Riley Rise',
];

const NORMALIZED = new Set(KNOWN_DEMO_PERSONA_NAMES.map((n) => n.trim().toLowerCase()));

export function isKnownDemoPersonaName(name) {
  const n = String(name || '').trim().toLowerCase();
  return !!n && NORMALIZED.has(n);
}

/**
 * Filters a list of rows/items, dropping any whose name (read via nameField, or via a getter
 * function for shapes with no single flat field) matches a known demo/fake persona.
 */
export function filterOutDemoPersonas(list, nameField) {
  if (!Array.isArray(list)) return list;
  const getName = typeof nameField === 'function' ? nameField : (item) => item && item[nameField];
  return list.filter((item) => !isKnownDemoPersonaName(getName(item)));
}
