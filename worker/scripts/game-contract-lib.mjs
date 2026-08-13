/**
 * Reusable Lantern game-contract evaluator.
 *
 * Future game IDs: build a spec, then call evaluateGameContract(spec, ctx).
 * Production catalogs are loaded structurally (VM / ESM import), not by regex of game IDs.
 *
 * Usage from a test:
 *   import { evaluateGameContract, loadProductionGameContext } from './game-contract-lib.mjs';
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  LANTERN_LEADERBOARD_GAMES,
  resolveRegisteredLeaderboardGame,
  validateLeaderboardScore,
} from '../lantern-game-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ID_RE = /^[a-z][A-Za-z0-9-]{1,47}$/;
const NEW_ID_RE = /^[a-z][a-z0-9-]{1,47}$/;
const PLAY_BTN_RE = /^[A-Za-z][A-Za-z0-9_]{2,63}$/;

export const TEMPLATE_GAME_ID = 'starter-tap-once';

function problem(list, msg) {
  list.push(msg);
}

function loadFrontendCatalog() {
  const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox.globalThis = sandbox;
  vm.runInNewContext(catalogJs, sandbox);
  return sandbox.LANTERN_GAME_CATALOG;
}

export function loadProductionGameContext() {
  const frontend = loadFrontendCatalog();
  const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
  const navJs = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
  const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
  const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
  const starterJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-starter.js'), 'utf8');
  return {
    frontend,
    frontendGames: frontend.listGames(),
    workerGames: LANTERN_LEADERBOARD_GAMES.slice(),
    gamesHtml,
    navJs,
    workerIndex,
    paidStartJs,
    starterJs,
    root,
  };
}

/**
 * Shape every Lantern game spec must have before it can be registered.
 * options.strictKebab: new games should be lowercase kebab-case (nuggetHunt is a grandfathered exception).
 */
export function evaluateSpecShape(spec, options) {
  const problems = [];
  if (!spec || typeof spec !== 'object') {
    return { ok: false, problems: ['spec is missing'] };
  }
  const idPat = options && options.strictKebab ? NEW_ID_RE : ID_RE;
  if (!idPat.test(String(spec.id || ''))) {
    problem(problems, options && options.strictKebab
      ? 'id must be lowercase kebab-case (e.g. tap-once), 2–48 chars'
      : 'id must start with a letter and use letters/digits/hyphens only, 2–48 chars');
  }
  const name = String(spec.name || '').trim();
  if (!name || name.length > 48) problem(problems, 'safe title (name) required, max 48 chars');
  if (/<[^>]+>/.test(name)) problem(problems, 'title must not contain HTML');
  if (!PLAY_BTN_RE.test(String(spec.playBtnId || ''))) {
    problem(problems, 'playBtnId required (unique element id for games.html trigger)');
  }
  const cost = Number(spec.play_cost);
  if (cost !== 1) problem(problems, 'play_cost must be 1 (ordinary paid start)');
  if (spec.leaderboard !== true) problem(problems, 'leaderboard must be true for scored games');
  const min = Number(spec.scoreMin);
  const max = Number(spec.scoreMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    problem(problems, 'explicit scoreMin/scoreMax required with min <= max');
  }
  if (typeof spec.lowerIsBetter !== 'boolean' && !(spec.scoring && typeof spec.scoring.lowerIsBetter === 'boolean')) {
    problem(problems, 'lowerIsBetter (or scoring.lowerIsBetter) required');
  }
  if (!spec.type) problem(problems, 'type required (trivia | arcade | memory | other)');
  if (!spec.description || String(spec.description).trim().length < 8) {
    problem(problems, 'description required');
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Evaluate one game ID/spec against production files.
 *
 * options.requireProductionRegistration (default true):
 *   true  — catalog + worker allowlist + games.html trigger must exist
 *   false — spec shape only; used for the non-production template
 *
 * options.forbidProductionRegistration:
 *   true  — fail if the id appears in either production catalog (template)
 */
export function evaluateGameContract(spec, ctx, options) {
  options = options || {};
  const requireReg = options.requireProductionRegistration !== false;
  const forbidReg = options.forbidProductionRegistration === true;
  const problems = [];
  const notes = [];

  const shape = evaluateSpecShape(spec, { strictKebab: options.strictKebab === true });
  shape.problems.forEach((p) => problems.push(p));

  const id = spec && spec.id ? String(spec.id) : '';
  const name = spec && spec.name ? String(spec.name) : '';
  const frontendGames = (ctx && ctx.frontendGames) || [];
  const workerGames = (ctx && ctx.workerGames) || [];
  const gamesHtml = (ctx && ctx.gamesHtml) || '';
  const frontend = ctx && ctx.frontend;

  const feById = frontendGames.filter((g) => g.id === id);
  const feByName = frontendGames.filter((g) => g.name === name);
  const wrById = workerGames.filter((g) => g.id === id);
  const wrByName = workerGames.filter((g) => g.name === name);

  if (forbidReg) {
    if (feById.length || feByName.length) problem(problems, id + ' must not appear in the production frontend catalog');
    if (wrById.length || wrByName.length) problem(problems, id + ' must not appear in the production worker allowlist');
    if (gamesHtml.includes("id: '" + id + "'") || (spec.playBtnId && gamesHtml.includes('id="' + spec.playBtnId + '"'))) {
      problem(problems, id + ' must not be wired into production games.html');
    }
    notes.push('template/dev-only: excluded from production Games catalog');
    return { ok: problems.length === 0, problems, notes };
  }

  if (!requireReg) {
    notes.push('registration not required for this evaluation');
    return { ok: problems.length === 0, problems, notes };
  }

  if (feById.length !== 1) problem(problems, 'frontend catalog must have exactly one entry for id ' + id);
  if (feByName.length !== 1) problem(problems, 'frontend catalog must have exactly one entry for name ' + name);
  if (wrById.length !== 1) problem(problems, 'worker allowlist must have exactly one entry for id ' + id);
  if (wrByName.length !== 1) problem(problems, 'worker allowlist must have exactly one entry for name ' + name);

  const fe = feById[0];
  const wr = wrById[0] || resolveRegisteredLeaderboardGame(id) || resolveRegisteredLeaderboardGame(name);

  if (fe) {
    if (fe.name !== name) problem(problems, 'frontend name mismatch for ' + id);
    if (fe.playBtnId !== spec.playBtnId) problem(problems, 'playBtnId must match frontend catalog for ' + id);
    if (Number(fe.play_cost) !== 1) problem(problems, 'frontend play_cost must be 1 for ' + id);
    if (fe.leaderboard !== true) problem(problems, 'frontend leaderboard must be true for ' + id);
    if (fe.status !== 'playable') problem(problems, 'frontend status must be playable for ' + id);
    if (frontend && typeof frontend.leaderboardKey === 'function' && frontend.leaderboardKey(id) !== name) {
      problem(problems, 'leaderboardKey(id) must equal display name for ' + id);
    }
  }

  if (wr) {
    if (wr.name !== name) problem(problems, 'worker name mismatch for ' + id);
    if (wr.status !== 'playable' || wr.leaderboard !== true) {
      problem(problems, 'worker status/leaderboard must be playable+true for ' + id);
    }
    if (Number(wr.scoreMin) !== Number(spec.scoreMin) && spec.scoreMin != null) {
      notes.push(id + ' spec.scoreMin differs from worker catalog (worker is authoritative)');
    }
    if (!Number.isFinite(Number(wr.scoreMin)) || !Number.isFinite(Number(wr.scoreMax))) {
      problem(problems, 'worker score bounds missing for ' + id);
    }
    const tooLow = validateLeaderboardScore(wr, Number(wr.scoreMin) - 1);
    const tooHigh = validateLeaderboardScore(wr, Number(wr.scoreMax) + 1);
    const inRange = validateLeaderboardScore(wr, Number(wr.scoreMin));
    if (inRange.ok !== true) problem(problems, 'worker scoreMin is not accepted for ' + id);
    if (tooLow.ok || tooHigh.ok) problem(problems, 'worker score bounds do not reject out-of-range for ' + id);
  }

  if (spec.playBtnId) {
    const idAttr = 'id="' + spec.playBtnId + '"';
    if (!gamesHtml.includes(idAttr)) problem(problems, 'games.html missing play trigger ' + spec.playBtnId);
  }

  if (gamesHtml && name) {
    const triviaNames = {
      'Lantern Live Trivia': true,
      'Handbook Trivia': true,
      'Local History Trivia': true,
    };
    const posted = triviaNames[name]
      ? gamesHtml.includes('postLeaderboardScore(gameName,')
      : gamesHtml.includes("postLeaderboardScore('" + name + "'");
    if (!posted) problem(problems, 'games.html has no leaderboard post path for ' + name);
  }

  return { ok: problems.length === 0, problems, notes };
}

export function findDuplicateIds(games) {
  const seen = Object.create(null);
  const dupes = [];
  (games || []).forEach((g) => {
    const id = g && g.id;
    if (!id) return;
    if (seen[id]) dupes.push(id);
    seen[id] = true;
  });
  return dupes;
}

export function catalogsAligned(frontendGames, workerGames) {
  const feIds = (frontendGames || []).map((g) => g.id).sort();
  const wrIds = (workerGames || []).map((g) => g.id).sort();
  const feNames = (frontendGames || []).map((g) => g.name).sort();
  const wrNames = (workerGames || []).map((g) => g.name).sort();
  return {
    ok:
      feIds.length === wrIds.length &&
      feIds.every((id, i) => id === wrIds[i]) &&
      feNames.every((n, i) => n === wrNames[i]),
    feIds,
    wrIds,
    feNames,
    wrNames,
  };
}

export { root as REPO_ROOT };
