/**
 * Lantern API — Cloudflare Worker (Lantern-only)
 * Routes: /api/avatar, /api/economy, /api/news, /api/approvals, /api/recognition, /api/reactions, /api/feed, /api/trivia
 * No MTSS / case / private student data.
 */
import {
  allocateStaffId,
  composeStaffDisplayName,
  ensureStaffIdsAllocated,
  fetchAdminUserRow,
  generateStaffTempPassword,
  isStaffAccountRole,
  validateDisplayName,
  validateStaffEmail,
  validateStaffNamePart,
} from './admin-account-utils.js';
import {
  validateStaffHonorific,
  validateStaffPublicDisplayName,
  propagateHonorificToLinkedAccounts,
  propagatePublicDisplayNameToLinkedAccounts,
  loadStaffPublicNameIndex,
  resolveAuthorPublicLabel,
  formatPublicStaffName,
  defaultPublicDisplayName,
  resolvePublicDisplayName,
  overlayNewsRowRecognizedStaff,
  overlayRecognitionListRow,
} from './staff-public-name.js';
import { handleFeedRoutes, handleTriviaRoutes, isApprovedFeedItem, isPeerShoutOutNewsSubmission } from './feed-handlers.js';
import { loadPilotAvatarKeyIndex, resolveAuthorAvatarKey } from './author-avatar-key.js';
import { handleFinalReactionRoutes } from './final-reaction-handlers.js';
import { handleLockerRoutes } from './locker-handlers.js';
import { handleMissionsRoutes } from './missions-handlers.js';
import { isTeacherLike, sessionTeacherId, reviewerLabelFromAccount } from './missions-auth.js';
import { durableAccountKeyFromPilotAccount } from './durable-account-key.js';
import { executeCosmeticPurchase } from './economy-cosmetic.js';
import { creditPollCompletionReward, pollRewardResponseFields } from './poll-completion-reward.js';
import { resolveEconomyBalanceRead, resolveEconomyGamePlayTransact, resolveEconomySelfTransact, isSelfEconomyTransactKind } from './economy-balance-auth.js';
import {
  resolveRegisteredLeaderboardGame,
  leaderboardGameNames,
  isLowerIsBetterGame,
  validateLeaderboardScore,
  sanitizeScoreDisplay,
  sanitizeRunId,
} from './lantern-game-catalog.js';
import { findPaidGamePlayByRunId, evaluatePaidGamePlayRun } from './game-paid-run-proof.js';
import { serverCosmeticPrice } from './cosmetic-catalog.js';
import { tmsEconomyBalance, tmsEconomyTransact, tmsStaffEconomyBalance, tmsStaffEconomyTransact } from './tms-economy-bridge.js';
import { applyAuthoritativeNuggetDelta } from './tms-economy-apply.js';
import { parseStaffEconomyKey, resolveStaffTmsPrincipal, isStaffEconomyKey, resolveTmsStaffIdForLanternAccount, resolvePrimaryLanternUsernameForTmsStaff } from './staff-economy.js';
import { handleStaffStarterNuggets, isSystemWebAdminAccount } from './staff-starter-nuggets.js';
import {
  canonicalLanternStaffDisplayName,
  ensureBlCompatIdentityForLanternStaff,
} from './tms-compat-provision.js';
import {
  searchPeople,
  normalizePeoplePayload,
  normalizeShoutOutRecognition,
  replaceContentPeople,
  copyContentPeople,
  listContentPeople,
  loadContentPeopleIndex,
  publicPeopleForReview,
} from './content-people.js';
import {
  finalizePollContributionPublish,
  isPollPublisherRole,
  parsePollChoices,
} from './poll-publish.js';
import { filterOutDemoPersonas, isKnownDemoPersonaName } from './demo-persona-guard.js';
import { buildAvatarMatchPool, uniqueAvatarMatchByLabel } from './avatar-match-pool.js';
import { evaluateSchoolSchedule, isSchoolScheduleEnforcementEnabled, resolveUntilSchoolCloseInstant } from './school-schedule.js';
import { ensureFirstGameMissionCompletion, ensureContentApprovedMissionCompletion } from './mission-event-completions.js';
import { awardStudentDailyContentCreationReward } from './content-creation-reward.js';
import {
  authorRemovePublishedContent,
  authorWithdrawPendingContent,
  parseContentRemoveTarget,
  removalStatusLabel,
  isAuthorRemovalLabel,
} from './content-author-remove.js';
import {
  normalizeReportItemType,
  resolveReportTargetIds,
  quarantineReportedContent,
  reportQuarantineAuditLabel,
  reporterIdentityFromAccount,
  isReportQuarantineLabel,
  reportStatusLabel,
} from './content-report-quarantine.js';
import {
  loadMediaPublicityMap,
  setStudentMediaPublicityRestriction,
  listRestrictedStudentsForStaff,
  buildReviewMediaPublicitySummary,
  filterNewsRowsForHallwayTv,
  filterRecognitionRowsForHallwayTv,
  recordExternalMediaClearance,
  computeExternalAssetFingerprint,
  loadRestrictedStudentIdSet,
  resolveAuthorStudentCandidates,
  assertExternalPublicationAllowed,
  knownRestrictedPeopleFromRows,
} from './media-publicity.js';
import { authorKeyFromAccount as feedAuthorKeyFromAccount } from './feed-handlers.js';
import {
  ACCESS_DEVICE_COOKIE_NAME,
  ACCESS_REQUEST_PENDING_TTL_SEC,
  ACCESS_REQUEST_ALLOWED_GRANT_MINUTES,
  ACCESS_REQUEST_RATE_LIMIT_WINDOW_SEC,
  ACCESS_REQUEST_RATE_LIMIT_MAX_PER_WINDOW,
  ACCESS_GRANT_EXTEND_ALLOWED_MINUTES,
  generateRequestPhrase,
  generateDeviceSecret,
  hashOpaqueSecret,
  buildAccessDeviceCookieHeader,
  derivedRequestStatus,
  computeExtendedGrantExpiresAt,
} from './access-requests.js';
import {
  DEVICE_PAIRING_COOKIE_NAME,
  DEVICE_TOKEN_HEADER,
  DEVICE_PAIRING_PENDING_TTL_SEC,
  DEVICE_PAIRING_RATE_LIMIT_WINDOW_SEC,
  DEVICE_PAIRING_RATE_LIMIT_MAX_PER_WINDOW,
  GROUP_UNLOCK_ALLOWED_MINUTES,
  generatePairingPhrase,
  generateOpaqueSecret,
  buildPairingCookieHeader,
  derivedPairingStatus,
  isDeviceActive,
  isGroupUnlockActive,
} from './device-enrollment.js';
import { ACCESS_AUDIT_ACTIONS, recordAccessAuditEvent } from './access-audit.js';
import {
  ACCESS_PREAUTH_CLAIM_TTL_SEC,
  loadActiveStudentAccount,
  searchActiveStudents,
  listUnclaimedPreauths,
  upsertStudentPreauthorization,
  cancelUnclaimedPreauthorization,
  claimPreauthorizationAfterLogin,
  mapClaimedRequestSources,
  studentPublicLabel,
} from './access-preauthorize.js';
import { handleSettingsRoutes } from './lantern-settings.js';
import {
  GEPPETTO_STUDENT_AUDIENCE,
  GEPPETTO_STUDENT_ROSTER_PATH,
  GEPPETTO_S2S_HEADERS,
  sanitizeGeppettoStudentReturn,
  appendHandoffCodeToReturn,
  resolveGeppettoStudentDisplayName,
  geppettoStudentAuthorizeFailurePage,
  bearerTokenFromRequest,
  mintGeppettoStudentHandoff,
  redeemGeppettoStudentHandoff,
  buildGeppettoStudentRosterPayload,
} from './geppetto-student-handoff.js';
import { handleMarqueeRoutes } from './marquee-handlers.js';
import {
  detectLeaderboardEntryTransition,
  queryWeeklyTopCharacterNames,
  withBoardEntryMeta,
} from './marquee-events.js';
import {
  awardAchievementsForEconomyTransact,
  awardAchievementsAfterPositiveCredit,
  awardAchievementsForNewsApproved,
  awardAchievementsForNewsCreate,
  awardAchievementsForPollContribute,
  awardAchievementsForRecognition,
} from './locker-achievements.js';
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
  'https://tmslantern.org',
  'https://www.tmslantern.org',
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
      u.hostname === 'tmslantern.org' ||
      u.hostname === 'www.tmslantern.org' ||
      u.hostname === 'lantern-42i.pages.dev' ||
      u.hostname.endsWith('.lantern-42i.pages.dev')
    );
  } catch (_) {
    return false;
  }
}

/**
 * Prompt #203 — Behavior Logger origins for credentialed silent bootstrap CORS only.
 * Does not broaden Lantern cookie Domain; cookies remain host-scoped on tmslantern.org.
 */
function isBehaviorLoggerOrigin(origin) {
  const o = String(origin || '').trim();
  if (!o) return false;
  try {
    const u = new URL(o);
    if (u.protocol !== 'https:') return false;
    return (
      u.hostname === 'log.tmslantern.org' ||
      u.hostname === 'tmsnuggets.pages.dev' ||
      u.hostname.endsWith('.tmsnuggets.pages.dev')
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
    isBehaviorLoggerOrigin(origin) ||
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Class-Token, X-Lantern-Economy-Secret, X-Device-Token',
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
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      ...corsHeaders,
    },
  });
}

function jsonResponseWithCookies(obj, status, corsHeaders, cookies) {
  const headers = new Headers({ 'Content-Type': 'application/json', ...corsHeaders });
  (cookies || []).forEach((c) => {
    if (c) headers.append('Set-Cookie', c);
  });
  return new Response(JSON.stringify(obj), { status: status || 200, headers });
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
      if (path === GEPPETTO_STUDENT_ROSTER_PATH) {
        return new Response(null, { status: 204, headers: { ...GEPPETTO_S2S_HEADERS } });
      }
      let o = corsHeaders;
      if (
        path.startsWith('/api/pilot') ||
        path.startsWith('/api/auth') ||
        path.startsWith('/api/admin') ||
        path.startsWith('/api/class-access') ||
        path.startsWith('/api/tms-nuggets') ||
        path.startsWith('/api/economy') ||
        path.startsWith('/api/leaderboards') ||
        path.startsWith('/api/integrations') ||
        path.startsWith('/api/approvals') ||
        path === '/api/news/hide' ||
        path === '/api/news/restore' ||
        path === '/api/news/hidden' ||
        path === '/api/polls/hide' ||
        path === '/api/polls/restore' ||
        path === '/api/polls/hidden' ||
        path === '/api/content/remove' ||
        path === '/api/content/withdraw' ||
        path.startsWith('/api/report') ||
        path.startsWith('/api/moderation') ||
        path.startsWith('/api/missions') ||
        path.startsWith('/api/feed') ||
        path.startsWith('/api/trivia') ||
        path.startsWith('/api/marquee') ||
        path.startsWith('/api/locker')
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
    // Phase #34 — central, server-side school-access gate. Runs before every other route is
    // dispatched (default-deny for anything not in SCHOOL_ACCESS_EXEMPT_PATH_PREFIXES), so a
    // student cannot bypass a scheduled school-hours lock by calling an API directly instead of
    // going through the frontend gate. No-op (schedule metadata aside) whenever
    // SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED is not "true".
    if (!isSchoolAccessExemptPath(path)) {
      const schoolAccessGate = await evaluateCentralSchoolAccess(request, env);
      if (!schoolAccessGate.allowed) {
        // Every route this gate actually guards (missions/feed/locker/economy/approvals/...) is a
        // credentialed pilot surface that normally answers with corsForPilot() headers, not the
        // wildcard-origin corsHeaders used pre-#34 only by the few uncredentialed endpoints. Using
        // the wrong CORS headers here would make a real browser's fetch() throw a CORS error
        // instead of letting frontend code read this response's body and show the lock message.
        return jsonResponse({
          ok: false,
          error: 'school_access_locked',
          reason: schoolAccessGate.reason,
          schedule: schoolAccessGate.schedule,
          message: 'Lantern is locked during school hours. Ask your teacher to grant access.',
        }, 403, corsForPilot(request));
      }
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
    if (path.startsWith('/api/people')) {
      try {
        return await handlePeopleRoutes(request, url, path, env, cors);
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
    if (path.startsWith('/api/feed')) {
      try {
        const feedCors =
          request.method === 'GET' && (path === '/api/feed' || path === '/api/feed/slideshow' || path === '/api/feed/comments')
            ? cors
            : corsForPilot(request);
        const feedDeps = {
          getPilotAccountFromRequest,
          pilotEconomyCharacterName,
          pilotAccountRequiresChangePassword,
        };
        return await handleFeedRoutes(request, url, path, env, feedCors, feedDeps);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    if (path.startsWith('/api/trivia')) {
      try {
        const triviaCors = request.method === 'GET' && path === '/api/trivia/live' ? cors : corsForPilot(request);
        const feedDeps = {
          getPilotAccountFromRequest,
          pilotEconomyCharacterName,
          pilotAccountRequiresChangePassword,
        };
        return await handleTriviaRoutes(request, url, path, env, triviaCors, feedDeps);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    if (path.startsWith('/api/missions')) {
      try {
        const missionsCors =
          request.method === 'GET' && path === '/api/missions/submissions/approved'
            ? cors
            : corsForPilot(request);
        const missionsDeps = {
          jsonResponse,
          getPilotAccountFromRequest,
          pilotEconomyCharacterName,
          pilotAccountRequiresChangePassword,
          requireAdminPilotSession,
          parseModerationBodyId,
          adminAuditLabel,
        };
        return await handleMissionsRoutes(request, url, path, env, missionsCors, missionsDeps);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    if (path.startsWith('/api/report') || path.startsWith('/api/moderation')) {
      try {
        // Prompt #117 — credentialed report + staff flagged list (corsForPilot).
        return await handleModerationRoutes(request, url, path, env, corsForPilot(request));
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
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
    // Prompt #95: Teacher -> Nuggets workspace, backed by the real TMS Nugget Ledger via the
    // narrow server-to-server bridge (never a direct browser->Nuggets call, never a copy of the
    // TMS balance into Lantern D1).
    if (path.startsWith('/api/tms-nuggets')) {
      const tmsNuggetsCors = corsForPilot(request);
      try {
        return await handleTmsNuggetsRoutes(request, url, path, env, tmsNuggetsCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, tmsNuggetsCors);
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
        const lbCors = request.method === 'POST' ? corsForPilot(request) : cors;
        return await handleLeaderboardRoutes(request, url, path, env, lbCors);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        const lbCors = request.method === 'POST' ? corsForPilot(request) : cors;
        return jsonResponse({ ok: false, error: message }, 400, lbCors);
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
    // Prompt #110 — ONE canonical settings store (currently: marquee/ticker scroll speed).
    if (path.startsWith('/api/settings')) {
      try {
        const settingsCors = request.method === 'GET' ? cors : corsForPilot(request);
        const settingsDeps = { jsonResponse, requireAdminPilotSession, adminAuditLabel };
        return await handleSettingsRoutes(request, url, path, env, settingsCors, settingsDeps);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    if (path.startsWith('/api/marquee')) {
      try {
        const marqueeCors = corsForPilot(request);
        return await handleMarqueeRoutes(request, url, path, env, marqueeCors, {
          getPilotAccountFromRequest,
          pilotAccountRequiresChangePassword,
          resolveTmsStaffIdForLanternAccount,
          callTmsNuggetsBridge,
          filterNewsRowsForHallwayTv,
          filterRecognitionRowsForHallwayTv,
        });
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return jsonResponse({ ok: false, error: message }, 400, corsForPilot(request));
      }
    }
    if (path.startsWith(['/', 'api', 'test-students'].join(''))) {
      return jsonResponse(
        {
          ok: false,
          error: 'test_students_disabled',
          message: 'Temporary test-student identities are no longer available in production.',
        },
        410,
        cors
      );
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
    if (path.startsWith('/api/locker')) {
      try {
        const lockerCors = corsForPilot(request);
        const lockerDeps = {
          jsonResponse,
          getPilotAccountFromRequest,
          pilotEconomyCharacterName,
          pilotAccountRequiresChangePassword,
        };
        return await handleLockerRoutes(request, url, path, env, lockerCors, lockerDeps);
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

/** Canonical primary admin (Lantern ship contract). Prompt #209 — login `admin`, display Web Admin. */
const LANTERN_PRIMARY_ADMIN_USERNAME = 'admin';
const LANTERN_PRIMARY_ADMIN_PASSWORD = '1606';
const LANTERN_PRIMARY_ADMIN_DISPLAY_NAME = 'Web Admin';

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
 * Ensures primary admin row exists (username admin / display Web Admin).
 * Prompt #209 — never rotate password_hash/salt for an existing row (preserves live credentials).
 * Currently unused by login; kept for bootstrap/setup callers.
 */
async function ensureLanternPrimaryAdminCredentials(db) {
  const existing = await db
    .prepare('SELECT username FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))')
    .bind(LANTERN_PRIMARY_ADMIN_USERNAME)
    .first();
  if (existing) {
    await db
      .prepare(
        `UPDATE lantern_pilot_accounts SET
          role = 'admin',
          display_name = ?,
          is_active = 1,
          must_change_password = 0,
          updated_at = datetime('now')
        WHERE username = ?`
      )
      .bind(LANTERN_PRIMARY_ADMIN_DISPLAY_NAME, String(existing.username))
      .run();
    return;
  }
  const salt = pilotRandomSaltHex();
  const hash = await pilotHashPassword(LANTERN_PRIMARY_ADMIN_PASSWORD, salt);
  await db
    .prepare(
      `INSERT INTO lantern_pilot_accounts (username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, updated_at, is_active, must_change_password, password_changed_at, password_reset_at, password_reset_by) VALUES (?, ?, 'admin', ?, ?, NULL, NULL, datetime('now'), 1, 0, datetime('now'), NULL, NULL)`
    )
    .bind(LANTERN_PRIMARY_ADMIN_USERNAME, LANTERN_PRIMARY_ADMIN_DISPLAY_NAME, hash, salt)
    .run();
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
  if (crypto.subtle && typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(ba, bb);
  }
  let out = 0;
  for (let i = 0; i < ba.length; i++) out |= ba[i] ^ bb[i];
  return out === 0;
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
      `SELECT username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, mtss_student_id, staff_id, is_active, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
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

/**
 * Session must be an active teacher/admin account (Prompt #92 — approvals + class-access
 * staff actions). Mirrors requireAdminPilotSession above, but for the broader teacher-or-admin
 * population already established by isTeacherLike (same helper missions/feed routes use).
 * Shared by both hardened areas so there is exactly one teacher/admin session guard, not two
 * parallel ones. Returns { account } or { response }.
 */
async function requireStaffPilotSession(request, env, cors) {
  const account = await getPilotAccountFromRequest(request, env);
  if (!account) {
    return { response: jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors) };
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return {
      response: jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors),
    };
  }
  if (!isTeacherLike(account.role)) {
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

/**
 * Prompt #211 — avatar profile key for a pilot account (same identity Locker uses for status).
 * Students: economy/MTSS key. Staff/admin: login username.
 */
function avatarCharacterNameForPilotAccount(row) {
  return durableAccountKeyFromPilotAccount(row);
}

/**
 * Prompt #94 -- TMS Nuggets -> Lantern staff SSO. Same set as app/teacher.html WORKSPACES
 * (Prompt #91); kept as a literal allowlist here rather than importing the frontend file, since
 * this is a strict server-side authorization boundary against open redirect, not UI state.
 */
const TMS_EXCHANGE_ALLOWED_WORKSPACES = ['overview', 'review', 'create', 'missions', 'moderation', 'economy', 'other'];

/**
 * Server-controlled return-target validation for the TMS exchange redirect (Prompt #94 / #196).
 * Always returns a same-origin relative Teacher Tools path — never trusts the caller's `return`
 * value directly. Accepts teacher / /teacher / teacher.html / /teacher.html (optional #workspace)
 * and canonical https://tmslantern.org/teacher[…] URLs. Everything else falls back to /teacher.
 * Default is extensionless /teacher so Cloudflare Pages does not insert an extra .html→pretty-URL
 * 308 hop after Set-Cookie (mobile Custom Tabs). No open redirect.
 */
function sanitizeTmsExchangeReturnTarget(raw) {
  const DEFAULT_TARGET = '/teacher';
  let s = String(raw || '').trim();
  if (!s) return DEFAULT_TARGET;
  // Absolute URLs: only canonical Lantern public host; strip to path+hash.
  if (/^https?:\/\//i.test(s) || s.indexOf('//') === 0) {
    try {
      const u = new URL(s.indexOf('//') === 0 ? 'https:' + s : s);
      const host = String(u.hostname || '').toLowerCase();
      if (host !== 'tmslantern.org' && host !== 'www.tmslantern.org') return DEFAULT_TARGET;
      s = (u.pathname || '/') + (u.hash || '');
    } catch (_) {
      return DEFAULT_TARGET;
    }
  }
  // Normalize path (drop trailing slash except root); keep hash.
  const hashIdx = s.indexOf('#');
  let pathOnly = hashIdx >= 0 ? s.slice(0, hashIdx) : s;
  const hashPart = hashIdx >= 0 ? s.slice(hashIdx + 1) : '';
  pathOnly = pathOnly.replace(/\/$/, '') || '/';
  if (pathOnly.charAt(0) !== '/') pathOnly = '/' + pathOnly;
  const teacherPaths = ['/teacher', '/teacher.html'];
  if (teacherPaths.indexOf(pathOnly) === -1) return DEFAULT_TARGET;
  if (!hashPart) return DEFAULT_TARGET;
  const workspace = hashPart.trim();
  if (!workspace || TMS_EXCHANGE_ALLOWED_WORKSPACES.indexOf(workspace) === -1) return DEFAULT_TARGET;
  return DEFAULT_TARGET + '#' + workspace;
}

function getTmsNuggetsApiBaseUrl(env) {
  return (env.TMS_NUGGETS_API_BASE_URL || 'https://mtss-behavior-log.mrradle.workers.dev').trim().replace(/\/$/, '');
}

/**
 * Prompt #139/#182 — allow only known Behavior Logger origins for device-authorize return.
 * Canonical public hostname: log.tmslantern.org (Pages hostname retained for compatibility).
 */
function sanitizeTmsDeviceAuthorizeReturn(raw) {
  const DEFAULT_TARGET = 'https://log.tmslantern.org/index.html';
  const ALLOWED_HOSTS = ['log.tmslantern.org', 'tmsnuggets.pages.dev'];
  const s = String(raw || '').trim();
  if (!s) return DEFAULT_TARGET;
  let u;
  try {
    u = new URL(s);
  } catch (_) {
    return DEFAULT_TARGET;
  }
  const host = String(u.hostname || '').toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1';
  if (ALLOWED_HOSTS.indexOf(host) === -1 && !local) return DEFAULT_TARGET;
  if (u.protocol !== 'https:' && !(local && (u.protocol === 'http:' || u.protocol === 'https:'))) {
    return DEFAULT_TARGET;
  }
  const path = u.pathname === '/' || u.pathname === '' ? '/index.html' : u.pathname;
  if (path !== '/index.html') return DEFAULT_TARGET;
  // Prompt #140 — allow only safe intent / lantern_return query params (no secrets).
  const params = new URLSearchParams();
  const intent = String(u.searchParams.get('intent') || '').trim().toLowerCase();
  if (intent === 'remember' || intent === 'session' || intent === 'not_now' || intent === 'onboard') {
    params.set('intent', intent);
  }
  const lanternReturn = String(u.searchParams.get('lantern_return') || '').trim();
  // Prompt #196 — reject bare "/" (root interstitial / Locker-titled index) so Remember-device
  // return never dumps staff on https://tmslantern.org/ after Behavior Logger trust.
  if (
    lanternReturn.charAt(0) === '/' &&
    lanternReturn !== '/' &&
    lanternReturn.indexOf('//') !== 0 &&
    lanternReturn.indexOf('/login') !== 0
  ) {
    params.set('lantern_return', lanternReturn);
  }
  const q = params.toString();
  return u.origin + path + (q ? '?' + q : '');
}

function appendLanternStaffCodeToReturn(returnUrl, code) {
  const base = String(returnUrl || '').trim();
  const sep = base.indexOf('?') >= 0 ? '&' : '?';
  return base + sep + 'lantern_staff_code=' + encodeURIComponent(String(code || ''));
}

/**
 * Server-to-server redemption of a Nuggets-issued Lantern staff handoff code. Authenticates
 * Lantern TO Nuggets via TMS_LANTERN_BRIDGE_SECRET (Bearer) -- mirrors the existing convention
 * Nuggets already uses for its OWN outbound calls into Lantern (LANTERN_MTSS_INTEGRATION_SECRET /
 * LANTERN_API_KEY). Never throws for an ordinary decline; only for genuinely unexpected failures.
 */
async function redeemTmsLanternHandoff(env, code) {
  const secret = (env.TMS_LANTERN_BRIDGE_SECRET || '').trim();
  if (!secret) return { ok: false, error: 'bridge_not_configured' };
  const base = getTmsNuggetsApiBaseUrl(env);
  let resp;
  try {
    resp = await fetch(base + '/api/auth/lantern-handoff/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ code: String(code || ''), audience: 'lantern' }),
    });
  } catch (_) {
    return { ok: false, error: 'redeem_request_failed' };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'redeem_bad_response' };
  }
  if (!resp.ok || !data || !data.ok || !data.tms_staff_id) {
    return { ok: false, error: (data && data.error) || 'invalid_or_expired_code' };
  }
  return { ok: true, tms_staff_id: String(data.tms_staff_id) };
}

/**
 * Prompt #139 — ask TMS to mint a tms_device audience handoff for linked staff device verify.
 */
async function mintTmsDeviceStaffHandoff(env, tmsStaffId, lanternUsername, lanternDisplayName) {
  const secret = (env.TMS_LANTERN_BRIDGE_SECRET || '').trim();
  if (!secret) return { ok: false, error: 'bridge_not_configured' };
  const base = getTmsNuggetsApiBaseUrl(env);
  let resp;
  try {
    resp = await fetch(base + '/api/auth/lantern-staff-verify/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        tms_staff_id: String(tmsStaffId || ''),
        lantern_username: String(lanternUsername || ''),
        // Prompt #111 — current BL session display comes from Lantern, not MTSS teacher_name.
        lantern_display_name: String(lanternDisplayName || '').trim(),
      }),
    });
  } catch (_) {
    return { ok: false, error: 'mint_request_failed' };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'mint_bad_response' };
  }
  if (!resp.ok || !data || !data.ok || !data.code) {
    return { ok: false, error: (data && data.error) || 'mint_failed' };
  }
  return {
    ok: true,
    code: String(data.code),
    tms_staff_id: data.tms_staff_id != null ? String(data.tms_staff_id) : String(tmsStaffId || ''),
    teacher_name: data.teacher_name != null ? String(data.teacher_name) : '',
    expires_at: data.expires_at || null,
    ttl_seconds: data.ttl_seconds || null,
  };
}

function tmsDeviceAuthorizeFailurePage(errorCode, cors) {
  const messages = {
    not_authenticated: 'Sign in to Lantern to verify for Behavior Logger.',
    must_change_password: 'You must change your Lantern password before verifying for Behavior Logger.',
    lantern_account_not_staff: 'Staff access required. Student accounts cannot verify for Behavior Logger.',
    lantern_account_not_linked:
      'Your Lantern account is not linked to a Behavior Logger staff record. Contact Admin.',
    lantern_account_disabled: 'Staff account is inactive.',
    bridge_not_configured: 'Staff verification is temporarily unavailable. Contact Admin.',
    mint_failed: 'Could not start Behavior Logger verification. Try again.',
    mint_request_failed: 'Could not reach Behavior Logger verification. Try again.',
    staff_not_found: 'Linked Behavior Logger staff record was not found. Contact Admin.',
  };
  const msg = messages[errorCode] || 'Cannot verify staff identity; contact Admin.';
  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Behavior Logger verification</title></head><body style="font-family:system-ui;padding:24px;max-width:560px;margin:40px auto;line-height:1.45;">' +
    '<h1 style="font-size:28px;">Could not verify for Behavior Logger</h1><p style="font-size:20px;">' +
    msg +
    '</p><p style="font-size:18px;"><a href="/login.html">Sign in to Lantern</a> · <a href="https://log.tmslantern.org/index.html">Return to Behavior Logger</a></p></body></html>';
  return new Response(html, {
    status: 401,
    headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Prompt #95 -- Lantern Teacher -> Nuggets workspace. Reverse lookup of the SAME tms_identity_links
 * table used by the SSO exchange (Prompt #94), keyed the other direction: given the currently
 * authenticated Lantern account's username, find the authoritative tms_staff_id Nuggets expects.
 * An account with no row here simply cannot use the Nuggets bridge (fail closed) -- never guessed
 * from display name.
 */
/**
 * Prompt #95/#176 -- Lantern account → TMS staff id via shared durable resolver
 * (username lower/trim, then immutable lantern staff_id). Never guessed from display name.
 */
async function getTmsStaffIdForLanternAccount(db, username) {
  return resolveTmsStaffIdForLanternAccount(db, username);
}

/**
 * Prompt #95 -- narrow server-to-server call into Nuggets' Lantern bridge (student search /
 * ledger / redeem). Same TMS_LANTERN_BRIDGE_SECRET + base URL as redeemTmsLanternHandoff above.
 * `tmsStaffId` here is ALWAYS the server-resolved value from getTmsStaffIdForLanternAccount --
 * never a client-supplied id -- so Nuggets can independently re-authorize the real acting staff
 * member. Returns Nuggets' JSON body verbatim (Nuggets already shapes { ok, error, code, ... }
 * consistently) plus an internal `_httpStatus` the caller uses for the outer Response status.
 */
async function callTmsNuggetsBridge(env, subPath, tmsStaffId, payload) {
  const secret = (env.TMS_LANTERN_BRIDGE_SECRET || '').trim();
  if (!secret) return { ok: false, error: 'bridge_not_configured', _httpStatus: 503 };
  const base = getTmsNuggetsApiBaseUrl(env);
  let resp;
  try {
    resp = await fetch(base + '/api/lantern-bridge/' + subPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...payload, tms_staff_id: tmsStaffId }),
    });
  } catch (_) {
    return { ok: false, error: 'bridge_request_failed', _httpStatus: 502 };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'bridge_bad_response', _httpStatus: 502 };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'bridge_bad_response', _httpStatus: 502 };
  return { ...data, _httpStatus: resp.status };
}

/**
 * Prompt #127 — Lantern Admin → TMS roster bridge (secret-only like economy; no tms_staff_id).
 */
async function callTmsRosterBridge(env, subPath, payload) {
  const secret = (env.TMS_LANTERN_BRIDGE_SECRET || '').trim();
  if (!secret) return { ok: false, error: 'bridge_not_configured', _httpStatus: 503 };
  const base = getTmsNuggetsApiBaseUrl(env);
  let resp;
  try {
    resp = await fetch(base + '/api/lantern-bridge/' + subPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload || {}),
    });
  } catch (_) {
    return { ok: false, error: 'bridge_request_failed', _httpStatus: 502 };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'bridge_bad_response', _httpStatus: 502 };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'bridge_bad_response', _httpStatus: 502 };
  return { ...data, _httpStatus: resp.status };
}

const ADMIN_TMS_STUDENT_ID_MAX_LEN = 256;

/** Prompt #134 — map Admin grade UI values to TMS grade-6|7|8 slug. Empty → null. */
function normalizeAdminTmsGradeSlug(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^(grade[-_\s]*)?[678](st|nd|rd|th)?(\s*grade)?$/i.test(s) || /^grade-[678]$/.test(s)) {
    const m = s.match(/([678])/);
    return m ? 'grade-' + m[1] : null;
  }
  return null;
}

function splitRosterDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/**
 * Prompt #127/#130 — Lantern account status vs TMS student_id (never auto-creates accounts).
 * Missing | Linked | Linked Archived | Broken | Ambiguous
 */
function classifyLanternAccountStatus(tmsStudentId, studentAccounts) {
  const sid = String(tmsStudentId || '').trim();
  const accounts = Array.isArray(studentAccounts) ? studentAccounts : [];
  if (!sid) {
    return {
      lantern_account: 'Missing',
      lantern_username: null,
      lantern_is_active: null,
      must_change_password: false,
      locker: 'Not Ready',
      exact_match_linkable: false,
      public_display_name: null,
    };
  }

  const byMtss = accounts.filter(
    (a) => a.mtss_student_id && String(a.mtss_student_id).trim().toLowerCase() === sid.toLowerCase()
  );
  const byUsernameExact = accounts.filter(
    (a) => String(a.username || '').trim().toLowerCase() === sid.toLowerCase()
  );

  if (byMtss.length > 1) {
    return {
      lantern_account: 'Ambiguous',
      lantern_username: null,
      lantern_is_active: null,
      must_change_password: false,
      locker: 'Error',
      exact_match_linkable: false,
      public_display_name: null,
    };
  }
  if (byMtss.length === 1) {
    const row = byMtss[0];
    const u = String(row.username || '').trim();
    const active = Number(row.is_active) === 1;
    const mcp = !!(row.must_change_password === 1 || row.must_change_password === true || row.must_change_password === '1');
    return {
      lantern_account: active ? 'Linked' : 'Linked Archived',
      lantern_username: u || null,
      lantern_is_active: active ? 1 : 0,
      must_change_password: mcp,
      locker: active ? 'Ready' : 'Not Ready',
      exact_match_linkable: false,
      public_display_name: row.public_display_name != null ? String(row.public_display_name).trim() || null : null,
    };
  }

  // No mtss_student_id link yet. Exact username==TMS ID student account → Broken (incomplete) + linkable.
  if (byUsernameExact.length === 1 && String(byUsernameExact[0].role || '').toLowerCase() === 'student') {
    const row = byUsernameExact[0];
    const u = String(row.username || '').trim();
    const mcp = !!(row.must_change_password === 1 || row.must_change_password === true || row.must_change_password === '1');
    const hasOtherMtss = row.mtss_student_id != null && String(row.mtss_student_id).trim() !== '';
    if (hasOtherMtss) {
      return {
        lantern_account: 'Broken',
        lantern_username: u || null,
        lantern_is_active: Number(row.is_active) === 1 ? 1 : 0,
        must_change_password: mcp,
        locker: 'Error',
        exact_match_linkable: false,
        public_display_name: row.public_display_name != null ? String(row.public_display_name).trim() || null : null,
      };
    }
    return {
      lantern_account: 'Broken',
      lantern_username: u || null,
      lantern_is_active: Number(row.is_active) === 1 ? 1 : 0,
      must_change_password: mcp,
      locker: 'Not Ready',
      exact_match_linkable: Number(row.is_active) === 1,
      public_display_name: row.public_display_name != null ? String(row.public_display_name).trim() || null : null,
    };
  }
  if (byUsernameExact.length > 1) {
    return {
      lantern_account: 'Ambiguous',
      lantern_username: null,
      lantern_is_active: null,
      must_change_password: false,
      locker: 'Error',
      exact_match_linkable: false,
      public_display_name: null,
    };
  }

  return {
    lantern_account: 'Missing',
    lantern_username: null,
    lantern_is_active: null,
    must_change_password: false,
    locker: 'Not Ready',
    exact_match_linkable: false,
    public_display_name: null,
  };
}

/**
 * Prompt #95 -- Teacher -> Nuggets workspace: real TMS student search / balance+ledger / redeem.
 * Lantern never stores or duplicates a TMS balance; every call here is a live pass-through.
 * Authorization is layered exactly as designed:
 *  1. requireStaffPilotSession -- Lantern's OWN session must be an active teacher/admin account
 *     (the same canonical guard Prompt #92 approvals/class-access already use).
 *  2. getTmsStaffIdForLanternAccount -- the acting TMS identity comes ONLY from the server-side
 *     tms_identity_links mapping for THIS session's account.username, never from the browser.
 *  3. Nuggets' own /api/lantern-bridge/* independently re-loads that staff row and re-enforces
 *     TEACHER capability -- Lantern's request is authenticated as "from Lantern", not as
 *     "this teacher is authorized" (Nuggets decides that for itself).
 */
async function handleTmsNuggetsRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, cors);

  const guard = await requireStaffPilotSession(request, env, cors);
  if (guard.response) return guard.response;
  const account = guard.account;

  const tmsStaffId = await getTmsStaffIdForLanternAccount(db, account.username);
  if (!tmsStaffId) {
    return jsonResponse({ ok: false, error: 'tms_identity_not_linked' }, 403, cors);
  }

  let body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch (_) {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
  }

  let result;
  if (path === '/api/tms-nuggets/students/search') {
    result = await callTmsNuggetsBridge(env, 'students/search', tmsStaffId, { query: body.query, limit: body.limit });
  } else if (path === '/api/tms-nuggets/ledger') {
    result = await callTmsNuggetsBridge(env, 'ledger', tmsStaffId, { student_name: body.student_name });
    // Prompt #173 — dashboard aliases for Teacher Student Nugget Dashboard (same TMS totals).
    if (result && result.ok) {
      result.current_balance = result.available;
      result.total_earned = result.earned;
      result.total_spent = result.spent;
    }
  } else if (path === '/api/tms-nuggets/redeem') {
    const note = String(body.note || '').trim();
    if (!note) {
      return jsonResponse({ ok: false, error: 'reason_required' }, 400, cors);
    }
    result = await callTmsNuggetsBridge(env, 'redeem', tmsStaffId, {
      student_name: body.student_name,
      amount: body.amount,
      note,
    });
    if (result && result.ok) {
      result.current_balance = result.available;
      result.total_earned = result.earned;
      result.total_spent = result.spent;
    }
  } else if (path === '/api/tms-nuggets/award') {
    const note = String(body.note || '').trim();
    if (!note) {
      return jsonResponse({ ok: false, error: 'reason_required' }, 400, cors);
    }
    const idem = String(body.idempotency_key || body.reference || '').trim();
    const reference = idem || ('lantern:teacher_award:' + crypto.randomUUID());
    result = await callTmsNuggetsBridge(env, 'award', tmsStaffId, {
      student_name: body.student_name,
      amount: body.amount,
      note,
      reference,
    });
    if (result && result.ok) {
      result.current_balance = result.available;
      result.total_earned = result.earned;
      result.total_spent = result.spent;
    }
  } else {
    return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
  }

  const status = Number.isInteger(result._httpStatus) ? result._httpStatus : result.ok ? 200 : 400;
  delete result._httpStatus;
  return jsonResponse(result, status, cors);
}

/** Fixed, non-interpolated messages only -- `reason` is always one of our own error codes, never raw user input. */
function tmsExchangeFailurePage(reason, cors) {
  // Prompt #203 — product-level wording (no tms_identity_links / SSO jargon).
  const MESSAGES = {
    missing_code: 'This sign-in link is missing its code. Please try again from Behavior Logger.',
    session_not_configured: 'Sign-in is not available right now. Please try again later.',
    bridge_not_configured: 'Sign-in is not available right now. Please try again later.',
    redeem_request_failed: 'Could not verify your sign-in. Please try again.',
    redeem_bad_response: 'Could not verify your sign-in. Please try again.',
    unauthorized: 'This sign-in link could not be verified. Please try again from Behavior Logger.',
    invalid_or_expired_code: 'This sign-in link has expired or was already used. Please try again from Behavior Logger.',
    lantern_account_not_linked: 'Account setup needed. Contact an administrator.',
    no_primary_lantern_link: 'Account setup needed. Contact an administrator.',
    lantern_account_disabled: 'This account is disabled. Contact an administrator.',
    lantern_account_not_staff: 'This account cannot open staff tools.',
    must_change_password: 'Please sign in once to set your password, then try again.',
  };
  const message = MESSAGES[reason] || 'Sign-in failed. Please try again from Behavior Logger.';
  const html =
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Sign in | Lantern</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:2rem auto;' +
    'padding:1rem;font-size:18px;line-height:1.5;color:#1f2937;} a{color:#1e40af;font-weight:600;}</style></head>' +
    '<body><h1>Sign in</h1><p>' +
    message +
    '</p><p><a href="https://log.tmslantern.org/index.html">Back to Behavior Logger</a></p></body></html>';
  return new Response(html, {
    status: 401,
    headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Prompt #94/#203 — redeem TMS handoff + issue Lantern pilot JWT for primary linked staff.
 * Shared by navigation exchange (302) and silent bootstrap (JSON + Set-Cookie).
 * Returns { ok:true, token, username, role } or { ok:false, error }.
 */
async function issueLanternSessionFromTmsHandoff(env, db, codeRaw) {
  const code = String(codeRaw || '').trim();
  if (!code) return { ok: false, error: 'missing_code' };
  const secret = env.PILOT_SESSION_SECRET;
  if (!secret || String(secret).trim() === '') return { ok: false, error: 'session_not_configured' };

  const redeemed = await redeemTmsLanternHandoff(env, code);
  if (!redeemed.ok) return { ok: false, error: redeemed.error || 'invalid_or_expired_code' };

  const primaryRes = await resolvePrimaryLanternUsernameForTmsStaff(db, redeemed.tms_staff_id);
  if (!primaryRes.ok) {
    if (primaryRes.error === 'no_primary') return { ok: false, error: 'no_primary_lantern_link' };
    return { ok: false, error: 'lantern_account_not_linked' };
  }

  const row = await db
    .prepare(
      `SELECT username, display_name, role, student_character_name, teacher_id, mtss_student_id, is_active, must_change_password
       FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
    )
    .bind(primaryRes.lantern_username)
    .first();
  if (!row) return { ok: false, error: 'lantern_account_not_linked' };

  const isActive = row.is_active != null ? Number(row.is_active) : 1;
  if (isActive === 0) return { ok: false, error: 'lantern_account_disabled' };
  if (!isTeacherLike(row.role)) return { ok: false, error: 'lantern_account_not_staff' };
  if (pilotAccountRequiresChangePassword(row)) return { ok: false, error: 'must_change_password' };

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
  return { ok: true, token, username: row.username, role: row.role };
}

async function handleAuthRoutes(request, url, path, env, cors) {
  // S2S roster read — no Lantern D1, no browser session, no CORS.
  if (request.method === 'GET' && path === GEPPETTO_STUDENT_ROSTER_PATH) {
    const s2s = { ...GEPPETTO_S2S_HEADERS };
    const configured = String(env.LANTERN_GEPPETTO_BRIDGE_SECRET || '').trim();
    if (!configured) {
      return jsonResponse({ ok: false, error: 'bridge_not_configured' }, 503, s2s);
    }
    const provided = bearerTokenFromRequest(request);
    if (!provided || !timingSafeEqualStrings(configured, provided)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, s2s);
    }
    const bridge = await callTmsRosterBridge(env, 'roster/list', { include_inactive: false });
    if (!bridge || bridge.ok === false) {
      const status = bridge && bridge._httpStatus ? Number(bridge._httpStatus) || 502 : 502;
      return jsonResponse({ ok: false, error: 'roster_unavailable' }, status, s2s);
    }
    return jsonResponse(buildGeppettoStudentRosterPayload(bridge.students), 200, s2s);
  }

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

  // Prompt #94: TMS -> Lantern staff SSO exchange. Top-level browser GET navigation
  // (redirected here from Behavior Logger with a one-time handoff code), not a fetch/XHR call --
  // CORS is not relevant to this route. Lantern independently re-derives role/access from its
  // OWN account row; a role/capability claim from Behavior Logger is never trusted for authorization.
  if (request.method === 'GET' && path === '/api/auth/tms-exchange') {
    const safeReturn = sanitizeTmsExchangeReturnTarget(url.searchParams.get('return'));
    const code = String(url.searchParams.get('code') || '').trim();
    const issued = await issueLanternSessionFromTmsHandoff(env, db, code);
    if (!issued.ok) return tmsExchangeFailurePage(issued.error, cors);
    const secure = url.protocol === 'https:';
    return new Response(null, {
      status: 302,
      headers: {
        ...cors,
        Location: safeReturn,
        'Set-Cookie': pilotSetCookieHeader(issued.token, secure, PILOT_JWT_TTL_SEC),
        'Cache-Control': 'no-store',
      },
    });
  }

  // Prompt #203 — silent session bootstrap from Behavior Logger (credentialed fetch).
  // Same handoff redemption as tms-exchange; returns JSON + Set-Cookie (no HTML redirect).
  // Origin must be Behavior Logger (corsForPilot + explicit check). Does NOT remember devices.
  if (request.method === 'POST' && path === '/api/auth/tms-bootstrap') {
    const origin = String(request.headers.get('Origin') || '').trim();
    if (!isBehaviorLoggerOrigin(origin) && !origin.startsWith('http://localhost:') && !origin.startsWith('http://127.0.0.1:')) {
      return jsonResponse({ ok: false, error: 'origin_not_allowed' }, 403, cors);
    }
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const code = String(body.code || '').trim();
    const issued = await issueLanternSessionFromTmsHandoff(env, db, code);
    if (!issued.ok) {
      const status =
        issued.error === 'missing_code' || issued.error === 'Invalid JSON'
          ? 400
          : issued.error === 'session_not_configured' || issued.error === 'bridge_not_configured'
            ? 503
            : 401;
      return jsonResponse({ ok: false, error: issued.error }, status, cors);
    }
    const secure = url.protocol === 'https:';
    return jsonResponse(
      { ok: true, username: issued.username, role: issued.role },
      200,
      {
        ...cors,
        'Set-Cookie': pilotSetCookieHeader(issued.token, secure, PILOT_JWT_TTL_SEC),
        'Cache-Control': 'no-store',
      }
    );
  }

  // Prompt #139 — Lantern first-party authorize for TMS device enrollment (linked staff only).
  // Uses existing Lantern session; mints TMS tms_device handoff via bridge; redirects to TMS
  // with a short-lived one-time code (never password / bridge secret / cookie in the URL body
  // beyond the opaque code).
  if (request.method === 'GET' && path === '/api/auth/tms-device-authorize') {
    const safeReturn = sanitizeTmsDeviceAuthorizeReturn(url.searchParams.get('return'));
    const authorizeSelf =
      url.pathname +
      '?return=' +
      encodeURIComponent(url.searchParams.get('return') || safeReturn);
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) {
      const loginLoc = '/login.html?return=' + encodeURIComponent(authorizeSelf);
      return new Response(null, {
        status: 302,
        headers: { ...cors, Location: loginLoc, 'Cache-Control': 'no-store' },
      });
    }
    if (pilotAccountRequiresChangePassword(account)) {
      const cpLoc =
        '/change-password.html?return=' + encodeURIComponent(authorizeSelf);
      return new Response(null, {
        status: 302,
        headers: { ...cors, Location: cpLoc, 'Cache-Control': 'no-store' },
      });
    }
    const isActive = account.is_active != null ? Number(account.is_active) : 1;
    if (isActive === 0) return tmsDeviceAuthorizeFailurePage('lantern_account_disabled', cors);
    if (!isTeacherLike(account.role)) return tmsDeviceAuthorizeFailurePage('lantern_account_not_staff', cors);

    const tmsStaffId = await getTmsStaffIdForLanternAccount(db, account.username);
    if (!tmsStaffId) return tmsDeviceAuthorizeFailurePage('lantern_account_not_linked', cors);

    const minted = await mintTmsDeviceStaffHandoff(
      env,
      tmsStaffId,
      account.username,
      resolvePublicDisplayName(account)
    );
    if (!minted.ok) {
      if (minted.error === 'bridge_not_configured') return tmsDeviceAuthorizeFailurePage('bridge_not_configured', cors);
      if (minted.error === 'staff_not_found') return tmsDeviceAuthorizeFailurePage('staff_not_found', cors);
      if (minted.error === 'mint_request_failed') return tmsDeviceAuthorizeFailurePage('mint_request_failed', cors);
      return tmsDeviceAuthorizeFailurePage('mint_failed', cors);
    }

    const dest = appendLanternStaffCodeToReturn(safeReturn, minted.code);
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: dest, 'Cache-Control': 'no-store' },
    });
  }

  // Prompt #140 — linked-staff check for Remember this device? (no secrets, no password material).
  if (request.method === 'GET' && path === '/api/auth/tms-link-status') {
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) {
      return jsonResponse({ ok: false, authenticated: false, linked: false }, 401, cors);
    }
    if (pilotAccountRequiresChangePassword(account)) {
      return jsonResponse({ ok: false, error: 'must_change_password', linked: false }, 403, cors);
    }
    const role = String(account.role || '').trim().toLowerCase();
    if (!isTeacherLike(account.role)) {
      return jsonResponse({ ok: true, authenticated: true, linked: false, role, staff: false }, 200, cors);
    }
    const tmsStaffId = await getTmsStaffIdForLanternAccount(db, account.username);
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        staff: true,
        role,
        linked: !!tmsStaffId,
        // Never expose bridge secrets; tms_staff_id is the server-resolved link id only.
        tms_staff_id: tmsStaffId || null,
      },
      200,
      cors
    );
  }

  // Geppetto student SSO — first-party authorize. Dedicated handoff table/audience.
  // Do not overload tms-device-authorize or TMS lantern_handoffs.
  if (request.method === 'GET' && path === '/api/auth/geppetto-student-authorize') {
    const safeReturn = sanitizeGeppettoStudentReturn(url.searchParams.get('return'));
    if (!safeReturn) return geppettoStudentAuthorizeFailurePage('return_not_allowed', cors);
    const authorizeSelf =
      url.pathname +
      '?return=' +
      encodeURIComponent(url.searchParams.get('return') || safeReturn);
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) {
      const loginLoc = '/login.html?return=' + encodeURIComponent(authorizeSelf);
      return new Response(null, {
        status: 302,
        headers: { ...cors, Location: loginLoc, 'Cache-Control': 'no-store' },
      });
    }
    if (pilotAccountRequiresChangePassword(account)) {
      const cpLoc = '/change-password.html?return=' + encodeURIComponent(authorizeSelf);
      return new Response(null, {
        status: 302,
        headers: { ...cors, Location: cpLoc, 'Cache-Control': 'no-store' },
      });
    }
    const isActive = account.is_active != null ? Number(account.is_active) : 1;
    if (isActive === 0) return geppettoStudentAuthorizeFailurePage('lantern_account_disabled', cors);
    const role = String(account.role || '').trim().toLowerCase();
    if (role !== 'student') return geppettoStudentAuthorizeFailurePage('lantern_account_not_student', cors);
    const mtssStudentId = account.mtss_student_id != null ? String(account.mtss_student_id).trim() : '';
    if (!mtssStudentId) return geppettoStudentAuthorizeFailurePage('missing_roster_id', cors);

    const minted = await mintGeppettoStudentHandoff(db, {
      lanternUsername: account.username,
      mtssStudentId,
      displayName: await resolveGeppettoStudentDisplayName(db, account),
    });
    if (!minted.ok) {
      if (minted.error === 'missing_roster_id') return geppettoStudentAuthorizeFailurePage('missing_roster_id', cors);
      return geppettoStudentAuthorizeFailurePage('mint_failed', cors);
    }
    const dest = appendHandoffCodeToReturn(safeReturn, minted.code);
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: dest, 'Cache-Control': 'no-store' },
    });
  }

  // Server-to-server redeem. Bearer LANTERN_GEPPETTO_BRIDGE_SECRET only.
  if (request.method === 'POST' && path === '/api/auth/geppetto-student-handoff/redeem') {
    const configured = String(env.LANTERN_GEPPETTO_BRIDGE_SECRET || '').trim();
    if (!configured) {
      return jsonResponse({ ok: false, error: 'bridge_not_configured' }, 503, cors);
    }
    const provided = bearerTokenFromRequest(request);
    if (!provided || !timingSafeEqualStrings(configured, provided)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, cors);
    }
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const redeemed = await redeemGeppettoStudentHandoff(
      db,
      body && body.code,
      body && body.audience ? body.audience : GEPPETTO_STUDENT_AUDIENCE
    );
    if (!redeemed.ok) {
      const status =
        redeemed.error === 'missing_code' || redeemed.error === 'Invalid JSON'
          ? 400
          : redeemed.error === 'wrong_audience'
            ? 403
            : 401;
      return jsonResponse({ ok: false, error: redeemed.error }, status, cors);
    }
    return jsonResponse(
      {
        ok: true,
        audience: redeemed.audience,
        mtss_student_id: redeemed.mtss_student_id,
        lantern_username: redeemed.lantern_username,
        display_name: redeemed.display_name,
      },
      200,
      cors
    );
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

  if (request.method === 'POST' && path === '/api/admin/staff-starter-nuggets') {
    return handleStaffStarterNuggets(request, env, cors, account);
  }

  if (request.method === 'GET' && path === '/api/admin/users') {
    // Prompt #136 — ensure any teacher/admin missing a Staff ID gets one (never reuses).
    try {
      await ensureStaffIdsAllocated(db);
    } catch (_) {
      /* list still proceeds; create path also allocates */
    }
    const rows = await db
      .prepare(
        `SELECT username, display_name, first_name, last_name, honorific, public_display_name, staff_id, email, role, student_character_name, teacher_id, mtss_student_id, is_active, updated_at, must_change_password, password_reset_at, password_reset_by FROM lantern_pilot_accounts ORDER BY username`
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
    // Client must never choose Staff ID.
    if (body.staff_id !== undefined && body.staff_id !== null && String(body.staff_id).trim() !== '') {
      return jsonResponse({ ok: false, error: 'staff_id_not_assignable' }, 400, cors);
    }
    const u = String(body.username || '').trim();
    const role = String(body.role || 'student').trim();
    if (!u) {
      return jsonResponse({ ok: false, error: 'username_required' }, 400, cors);
    }
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return jsonResponse({ ok: false, error: 'invalid_role' }, 400, cors);
    }

    let displayName;
    let firstName = null;
    let lastName = null;
    let staffId = null;
    let email = null;
    let honorific = null;
    let publicDisplayName = null;
    let passwordPlain = String(body.password || '');
    let generatedTempPassword = null;
    let deferCredentials = body.defer_credentials === true || body.uninitialized_password === true;

    if (isStaffAccountRole(role)) {
      const fnCheck = validateStaffNamePart(body.first_name, 'first_name', { required: true });
      if (!fnCheck.ok) {
        return jsonResponse({ ok: false, error: fnCheck.error, max: fnCheck.max }, 400, cors);
      }
      const lnCheck = validateStaffNamePart(body.last_name, 'last_name', { required: true });
      if (!lnCheck.ok) {
        return jsonResponse({ ok: false, error: lnCheck.error, max: lnCheck.max }, 400, cors);
      }
      // Prompt #220/#2 — new staff require an explicit honorific (Mr./Miss/Ms./Mrs./SRO).
      const honCheck = validateStaffHonorific(body.honorific, { required: true });
      if (!honCheck.ok) {
        return jsonResponse({ ok: false, error: honCheck.error }, 400, cors);
      }
      // Prompt #223 — optional public display override (exact; blank → Honorific + Last).
      const pdnCheck = validateStaffPublicDisplayName(body.public_display_name);
      if (!pdnCheck.ok) {
        return jsonResponse({ ok: false, error: pdnCheck.error, max: pdnCheck.max }, 400, cors);
      }
      firstName = fnCheck.value;
      lastName = lnCheck.value;
      honorific = honCheck.value;
      publicDisplayName = pdnCheck.value;
      displayName = composeStaffDisplayName(firstName, lastName);
      const dnCheck = validateDisplayName(displayName, { required: true });
      if (!dnCheck.ok) {
        return jsonResponse({ ok: false, error: dnCheck.error, max: dnCheck.max }, 400, cors);
      }
      displayName = dnCheck.value;
      const emailCheck = validateStaffEmail(body.email, { required: false });
      if (!emailCheck.ok) {
        return jsonResponse({ ok: false, error: emailCheck.error, max: emailCheck.max }, 400, cors);
      }
      email = emailCheck.value;
      try {
        staffId = await allocateStaffId(db);
      } catch (_) {
        return jsonResponse({ ok: false, error: 'staff_id_allocation_failed' }, 500, cors);
      }
      if (!deferCredentials && (!passwordPlain || passwordPlain.length < 8)) {
        generatedTempPassword = generateStaffTempPassword();
        passwordPlain = generatedTempPassword;
      }
    } else {
      // Prompt #197 — student Lantern login create may omit password; server issues one-time temp PW.
      const dnCheck = validateDisplayName(body.display_name, { required: true });
      if (!dnCheck.ok) {
        return jsonResponse({ ok: false, error: dnCheck.error, max: dnCheck.max }, 400, cors);
      }
      displayName = dnCheck.value;
      if (body.first_name != null || body.last_name != null) {
        const fnOpt = validateStaffNamePart(body.first_name, 'first_name', { required: false });
        if (!fnOpt.ok) {
          return jsonResponse({ ok: false, error: fnOpt.error, max: fnOpt.max }, 400, cors);
        }
        const lnOpt = validateStaffNamePart(body.last_name, 'last_name', { required: false });
        if (!lnOpt.ok) {
          return jsonResponse({ ok: false, error: lnOpt.error, max: lnOpt.max }, 400, cors);
        }
        firstName = fnOpt.value;
        lastName = lnOpt.value;
      }
      if (!passwordPlain || passwordPlain.length < 8) {
        generatedTempPassword = generateStaffTempPassword();
        passwordPlain = generatedTempPassword;
      }
    }

    if (!publicDisplayName) {
      publicDisplayName =
        defaultPublicDisplayName({
          username: u,
          role,
          first_name: firstName,
          last_name: lastName,
          honorific,
          display_name: displayName,
        }) || null;
    }

    let salt = null;
    let hash = null;
    let mustChange = 0;
    let resetAt = null;
    let resetBy = null;
    if (!(isStaffAccountRole(role) && deferCredentials)) {
      salt = pilotRandomSaltHex();
      hash = await pilotHashPassword(passwordPlain, salt);
      mustChange = 1;
      resetAt = null; // set via datetime in SQL
      resetBy = String(account.username || '').trim() || 'admin';
    }
    const scn = body.student_character_name != null ? String(body.student_character_name).trim() : null;
    const tid = body.teacher_id != null ? String(body.teacher_id).trim() : null;
    const mtssId =
      body.mtss_student_id != null && String(body.mtss_student_id).trim() !== ''
        ? String(body.mtss_student_id).trim()
        : null;
    const adminUsername = String(account.username || '').trim() || 'admin';
    if (email) {
      const clash = await db
        .prepare(
          `SELECT username FROM lantern_pilot_accounts WHERE lower(trim(email)) = lower(trim(?)) LIMIT 1`
        )
        .bind(email)
        .first();
      if (clash && String(clash.username) !== u) {
        return jsonResponse({ ok: false, error: 'email_taken' }, 409, cors);
      }
    }
    const ins = await db
      .prepare(
        `INSERT INTO lantern_pilot_accounts (username, display_name, first_name, last_name, honorific, public_display_name, staff_id, email, role, password_hash, password_salt, student_character_name, teacher_id, mtss_student_id, updated_at, is_active, must_change_password, password_reset_at, password_reset_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END, ?)`
      )
      .bind(
        u,
        displayName,
        firstName,
        lastName,
        honorific,
        publicDisplayName,
        staffId,
        email,
        role,
        hash,
        salt,
        scn || null,
        tid || null,
        mtssId,
        mustChange,
        mustChange,
        mustChange ? adminUsername : null
      )
      .run();
    if (!ins.success) {
      return jsonResponse({ ok: false, error: 'insert_failed' }, 500, cors);
    }
    if (isStaffAccountRole(role)) {
      if (honorific) await propagateHonorificToLinkedAccounts(db, u, honorific);
      await propagatePublicDisplayNameToLinkedAccounts(db, u, publicDisplayName);
    }
    const created = await fetchAdminUserRow(db, u);
    const payload = {
      ok: true,
      username: u,
      user: created || {
        username: u,
        staff_id: staffId,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        honorific,
        public_display_name: publicDisplayName,
        email,
      },
    };
    // Prompt #111 — new ordinary staff: auto provision BL compatibility identity (idempotent).
    // Cross-DB: Lantern row already committed; BL provision failure does not roll back the account.
    if (isStaffAccountRole(role) && staffId) {
      try {
        const blCompat = await ensureBlCompatIdentityForLanternStaff(
          env,
          db,
          created || {
            username: u,
            staff_id: staffId,
            display_name: displayName,
            first_name: firstName,
            last_name: lastName,
            email,
            role,
            is_active: 1,
          },
          { createdBy: adminUsername }
        );
        payload.bl_compat = {
          ok: !!blCompat.ok,
          tms_staff_id: blCompat.tms_staff_id || null,
          created: !!blCompat.created,
          linked: !!blCompat.linked,
          error: blCompat.ok ? null : blCompat.error || 'bl_compat_failed',
        };
      } catch (_) {
        payload.bl_compat = { ok: false, error: 'bl_compat_exception' };
      }
    }
    if (generatedTempPassword) {
      payload.temporary_password = generatedTempPassword;
      payload.must_change_password = true;
    }
    if (deferCredentials) {
      payload.credentials_deferred = true;
      payload.must_change_password = false;
    }
    return jsonResponse(payload, 200, cors);
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
    // Staff ID is immutable — reject any client attempt to set/change it.
    if (body.staff_id !== undefined) {
      return jsonResponse({ ok: false, error: 'staff_id_immutable' }, 400, cors);
    }
    const existing = await db
      .prepare(
        `SELECT username, role, staff_id, first_name, last_name, honorific, public_display_name, display_name, email, is_active FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
      )
      .bind(u)
      .first();
    if (!existing) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
    }
    const targetUser = String(existing.username);
    const priorActive = existing.is_active != null ? Number(existing.is_active) : 1;
    let becameActive = false;
    let becameStaff = false;
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
    } else if (body.must_change_password !== undefined) {
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET must_change_password = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(body.must_change_password ? 1 : 0, targetUser)
        .run();
    }

    const wantsFirst = body.first_name !== undefined;
    const wantsLast = body.last_name !== undefined;
    if (wantsFirst || wantsLast) {
      const fnCheck = validateStaffNamePart(
        wantsFirst ? body.first_name : existing.first_name,
        'first_name',
        { required: true }
      );
      if (!fnCheck.ok) {
        return jsonResponse({ ok: false, error: fnCheck.error, max: fnCheck.max }, 400, cors);
      }
      const lnCheck = validateStaffNamePart(wantsLast ? body.last_name : existing.last_name, 'last_name', {
        required: true,
      });
      if (!lnCheck.ok) {
        return jsonResponse({ ok: false, error: lnCheck.error, max: lnCheck.max }, 400, cors);
      }
      const composed = composeStaffDisplayName(fnCheck.value, lnCheck.value);
      const dnCheck = validateDisplayName(composed, { required: true });
      if (!dnCheck.ok) {
        return jsonResponse({ ok: false, error: dnCheck.error, max: dnCheck.max }, 400, cors);
      }
      await db
        .prepare(
          `UPDATE lantern_pilot_accounts SET first_name = ?, last_name = ?, display_name = ?, updated_at = datetime('now') WHERE username = ?`
        )
        .bind(fnCheck.value, lnCheck.value, dnCheck.value, targetUser)
        .run();
    } else if (body.display_name != null) {
      // Compatibility: allow display_name-only updates (students / legacy callers).
      const dnCheck = validateDisplayName(body.display_name, { required: true });
      if (!dnCheck.ok) {
        return jsonResponse({ ok: false, error: dnCheck.error, max: dnCheck.max }, 400, cors);
      }
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET display_name = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(dnCheck.value, targetUser)
        .run();
    }

    if (body.email !== undefined && isStaffAccountRole(existing.role)) {
      const emailCheck = validateStaffEmail(body.email, { required: false });
      if (!emailCheck.ok) {
        return jsonResponse({ ok: false, error: emailCheck.error, max: emailCheck.max }, 400, cors);
      }
      if (emailCheck.value) {
        const clash = await db
          .prepare(
            `SELECT username FROM lantern_pilot_accounts WHERE lower(trim(email)) = lower(trim(?)) AND lower(trim(username)) != lower(trim(?)) LIMIT 1`
          )
          .bind(emailCheck.value, targetUser)
          .first();
        if (clash) {
          return jsonResponse({ ok: false, error: 'email_taken' }, 409, cors);
        }
      }
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET email = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(emailCheck.value, targetUser)
        .run();
    }

    // Prompt #220 — honorific is optional on update (existing staff may remain unset until Admin fills it).
    if (body.honorific !== undefined && isStaffAccountRole(existing.role)) {
      const honCheck = validateStaffHonorific(body.honorific, { required: false });
      if (!honCheck.ok) {
        return jsonResponse({ ok: false, error: honCheck.error }, 400, cors);
      }
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET honorific = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(honCheck.value, targetUser)
        .run();
      await propagateHonorificToLinkedAccounts(db, targetUser, honCheck.value);
    }

    // Prompt #147 — public_display_name override for any human account (staff or student).
    if (body.public_display_name !== undefined) {
      const pdnCheck = validateStaffPublicDisplayName(body.public_display_name);
      if (!pdnCheck.ok) {
        return jsonResponse({ ok: false, error: pdnCheck.error, max: pdnCheck.max }, 400, cors);
      }
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET public_display_name = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(pdnCheck.value, targetUser)
        .run();
      await propagatePublicDisplayNameToLinkedAccounts(db, targetUser, pdnCheck.value);
    }

    if (body.role != null) {
      const role = String(body.role).trim();
      if (!['student', 'teacher', 'admin'].includes(role)) {
        return jsonResponse({ ok: false, error: 'invalid_role' }, 400, cors);
      }
      await db.prepare(`UPDATE lantern_pilot_accounts SET role = ?, updated_at = datetime('now') WHERE username = ?`).bind(role, targetUser).run();
      // Promote student → staff: allocate Staff ID if missing. Demote → clear staff_id on row (alloc row keeps ID reserved).
      if (isStaffAccountRole(role)) {
        if (!isStaffAccountRole(existing.role)) becameStaff = true;
        const cur = await db
          .prepare(`SELECT staff_id FROM lantern_pilot_accounts WHERE username = ?`)
          .bind(targetUser)
          .first();
        if (!cur || cur.staff_id == null) {
          try {
            const sid = await allocateStaffId(db);
            await db
              .prepare(`UPDATE lantern_pilot_accounts SET staff_id = ?, updated_at = datetime('now') WHERE username = ? AND staff_id IS NULL`)
              .bind(sid, targetUser)
              .run();
          } catch (_) {
            return jsonResponse({ ok: false, error: 'staff_id_allocation_failed' }, 500, cors);
          }
        }
      } else if (String(existing.role || '').trim().toLowerCase() !== 'student') {
        await db
          .prepare(`UPDATE lantern_pilot_accounts SET staff_id = NULL, first_name = NULL, last_name = NULL, updated_at = datetime('now') WHERE username = ?`)
          .bind(targetUser)
          .run();
      }
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
      const nextActive = body.is_active ? 1 : 0;
      if (nextActive === 1 && priorActive === 0) becameActive = true;
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET is_active = ?, updated_at = datetime('now') WHERE username = ?`)
        .bind(nextActive, targetUser)
        .run();
    }
    const updated = await fetchAdminUserRow(db, targetUser);
    const responsePayload = { ok: true, user: updated || { username: targetUser } };
    // Prompt #111 — activate or promote-to-staff: ensure BL compat link (idempotent; never for students).
    if (updated && isStaffAccountRole(updated.role) && (becameActive || becameStaff)) {
      try {
        const blCompat = await ensureBlCompatIdentityForLanternStaff(env, db, updated, {
          createdBy: adminUsername,
        });
        responsePayload.bl_compat = {
          ok: !!blCompat.ok,
          tms_staff_id: blCompat.tms_staff_id || null,
          created: !!blCompat.created,
          linked: !!blCompat.linked,
          error: blCompat.ok ? null : blCompat.error || 'bl_compat_failed',
        };
      } catch (_) {
        responsePayload.bl_compat = { ok: false, error: 'bl_compat_exception' };
      }
    }
    return jsonResponse(responsePayload, 200, cors);
  }

  // Prompt #211 — System Admin set/replace avatar for any account (0 Nuggets; no economy path).
  if (request.method === 'GET' && path === '/api/admin/avatar/status') {
    const username = String(url.searchParams.get('username') || '').trim();
    if (!username) {
      return jsonResponse({ ok: false, error: 'username_required' }, 400, cors);
    }
    const target = await db
      .prepare(
        `SELECT username, role, mtss_student_id, student_character_name, staff_id, is_active
         FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?)) LIMIT 1`
      )
      .bind(username)
      .first();
    if (!target) {
      return jsonResponse({ ok: false, error: 'account_not_found' }, 404, cors);
    }
    const characterName = avatarCharacterNameForPilotAccount(target);
    if (!characterName) {
      return jsonResponse({ ok: false, error: 'avatar_identity_unavailable' }, 400, cors);
    }
    const profile = await db
      .prepare(`SELECT current_avatar_key, updated_at FROM lantern_avatar_profiles WHERE character_name = ?`)
      .bind(characterName)
      .first();
    const origin = new URL(request.url).origin;
    const activeV = profile && profile.updated_at
      ? String(profile.updated_at).replace(/[^\d]/g, '').slice(0, 14)
      : '';
    const activeImage = profile && profile.current_avatar_key
      ? (origin + '/api/avatar/image?key=' + encodeURIComponent(profile.current_avatar_key) + (activeV ? ('&v=' + encodeURIComponent(activeV)) : ''))
      : null;
    return jsonResponse(
      {
        ok: true,
        username: String(target.username),
        role: String(target.role || ''),
        character_name: characterName,
        staff_id: target.staff_id != null ? String(target.staff_id) : null,
        is_active: Number(target.is_active) === 1 ? 1 : 0,
        active_image: activeImage,
        current_avatar_key: profile && profile.current_avatar_key ? String(profile.current_avatar_key) : null,
        updated_at: profile && profile.updated_at ? String(profile.updated_at) : null,
      },
      200,
      cors
    );
  }

  if (request.method === 'POST' && path === '/api/admin/avatar/set') {
    const bucket = env.AVATAR_BUCKET;
    if (!bucket) {
      return jsonResponse({ ok: false, error: 'Avatar bucket not configured' }, 503, cors);
    }
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    // Never honor client economy/privilege flags — admin session alone authorizes zero-cost set.
    const username = String(body.username || '').trim();
    if (!username) {
      return jsonResponse({ ok: false, error: 'username_required' }, 400, cors);
    }
    const target = await db
      .prepare(
        `SELECT username, role, mtss_student_id, student_character_name, staff_id, is_active
         FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?)) LIMIT 1`
      )
      .bind(username)
      .first();
    if (!target) {
      return jsonResponse({ ok: false, error: 'account_not_found' }, 404, cors);
    }
    const characterName = avatarCharacterNameForPilotAccount(target);
    if (!characterName) {
      return jsonResponse({ ok: false, error: 'avatar_identity_unavailable' }, 400, cors);
    }
    const imageData = body.image;
    if (!imageData || typeof imageData !== 'string') {
      return jsonResponse({ ok: false, error: 'Missing image' }, 400, cors);
    }
    const base64 = stripBase64Payload(imageData);
    if (!base64) {
      return jsonResponse({ ok: false, error: 'Missing image payload' }, 400, cors);
    }
    let bytes;
    try {
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid base64 image' }, 400, cors);
    }
    if (bytes.length < 32) {
      return jsonResponse({ ok: false, error: 'Image too small' }, 400, cors);
    }
    if (bytes.length > 5 * 1024 * 1024) {
      return jsonResponse({ ok: false, error: 'Image too large (max 5MB)' }, 400, cors);
    }
    const id = 'av-' + crypto.randomUUID();
    const key = 'avatars/' + id + '.png';
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
    const now = new Date().toISOString();
    const adminLabel = adminAuditLabel(account);
    // Direct administrative assignment: approved + equipped immediately. No Nugget path.
    await db
      .prepare(
        `INSERT INTO lantern_avatar_submissions (id, character_name, image_key, status, created_at, approved_at, approved_by)
         VALUES (?, ?, ?, 'approved', ?, ?, ?)`
      )
      .bind(id, characterName, key, now, now, adminLabel)
      .run();
    await db
      .prepare(
        `INSERT INTO lantern_avatar_profiles (character_name, current_avatar_key, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(character_name) DO UPDATE SET
           current_avatar_key = excluded.current_avatar_key,
           updated_at = excluded.updated_at`
      )
      .bind(characterName, key, now)
      .run();
    // Supersede any pending submissions for this identity (admin decision is final).
    try {
      await db
        .prepare(
          `UPDATE lantern_avatar_submissions
           SET status = 'rejected', rejected_at = ?, rejected_by = ?, rejected_reason = ?
           WHERE character_name = ? AND status = 'pending' AND id != ?`
        )
        .bind(now, adminLabel, 'Superseded by System Admin avatar assignment', characterName, id)
        .run();
    } catch (_) {}
    const origin = new URL(request.url).origin;
    const activeV = String(now).replace(/[^\d]/g, '').slice(0, 14);
    const activeImage =
      origin + '/api/avatar/image?key=' + encodeURIComponent(key) + (activeV ? ('&v=' + encodeURIComponent(activeV)) : '');
    return jsonResponse(
      {
        ok: true,
        username: String(target.username),
        role: String(target.role || ''),
        character_name: characterName,
        submission_id: id,
        image_key: key,
        active_image: activeImage,
        admin_set: true,
        nugget_charged: 0,
        approved_by: adminLabel,
      },
      200,
      cors
    );
  }

  // Prompt #94/#184: explicit TMS ↔ Lantern staff identity links (admin-created ONLY).
  // Cardinality: one TMS staff → many Lantern accounts; one Lantern account → at most one TMS.
  // Reverse SSO uses is_primary (at most one primary per tms_staff_id).
  if (request.method === 'GET' && path === '/api/admin/tms-identity-links') {
    let rows;
    try {
      rows = await db
        .prepare(
          `SELECT l.id, l.tms_staff_id, l.lantern_username, l.lantern_staff_id, l.is_primary,
                  l.created_at, l.created_by,
                  a.display_name, a.role, a.is_active
           FROM tms_identity_links l
           LEFT JOIN lantern_pilot_accounts a ON a.username = l.lantern_username
           ORDER BY l.tms_staff_id, CASE WHEN l.is_primary = 1 THEN 0 ELSE 1 END, l.lantern_username`
        )
        .all();
    } catch (_) {
      // Pre-migration 063 fallback.
      rows = await db
        .prepare(
          `SELECT l.tms_staff_id, l.lantern_username, l.created_at, l.created_by,
                  a.display_name, a.role, a.is_active
           FROM tms_identity_links l
           LEFT JOIN lantern_pilot_accounts a ON a.username = l.lantern_username
           ORDER BY l.tms_staff_id`
        )
        .all();
    }
    return jsonResponse({ ok: true, links: rows.results || [] }, 200, cors);
  }

  // Prompt #201 — Lantern Admin → TMS Device Access + System Administration ops.
  // Gate: Lantern admin session (same as other /api/admin/*). Forwards allowlisted actions
  // via lantern-bridge admin/action (no schema change; no staff-account mutations).
  if (request.method === 'POST' && path === '/api/admin/tms-ops') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const action = String(body.action || '').trim();
    if (!action) return jsonResponse({ ok: false, error: 'action_required' }, 400, cors);
    const bridge = await callTmsRosterBridge(env, 'admin/action', body);
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        { ok: false, error: bridge.error || 'bridge_failed', code: bridge.code || null, action },
        status,
        cors
      );
    }
    const { _httpStatus, ...rest } = bridge;
    return jsonResponse(rest, 200, cors);
  }

  // Prompt #197 — Behavior Logger staff directory for Staff link picker + Needs Attention.
  // Composes existing TMS staff table via lantern-bridge staff/list + tms_identity_links.
  if (request.method === 'GET' && path === '/api/admin/tms-staff') {
    const bridge = await callTmsRosterBridge(env, 'staff/list', {});
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        { ok: false, error: bridge.error || 'bridge_failed', code: bridge.code || null },
        status,
        cors
      );
    }
    let linkRows;
    try {
      linkRows = await db
        .prepare(
          `SELECT id, tms_staff_id, lantern_username, is_primary FROM tms_identity_links`
        )
        .all();
    } catch (_) {
      linkRows = await db
        .prepare(`SELECT tms_staff_id, lantern_username FROM tms_identity_links`)
        .all();
    }
    const links = linkRows.results || [];
    const byTms = {};
    links.forEach((l) => {
      const tid = String(l.tms_staff_id || '').trim();
      if (!tid) return;
      if (!byTms[tid]) byTms[tid] = [];
      byTms[tid].push({
        id: l.id != null ? Number(l.id) : null,
        lantern_username: String(l.lantern_username || '').trim(),
        is_primary: Number(l.is_primary) === 1 ? 1 : 0,
      });
    });
    const staff = (Array.isArray(bridge.staff) ? bridge.staff : []).map((s) => {
      const tid = String(s.tms_staff_id || '').trim();
      const linked = byTms[tid] || [];
      return {
        tms_staff_id: tid,
        teacher_name: String(s.teacher_name || '').trim(),
        teacher_email: String(s.teacher_email || '').trim(),
        role: String(s.role || '').trim(),
        is_admin: !!s.is_admin,
        report_maker: !!s.report_maker,
        link_count: linked.length,
        lantern_usernames: linked.map((x) => x.lantern_username).filter(Boolean),
        has_primary: linked.some((x) => x.is_primary === 1),
        lantern_linked: linked.length > 0,
      };
    });
    const needsAttention = staff.filter((s) => !s.lantern_linked);
    return jsonResponse(
      {
        ok: true,
        staff,
        needs_attention: needsAttention,
        counts: {
          total: staff.length,
          linked: staff.filter((s) => s.lantern_linked).length,
          needs_attention: needsAttention.length,
        },
      },
      200,
      cors
    );
  }

  // Prompt #163 — SYSTEM_ADMIN-equivalent Lantern Admin toggles REPORT_MAKER on a linked TMS staff.
  if (request.method === 'POST' && path === '/api/admin/staff-reporting-access') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    let tmsStaffId = String(body.tms_staff_id || '').trim();
    const lanternUsername = String(body.lantern_username || '').trim();
    if (!tmsStaffId && lanternUsername) {
      tmsStaffId = (await getTmsStaffIdForLanternAccount(db, lanternUsername)) || '';
    }
    if (!tmsStaffId) {
      return jsonResponse({ ok: false, error: 'missing_tms_staff_id' }, 400, cors);
    }
    const want =
      body.report_maker === true ||
      body.report_maker === 1 ||
      body.report_maker === '1' ||
      body.report_maker === 'true';
    const bridge = await callTmsRosterBridge(env, 'staff/set-reporting-access', {
      tms_staff_id: tmsStaffId,
      report_maker: want,
    });
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        { ok: false, error: bridge.error || 'bridge_failed', code: bridge.code || null, message: bridge.message || null },
        status,
        cors
      );
    }
    return jsonResponse(
      {
        ok: true,
        tms_staff_id: tmsStaffId,
        report_maker: !!bridge.report_maker,
        capabilities: Array.isArray(bridge.capabilities) ? bridge.capabilities : null,
      },
      200,
      cors
    );
  }

  if (request.method === 'POST' && path === '/api/admin/tms-identity-links/primary') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const linkId = body.id != null && String(body.id).trim() !== '' ? Number(body.id) : 0;
    const lanternUsername = String(body.lantern_username || '').trim();
    let targetLink = null;
    if (Number.isFinite(linkId) && linkId > 0) {
      targetLink = await db
        .prepare(`SELECT id, tms_staff_id, lantern_username, is_primary FROM tms_identity_links WHERE id = ?`)
        .bind(Math.floor(linkId))
        .first();
    } else if (lanternUsername) {
      targetLink = await db
        .prepare(
          `SELECT id, tms_staff_id, lantern_username, is_primary FROM tms_identity_links
           WHERE lower(trim(lantern_username)) = lower(trim(?))`
        )
        .bind(lanternUsername)
        .first();
    } else {
      return jsonResponse({ ok: false, error: 'missing_link_id' }, 400, cors);
    }
    if (!targetLink || !targetLink.id) {
      return jsonResponse({ ok: false, error: 'link_not_found' }, 404, cors);
    }
    const tmsStaffId = String(targetLink.tms_staff_id || '').trim();
    await db.batch([
      db.prepare(`UPDATE tms_identity_links SET is_primary = 0 WHERE tms_staff_id = ?`).bind(tmsStaffId),
      db.prepare(`UPDATE tms_identity_links SET is_primary = 1 WHERE id = ?`).bind(Number(targetLink.id)),
    ]);
    return jsonResponse(
      {
        ok: true,
        id: Number(targetLink.id),
        tms_staff_id: tmsStaffId,
        lantern_username: String(targetLink.lantern_username || ''),
        is_primary: 1,
      },
      200,
      cors
    );
  }

  if (request.method === 'POST' && path === '/api/admin/tms-identity-links') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const tmsStaffId = String(body.tms_staff_id || '').trim();
    const lanternUsername = String(body.lantern_username || '').trim();
    const makePrimary = body.make_primary === true || body.make_primary === 1 || body.make_primary === '1';
    if (!tmsStaffId || tmsStaffId.length > 128) {
      return jsonResponse({ ok: false, error: 'invalid_tms_staff_id' }, 400, cors);
    }
    if (!lanternUsername) {
      return jsonResponse({ ok: false, error: 'invalid_lantern_username' }, 400, cors);
    }
    const target = await db
      .prepare(`SELECT username, role, is_active, staff_id FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`)
      .bind(lanternUsername)
      .first();
    if (!target) {
      return jsonResponse({ ok: false, error: 'lantern_account_not_found' }, 404, cors);
    }
    if (!isTeacherLike(target.role)) {
      return jsonResponse({ ok: false, error: 'lantern_account_not_staff' }, 400, cors);
    }
    const targetActive = target.is_active != null ? Number(target.is_active) : 1;
    if (targetActive === 0) {
      return jsonResponse({ ok: false, error: 'lantern_account_inactive' }, 400, cors);
    }
    const adminUsername = String(account.username || '').trim() || 'admin';
    const lanternStaffId = target.staff_id != null && Number(target.staff_id) > 0 ? Math.floor(Number(target.staff_id)) : null;
    const existingCountRow = await db
      .prepare(`SELECT COUNT(*) AS n FROM tms_identity_links WHERE tms_staff_id = ?`)
      .bind(tmsStaffId)
      .first();
    const existingCount = existingCountRow ? Number(existingCountRow.n) || 0 : 0;
    const isPrimary = existingCount === 0 || makePrimary ? 1 : 0;
    try {
      if (isPrimary === 1 && existingCount > 0) {
        await db.prepare(`UPDATE tms_identity_links SET is_primary = 0 WHERE tms_staff_id = ?`).bind(tmsStaffId).run();
      }
      await db
        .prepare(
          `INSERT INTO tms_identity_links (tms_staff_id, lantern_username, lantern_staff_id, is_primary, created_at, created_by)
           VALUES (?, ?, ?, ?, datetime('now'), ?)`
        )
        .bind(tmsStaffId, target.username, lanternStaffId, isPrimary, adminUsername)
        .run();
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '';
      if (/UNIQUE constraint failed/i.test(msg)) {
        return jsonResponse({ ok: false, error: 'link_already_exists' }, 409, cors);
      }
      throw e;
    }
    return jsonResponse(
      {
        ok: true,
        tms_staff_id: tmsStaffId,
        lantern_username: target.username,
        lantern_staff_id: lanternStaffId,
        is_primary: isPrimary,
      },
      200,
      cors
    );
  }

  if (request.method === 'DELETE' && path === '/api/admin/tms-identity-links') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      body = {};
    }
    const linkId = body.id != null && String(body.id).trim() !== '' ? Number(body.id) : 0;
    const lanternUsername = String(body.lantern_username || url.searchParams.get('lantern_username') || '').trim();
    const replacementUsername = String(body.replacement_lantern_username || '').trim();
    let targetLink = null;
    if (Number.isFinite(linkId) && linkId > 0) {
      targetLink = await db
        .prepare(`SELECT id, tms_staff_id, lantern_username, is_primary FROM tms_identity_links WHERE id = ?`)
        .bind(Math.floor(linkId))
        .first();
    } else if (lanternUsername) {
      targetLink = await db
        .prepare(
          `SELECT id, tms_staff_id, lantern_username, is_primary FROM tms_identity_links
           WHERE lower(trim(lantern_username)) = lower(trim(?))`
        )
        .bind(lanternUsername)
        .first();
    } else {
      // Prompt #184 — refuse bulk delete-by-tms_staff_id (would wipe all Lantern links).
      return jsonResponse({ ok: false, error: 'missing_link_id' }, 400, cors);
    }
    if (!targetLink || !targetLink.id) {
      return jsonResponse({ ok: false, error: 'link_not_found' }, 404, cors);
    }
    const tmsStaffId = String(targetLink.tms_staff_id || '').trim();
    const wasPrimary = Number(targetLink.is_primary) === 1;
    const siblings = await db
      .prepare(
        `SELECT id, lantern_username, is_primary FROM tms_identity_links
         WHERE tms_staff_id = ? AND id != ?
         ORDER BY lantern_username`
      )
      .bind(tmsStaffId, Number(targetLink.id))
      .all();
    const otherLinks = siblings.results || [];
    if (wasPrimary && otherLinks.length > 0) {
      if (!replacementUsername) {
        return jsonResponse(
          {
            ok: false,
            error: 'replacement_primary_required',
            remaining: otherLinks.map((r) => String(r.lantern_username || '')),
          },
          400,
          cors
        );
      }
      const replacement = otherLinks.find(
        (r) => String(r.lantern_username || '').trim().toLowerCase() === replacementUsername.toLowerCase()
      );
      if (!replacement) {
        return jsonResponse({ ok: false, error: 'replacement_primary_not_found' }, 400, cors);
      }
      await db.batch([
        db.prepare(`DELETE FROM tms_identity_links WHERE id = ?`).bind(Number(targetLink.id)),
        db.prepare(`UPDATE tms_identity_links SET is_primary = 0 WHERE tms_staff_id = ?`).bind(tmsStaffId),
        db.prepare(`UPDATE tms_identity_links SET is_primary = 1 WHERE id = ?`).bind(Number(replacement.id)),
      ]);
      return jsonResponse(
        {
          ok: true,
          deleted: true,
          id: Number(targetLink.id),
          new_primary_lantern_username: String(replacement.lantern_username || ''),
        },
        200,
        cors
      );
    }
    const del = await db.prepare(`DELETE FROM tms_identity_links WHERE id = ?`).bind(Number(targetLink.id)).run();
    const changed = typeof del.meta?.changes === 'number' ? del.meta.changes : 0;
    return jsonResponse(
      {
        ok: true,
        deleted: changed > 0,
        id: Number(targetLink.id),
        lantern_username: String(targetLink.lantern_username || ''),
      },
      200,
      cors
    );
  }

  // Prompt #127 — Admin TMS student roster / account readiness (bridge to authoritative TMS students).
  if (request.method === 'GET' && path === '/api/admin/tms-roster') {
    const includeInactive =
      url.searchParams.get('include_inactive') === '1' || url.searchParams.get('include_inactive') === 'true';
    const bridge = await callTmsRosterBridge(env, 'roster/list', { include_inactive: includeInactive });
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        { ok: false, error: bridge.error || 'bridge_failed', code: bridge.code || null },
        status,
        cors
      );
    }
    const tmsStudents = Array.isArray(bridge.students) ? bridge.students : [];
    const acctRows = await db
      .prepare(
        `SELECT username, display_name, public_display_name, role, mtss_student_id, is_active, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(role)) = 'student'`
      )
      .all();
    const studentAccounts = (acctRows.results || []).map((r) => ({
      username: String(r.username || '').trim(),
      display_name: String(r.display_name || '').trim(),
      public_display_name: r.public_display_name != null ? String(r.public_display_name).trim() : '',
      role: String(r.role || '').trim().toLowerCase(),
      mtss_student_id: r.mtss_student_id != null ? String(r.mtss_student_id).trim() : '',
      is_active: r.is_active != null ? Number(r.is_active) : 1,
      must_change_password: r.must_change_password != null ? Number(r.must_change_password) : 0,
    }));

    const mediaMap = await loadMediaPublicityMap(db);

    const students = tmsStudents.map((s) => {
      const name = String(s.student_name || '').trim();
      const sid = String(s.student_id ?? '').trim() || '';
      const names = splitRosterDisplayName(name);
      const status = classifyLanternAccountStatus(sid, studentAccounts);
      const isActive = s.is_active != null ? Number(s.is_active) === 1 : true;
      const media = sid ? mediaMap[String(sid).trim().toLowerCase()] : null;
      const restricted = media && Number(media.media_publicity_restricted) === 1;
      return {
        student_name: name,
        first_name: names.first_name,
        last_name: names.last_name,
        student_id: sid,
        grade: String(s.grade || '').trim(),
        tms_status: isActive ? 'Active' : 'Inactive',
        is_active: isActive ? 1 : 0,
        lantern_account: status.lantern_account,
        lantern_username: status.lantern_username,
        public_display_name: status.public_display_name || null,
        lantern_is_active: status.lantern_is_active,
        must_change_password: !!status.must_change_password,
        locker: status.locker,
        exact_match_linkable: !!status.exact_match_linkable,
        media_publicity_restricted: restricted ? 1 : 0,
        media_publicity_status: restricted ? 'Restricted' : 'Allowed',
        media_publicity_updated_at: media ? media.media_publicity_updated_at : null,
        media_publicity_updated_by: media ? media.media_publicity_updated_by : null,
      };
    });

    const activeStudents = students.filter((s) => Number(s.is_active) === 1);
    const scope = includeInactive ? students : activeStudents;
    const counts = {
      active_tms: activeStudents.length,
      missing_id: activeStudents.filter((s) => !s.student_id).length,
      lantern_linked: activeStudents.filter((s) => s.lantern_account === 'Linked').length,
      lantern_archived: activeStudents.filter((s) => s.lantern_account === 'Linked Archived').length,
      lantern_missing: activeStudents.filter((s) => s.lantern_account === 'Missing').length,
      lantern_broken: activeStudents.filter((s) => s.lantern_account === 'Broken').length,
      lantern_ambiguous: activeStudents.filter((s) => s.lantern_account === 'Ambiguous').length,
      locker_ready: activeStudents.filter((s) => s.locker === 'Ready').length,
      media_publicity_restricted: activeStudents.filter((s) => Number(s.media_publicity_restricted) === 1).length,
      total_shown: scope.length,
    };

    return jsonResponse({ ok: true, students: scope, counts, include_inactive: includeInactive }, 200, cors);
  }

  // Prompt #3 — Admin sets Media/Publicity Restriction (canonical on lantern_student_identities).
  if (request.method === 'POST' && path === '/api/admin/students/media-publicity') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const studentId = String(body.student_id ?? '').trim();
    if (!studentId) return jsonResponse({ ok: false, error: 'student_id_required' }, 400, cors);
    const restrictedRaw = body.restricted != null ? body.restricted : body.media_publicity_restricted;
    const restricted =
      restrictedRaw === true ||
      restrictedRaw === 1 ||
      restrictedRaw === '1' ||
      String(restrictedRaw || '').trim().toLowerCase() === 'restricted';
    const displayName = String(body.student_name || body.display_name || '').trim();
    const result = await setStudentMediaPublicityRestriction(db, {
      studentId,
      restricted,
      displayName,
      updatedBy: adminAuditLabel(account),
    });
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error || 'write_failed', detail: result.detail || null }, 503, cors);
    }
    return jsonResponse(result, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/admin/tms-roster/set-student-id') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const studentName = String(body.student_name || '').trim();
    const previousStudentId = String(body.previous_student_id ?? '').trim();
    const studentId = String(body.student_id ?? '').trim();
    if (!studentName) return jsonResponse({ ok: false, error: 'student_name_required' }, 400, cors);
    if (!studentId) return jsonResponse({ ok: false, error: 'student_id_required' }, 400, cors);
    if (studentId.length > ADMIN_TMS_STUDENT_ID_MAX_LEN) {
      return jsonResponse({ ok: false, error: 'student_id_too_long', max: ADMIN_TMS_STUDENT_ID_MAX_LEN }, 400, cors);
    }

    if (previousStudentId && previousStudentId !== studentId) {
      if (body.confirm_change !== true) {
        return jsonResponse(
          {
            ok: false,
            error: 'confirm_change_required',
            previous_student_id: previousStudentId,
            student_id: studentId,
            message: 'Changing a non-blank Student ID requires explicit confirmation.',
          },
          400,
          cors
        );
      }
      // Stop if an existing Lantern student identity depends on the old ID.
      const linkedRows = await db
        .prepare(
          `SELECT username, role, mtss_student_id, is_active FROM lantern_pilot_accounts
           WHERE lower(trim(role)) = 'student'
             AND (
               (mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?)))
               OR lower(trim(username)) = lower(trim(?))
             )`
        )
        .bind(previousStudentId, previousStudentId)
        .all();
      const linked = linkedRows.results || [];
      if (linked.length) {
        return jsonResponse(
          {
            ok: false,
            error: 'lantern_reconcile_required',
            message:
              'Changing this Student ID would break an existing Lantern student identity. Reconcile the Lantern account first (do not silently relink).',
            lantern_accounts: linked.map((r) => ({
              username: String(r.username || '').trim(),
              mtss_student_id: r.mtss_student_id != null ? String(r.mtss_student_id).trim() : null,
            })),
            previous_student_id: previousStudentId,
            student_id: studentId,
          },
          409,
          cors
        );
      }
    }

    const bridge = await callTmsRosterBridge(env, 'roster/set-student-id', {
      student_name: studentName,
      previous_student_id: previousStudentId,
      student_id: studentId,
    });
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        { ok: false, error: bridge.error || 'bridge_failed', code: bridge.code || null },
        status,
        cors
      );
    }
    return jsonResponse(
      {
        ok: true,
        student_name: bridge.student_name || studentName,
        previous_student_id: previousStudentId,
        student_id: bridge.student_id || studentId,
        unchanged: !!bridge.unchanged,
      },
      200,
      cors
    );
  }

  if (request.method === 'POST' && path === '/api/admin/tms-roster/link-exact') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const studentId = String(body.student_id || body.tms_student_id || '').trim();
    if (!studentId) return jsonResponse({ ok: false, error: 'student_id_required' }, 400, cors);

    const already = await db
      .prepare(
        `SELECT username FROM lantern_pilot_accounts
         WHERE mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?))`
      )
      .bind(studentId)
      .all();
    if ((already.results || []).length > 1) {
      return jsonResponse({ ok: false, error: 'ambiguous_mtss_student_id' }, 409, cors);
    }
    if ((already.results || []).length === 1) {
      return jsonResponse(
        {
          ok: true,
          already_linked: true,
          username: String(already.results[0].username || '').trim(),
          mtss_student_id: studentId,
        },
        200,
        cors
      );
    }

    const matches = await db
      .prepare(
        `SELECT username, role, mtss_student_id, is_active FROM lantern_pilot_accounts
         WHERE lower(trim(username)) = lower(trim(?))`
      )
      .bind(studentId)
      .all();
    const rows = matches.results || [];
    if (rows.length !== 1) {
      return jsonResponse(
        { ok: false, error: rows.length === 0 ? 'no_exact_username_match' : 'ambiguous_username_match' },
        409,
        cors
      );
    }
    const row = rows[0];
    if (String(row.role || '').trim().toLowerCase() !== 'student') {
      return jsonResponse({ ok: false, error: 'exact_match_not_student_role' }, 409, cors);
    }
    const existingMtss = row.mtss_student_id != null ? String(row.mtss_student_id).trim() : '';
    if (existingMtss && existingMtss.toLowerCase() !== studentId.toLowerCase()) {
      return jsonResponse(
        {
          ok: false,
          error: 'account_has_different_mtss_student_id',
          message: 'Lantern account already has a different mtss_student_id. Reconcile manually.',
        },
        409,
        cors
      );
    }

    const username = String(row.username || '').trim();
    await db
      .prepare(
        `UPDATE lantern_pilot_accounts SET mtss_student_id = ?, updated_at = datetime('now') WHERE username = ?`
      )
      .bind(studentId, username)
      .run();

    return jsonResponse({ ok: true, username, mtss_student_id: studentId }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/admin/tms-roster/create') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const first = String(body.first_name || '').trim();
    const last = String(body.last_name || '').trim();
    const studentName = String(body.student_name || '').trim() || [first, last].filter(Boolean).join(' ').trim();
    const studentId = String(body.student_id ?? '').trim() || '';
    if (!studentName) return jsonResponse({ ok: false, error: 'student_name_required' }, 400, cors);
    if (studentId && studentId.length > ADMIN_TMS_STUDENT_ID_MAX_LEN) {
      return jsonResponse({ ok: false, error: 'student_id_too_long', max: ADMIN_TMS_STUDENT_ID_MAX_LEN }, 400, cors);
    }
    const gradeRaw = body.grade_slug != null ? body.grade_slug : body.grade;
    const gradeSlug = normalizeAdminTmsGradeSlug(gradeRaw) || 'grade-6';

    const bridge = await callTmsRosterBridge(env, 'roster/create', {
      student_name: studentName,
      student_id: studentId,
      grade: gradeSlug.replace(/^grade-/, ''),
      grade_slug: gradeSlug,
    });
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        { ok: false, error: bridge.error || 'bridge_failed', code: bridge.code || null },
        status,
        cors
      );
    }
    return jsonResponse(
      {
        ok: true,
        student_name: bridge.student_name || studentName,
        student_id: bridge.student_id != null ? String(bridge.student_id) : studentId,
        grade: bridge.grade != null ? String(bridge.grade) : gradeSlug.replace(/^grade-/, ''),
        grade_slug: bridge.grade_slug || gradeSlug,
        lantern_account: 'Missing',
        locker: 'Not Ready',
      },
      200,
      cors
    );
  }

  if (request.method === 'POST' && path === '/api/admin/tms-roster/set-grade') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const studentName = String(body.student_name || '').trim();
    const studentId = String(body.student_id ?? '').trim() || '';
    const gradeRaw = body.grade_slug != null ? body.grade_slug : body.grade;
    const gradeSlug = normalizeAdminTmsGradeSlug(gradeRaw);
    if (!studentName) return jsonResponse({ ok: false, error: 'student_name_required' }, 400, cors);
    if (!gradeSlug) {
      return jsonResponse({ ok: false, error: 'invalid_grade', message: 'grade must be 6, 7, or 8' }, 400, cors);
    }

    const bridge = await callTmsRosterBridge(env, 'roster/set-grade', {
      student_name: studentName,
      student_id: studentId,
      grade: gradeSlug.replace(/^grade-/, ''),
      grade_slug: gradeSlug,
    });
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        { ok: false, error: bridge.error || 'bridge_failed', code: bridge.code || null, message: bridge.message || null },
        status,
        cors
      );
    }
    return jsonResponse(
      {
        ok: true,
        student_name: bridge.student_name || studentName,
        student_id: bridge.student_id != null ? String(bridge.student_id) : studentId,
        grade: bridge.grade != null ? String(bridge.grade) : gradeSlug.replace(/^grade-/, ''),
        grade_slug: bridge.grade_slug || gradeSlug,
      },
      200,
      cors
    );
  }

  // Prompt #205 — edit Student ID + First/Last + Grade in one save.
  if (request.method === 'POST' && path === '/api/admin/tms-roster/update') {
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const previousName = String(body.previous_student_name || body.student_name || '').trim();
    const previousId = String(body.previous_student_id ?? '').trim();
    const first = String(body.first_name || '').trim();
    const last = String(body.last_name || '').trim();
    const nextName =
      String(body.next_student_name || '').trim() || [first, last].filter(Boolean).join(' ').trim();
    const studentId = String(body.student_id ?? '').trim();
    const gradeRaw = body.grade_slug != null ? body.grade_slug : body.grade;
    const gradeSlug = normalizeAdminTmsGradeSlug(gradeRaw);
    if (!previousName) return jsonResponse({ ok: false, error: 'student_name_required' }, 400, cors);
    if (!first) return jsonResponse({ ok: false, error: 'first_name_required', message: 'First name is required.' }, 400, cors);
    if (!nextName) return jsonResponse({ ok: false, error: 'student_name_required' }, 400, cors);
    if (!studentId) return jsonResponse({ ok: false, error: 'student_id_required' }, 400, cors);
    if (studentId.length > ADMIN_TMS_STUDENT_ID_MAX_LEN) {
      return jsonResponse({ ok: false, error: 'student_id_too_long', max: ADMIN_TMS_STUDENT_ID_MAX_LEN }, 400, cors);
    }
    if (!gradeSlug) {
      return jsonResponse({ ok: false, error: 'invalid_grade', message: 'grade must be 6, 7, or 8' }, 400, cors);
    }

    if (previousId && previousId !== studentId) {
      if (body.confirm_change !== true) {
        return jsonResponse(
          {
            ok: false,
            error: 'confirm_change_required',
            previous_student_id: previousId,
            student_id: studentId,
            message: 'Changing a non-blank Student ID requires explicit confirmation.',
          },
          400,
          cors
        );
      }
      const linkedRows = await db
        .prepare(
          `SELECT username, role, mtss_student_id, is_active FROM lantern_pilot_accounts
           WHERE lower(trim(role)) = 'student'
             AND (
               (mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?)))
               OR lower(trim(username)) = lower(trim(?))
             )`
        )
        .bind(previousId, previousId)
        .all();
      const linked = linkedRows.results || [];
      if (linked.length) {
        return jsonResponse(
          {
            ok: false,
            error: 'lantern_reconcile_required',
            message:
              'Changing this Student ID would break an existing Lantern student identity. Reconcile the Lantern account first (do not silently relink).',
            lantern_accounts: linked.map((r) => ({
              username: String(r.username || '').trim(),
              mtss_student_id: r.mtss_student_id != null ? String(r.mtss_student_id).trim() : null,
            })),
            previous_student_id: previousId,
            student_id: studentId,
          },
          409,
          cors
        );
      }
    }

    const bridge = await callTmsRosterBridge(env, 'roster/update', {
      previous_student_name: previousName,
      previous_student_id: previousId,
      first_name: first,
      last_name: last,
      next_student_name: nextName,
      student_id: studentId,
      grade: gradeSlug.replace(/^grade-/, ''),
      grade_slug: gradeSlug,
    });
    if (!bridge.ok) {
      const status = bridge._httpStatus && bridge._httpStatus >= 400 ? bridge._httpStatus : 502;
      return jsonResponse(
        {
          ok: false,
          error: bridge.error || bridge.code || 'bridge_failed',
          code: bridge.code || null,
          message: bridge.message || bridge.error || null,
        },
        status,
        cors
      );
    }
    const names = splitRosterDisplayName(bridge.student_name || nextName);
    return jsonResponse(
      {
        ok: true,
        previous_student_name: previousName,
        previous_student_id: previousId,
        student_name: bridge.student_name || nextName,
        student_id: bridge.student_id != null ? String(bridge.student_id) : studentId,
        first_name: bridge.first_name != null ? String(bridge.first_name) : names.first_name,
        last_name: bridge.last_name != null ? String(bridge.last_name) : names.last_name,
        grade: bridge.grade != null ? String(bridge.grade) : gradeSlug.replace(/^grade-/, ''),
        grade_slug: bridge.grade_slug || gradeSlug,
        identity_changed: !!bridge.identity_changed,
      },
      200,
      cors
    );
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
        'SELECT username, display_name, first_name, last_name, honorific, public_display_name, role, student_character_name, teacher_id, mtss_student_id, is_active, must_change_password FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))'
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
    const isStaffMe = rlow === 'teacher' || rlow === 'admin' || rlow === 'staff';
    // Prompt #147 — ordinary header/UI identity is resolvePublicDisplayName.
    const publicDisplayLabel = resolvePublicDisplayName(row) || null;
    const publicStaffLabel = isStaffMe ? publicDisplayLabel : null;
    // Prompt #163 — attach authoritative TMS capabilities for staff nav (fail closed on bridge miss).
    let capabilities = null;
    if (isStaffMe) {
      capabilities = {
        teacher: false,
        report_maker: false,
        system_admin: false,
        behavior_admin: false,
        secretary: false,
      };
      try {
        const tmsStaffId = await getTmsStaffIdForLanternAccount(db, row.username);
        if (tmsStaffId) {
          const capRes = await callTmsNuggetsBridge(env, 'staff/capabilities', tmsStaffId, {});
          if (capRes && capRes.ok && capRes.capabilities && typeof capRes.capabilities === 'object') {
            capabilities = {
              teacher: !!capRes.capabilities.teacher,
              report_maker: !!capRes.capabilities.report_maker,
              system_admin: !!capRes.capabilities.system_admin,
              behavior_admin: !!capRes.capabilities.behavior_admin,
              secretary: !!capRes.capabilities.secretary,
            };
          }
        }
      } catch (_) {
        /* keep empty caps — do not fail-open Reports/System */
      }
    }
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        username: row.username,
        display_name: row.display_name,
        first_name: row.first_name != null ? row.first_name : null,
        last_name: row.last_name != null ? row.last_name : null,
        honorific: row.honorific != null ? row.honorific : null,
        public_display_name: row.public_display_name != null ? row.public_display_name : null,
        public_display_label: publicDisplayLabel,
        public_staff_label: publicStaffLabel,
        role: row.role,
        student_character_name: row.student_character_name || null,
        mtss_student_id: row.mtss_student_id || null,
        economy_character_name: rlow === 'student' ? pilotEconomyCharacterName(row) || null : null,
        teacher_id: row.teacher_id || null,
        must_change_password: mcp,
        capabilities,
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

    const loginHeaders = new Headers({
      'Content-Type': 'application/json',
      ...cors,
    });
    loginHeaders.append('Set-Cookie', pilotSetCookieHeader(token, secure, PILOT_JWT_TTL_SEC));

    let individualAccessClaimed = false;
    if (!mcp && String(row.role || '').trim().toLowerCase() === 'student') {
      try {
        const claim = await claimPreauthorizationAfterLogin(db, request, row, secure);
        if (claim && claim.deviceCookie) {
          loginHeaders.append('Set-Cookie', claim.deviceCookie);
        }
        if (claim && claim.claimed) {
          individualAccessClaimed = true;
          await recordAccessAuditEvent(db, {
            action: ACCESS_AUDIT_ACTIONS.PREAUTH_CLAIMED,
            staffId: null,
            staffName: 'login-claim',
            targetId: claim.preauthId || claim.requestId,
            detail: { requestId: claim.requestId, durationMinutes: claim.durationMinutes },
          });
        }
      } catch (_) {
        // Missing preauth table or claim failure must never break login.
      }
    }

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
        individual_access_claimed: individualAccessClaimed,
      }),
      {
        status: 200,
        headers: loginHeaders,
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

// Phase #33 — temporary whole-Lantern event override ("Open Lantern Temporarily"). Every
// override MUST have an explicit, bounded expiration -- there is deliberately no "forever"
// option and no code path that omits expires_at.
const EVENT_OVERRIDE_ALLOWED_MINUTES = [15, 30, 60];
const EVENT_OVERRIDE_MAX_CUSTOM_MINUTES = 180;

function normalizeBoardCode(s) {
  if (typeof s !== 'string') return '';
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Legacy Monday–Thursday 8:00 AM–4:00 PM America/Denver window. SUPERSEDED by Phase #34 —
 * production access decisions no longer call this function (see `evaluateCentralSchoolAccess`
 * below, which uses the canonical 2026-27 calendar in `evaluateSchoolSchedule`). Left defined,
 * unused, only because some historical tests reference its source; do not wire it back into any
 * access decision.
 */
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
 * Phase #34 — the SINGLE authoritative signal set behind every school-access authorization
 * decision (both the informational GET /api/class-access/state endpoint and the real gate in
 * `evaluateCentralSchoolAccess` below). Computed in exactly one place so the informational
 * endpoint students/teachers see can never drift from what actually gates access. Identifies the
 * caller solely by non-transferable, server-issued secrets (the individual-grant device cookie,
 * the device-group pairing token, and the override table itself) — never by anything a student
 * could forward to someone else, and never by a bare login session.
 */
async function computeQualifyingAccessSignals(request, env, db) {
  let individualGrant = { qualifyingAccess: false, reason: 'no_device_cookie', expiresAt: null };
  try {
    const deviceSecretForGrant = getCookieValue(request.headers.get('Cookie') || '', ACCESS_DEVICE_COOKIE_NAME);
    if (deviceSecretForGrant) {
      const deviceHashForGrant = await hashOpaqueSecret(deviceSecretForGrant);
      const grantRow = await db.prepare(
        'SELECT status, grant_expires_at, revoked_at FROM lantern_access_requests WHERE device_secret_hash = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(deviceHashForGrant).first();
      const nowIsoForGrant = new Date().toISOString();
      if (!grantRow) {
        individualGrant = { qualifyingAccess: false, reason: 'no_matching_request', expiresAt: null };
      } else {
        const derived = derivedRequestStatus(grantRow, nowIsoForGrant);
        individualGrant = {
          qualifyingAccess: derived === 'approved',
          reason: derived === 'approved' ? 'active_individual_grant' : derived,
          expiresAt: derived === 'approved' ? grantRow.grant_expires_at : null,
        };
      }
    }
  } catch (_) {
    individualGrant = { qualifyingAccess: false, reason: 'lookup_error', expiresAt: null };
  }

  let deviceGroupAccess = { qualifyingAccess: false, reason: 'no_device_token', groupId: null, groupName: null, expiresAt: null };
  try {
    const deviceToken = request.headers.get(DEVICE_TOKEN_HEADER) || '';
    if (deviceToken) {
      const deviceHash = await hashOpaqueSecret(deviceToken);
      const deviceRow = await db.prepare(
        'SELECT id, group_id, revoked_at FROM lantern_access_devices WHERE device_token_hash = ?'
      ).bind(deviceHash).first();
      const nowIsoForDevice = new Date().toISOString();
      if (!deviceRow) {
        deviceGroupAccess = { qualifyingAccess: false, reason: 'unknown_device', groupId: null, groupName: null, expiresAt: null };
      } else if (!isDeviceActive(deviceRow)) {
        deviceGroupAccess = { qualifyingAccess: false, reason: 'device_revoked', groupId: null, groupName: null, expiresAt: null };
      } else if (!deviceRow.group_id) {
        deviceGroupAccess = { qualifyingAccess: false, reason: 'device_ungrouped', groupId: null, groupName: null, expiresAt: null };
      } else {
        const groupRow = await db.prepare('SELECT id, name FROM lantern_access_device_groups WHERE id = ?').bind(deviceRow.group_id).first();
        const unlockRow = await db.prepare(
          'SELECT expires_at, is_active, revoked_at FROM lantern_access_group_unlocks WHERE group_id = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(deviceRow.group_id).first();
        const active = isGroupUnlockActive(unlockRow, nowIsoForDevice);
        deviceGroupAccess = {
          qualifyingAccess: active,
          reason: active ? 'active_group_unlock' : 'group_not_unlocked',
          groupId: deviceRow.group_id,
          groupName: (groupRow && groupRow.name) || null,
          expiresAt: active ? unlockRow.expires_at : null,
        };
        // Diagnostic-only last-seen bookkeeping (never authorization); throttled to at most once
        // per minute per device so a short poll loop doesn't write on every single request.
        const ipForDevice = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
        const ipHashForDevice = ipForDevice ? await hashOpaqueSecret(ipForDevice) : null;
        await db.prepare(
          'UPDATE lantern_access_devices SET last_seen_at = ?, last_seen_ip_hash = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)'
        ).bind(nowIsoForDevice, ipHashForDevice, deviceRow.id, new Date(Date.now() - 60000).toISOString()).run();
      }
    }
  } catch (_) {
    deviceGroupAccess = { qualifyingAccess: false, reason: 'lookup_error', groupId: null, groupName: null, expiresAt: null };
  }

  let eventOverride = { qualifyingAccess: false, reason: 'no_active_override', expiresAt: null };
  try {
    const overrideRow = await db.prepare(
      'SELECT expires_at, is_active, revoked_at FROM lantern_access_overrides ORDER BY created_at DESC LIMIT 1'
    ).first();
    const nowIsoForOverride = new Date().toISOString();
    const active = isGroupUnlockActive(overrideRow, nowIsoForOverride);
    eventOverride = {
      qualifyingAccess: active,
      reason: active ? 'active_event_override' : 'no_active_override',
      expiresAt: active ? overrideRow.expires_at : null,
    };
  } catch (_) {
    eventOverride = { qualifyingAccess: false, reason: 'lookup_error', expiresAt: null };
  }

  const qualifyingAccess = !!(individualGrant.qualifyingAccess || deviceGroupAccess.qualifyingAccess || eventOverride.qualifyingAccess);
  return { individualGrant, deviceGroupAccess, eventOverride, qualifyingAccess };
}

/**
 * Phase #34 — ONE authoritative, server-side gate for every student-facing protected API surface
 * (wired into the top-level fetch() dispatcher below; never per-route, so a newly added route is
 * protected by default instead of needing to opt in). Effective priority, exactly as specified:
 *   A. authenticated teacher/admin/staff              -> ALLOW, regardless of schedule
 *   B. outside the scheduled school-lock window        -> ALLOW (normal Lantern behavior)
 *   C. active whole-Lantern event override              -> ALLOW
 *   D. valid enrolled device + active group unlock       -> ALLOW
 *   E. active individual teacher-approved device grant    -> ALLOW
 *   F. otherwise, during a scheduled lock                  -> DENY (student must Request Access)
 * Deliberately does NOT treat as authorization: a bare authenticated student session/JWT, or the
 * legacy shareable class-access code/token (`class_access_sessions` / `class_access_tokens`,
 * `/api/class-access/join`, `/api/class-access/validate`) — neither is bound to one browser in a
 * way that resists forwarding, and Prompt #34 requires removing both as bypasses.
 *
 * `now` is accepted only so deterministic tests can pass a fixed instant; every real request
 * path uses the default (`new Date()`) and there is no request-controllable way to change it.
 *
 * @returns {{ allowed: boolean, reason: string, schedule: object, enforcementEnabled: boolean }}
 */
async function evaluateCentralSchoolAccess(request, env, now) {
  const db = env.DB;
  const nowDate = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  const schedule = evaluateSchoolSchedule(nowDate);
  const enforcementEnabled = isSchoolScheduleEnforcementEnabled(env);

  if (!enforcementEnabled) {
    return { allowed: true, reason: 'enforcement_disabled', schedule, enforcementEnabled };
  }

  // A. Staff (teacher/admin) always allowed, regardless of schedule.
  try {
    const account = await getPilotAccountFromRequest(request, env);
    if (account && isTeacherLike(account.role)) {
      return { allowed: true, reason: 'staff', schedule, enforcementEnabled };
    }
  } catch (_) {
    // An auth lookup failure must never itself grant access -- fall through to the schedule check.
  }

  // B. Outside the scheduled lock window -> normal Lantern behavior.
  if (!schedule.withinScheduledLock) {
    return { allowed: true, reason: 'outside_scheduled_lock', schedule, enforcementEnabled };
  }

  // C/D/E. Active override, enrolled+unlocked device group, or active individual grant.
  if (!db) {
    // No DB configured -- fail CLOSED during a scheduled lock; never fail open.
    return { allowed: false, reason: 'db_unavailable', schedule, enforcementEnabled };
  }
  const signals = await computeQualifyingAccessSignals(request, env, db);
  if (signals.qualifyingAccess) {
    const reason = signals.eventOverride.qualifyingAccess
      ? 'event_override'
      : signals.deviceGroupAccess.qualifyingAccess
        ? 'device_group_unlock'
        : 'individual_grant';
    return { allowed: true, reason, schedule, enforcementEnabled };
  }

  // F. During a scheduled lock, with none of A-E satisfied -> DENY.
  return { allowed: false, reason: 'school_lock_active', schedule, enforcementEnabled };
}

/**
 * API path prefixes that Phase #34's central school-access gate never evaluates: auth/session
 * bootstrapping (a student may always attempt to log in or check `me`/log out; identity is not
 * content), staff-only surfaces (already independently staff-gated, and staff pass rule A of the
 * evaluator anyway), the class-access API itself (the mechanism BY WHICH a student requests/
 * checks access — gating it would make requesting access impossible), and non-browser
 * infrastructure (`/api/health`, `/api/setup`, `/api/integrations` server-to-server bridge,
 * `/api/verify` demo/simulation harness, `/api/settings`). Everything else under `/api/` is
 * DEFAULT-DENIED during a scheduled lock unless the evaluator above says otherwise -- a new route
 * added later is automatically protected instead of needing to opt in.
 */
const SCHOOL_ACCESS_EXEMPT_PATH_PREFIXES = [
  '/api/health',
  '/api/auth',
  '/api/pilot',
  '/api/admin',
  '/api/setup',
  '/api/verify',
  '/api/class-access',
  '/api/settings',
  '/api/integrations',
  '/api/tms-nuggets',
];

function isSchoolAccessExemptPath(path) {
  return SCHOOL_ACCESS_EXEMPT_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

async function handleClassAccessRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  async function getVerifyState() {
    return loadVerifyState(env);
  }

  if (request.method === 'POST' && path === '/api/class-access/session/start') {
    // Prompt #92 — authorization now requires an authenticated Lantern teacher/admin session;
    // the acting teacherId is server-derived from that session, never from client body.teacher_id.
    const classAccessAuth = await requireStaffPilotSession(request, env, cors);
    if (classAccessAuth.response) return classAccessAuth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const teacherId = sessionTeacherId(classAccessAuth.account);
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
    // Prompt #92 — see session/start above: session-derived teacherId, no client-supplied identity.
    const classAccessAuth = await requireStaffPilotSession(request, env, cors);
    if (classAccessAuth.response) return classAccessAuth.response;
    const teacherId = sessionTeacherId(classAccessAuth.account);
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
    // Prompt #92 — see session/start above: session-derived teacherId, no client-supplied identity.
    const classAccessAuth = await requireStaffPilotSession(request, env, cors);
    if (classAccessAuth.response) return classAccessAuth.response;
    const teacherId = sessionTeacherId(classAccessAuth.account);
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
    // Phase #30 (School Access Foundation) — additive schedule metadata, computed once and
    // attached to every branch below. `schedule` reports the canonical 2026-27 calendar
    // (informational only) and `scheduleEnforcementEnabled` reports the authoritative
    // enforcement switch, which MUST remain false in production until a later phase turns it
    // on deliberately. Neither field changes accessState/tokenValid or any existing behavior.
    const schedule = evaluateSchoolSchedule(new Date());
    const scheduleEnforcementEnabled = isSchoolScheduleEnforcementEnabled(env);

    // Individual grants (Phase #31), device-group unlocks (Phase #32), and the whole-Lantern
    // event override (Phase #33) all funnel through the one shared signal computation
    // (`computeQualifyingAccessSignals`) that Phase #34's real gate (`evaluateCentralSchoolAccess`)
    // also uses, so this informational endpoint can never disagree with what actually gates
    // access. Identifies the caller solely by non-transferable, server-issued secrets — never by
    // anything a student could forward to someone else.
    let { individualGrant, deviceGroupAccess, eventOverride, qualifyingAccess } = await computeQualifyingAccessSignals(request, env, db);

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
        schedule,
        scheduleEnforcementEnabled,
        individualGrant,
        deviceGroupAccess,
        eventOverride,
        qualifyingAccess,
      }, 200, cors);
    }

    const secureForClaim = url.protocol === 'https:';
    const stateCookies = [];
    try {
      const studentForClaim = await getPilotAccountFromRequest(request, env);
      if (
        studentForClaim &&
        String(studentForClaim.role || '').trim().toLowerCase() === 'student' &&
        !pilotAccountRequiresChangePassword(studentForClaim)
      ) {
        const claim = await claimPreauthorizationAfterLogin(db, request, studentForClaim, secureForClaim);
        if (claim && claim.deviceCookie) stateCookies.push(claim.deviceCookie);
        if (claim && claim.claimed) {
          individualGrant = {
            qualifyingAccess: true,
            reason: 'active_individual_grant',
            expiresAt: claim.grantExpiresAt,
          };
          qualifyingAccess = true;
          await recordAccessAuditEvent(db, {
            action: ACCESS_AUDIT_ACTIONS.PREAUTH_CLAIMED,
            staffId: null,
            staffName: 'state-claim',
            targetId: claim.preauthId || claim.requestId,
            detail: { requestId: claim.requestId, durationMinutes: claim.durationMinutes },
          });
        }
      }
    } catch (_) {
      // Preauth table missing or claim error must not break the informational state endpoint.
    }

    // Phase #34 (Production Enforcement) — the ACTUAL access decision now comes solely from the
    // canonical 2026-27 calendar (`schedule.withinScheduledLock`) plus the same staff / event-
    // override / device-group / individual-grant signals the real gate
    // (`evaluateCentralSchoolAccess`, wired into every other protected API) uses. The legacy
    // Mon-Thu `isLockHours()` window, the legacy shareable class-access code/token
    // (`class_access_sessions` / `class_access_tokens`), and "any authenticated student session
    // bypasses the gate" are ALL removed as authorization signals here — none of them are bound
    // to one non-transferable browser/device, which is the whole point of this gate.
    // `/api/class-access/join` and `/api/class-access/validate` still work exactly as before for
    // backward compatibility; their output is simply no longer treated as access.
    let isStaffCaller = false;
    try {
      const staffAccountForState = await getPilotAccountFromRequest(request, env);
      isStaffCaller = !!(staffAccountForState && isTeacherLike(staffAccountForState.role));
    } catch (_) {
      isStaffCaller = false;
    }

    const effectivelyLocked = scheduleEnforcementEnabled && schedule.withinScheduledLock && !isStaffCaller;

    if (!effectivelyLocked) {
      return jsonResponseWithCookies({
        ok: true,
        mode: 'live',
        accessState: 'live_outside_school_hours',
        tokenValid: true,
        schedule,
        scheduleEnforcementEnabled,
        individualGrant,
        deviceGroupAccess,
        eventOverride,
        qualifyingAccess,
      }, 200, cors, stateCookies);
    }

    if (qualifyingAccess) {
      const grantExpiresAt =
        (individualGrant.qualifyingAccess && individualGrant.expiresAt) ||
        (deviceGroupAccess.qualifyingAccess && deviceGroupAccess.expiresAt) ||
        (eventOverride.qualifyingAccess && eventOverride.expiresAt) ||
        null;
      return jsonResponseWithCookies({
        ok: true,
        mode: 'live',
        accessState: 'live_student_has_valid_access',
        tokenValid: true,
        expires_at: grantExpiresAt,
        schedule,
        scheduleEnforcementEnabled,
        individualGrant,
        deviceGroupAccess,
        eventOverride,
        qualifyingAccess,
      }, 200, cors, stateCookies);
    }

    return jsonResponseWithCookies({
      ok: true,
      mode: 'live',
      accessState: 'live_locked_no_session',
      tokenValid: false,
      schedule,
      scheduleEnforcementEnabled,
      individualGrant,
      deviceGroupAccess,
      eventOverride,
      qualifyingAccess,
    }, 200, cors, stateCookies);
  }

  if (request.method === 'POST' && path === '/api/class-access/request') {
    // Phase #31 — student "Request Access" creation. request_phrase (e.g. GREEN-FALCON-49) is a
    // DISPLAY/LOOKUP IDENTIFIER ONLY for the teacher; it is never accepted as proof of anything.
    // The real security boundary is the high-entropy device secret minted below and returned
    // ONLY as an HttpOnly cookie (never in the JSON body, never in a URL/query string).
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const rawCookie = request.headers.get('Cookie') || '';
    const existingSecret = getCookieValue(rawCookie, ACCESS_DEVICE_COOKIE_NAME);
    const secure = url.protocol === 'https:';

    // Idempotent retry: a browser that already has a live (pending, not expired) request gets
    // that same request back instead of creating a duplicate — this alone prevents the common
    // "double click" / "reopen the page" spam case without needing any extra bookkeeping.
    if (existingSecret) {
      const existingHash = await hashOpaqueSecret(existingSecret);
      const existingRow = await db.prepare(
        'SELECT id, request_phrase, status, request_expires_at, grant_expires_at, revoked_at FROM lantern_access_requests WHERE device_secret_hash = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(existingHash).first();
      if (existingRow && derivedRequestStatus(existingRow, nowIso) === 'pending') {
        return jsonResponse({
          ok: true,
          existing: true,
          requestId: existingRow.id,
          requestPhrase: existingRow.request_phrase,
          requestExpiresAt: existingRow.request_expires_at,
        }, 200, cors);
      }
    }

    // Identity: prefer the authenticated Lantern pilot student session (verified); otherwise
    // require the student to enter/confirm a display name (explicitly unverified — never trusted
    // as an identity by itself, matching the "no client-supplied student_id alone" requirement).
    let studentUsername = null;
    let studentCharacterName = null;
    let proposedName = null;
    const account = await getPilotAccountFromRequest(request, env);
    if (account && String(account.role || '').trim().toLowerCase() === 'student' && !pilotAccountRequiresChangePassword(account)) {
      studentUsername = account.username;
      studentCharacterName = account.student_character_name || account.display_name || account.username;
    } else {
      proposedName = String(body.proposed_name || body.proposedName || '').trim().slice(0, 60);
      if (!proposedName) return jsonResponse({ ok: false, error: 'Missing proposed_name' }, 400, cors);
    }

    // Rate limit: coarse cap on distinct requests per hashed requester IP within a short window.
    // The IP hash is used ONLY for this anti-spam throttle, never to authorize or qualify access.
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
    const ipHash = ip ? await hashOpaqueSecret(ip) : null;
    if (ipHash) {
      const windowStart = new Date(nowDate.getTime() - ACCESS_REQUEST_RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
      const recent = await db.prepare(
        'SELECT COUNT(*) AS c FROM lantern_access_requests WHERE requester_ip_hash = ? AND requested_at > ?'
      ).bind(ipHash, windowStart).first();
      if (recent && Number(recent.c) >= ACCESS_REQUEST_RATE_LIMIT_MAX_PER_WINDOW) {
        return jsonResponse({ ok: false, error: 'too_many_requests' }, 429, cors);
      }
    }

    // Generate a unique memorable phrase, retrying on collision against other currently-pending,
    // not-yet-expired requests (a phrase from a decided/expired request is safe to reuse).
    let phrase = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateRequestPhrase();
      const clash = await db.prepare(
        "SELECT id FROM lantern_access_requests WHERE request_phrase = ? AND status = 'pending' AND request_expires_at > ?"
      ).bind(candidate, nowIso).first();
      if (!clash) { phrase = candidate; break; }
    }
    if (!phrase) return jsonResponse({ ok: false, error: 'Could not generate a unique request phrase, please try again' }, 503, cors);

    const deviceSecret = generateDeviceSecret();
    const deviceHash = await hashOpaqueSecret(deviceSecret);
    const id = 'accreq_' + crypto.randomUUID().replace(/-/g, '');
    const requestExpiresAt = new Date(nowDate.getTime() + ACCESS_REQUEST_PENDING_TTL_SEC * 1000).toISOString();

    await db.prepare(
      'INSERT INTO lantern_access_requests (id, request_phrase, student_username, student_character_name, proposed_name, device_secret_hash, requester_ip_hash, status, requested_at, request_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'pending\', ?, ?, ?)'
    ).bind(id, phrase, studentUsername, studentCharacterName, proposedName, deviceHash, ipHash, nowIso, requestExpiresAt, nowIso).run();

    return new Response(JSON.stringify({
      ok: true,
      requestId: id,
      requestPhrase: phrase,
      requestExpiresAt,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...cors,
        'Set-Cookie': buildAccessDeviceCookieHeader(deviceSecret, secure),
      },
    });
  }

  if (request.method === 'GET' && path === '/api/class-access/request/status') {
    // Phase #31 — student polling. Looked up SOLELY by the requesting browser's HttpOnly device
    // cookie, never by any client-supplied id/phrase. If the cookie is missing or doesn't match
    // any request, respond with a generic 'pending' rather than a 404/'not_found' so a browser
    // that merely knows another student's phrase (but not their device secret) learns nothing.
    const nowIso = new Date().toISOString();
    const secret = getCookieValue(request.headers.get('Cookie') || '', ACCESS_DEVICE_COOKIE_NAME);
    if (!secret) return jsonResponse({ ok: true, status: 'pending' }, 200, cors);
    const hash = await hashOpaqueSecret(secret);
    const row = await db.prepare(
      'SELECT id, request_phrase, status, request_expires_at, grant_expires_at, revoked_at FROM lantern_access_requests WHERE device_secret_hash = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(hash).first();
    if (!row) return jsonResponse({ ok: true, status: 'pending' }, 200, cors);
    const derived = derivedRequestStatus(row, nowIso);
    return jsonResponse({
      ok: true,
      status: derived,
      requestPhrase: row.request_phrase,
      grantExpiresAt: derived === 'approved' ? row.grant_expires_at : null,
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/requests/pending') {
    // Phase #31 — teacher dashboard. Staff-only (Prompt #92 pattern): session-derived identity,
    // never client-supplied. Never selects/returns device_secret_hash.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    const rows = await db.prepare(
      "SELECT id, request_phrase, student_username, student_character_name, proposed_name, requested_at, request_expires_at FROM lantern_access_requests WHERE status = 'pending' AND request_expires_at > ? ORDER BY requested_at ASC"
    ).bind(nowIso).all();
    const list = (rows.results || []).map((r) => ({
      id: r.id,
      requestPhrase: r.request_phrase,
      displayName: r.student_character_name || r.proposed_name || r.student_username || 'Student',
      studentUsername: r.student_username || null,
      studentId: r.student_username || null,
      verified: !!r.student_username,
      requestedAt: r.requested_at,
      requestExpiresAt: r.request_expires_at,
    }));
    return jsonResponse({ ok: true, requests: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/requests/approve') {
    // Phase #31 — teacher approval. Duration is restricted to exactly 15 or 30 minutes (the only
    // two classroom actions in scope for this phase). Authorization for the resulting grant is
    // always evaluated against current server time — no cleanup job ever needs to run.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    const durationMinutes = parseInt(body.duration_minutes, 10);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    if (!ACCESS_REQUEST_ALLOWED_GRANT_MINUTES.includes(durationMinutes)) {
      return jsonResponse({ ok: false, error: 'duration_minutes must be 15 or 30' }, 400, cors);
    }
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const row = await db.prepare('SELECT id, status, request_expires_at FROM lantern_access_requests WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
    if (row.status !== 'pending' || row.request_expires_at <= nowIso) {
      return jsonResponse({ ok: false, error: 'request_not_pending_or_expired' }, 400, cors);
    }
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    const grantExpiresAt = new Date(nowDate.getTime() + durationMinutes * 60 * 1000).toISOString();
    const result = await db.prepare(
      "UPDATE lantern_access_requests SET status = 'approved', decided_at = ?, decided_by_staff_id = ?, decided_by_staff_name = ?, grant_expires_at = ? WHERE id = ? AND status = 'pending' AND request_expires_at > ?"
    ).bind(nowIso, staffId || null, staffName, grantExpiresAt, id, nowIso).run();
    if (!result || !result.meta || !result.meta.changes) {
      return jsonResponse({ ok: false, error: 'request_not_pending_or_expired' }, 400, cors);
    }
    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.REQUEST_APPROVED,
      staffId, staffName, targetId: id,
      detail: { durationMinutes, grantExpiresAt },
    });
    return jsonResponse({ ok: true, id, status: 'approved', grantExpiresAt, durationMinutes }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/requests/deny') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const nowIso = new Date().toISOString();
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    const result = await db.prepare(
      "UPDATE lantern_access_requests SET status = 'denied', decided_at = ?, decided_by_staff_id = ?, decided_by_staff_name = ? WHERE id = ? AND status = 'pending'"
    ).bind(nowIso, staffId || null, staffName, id).run();
    if (!result || !result.meta || !result.meta.changes) {
      return jsonResponse({ ok: false, error: 'request_not_pending' }, 400, cors);
    }
    await recordAccessAuditEvent(db, { action: ACCESS_AUDIT_ACTIONS.REQUEST_DENIED, staffId, staffName, targetId: id });
    return jsonResponse({ ok: true, id, status: 'denied' }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/requests/active') {
    // Phase #31 — teacher dashboard active-grants view. Never selects/returns device_secret_hash.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    const rows = await db.prepare(
      "SELECT id, student_username, student_character_name, proposed_name, decided_at, decided_by_staff_name, grant_expires_at FROM lantern_access_requests WHERE status = 'approved' AND (revoked_at IS NULL OR revoked_at = '') AND grant_expires_at > ? ORDER BY grant_expires_at ASC"
    ).bind(nowIso).all();
    const grantRows = rows.results || [];
    let sourceMap = {};
    try {
      sourceMap = await mapClaimedRequestSources(db, grantRows.map((r) => r.id));
    } catch (_) {
      sourceMap = {};
    }
    const list = grantRows.map((r) => ({
      id: r.id,
      displayName: r.student_character_name || r.proposed_name || r.student_username || 'Student',
      studentUsername: r.student_username || null,
      studentId: r.student_username || null,
      grantedAt: r.decided_at,
      grantedBy: r.decided_by_staff_name,
      grantExpiresAt: r.grant_expires_at,
      source: sourceMap[r.id] || 'Student Request',
    }));
    return jsonResponse({ ok: true, grants: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/requests/revoke') {
    // Phase #31 — teacher revoke. Takes effect immediately: the UPDATE below is the only thing
    // any qualification check ever reads, and it is guarded by current server time, not a job.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const nowIso = new Date().toISOString();
    const result = await db.prepare(
      "UPDATE lantern_access_requests SET revoked_at = ? WHERE id = ? AND status = 'approved' AND (revoked_at IS NULL OR revoked_at = '')"
    ).bind(nowIso, id).run();
    if (!result || !result.meta || !result.meta.changes) {
      return jsonResponse({ ok: false, error: 'grant_not_active' }, 400, cors);
    }
    const staffIdForRevoke = sessionTeacherId(auth.account);
    const staffNameForRevoke = reviewerLabelFromAccount(auth.account);
    await recordAccessAuditEvent(db, { action: ACCESS_AUDIT_ACTIONS.GRANT_REVOKED, staffId: staffIdForRevoke, staffName: staffNameForRevoke, targetId: id });
    return jsonResponse({ ok: true, id, status: 'revoked' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/requests/extend') {
    // Phase #33 — "Extend +15 min" / "Extend +30 min" on an already-active individual grant.
    // Only ever extends a grant that is CURRENTLY qualifying (approved, not revoked, not yet
    // expired) — an already-expired/denied/revoked request must be re-approved instead, never
    // "resurrected" by extension. computeExtendedGrantExpiresAt enforces the hard ceiling that
    // keeps this from ever becoming a de-facto permanent grant (see access-requests.js).
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    const deltaMinutes = parseInt(body.duration_minutes, 10);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    if (!ACCESS_GRANT_EXTEND_ALLOWED_MINUTES.includes(deltaMinutes)) {
      return jsonResponse({ ok: false, error: 'duration_minutes must be 15 or 30' }, 400, cors);
    }
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const row = await db.prepare('SELECT id, status, grant_expires_at, revoked_at FROM lantern_access_requests WHERE id = ?').bind(id).first();
    if (!row || derivedRequestStatus(row, nowIso) !== 'approved') {
      return jsonResponse({ ok: false, error: 'grant_not_active' }, 400, cors);
    }
    const newExpiresAt = computeExtendedGrantExpiresAt(row.grant_expires_at, deltaMinutes, nowDate);
    const result = await db.prepare(
      "UPDATE lantern_access_requests SET grant_expires_at = ? WHERE id = ? AND status = 'approved' AND (revoked_at IS NULL OR revoked_at = '') AND grant_expires_at > ?"
    ).bind(newExpiresAt, id, nowIso).run();
    if (!result || !result.meta || !result.meta.changes) {
      return jsonResponse({ ok: false, error: 'grant_not_active' }, 400, cors);
    }
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.GRANT_EXTENDED,
      staffId, staffName, targetId: id,
      detail: { deltaMinutes, grantExpiresAt: newExpiresAt },
    });
    return jsonResponse({ ok: true, id, status: 'approved', grantExpiresAt: newExpiresAt, deltaMinutes }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/students') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const q = String(url.searchParams.get('q') || '').trim();
    try {
      const students = await searchActiveStudents(db, q, 12);
      return jsonResponse({ ok: true, students }, 200, cors);
    } catch (_) {
      return jsonResponse({ ok: false, error: 'student_search_unavailable' }, 503, cors);
    }
  }

  if (request.method === 'POST' && path === '/api/class-access/preauthorize') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const studentUsername = String(body.student_username || body.username || '').trim();
    const durationMinutes = parseInt(body.duration_minutes, 10);
    if (!studentUsername) return jsonResponse({ ok: false, error: 'Missing student_username' }, 400, cors);
    if (!ACCESS_REQUEST_ALLOWED_GRANT_MINUTES.includes(durationMinutes)) {
      return jsonResponse({ ok: false, error: 'duration_minutes must be 15 or 30' }, 400, cors);
    }
    const studentRow = await loadActiveStudentAccount(db, studentUsername);
    if (!studentRow) return jsonResponse({ ok: false, error: 'unknown_student' }, 400, cors);
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    let created;
    try {
      created = await upsertStudentPreauthorization(db, {
        studentRow,
        durationMinutes,
        staffId,
        staffName,
        nowDate: new Date(),
      });
    } catch (_) {
      return jsonResponse({ ok: false, error: 'preauth_unavailable' }, 503, cors);
    }
    if (!created || !created.ok) {
      return jsonResponse({ ok: false, error: (created && created.error) || 'preauth_failed' }, 400, cors);
    }
    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.PREAUTH_CREATED,
      staffId,
      staffName,
      targetId: created.id,
      detail: { student_username: created.student_username, durationMinutes, replaced: !!created.replaced },
    });
    return jsonResponse({
      ok: true,
      id: created.id,
      replaced: !!created.replaced,
      student_username: created.student_username,
      student_display_name: created.student_display_name,
      student_id: created.student_id,
      durationMinutes: created.durationMinutes,
      claimExpiresAt: created.claimExpiresAt,
      claimTtlSec: ACCESS_PREAUTH_CLAIM_TTL_SEC,
      status: 'preauthorized',
      message: studentPublicLabel(created) + ' is pre-authorized for ' + created.durationMinutes + ' minutes. Waiting for login.',
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/preauthorize') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    let rows = [];
    try {
      rows = await listUnclaimedPreauths(db, nowIso);
    } catch (_) {
      rows = [];
    }
    const list = rows.map((r) => ({
      id: r.id,
      studentUsername: r.student_username,
      studentId: r.student_id || r.student_username,
      displayName: r.student_display_name || r.student_username,
      durationMinutes: r.duration_minutes,
      createdAt: r.created_at,
      createdBy: r.created_by_staff_name,
      claimExpiresAt: r.claim_expires_at,
      status: 'preauthorized',
    }));
    return jsonResponse({ ok: true, preauthorizations: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/preauthorize/cancel') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    let cancelled;
    try {
      cancelled = await cancelUnclaimedPreauthorization(db, id, new Date().toISOString());
    } catch (_) {
      return jsonResponse({ ok: false, error: 'preauth_unavailable' }, 503, cors);
    }
    if (!cancelled || !cancelled.ok) {
      return jsonResponse({ ok: false, error: (cancelled && cancelled.error) || 'preauth_not_cancellable' }, 400, cors);
    }
    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.PREAUTH_CANCELLED,
      staffId,
      staffName,
      targetId: id,
    });
    return jsonResponse({ ok: true, id, status: 'cancelled' }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/individual-board') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    const pendingRows = await db.prepare(
      "SELECT id, request_phrase, student_username, student_character_name, proposed_name, requested_at, request_expires_at FROM lantern_access_requests WHERE status = 'pending' AND request_expires_at > ? ORDER BY requested_at ASC"
    ).bind(nowIso).all();
    const activeRows = await db.prepare(
      "SELECT id, student_username, student_character_name, proposed_name, decided_at, decided_by_staff_name, grant_expires_at FROM lantern_access_requests WHERE status = 'approved' AND (revoked_at IS NULL OR revoked_at = '') AND grant_expires_at > ? ORDER BY grant_expires_at ASC"
    ).bind(nowIso).all();
    let preRows = [];
    try {
      preRows = await listUnclaimedPreauths(db, nowIso);
    } catch (_) {
      preRows = [];
    }
    const pending = (pendingRows.results || []).map((r) => ({
      id: r.id,
      kind: 'pending',
      requestPhrase: r.request_phrase,
      displayName: r.student_character_name || r.proposed_name || r.student_username || 'Student',
      studentUsername: r.student_username || null,
      studentId: r.student_username || null,
      verified: !!r.student_username,
      requestedAt: r.requested_at,
      requestExpiresAt: r.request_expires_at,
      source: 'Student Request',
      status: 'pending',
    }));
    const preauthorized = preRows.map((r) => ({
      id: r.id,
      kind: 'preauthorized',
      displayName: r.student_display_name || r.student_username,
      studentUsername: r.student_username,
      studentId: r.student_id || r.student_username,
      durationMinutes: r.duration_minutes,
      createdAt: r.created_at,
      createdBy: r.created_by_staff_name,
      claimExpiresAt: r.claim_expires_at,
      source: 'Teacher',
      status: 'preauthorized',
    }));
    const grantRows = activeRows.results || [];
    let sourceMap = {};
    try {
      sourceMap = await mapClaimedRequestSources(db, grantRows.map((r) => r.id));
    } catch (_) {
      sourceMap = {};
    }
    const active = grantRows.map((r) => ({
      id: r.id,
      kind: 'active',
      displayName: r.student_character_name || r.proposed_name || r.student_username || 'Student',
      studentUsername: r.student_username || null,
      studentId: r.student_username || null,
      grantedAt: r.decided_at,
      grantedBy: r.decided_by_staff_name,
      grantExpiresAt: r.grant_expires_at,
      source: sourceMap[r.id] || 'Student Request',
      status: 'active',
    }));
    return jsonResponse({ ok: true, pending, preauthorized, active }, 200, cors);
  }

  // ================= Phase #32 — enrolled classroom devices + device-group unlock =================

  if (request.method === 'POST' && path === '/api/class-access/device/pairing/request') {
    // Phase #32 — classroom browser "enroll this computer" request. pairing_phrase (e.g.
    // CRIMSON-CEDAR-49) is a DISPLAY/LOOKUP IDENTIFIER ONLY for the teacher to recognize which
    // pending pairing belongs to which physical browser; it is never accepted as proof of
    // anything. The real security boundary is the opaque pairing secret minted below and returned
    // ONLY as an HttpOnly cookie (never in the JSON body, never in a URL/query string).
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const rawCookie = request.headers.get('Cookie') || '';
    const existingSecret = getCookieValue(rawCookie, DEVICE_PAIRING_COOKIE_NAME);
    const secure = url.protocol === 'https:';

    if (existingSecret) {
      const existingHash = await hashOpaqueSecret(existingSecret);
      const existingRow = await db.prepare(
        'SELECT id, pairing_phrase, status, request_expires_at FROM lantern_access_device_pairings WHERE pairing_secret_hash = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(existingHash).first();
      if (existingRow && derivedPairingStatus(existingRow, nowIso) === 'pending') {
        return jsonResponse({
          ok: true,
          existing: true,
          pairingId: existingRow.id,
          pairingPhrase: existingRow.pairing_phrase,
          requestExpiresAt: existingRow.request_expires_at,
        }, 200, cors);
      }
    }

    // Rate limit: coarse cap on distinct pairing requests per hashed requester IP within a short
    // window. The IP hash is used ONLY for this anti-spam throttle, never to authorize a device.
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
    const ipHash = ip ? await hashOpaqueSecret(ip) : null;
    if (ipHash) {
      const windowStart = new Date(nowDate.getTime() - DEVICE_PAIRING_RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
      const recent = await db.prepare(
        'SELECT COUNT(*) AS c FROM lantern_access_device_pairings WHERE requester_ip_hash = ? AND requested_at > ?'
      ).bind(ipHash, windowStart).first();
      if (recent && Number(recent.c) >= DEVICE_PAIRING_RATE_LIMIT_MAX_PER_WINDOW) {
        return jsonResponse({ ok: false, error: 'too_many_requests' }, 429, cors);
      }
    }

    let phrase = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generatePairingPhrase();
      const clash = await db.prepare(
        "SELECT id FROM lantern_access_device_pairings WHERE pairing_phrase = ? AND status = 'pending' AND request_expires_at > ?"
      ).bind(candidate, nowIso).first();
      if (!clash) { phrase = candidate; break; }
    }
    if (!phrase) return jsonResponse({ ok: false, error: 'Could not generate a unique pairing phrase, please try again' }, 503, cors);

    const pairingSecret = generateOpaqueSecret();
    const pairingHash = await hashOpaqueSecret(pairingSecret);
    const id = 'devpair_' + crypto.randomUUID().replace(/-/g, '');
    const requestExpiresAt = new Date(nowDate.getTime() + DEVICE_PAIRING_PENDING_TTL_SEC * 1000).toISOString();

    await db.prepare(
      "INSERT INTO lantern_access_device_pairings (id, pairing_phrase, pairing_secret_hash, requester_ip_hash, status, requested_at, request_expires_at, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)"
    ).bind(id, phrase, pairingHash, ipHash, nowIso, requestExpiresAt, nowIso).run();

    return new Response(JSON.stringify({
      ok: true,
      pairingId: id,
      pairingPhrase: phrase,
      requestExpiresAt,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...cors,
        'Set-Cookie': buildPairingCookieHeader(pairingSecret, secure),
      },
    });
  }

  if (request.method === 'GET' && path === '/api/class-access/device/pairing/status') {
    // Phase #32 — classroom browser polling. Looked up SOLELY by the requesting browser's
    // HttpOnly pairing cookie, never by any client-supplied id/phrase. A browser that merely knows
    // another classroom computer's phrase (but not its pairing secret) learns nothing here and
    // never receives a device credential — see the cross-browser tests in
    // worker/scripts/device-enrollment-test.mjs.
    //
    // The real device credential is delivered here at MOST ONCE (credential_delivered_at guards
    // it), matched only by this cookie. It is never re-sent once delivered, and never shown to
    // staff on any teacher-facing endpoint.
    const nowIso = new Date().toISOString();
    const secret = getCookieValue(request.headers.get('Cookie') || '', DEVICE_PAIRING_COOKIE_NAME);
    if (!secret) return jsonResponse({ ok: true, status: 'pending' }, 200, cors);
    const hash = await hashOpaqueSecret(secret);
    const row = await db.prepare(
      'SELECT id, pairing_phrase, status, request_expires_at, device_id, credential_delivered_at FROM lantern_access_device_pairings WHERE pairing_secret_hash = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(hash).first();
    if (!row) return jsonResponse({ ok: true, status: 'pending' }, 200, cors);
    const derived = derivedPairingStatus(row, nowIso);
    if (derived !== 'approved') {
      return jsonResponse({ ok: true, status: derived, pairingPhrase: row.pairing_phrase }, 200, cors);
    }
    if (row.credential_delivered_at) {
      return jsonResponse({ ok: true, status: 'approved', delivered: true }, 200, cors);
    }
    // One-time credential pickup: mint a fresh device credential the FIRST time the original
    // browser observes 'approved', bind it into lantern_access_devices, and mark delivered.
    const deviceRow = row.device_id ? await db.prepare('SELECT id, label, group_id FROM lantern_access_devices WHERE id = ?').bind(row.device_id).first() : null;
    if (!deviceRow) return jsonResponse({ ok: false, error: 'device_not_found' }, 500, cors);
    const deviceCredential = generateOpaqueSecret();
    const credentialHash = await hashOpaqueSecret(deviceCredential);
    await db.prepare('UPDATE lantern_access_devices SET device_token_hash = ? WHERE id = ?').bind(credentialHash, deviceRow.id).run();
    await db.prepare('UPDATE lantern_access_device_pairings SET credential_delivered_at = ? WHERE id = ?').bind(nowIso, row.id).run();
    return jsonResponse({
      ok: true,
      status: 'approved',
      delivered: true,
      deviceToken: deviceCredential,
      deviceLabel: deviceRow.label,
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/device/pairings/pending') {
    // Phase #32 — teacher dashboard. Staff-only. Never selects/returns pairing_secret_hash or any
    // device credential.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    const rows = await db.prepare(
      "SELECT id, pairing_phrase, requested_at, request_expires_at FROM lantern_access_device_pairings WHERE status = 'pending' AND request_expires_at > ? ORDER BY requested_at ASC"
    ).bind(nowIso).all();
    const list = (rows.results || []).map((r) => ({
      id: r.id,
      pairingPhrase: r.pairing_phrase,
      requestedAt: r.requested_at,
      requestExpiresAt: r.request_expires_at,
    }));
    return jsonResponse({ ok: true, pairings: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/pairings/approve') {
    // Phase #32 — teacher approval. Assigns the human-readable label (and, optionally, a device
    // group) and creates the lantern_access_devices row, but does NOT mint or expose the device
    // credential here — that only happens once, to the ORIGINAL requesting browser, via
    // /device/pairing/status above. Staff never see the credential.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    const label = String(body.label || '').trim().slice(0, 60);
    const groupId = body.group_id ? String(body.group_id).trim() : null;
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    if (!label) return jsonResponse({ ok: false, error: 'Missing label' }, 400, cors);
    if (groupId) {
      const groupRow = await db.prepare('SELECT id FROM lantern_access_device_groups WHERE id = ?').bind(groupId).first();
      if (!groupRow) return jsonResponse({ ok: false, error: 'group_not_found' }, 404, cors);
    }
    const nowIso = new Date().toISOString();
    const row = await db.prepare('SELECT id, status, request_expires_at FROM lantern_access_device_pairings WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
    if (row.status !== 'pending' || row.request_expires_at <= nowIso) {
      return jsonResponse({ ok: false, error: 'pairing_not_pending_or_expired' }, 400, cors);
    }
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    // Placeholder hash -- overwritten with the real credential's hash the first time the
    // original browser picks it up via /device/pairing/status (never here, never by staff).
    const placeholderHash = await hashOpaqueSecret('unclaimed:' + id + ':' + crypto.randomUUID());
    const deviceId = 'accdev_' + crypto.randomUUID().replace(/-/g, '');
    await db.prepare(
      'INSERT INTO lantern_access_devices (id, device_token_hash, group_id, label, enrolled_by_staff_id, enrolled_by_staff_name, enrolled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(deviceId, placeholderHash, groupId, label, staffId || null, staffName, nowIso, nowIso).run();
    const result = await db.prepare(
      "UPDATE lantern_access_device_pairings SET status = 'approved', decided_at = ?, decided_by_staff_id = ?, decided_by_staff_name = ?, device_id = ? WHERE id = ? AND status = 'pending' AND request_expires_at > ?"
    ).bind(nowIso, staffId || null, staffName, deviceId, id, nowIso).run();
    if (!result || !result.meta || !result.meta.changes) {
      // Roll back the just-created device row -- the pairing was decided/expired concurrently.
      await db.prepare('DELETE FROM lantern_access_devices WHERE id = ?').bind(deviceId).run();
      return jsonResponse({ ok: false, error: 'pairing_not_pending_or_expired' }, 400, cors);
    }
    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.DEVICE_ENROLLED,
      staffId, staffName, targetId: deviceId,
      detail: { label, groupId },
    });
    return jsonResponse({ ok: true, id, status: 'approved', deviceId, label, groupId }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/pairings/deny') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const nowIso = new Date().toISOString();
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    const result = await db.prepare(
      "UPDATE lantern_access_device_pairings SET status = 'denied', decided_at = ?, decided_by_staff_id = ?, decided_by_staff_name = ? WHERE id = ? AND status = 'pending'"
    ).bind(nowIso, staffId || null, staffName, id).run();
    if (!result || !result.meta || !result.meta.changes) {
      return jsonResponse({ ok: false, error: 'pairing_not_pending' }, 400, cors);
    }
    return jsonResponse({ ok: true, id, status: 'denied' }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/device/groups') {
    // Phase #32 — teacher dashboard. Group name, enrolled-device count, current unlock
    // status/expiration. No group ever has, needs, or exposes a shared password.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    const groupRows = await db.prepare('SELECT id, name, created_at FROM lantern_access_device_groups ORDER BY name ASC').all();
    const groups = groupRows.results || [];
    const list = [];
    for (const g of groups) {
      const countRow = await db.prepare(
        "SELECT COUNT(*) AS c FROM lantern_access_devices WHERE group_id = ? AND (revoked_at IS NULL OR revoked_at = '')"
      ).bind(g.id).first();
      const unlockRow = await db.prepare(
        'SELECT expires_at, is_active, revoked_at, started_by_staff_name FROM lantern_access_group_unlocks WHERE group_id = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(g.id).first();
      const active = isGroupUnlockActive(unlockRow, nowIso);
      list.push({
        id: g.id,
        name: g.name,
        deviceCount: countRow ? Number(countRow.c) : 0,
        unlockActive: active,
        unlockExpiresAt: active ? unlockRow.expires_at : null,
        unlockedBy: active ? unlockRow.started_by_staff_name : null,
      });
    }
    return jsonResponse({ ok: true, groups: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/groups') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return jsonResponse({ ok: false, error: 'Missing name' }, 400, cors);
    const nowIso = new Date().toISOString();
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);
    const id = 'accgrp_' + crypto.randomUUID().replace(/-/g, '');
    await db.prepare(
      'INSERT INTO lantern_access_device_groups (id, name, created_by_staff_id, created_by_staff_name, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, name, staffId || null, staffName, nowIso).run();
    return jsonResponse({ ok: true, id, name }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/groups/rename') {
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim().slice(0, 80);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    if (!name) return jsonResponse({ ok: false, error: 'Missing name' }, 400, cors);
    const result = await db.prepare('UPDATE lantern_access_device_groups SET name = ? WHERE id = ?').bind(name, id).run();
    if (!result || !result.meta || !result.meta.changes) return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
    return jsonResponse({ ok: true, id, name }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/class-access/device/devices') {
    // Phase #32 — teacher dashboard. Device label, last seen, active/revoked, non-authoritative
    // diagnostic metadata only. Never selects/returns device_token_hash.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const rows = await db.prepare(
      'SELECT d.id, d.label, d.group_id, g.name AS group_name, d.enrolled_at, d.enrolled_by_staff_name, d.last_seen_at, d.revoked_at FROM lantern_access_devices d LEFT JOIN lantern_access_device_groups g ON g.id = d.group_id ORDER BY d.enrolled_at DESC'
    ).all();
    const list = (rows.results || []).map((r) => ({
      id: r.id,
      label: r.label,
      groupId: r.group_id,
      groupName: r.group_name,
      enrolledAt: r.enrolled_at,
      enrolledBy: r.enrolled_by_staff_name,
      lastSeenAt: r.last_seen_at,
      revoked: !!r.revoked_at,
      revokedAt: r.revoked_at,
    }));
    return jsonResponse({ ok: true, devices: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/devices/assign') {
    // Phase #32 — assign/reassign an enrolled device to a group (or ungroup with group_id: null).
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const deviceId = String(body.device_id || '').trim();
    const groupId = body.group_id ? String(body.group_id).trim() : null;
    if (!deviceId) return jsonResponse({ ok: false, error: 'Missing device_id' }, 400, cors);
    if (groupId) {
      const groupRow = await db.prepare('SELECT id FROM lantern_access_device_groups WHERE id = ?').bind(groupId).first();
      if (!groupRow) return jsonResponse({ ok: false, error: 'group_not_found' }, 404, cors);
    }
    const result = await db.prepare('UPDATE lantern_access_devices SET group_id = ? WHERE id = ?').bind(groupId, deviceId).run();
    if (!result || !result.meta || !result.meta.changes) return jsonResponse({ ok: false, error: 'not_found' }, 404, cors);
    return jsonResponse({ ok: true, deviceId, groupId }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/devices/revoke') {
    // Phase #32 — immediate, permanent revocation of this credential. Takes effect immediately:
    // the UPDATE below is the only thing any qualification check ever reads. A revoked device
    // cannot silently restore itself; the teacher may explicitly re-enroll (a fresh pairing) later.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const deviceId = String(body.device_id || '').trim();
    if (!deviceId) return jsonResponse({ ok: false, error: 'Missing device_id' }, 400, cors);
    const nowIso = new Date().toISOString();
    const result = await db.prepare(
      "UPDATE lantern_access_devices SET revoked_at = ? WHERE id = ? AND (revoked_at IS NULL OR revoked_at = '')"
    ).bind(nowIso, deviceId).run();
    if (!result || !result.meta || !result.meta.changes) return jsonResponse({ ok: false, error: 'already_revoked_or_not_found' }, 400, cors);
    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.DEVICE_REVOKED,
      staffId: sessionTeacherId(auth.account),
      staffName: reviewerLabelFromAccount(auth.account),
      targetId: deviceId,
    });
    return jsonResponse({ ok: true, deviceId, revoked: true }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/groups/unlock') {
    // Phase #32 — teacher group unlock. Exactly one active unlock per group at a time: starting a
    // new one immediately supersedes (revokes) any prior active unlock for that group, so
    // "Unlock 60" after an accidental "Unlock 15" behaves as the teacher expects. No shared
    // classroom password is ever created or displayed -- this only sets an expiry a valid enrolled
    // device in this group is checked against.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const groupId = String(body.group_id || '').trim();
    if (!groupId) return jsonResponse({ ok: false, error: 'Missing group_id' }, 400, cors);
    const groupRow = await db.prepare('SELECT id FROM lantern_access_device_groups WHERE id = ?').bind(groupId).first();
    if (!groupRow) return jsonResponse({ ok: false, error: 'group_not_found' }, 404, cors);

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    let expiresAt;
    let untilSchoolClose = false;
    if (body.until_school_close) {
      const resolved = resolveUntilSchoolCloseInstant(nowDate);
      if (!resolved.ok) {
        return jsonResponse({ ok: false, error: 'until_school_close_unavailable', reason: resolved.reason }, 400, cors);
      }
      expiresAt = resolved.expiresAt;
      untilSchoolClose = true;
    } else {
      const durationMinutes = parseInt(body.duration_minutes, 10);
      if (!GROUP_UNLOCK_ALLOWED_MINUTES.includes(durationMinutes)) {
        return jsonResponse({ ok: false, error: 'duration_minutes must be 15, 30, or 60' }, 400, cors);
      }
      expiresAt = new Date(nowDate.getTime() + durationMinutes * 60 * 1000).toISOString();
    }

    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);

    await db.prepare(
      "UPDATE lantern_access_group_unlocks SET is_active = 0, revoked_at = ? WHERE group_id = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = '')"
    ).bind(nowIso, groupId).run();

    const id = 'accunlock_' + crypto.randomUUID().replace(/-/g, '');
    await db.prepare(
      'INSERT INTO lantern_access_group_unlocks (id, group_id, started_by_staff_id, started_by_staff_name, starts_at, expires_at, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    ).bind(id, groupId, staffId || null, staffName, nowIso, expiresAt, nowIso).run();

    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.GROUP_UNLOCKED,
      staffId, staffName, targetId: groupId,
      detail: { unlockId: id, expiresAt, untilSchoolClose },
    });
    return jsonResponse({ ok: true, groupId, unlockId: id, expiresAt, untilSchoolClose }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/device/groups/lock') {
    // Phase #32 — "Lock Now". Ends the active unlock immediately and server-side: the UPDATE
    // below is the only thing any qualification check ever reads, so there is no delayed cleanup
    // job to wait on.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const groupId = String(body.group_id || '').trim();
    if (!groupId) return jsonResponse({ ok: false, error: 'Missing group_id' }, 400, cors);
    const nowIso = new Date().toISOString();
    const result = await db.prepare(
      "UPDATE lantern_access_group_unlocks SET is_active = 0, revoked_at = ? WHERE group_id = ? AND is_active = 1 AND (revoked_at IS NULL OR revoked_at = '')"
    ).bind(nowIso, groupId).run();
    const hadActiveUnlock = !!(result && result.meta && result.meta.changes);
    if (hadActiveUnlock) {
      await recordAccessAuditEvent(db, {
        action: ACCESS_AUDIT_ACTIONS.GROUP_LOCKED,
        staffId: sessionTeacherId(auth.account),
        staffName: reviewerLabelFromAccount(auth.account),
        targetId: groupId,
      });
    }
    return jsonResponse({ ok: true, groupId, locked: true, hadActiveUnlock }, 200, cors);
  }

  // ================= Phase #33 — temporary whole-Lantern event override =================
  // "Open Lantern Temporarily" -- a GLOBAL override (school event, club, after-hours group,
  // unusual class situation) that suspends the schedule lock for everyone during a fixed,
  // explicitly-expiring window. Reuses lantern_access_overrides (migration 050) and the exact
  // same is_active/revoked_at/expires_at lifecycle as device-group unlocks above -- there is
  // deliberately only ONE active override at a time (starting a new one supersedes any prior
  // one) and NO code path that can create a row without a bounded expires_at ("Open Forever" is
  // not offered anywhere in this API).

  if (request.method === 'GET' && path === '/api/class-access/override/active') {
    // Staff-only, full detail (including who started it) for the teacher control center. The
    // public /api/class-access/state above intentionally omits startedByName/reason.
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    const row = await db.prepare(
      'SELECT id, reason, created_by_staff_name, starts_at, expires_at, is_active, revoked_at FROM lantern_access_overrides ORDER BY created_at DESC LIMIT 1'
    ).first();
    if (!isGroupUnlockActive(row, nowIso)) return jsonResponse({ ok: true, active: false }, 200, cors);
    return jsonResponse({
      ok: true,
      active: true,
      id: row.id,
      reason: row.reason || null,
      startedByName: row.created_by_staff_name || null,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/override/start') {
    // Prompt #171 — schoolwide override is admin-only (teachers use Individual / Class Access).
    const auth = await requireAdminPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    let expiresAt;
    let untilSchoolClose = false;
    if (body.until_school_close) {
      const resolved = resolveUntilSchoolCloseInstant(nowDate);
      if (!resolved.ok) {
        return jsonResponse({ ok: false, error: 'until_school_close_unavailable', reason: resolved.reason }, 400, cors);
      }
      expiresAt = resolved.expiresAt;
      untilSchoolClose = true;
    } else if (body.custom_minutes != null) {
      const customMinutes = parseInt(body.custom_minutes, 10);
      if (!Number.isFinite(customMinutes) || customMinutes < 1 || customMinutes > EVENT_OVERRIDE_MAX_CUSTOM_MINUTES) {
        return jsonResponse({ ok: false, error: `custom_minutes must be between 1 and ${EVENT_OVERRIDE_MAX_CUSTOM_MINUTES}` }, 400, cors);
      }
      expiresAt = new Date(nowDate.getTime() + customMinutes * 60 * 1000).toISOString();
    } else {
      const durationMinutes = parseInt(body.duration_minutes, 10);
      if (!EVENT_OVERRIDE_ALLOWED_MINUTES.includes(durationMinutes)) {
        return jsonResponse({ ok: false, error: 'duration_minutes must be 15, 30, or 60 (or provide until_school_close / custom_minutes)' }, 400, cors);
      }
      expiresAt = new Date(nowDate.getTime() + durationMinutes * 60 * 1000).toISOString();
    }

    const reason = String(body.reason || '').trim().slice(0, 200) || null;
    const staffId = sessionTeacherId(auth.account);
    const staffName = reviewerLabelFromAccount(auth.account);

    // Exactly one active override at a time -- a new one supersedes (ends) any prior one, same
    // pattern as device-group unlocks, so re-clicking a duration behaves as the teacher expects.
    await db.prepare(
      "UPDATE lantern_access_overrides SET is_active = 0, revoked_at = ? WHERE is_active = 1 AND (revoked_at IS NULL OR revoked_at = '')"
    ).bind(nowIso).run();

    const id = 'accoverride_' + crypto.randomUUID().replace(/-/g, '');
    await db.prepare(
      'INSERT INTO lantern_access_overrides (id, reason, created_by_staff_id, created_by_staff_name, starts_at, expires_at, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    ).bind(id, reason, staffId || null, staffName, nowIso, expiresAt, nowIso).run();

    await recordAccessAuditEvent(db, {
      action: ACCESS_AUDIT_ACTIONS.OVERRIDE_STARTED,
      staffId, staffName, targetId: id,
      detail: { reason, expiresAt, untilSchoolClose },
    });
    return jsonResponse({ ok: true, overrideId: id, reason, expiresAt, untilSchoolClose }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/class-access/override/end') {
    // Prompt #171 — schoolwide override end is admin-only.
    const auth = await requireAdminPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const nowIso = new Date().toISOString();
    const result = await db.prepare(
      "UPDATE lantern_access_overrides SET is_active = 0, revoked_at = ? WHERE is_active = 1 AND (revoked_at IS NULL OR revoked_at = '')"
    ).bind(nowIso).run();
    const hadActiveOverride = !!(result && result.meta && result.meta.changes);
    if (hadActiveOverride) {
      await recordAccessAuditEvent(db, {
        action: ACCESS_AUDIT_ACTIONS.OVERRIDE_ENDED,
        staffId: sessionTeacherId(auth.account),
        staffName: reviewerLabelFromAccount(auth.account),
      });
    }
    return jsonResponse({ ok: true, ended: true, hadActiveOverride }, 200, cors);
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
    const activeV = profile && profile.updated_at
      ? String(profile.updated_at).replace(/[^\d]/g, '').slice(0, 14)
      : '';
    const activeImage = profile
      ? (origin + '/api/avatar/image?key=' + encodeURIComponent(profile.current_avatar_key) + (activeV ? ('&v=' + encodeURIComponent(activeV)) : ''))
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
/**
 * Prompt #96 -- deterministic idempotency reference for a generic (non-cosmetic, non-mission)
 * economy transact call. Prefers a caller-supplied `meta.idempotency_key`/`body.idempotency_key`
 * (stable across retries of the SAME action); falls back to kind-specific stable identifiers
 * already present in the payload (poll_id, run_id); as a last resort falls back to the
 * newly-generated txId, which carries the exact same "no worse than the pre-#96 behavior"
 * idempotency guarantee the legacy random-tx-id path already had (i.e. none) rather than
 * inventing a false guarantee.
 */
function buildLanternEconomyReference(kind, meta, body, txId) {
  const explicit = String((meta && meta.idempotency_key) || body.idempotency_key || '').trim();
  if (explicit) return `lantern:${kind}:${explicit}`;
    if ((kind === 'poll_vote' || kind === 'poll_complete') && meta && meta.poll_id) {
      const who = String((meta.character_name || meta.account_key || '')).trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '_');
      const poll = String(meta.poll_id).trim();
      return who ? `lantern:poll_complete:${poll}:${who}` : `lantern:poll_complete:${poll}`;
    }
  // Prompt #102: cover every game-originated economy write (game_play, game_win,
  // game_false_start, and any future game_* kind), not just game_play/game_win. This was a real
  // idempotency gap — Reaction Tap's false-start penalty already sent a stable client run_id, but
  // it fell through to the random-per-request txId below because 'game_false_start' wasn't in the
  // matched kind list, so a genuine retry of that request was never deduped.
  if (String(kind || '').indexOf('game_') === 0 && meta && meta.run_id) return `lantern:${kind}:${String(meta.run_id).trim()}`;
  return `lantern:${kind}:${txId}`;
}

function mapTmsHistoryToTransactions(characterName, recentHistory) {
  return (recentHistory || []).map((h, idx) => ({
    id: 'tms-' + idx + '-' + String(h.timestamp || ''),
    character_name: characterName,
    delta: h.type === 'redeemed' ? -Math.abs(Number(h.amount) || 0) : Math.abs(Number(h.amount) || 0),
    kind: h.type === 'redeemed' ? 'tms_redeem' : 'tms_earn',
    source: 'TMS_NUGGETS',
    note: h.note || h.teacher_name || '',
    created_at: h.timestamp,
    meta: {},
  }));
}

async function handleEconomyRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/economy/balance') {
    const requestedCharacterName = (url.searchParams.get('character_name') || '').trim();
    const usernameQuery = (url.searchParams.get('username') || '').trim();
    if (usernameQuery) {
      return jsonResponse({ ok: false, error: 'forbidden', code: 'forbidden' }, 403, cors);
    }
    const pilotAccount = await getPilotAccountFromRequest(request, env);
    const readAuth = resolveEconomyBalanceRead(
      pilotAccount,
      requestedCharacterName,
      pilotEconomyCharacterName
    );
    if (!readAuth.ok) {
      return jsonResponse({ ok: false, error: readAuth.error, code: readAuth.error }, readAuth.code || 403, cors);
    }
    const characterName = readAuth.characterName;

    // Prompt #170 — Web Admin has no spendable Nugget principal. Self-read must not
    // inherit Rick / Radle (or any other staff) balance. Target lookups stay admin tools.
    if (readAuth.session_scoped && isSystemWebAdminAccount(pilotAccount)) {
      return jsonResponse({
        ok: false,
        error: 'no_nugget_account',
        code: 'no_nugget_account',
        message: 'No Nugget account',
        principal_type: 'none',
      }, 403, cors);
    }

    // Prompt #107 — staff self wallet uses staff:<username> → tms_identity_links → TMS staff ledger.
    // Never fabricate a student row or show a misleading 0 for unlinked staff.
    if (isStaffEconomyKey(characterName)) {
      const staffPrincipal = await resolveStaffTmsPrincipal(db, characterName);
      if (!staffPrincipal.ok) {
        return jsonResponse({
          ok: false,
          error: 'tms_identity_not_linked',
          code: 'needs_link',
          message: 'Nugget account needs linking',
          character_name: characterName,
          principal_type: 'staff',
        }, 403, cors);
      }
      const staffBal = await tmsStaffEconomyBalance(env, staffPrincipal.tmsStaffId);
      if (!staffBal.ok) {
        return jsonResponse({
          ok: false,
          error: staffBal.error || 'staff_balance_unavailable',
          code: 'unavailable',
          character_name: characterName,
          principal_type: 'staff',
        }, staffBal.httpStatus && staffBal.httpStatus >= 400 ? staffBal.httpStatus : 502, cors);
      }
      const staffPayload = {
        ok: true,
        character_name: characterName,
        balance: staffBal.available,
        earned: staffBal.earned,
        spent: staffBal.spent,
        available: staffBal.available,
        recent_transactions: mapTmsHistoryToTransactions(characterName, staffBal.recentHistory),
        economy_authority: 'tms_nuggets_staff',
        principal_type: 'staff',
      };
      // Target-account admin/teacher lookups may keep the TMS staff id; signed-in self does not.
      if (!readAuth.session_scoped) staffPayload.tms_staff_id = staffPrincipal.tmsStaffId;
      return jsonResponse(staffPayload, 200, cors);
    }

    // Prompt #96: TMS Nuggets is the one authoritative ledger for every real student. Try it
    // first; only fall back to the legacy Lantern-only wallet for demo/persona characters.
    // Prompt #170: a real authenticated student must never display lantern_wallets as authority.
    const tms = await tmsEconomyBalance(env, characterName);
    if (tms.ok) {
      return jsonResponse({
        ok: true,
        character_name: characterName,
        balance: tms.available,
        earned: tms.earned,
        spent: tms.spent,
        available: tms.available,
        recent_transactions: mapTmsHistoryToTransactions(characterName, tms.recentHistory),
        economy_authority: 'tms_nuggets',
        principal_type: 'student',
      }, 200, cors);
    }

    const productionSelf = !!(
      readAuth.session_scoped &&
      pilotAccount &&
      !isKnownDemoPersonaName(characterName)
    );
    if (productionSelf) {
      if (tms.notFound) {
        return jsonResponse({
          ok: false,
          error: 'tms_student_not_found',
          code: 'needs_link',
          character_name: characterName,
          principal_type: 'student',
        }, 404, cors);
      }
      return jsonResponse({
        ok: false,
        error: tms.error || 'balance_unavailable',
        code: 'unavailable',
        character_name: characterName,
        principal_type: 'student',
      }, tms.httpStatus && tms.httpStatus >= 400 ? tms.httpStatus : 502, cors);
    }

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
      economy_authority: 'lantern_legacy',
      principal_type: 'demo',
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/economy/transact') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const pilotAccount = await getPilotAccountFromRequest(request, env);
    const kindEarly = String(body.kind || '').trim() || 'misc';
    let characterName = (body.character_name || '').trim();
    let selfSessionScoped = false;
    if (isSelfEconomyTransactKind(kindEarly)) {
      const playAuth = resolveEconomySelfTransact(
        pilotAccount,
        characterName,
        pilotEconomyCharacterName
      );
      if (!playAuth.ok) {
        return jsonResponse({ ok: false, error: playAuth.error }, playAuth.code || 403, cors);
      }
      characterName = playAuth.characterName;
      selfSessionScoped = !!playAuth.session_scoped;
    } else if (!characterName) {
      return jsonResponse({ ok: false, error: 'Missing character_name' }, 400, cors);
    }
    const authz = economyTransactAllowed(env, request, characterName, pilotAccount);
    if (!authz.ok) {
      return jsonResponse({ ok: false, error: authz.error }, authz.code || 403, cors);
    }
    const kind = String(body.kind || '').trim() || 'misc';
    let source = String(body.source || '').trim() || '';
    let note = String(body.note || '').trim() || '';
    let meta = body.meta && typeof body.meta === 'object' ? { ...body.meta } : {};

    // Prompt #172 — Nugget Adjustment (admin_adjustment): admin-only (or economy secret),
    // required reason, and server-derived actor metadata (never trust client initiated_by).
    if (kind === 'admin_adjustment') {
      const configured = (env.LANTERN_ECONOMY_SECRET || '').trim();
      const provided = getEconomyTransactSecretFromRequest(request);
      const secretOk = !!(configured && provided && timingSafeEqualStrings(configured, provided));
      const role = pilotAccount ? String(pilotAccount.role || '').trim().toLowerCase() : '';
      if (!secretOk && role !== 'admin') {
        return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
      }
      if (!note) {
        return jsonResponse({ ok: false, error: 'reason_required' }, 400, cors);
      }
      const actorUsername = pilotAccount
        ? String(pilotAccount.username || '').trim() || 'admin'
        : 'economy_secret';
      const actorDisplay = pilotAccount
        ? (String(pilotAccount.display_name || '').trim() || actorUsername)
        : 'economy_secret';
      meta.initiated_by = actorUsername;
      meta.initiated_by_display = actorDisplay;
      meta.context = 'admin_panel';
      meta.actor_role = role || 'secret';
      if (!source) source = 'ADMIN_PANEL';
      // Keep reason first; append actor so TMS history remains attributable without raw JSON.
      note = note + ' — by ' + actorDisplay + (actorUsername && actorUsername !== actorDisplay ? ' (' + actorUsername + ')' : '');
    }

    if (kind === 'poll_vote' || kind === 'poll_complete') {
      return jsonResponse(
        {
          ok: false,
          error: 'poll_reward_via_vote_only',
          message: 'Poll Nuggets are awarded only by completing a Poll.',
        },
        400,
        cors
      );
    }

    if (kind === 'cosmetic') {
      const cosmeticId = String(meta.cosmetic_id || meta.item_id || '').trim();
      const idempotencyKey = String(meta.idempotency_key || body.idempotency_key || '').trim();
      if (!cosmeticId) {
        return jsonResponse({ ok: false, error: 'missing_cosmetic_id' }, 400, cors);
      }
      if (body.delta != null && body.delta !== '' && Math.floor(Number(body.delta)) !== 0) {
        const clientDelta = Math.floor(Number(body.delta));
        const catalogPrice = serverCosmeticPrice(cosmeticId);
        if (catalogPrice == null || clientDelta !== -catalogPrice) {
          return jsonResponse(
            { ok: false, error: 'client_price_rejected', server_price: catalogPrice },
            400,
            cors
          );
        }
      }
      // Prompt #96 Atomic Purchase Rule: TMS Nuggets spends first (authoritative, idempotent by
      // idempotencyKey); the cosmetic is only granted after that succeeds. See economy-cosmetic.js.
      const purchase = await executeCosmeticPurchase(db, characterName, cosmeticId, {
        idempotencyKey,
        env,
        allowLegacyWallet: !(selfSessionScoped && !isKnownDemoPersonaName(characterName)),
      });
      if (!purchase.ok) {
        return jsonResponse(purchase, 400, cors);
      }
      return jsonResponse(purchase, 200, cors);
    }

    // Prompt #159 — locked Nugget economy amounts (server-authoritative; do not trust client).
    // game_play: exactly -1. game_win: exactly +1. game_false_start: no extra spend (one paid play).
    if (kind === 'game_false_start') {
      return jsonResponse(
        { ok: false, error: 'game_false_start_disabled', message: 'False start does not charge an extra Nugget; play cost is already 1.' },
        400,
        cors
      );
    }
    let delta = Math.floor(Number(body.delta));
    if (kind === 'game_play') {
      if (body.delta != null && body.delta !== '' && Number.isFinite(Number(body.delta)) && Math.floor(Number(body.delta)) !== -1) {
        return jsonResponse(
          { ok: false, error: 'client_delta_rejected', server_delta: -1, message: 'game_play costs exactly 1 Nugget' },
          400,
          cors
        );
      }
      delta = -1;
    } else if (kind === 'game_win') {
      if (body.delta != null && body.delta !== '' && Number.isFinite(Number(body.delta)) && Math.floor(Number(body.delta)) !== 1) {
        return jsonResponse(
          { ok: false, error: 'client_delta_rejected', server_delta: 1, message: 'game_win awards exactly 1 Nugget' },
          400,
          cors
        );
      }
      delta = 1;
    } else if (kind === 'avatar_upload') {
      // Prompt #179 — ordinary avatar submission costs exactly 1 Nugget (server-authoritative).
      if (body.delta != null && body.delta !== '' && Number.isFinite(Number(body.delta)) && Math.floor(Number(body.delta)) !== -1) {
        return jsonResponse(
          { ok: false, error: 'client_delta_rejected', server_delta: -1, message: 'avatar_upload costs exactly 1 Nugget' },
          400,
          cors
        );
      }
      delta = -1;
    }
    if (delta === 0) return jsonResponse({ ok: false, error: 'delta must be non-zero' }, 400, cors);
    const now = new Date().toISOString();
    const displayName = String(body.display_name ?? '').trim();
    if (displayName) {
      await db.prepare(
        `INSERT INTO lantern_student_identities (character_name, display_name, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(character_name) DO UPDATE SET display_name = excluded.display_name`
      ).bind(characterName, displayName, now).run();
    }

    const txId = 'tx-' + crypto.randomUUID();

    // Prompt #96: TMS Nuggets is authoritative for every real student's balance. Try the TMS
    // grant/spend first, keyed by a stable reference so a retry can never double-apply. Only fall
    // back to the legacy Lantern-only wallet when TMS genuinely does not recognize this id as a
    // real student (demo/persona characters, local dev/test fixtures) -- a real validation failure
    // (e.g. insufficient balance) or a transient bridge error must NOT silently fall back to a
    // second ledger; it must be returned to the caller as-is.
    const reference = buildLanternEconomyReference(kind, meta, body, txId);

    // Prompt #107 — staff principal spends/grants (games cost, rewards) use TMS staff ledger.
    if (isStaffEconomyKey(characterName)) {
      const staffPrincipal = await resolveStaffTmsPrincipal(db, characterName);
      if (!staffPrincipal.ok) {
        return jsonResponse({ ok: false, error: 'tms_identity_not_linked', message: 'Nugget account needs linking' }, 403, cors);
      }
      const staffTx = await tmsStaffEconomyTransact(env, staffPrincipal.tmsStaffId, delta, kind, source || 'LANTERN', note, reference);
      if (!staffTx.ok) {
        const status = staffTx.code === 'insufficient_balance' ? 400 : (staffTx.httpStatus && staffTx.httpStatus >= 400 ? staffTx.httpStatus : 502);
        return jsonResponse({ ok: false, error: staffTx.error || 'tms_staff_transact_failed', code: staffTx.code }, status, cors);
      }
      try {
        await db.prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(txId, characterName, delta, kind, source, note, now, JSON.stringify({ ...meta, tms_reference: reference, tms_backed: true, tms_staff_id: staffPrincipal.tmsStaffId })).run();
      } catch (_) {}
      if (kind === 'game_play') {
        try {
          await ensureFirstGameMissionCompletion(db, env, characterName, txId);
        } catch (_) {}
      }
      return jsonResponse({
        ok: true,
        id: txId,
        character_name: characterName,
        delta,
        balance_after: staffTx.available,
        idempotent: !!staffTx.idempotent,
        economy_authority: 'tms_nuggets_staff',
      }, 200, cors);
    }

    const tms = await tmsEconomyTransact(env, characterName, delta, kind, source || 'LANTERN', note, reference);
    if (tms.ok) {
      try {
        await db.prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(txId, characterName, delta, kind, source, note, now, JSON.stringify({ ...meta, tms_reference: reference, tms_backed: true })).run();
        await awardAchievementsForEconomyTransact(db, characterName, kind, txId, note);
        if (delta > 0) {
          await awardAchievementsAfterPositiveCredit(db, characterName, txId, delta);
        }
      } catch (_) {}
      if (kind === 'game_play') {
        try {
          await ensureFirstGameMissionCompletion(db, env, characterName, txId);
        } catch (_) {}
      }
      return jsonResponse({
        ok: true,
        id: txId,
        character_name: characterName,
        delta,
        balance_after: tms.available,
        idempotent: !!tms.idempotent,
        economy_authority: 'tms_nuggets',
      }, 200, cors);
    }
    if (!tms.notFound) {
      const status = tms.code === 'insufficient_balance' ? 400 : (tms.httpStatus && tms.httpStatus >= 400 ? tms.httpStatus : 502);
      return jsonResponse({ ok: false, error: tms.error || 'tms_transact_failed', code: tms.code }, status, cors);
    }

    if (selfSessionScoped && !isKnownDemoPersonaName(characterName)) {
      return jsonResponse({
        ok: false,
        error: 'tms_student_not_found',
        code: 'needs_link',
        character_name: characterName,
      }, 404, cors);
    }

    const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(characterName).first();
    const currentBalance = walletRow ? (Number(walletRow.balance) || 0) : 0;
    if (delta < 0 && currentBalance + delta < 0) {
      return jsonResponse({ ok: false, error: 'insufficient', need: -delta, available: currentBalance }, 400, cors);
    }

    await db.prepare(
      'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(txId, characterName, delta, kind, source, note, now, JSON.stringify(meta)).run();
    await db.prepare(
      'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
    ).bind(characterName, currentBalance + delta, now, delta, now).run();

    try {
      await awardAchievementsForEconomyTransact(db, characterName, kind, txId, note);
      if (delta > 0) {
        await awardAchievementsAfterPositiveCredit(db, characterName, txId, delta);
      }
    } catch (_) {}

    if (kind === 'game_play') {
      try {
        await ensureFirstGameMissionCompletion(db, env, characterName, txId);
      } catch (_) {}
    }

    return jsonResponse({
      ok: true,
      id: txId,
      character_name: characterName,
      delta,
      balance_after: currentBalance + delta,
      economy_authority: 'lantern_legacy',
    }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}

/** Prompt #190 — authenticated People search for Create tagging. */
async function handlePeopleRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  const account = await getPilotAccountFromRequest(request, env);
  if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
  if (pilotAccountRequiresChangePassword(account)) {
    return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
  }
  if (request.method === 'GET' && path === '/api/people/search') {
    const q = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
    const limit = url.searchParams.get('limit');
    const kind = (url.searchParams.get('kind') || url.searchParams.get('kinds') || '').trim();
    const result = await searchPeople(db, q, limit, { kind });
    if (!result.ok) return jsonResponse(result, 503, cors);
    return jsonResponse(
      {
        ok: true,
        students: result.students,
        staff: result.staff,
      },
      200,
      cors
    );
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
    // Prompt #186 — submission identity/authorization from authenticated session only.
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
    if (pilotAccountRequiresChangePassword(account)) {
      return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
    }
    const sessionRole = String(account.role || '').trim().toLowerCase();
    // Preserve historic news publisher set (teacher/staff/admin). Do not widen isTeacherLike.
    const NEWS_PUBLISHER_ROLES = ['teacher', 'staff', 'admin'];
    const authorType = NEWS_PUBLISHER_ROLES.includes(sessionRole) ? sessionRole : 'student';
    const clientClaim = (body.author_type || '').trim().toLowerCase();
    if (clientClaim && NEWS_PUBLISHER_ROLES.includes(clientClaim) && authorType === 'student') {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    const title = (body.title || '').trim();
    const articleBody = (body.body || '').trim();
    // Prompt #170 — actor_id is the durable account key from session. Client actor_id /
    // author_name / account_key are not identity authority.
    const actorId = durableAccountKeyFromPilotAccount(account);
    if (!actorId) return jsonResponse({ ok: false, error: 'account_link_missing' }, 400, cors);
    let authorName = '';
    if (authorType === 'student') {
      authorName = String(account.display_name || account.student_character_name || account.username || '').trim();
    } else {
      authorName = String(account.display_name || account.username || '').trim();
    }
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
    const isShoutOut = String(category || '').trim().toLowerCase() === 'student spotlight';
    let peopleNorm;
    let shoutRecognitionLabel = '';
    if (isShoutOut) {
      // Prompt #213 — Recognizing may be a canonical person OR free-text group/label.
      const shoutRec = await normalizeShoutOutRecognition(db, body.people, body.recognition_label);
      if (!shoutRec.ok) return jsonResponse({ ok: false, error: shoutRec.error }, 400, cors);
      peopleNorm = { ok: true, people: shoutRec.people };
      shoutRecognitionLabel = shoutRec.recognition_label;
    } else {
      peopleNorm = await normalizePeoplePayload(db, body.people, { requireRecognizedOne: false });
      if (!peopleNorm.ok) return jsonResponse({ ok: false, error: peopleNorm.error }, 400, cors);
    }
    if (!title) return jsonResponse({ ok: false, error: 'Missing title' }, 400, cors);
    if (!authorName) return jsonResponse({ ok: false, error: 'Missing author_name' }, 400, cors);
    let articleBodyFinal = articleBody;
    if (isShoutOut && shoutRecognitionLabel) {
      // Keep Recognizing: prefix for Explore/mission detectors; person identity is relational when present.
      if (!/^Recognizing:\s*/i.test(articleBodyFinal)) {
        articleBodyFinal = 'Recognizing: ' + shoutRecognitionLabel + '\n\n' + articleBodyFinal;
      }
    }
    const id = 'news-' + crypto.randomUUID();
    const now = new Date().toISOString();
    const staffPublisher = NEWS_PUBLISHER_ROLES.includes(authorType);
    const status = staffPublisher ? 'approved' : 'pending';
    const reviewedAt = staffPublisher ? now : null;
    const reviewedBy = staffPublisher ? (authorName || 'Teacher') : null;
    await db.prepare(
      'INSERT INTO lantern_news_submissions (id, title, body, actor_id, author_name, author_type, image_r2_key, full_image_r2_key, image_file_name, image_mime_type, image_file_size, photo_credit, video_r2_key, video_file_name, video_mime_type, video_file_size, link_url, category, status, created_at, reviewed_at, reviewed_by_staff_id, reviewed_by_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, title, articleBodyFinal, actorId || null, authorName, authorType, imageR2Key, fullImageR2Key, imageFileName, imageMimeType, imageFileSize, photoCredit, videoR2Key, videoFileName, videoMimeType, videoFileSize, linkUrl, category, status, now, reviewedAt, null, reviewedBy).run();
    try {
      await replaceContentPeople(db, 'news', id, peopleNorm.people, account.username);
    } catch (_) {
      return jsonResponse({ ok: false, error: 'people_schema_required' }, 503, cors);
    }
    if (!staffPublisher) {
      const approvalId = 'approval-' + crypto.randomUUID();
      await db.prepare(
        'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(approvalId, 'news', id, 'pending', actorId || null, authorName, null, now).run();
    }
    try {
      await awardAchievementsForNewsCreate(db, authorName, authorType, id);
    } catch (_) {}
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
      "SELECT id, title, body, actor_id, author_name, author_type, image_r2_key, full_image_r2_key, image_file_name, image_mime_type, image_file_size, photo_credit, video_r2_key, video_file_name, video_mime_type, video_file_size, link_url, category, status, created_at, reviewed_at FROM lantern_news_submissions WHERE LOWER(TRIM(status)) = 'approved' AND (hidden_at IS NULL OR hidden_at = '') ORDER BY reviewed_at DESC, created_at DESC"
    ).all();
    // Prompt #97: known demo/fake personas (created while building the app) have real, approved
    // rows in production — filter them from this production-facing response rather than deleting
    // the historical rows. See worker/demo-persona-guard.js.
    let rawResults = filterOutDemoPersonas(rows.results || [], 'author_name');
    // Prompt #3 — Hallway TV / Display surface only (internal Explore keeps restricted authors).
    const forDisplay =
      url.searchParams.get('for_display') === '1' ||
      url.searchParams.get('for_display') === 'true' ||
      url.searchParams.get('surface') === 'hallway';
    if (forDisplay) {
      rawResults = await filterNewsRowsForHallwayTv(db, rawResults);
    }
    console.log('[GET /api/news/approved] row count:', rawResults.length);
    // Prompt #218 — expose actor_id + Locker avatar key so ticker/LLHC do not look up display names.
    const avatarIndex = await loadPilotAvatarKeyIndex(db);
    const staffNameIndex = await loadStaffPublicNameIndex(db);
    const peopleByContent = await loadContentPeopleIndex(db);
    const list = rawResults.map(r => {
      const people = peopleByContent.get('news|' + String(r.id || '').trim()) || [];
      const overlaid = overlayNewsRowRecognizedStaff(
        {
          id: r.id,
          title: r.title,
          body: r.body,
        },
        staffNameIndex,
        people
      );
      return {
      id: r.id,
      title: overlaid.title,
      body: overlaid.body,
      category: r.category != null && String(r.category).trim() !== '' ? String(r.category).trim() : null,
      actor_id: r.actor_id != null && String(r.actor_id).trim() ? String(r.actor_id).trim() : null,
      author_avatar_key: resolveAuthorAvatarKey(avatarIndex, {
        actor_id: r.actor_id,
        author_name: r.author_name,
        character_name: r.actor_id,
      }) || null,
      author_name: r.author_name,
      author_public_label: resolveAuthorPublicLabel(staffNameIndex, {
        actor_id: r.actor_id,
        author_name: r.author_name,
        author_type: r.author_type,
        authorRole: r.author_type,
      }) || null,
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
    };
    });
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

  // Prompt #226 — author soft-remove (published) + withdraw (pending). Reuses hidden_at/hidden_by.
  if (request.method === 'POST' && path === '/api/content/remove') {
    const pilotCors = corsForPilot(request);
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, pilotCors);
    if (pilotAccountRequiresChangePassword(account)) {
      return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, pilotCors);
    }
    let body;
    try { body = JSON.parse(await request.text() || '{}'); } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors);
    }
    const parsed = parseContentRemoveTarget(body.item_type || body.type, body.item_id || body.id);
    const result = await authorRemovePublishedContent(db, {
      itemType: parsed.itemType,
      itemId: parsed.itemId,
      account,
      pilotEconomyCharacterName,
      authorKeyFromAccount: feedAuthorKeyFromAccount,
    });
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, result.code || 400, pilotCors);
    }
    return jsonResponse({
      ok: true,
      id: result.id,
      item_type: result.item_type,
      hidden_at: result.hidden_at,
      hidden_by: result.hidden_by,
      removal_label: result.removal_label || 'Removed by author',
      already_removed: !!result.already_removed,
      idempotent: !!result.idempotent,
    }, 200, pilotCors);
  }

  if (request.method === 'POST' && path === '/api/content/withdraw') {
    const pilotCors = corsForPilot(request);
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, pilotCors);
    if (pilotAccountRequiresChangePassword(account)) {
      return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, pilotCors);
    }
    let body;
    try { body = JSON.parse(await request.text() || '{}'); } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors);
    }
    const itemType = String(body.item_type || body.type || '').trim().toLowerCase();
    const itemId = String(body.item_id || body.id || '').trim();
    const result = await authorWithdrawPendingContent(db, {
      itemType,
      itemId,
      account,
      pilotEconomyCharacterName,
      authorKeyFromAccount: feedAuthorKeyFromAccount,
    });
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, result.code || 400, pilotCors);
    }
    return jsonResponse({
      ok: true,
      id: result.id,
      item_type: result.item_type,
      status: result.status,
      already_withdrawn: !!result.already_withdrawn,
      idempotent: !!result.idempotent,
    }, 200, pilotCors);
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
      removal_label: removalStatusLabel(r.hidden_by),
      removed_by_author: isAuthorRemovalLabel(r.hidden_by),
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

  // Prompt #92 — every /api/approvals/* action is a staff (teacher/admin) operation; require an
  // authenticated Lantern session up front, same as missions/admin routes already do elsewhere.
  // Below, the acting staff identity for filtering and audit fields comes from this session
  // account, never from client-supplied staff_id/staff_name/reviewed_by_* request fields.
  const auth = await requireStaffPilotSession(request, env, approvalsCors);
  if (auth.response) return auth.response;
  const account = auth.account;

  if (request.method === 'GET' && path === '/api/approvals/pending') {
    const staffId = sessionTeacherId(account);
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
        const newsRow = await db.prepare('SELECT id, title, body, actor_id, author_name, author_type, image_r2_key, video_r2_key, link_url, category FROM lantern_news_submissions WHERE id = ?').bind(a.item_id).first();
        if (newsRow) {
          title = newsRow.title || '';
          preview_url = newsRow.image_r2_key ? origin + '/api/news/image?key=' + encodeURIComponent(newsRow.image_r2_key) : null;
          const videoUrl = newsRow.video_r2_key ? origin + '/api/news/video?key=' + encodeURIComponent(newsRow.video_r2_key) : null;
          const linkUrl = (newsRow.link_url && /^https?:\/\//i.test(String(newsRow.link_url).trim())) ? String(newsRow.link_url).trim().slice(0, 2000) : null;
          const cat = newsRow.category != null && String(newsRow.category).trim() !== '' ? String(newsRow.category).trim() : null;
          const peopleRows = await listContentPeople(db, 'news', a.item_id);
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
            people: publicPeopleForReview(peopleRows),
            media_publicity: await buildReviewMediaPublicitySummary(db, {
              contentKind: 'news',
              contentId: a.item_id,
              peopleRows,
              authorFields: {
                actor_id: newsRow.actor_id,
                author_name: newsRow.author_name,
                submitted_by_actor_id: a.submitted_by_actor_id,
              },
              authorType: newsRow.author_type || 'student',
              videoKey: newsRow.video_r2_key,
              imageKey: newsRow.image_r2_key,
            }),
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
          pc = await db.prepare('SELECT question, choices_json, image_url, fallback_key, character_name FROM lantern_poll_contributions WHERE id = ?').bind(a.item_id).first();
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
          const peopleRows = await listContentPeople(db, 'poll_contribution', a.item_id);
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
            people: publicPeopleForReview(peopleRows),
            media_publicity: await buildReviewMediaPublicitySummary(db, {
              contentKind: 'poll_contribution',
              contentId: a.item_id,
              peopleRows,
              authorFields: {
                character_name: pc.character_name,
                author_name: pc.character_name,
                submitted_by_actor_id: a.submitted_by_actor_id,
              },
              authorType: 'student',
              videoKey: '',
              imageKey: pc.image_url,
            }),
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

  // Prompt #3 — staff-only restricted student list for Review Submissions (no parent/waiver notes).
  if (request.method === 'GET' && path === '/api/approvals/media-publicity-restrictions') {
    let tmsStudents = [];
    try {
      const bridge = await callTmsRosterBridge(env, 'roster/list', { include_inactive: false });
      if (bridge && bridge.ok && Array.isArray(bridge.students)) tmsStudents = bridge.students;
    } catch (_) {}
    const list = await listRestrictedStudentsForStaff(db, tmsStudents);
    return jsonResponse({ ok: true, count: list.length, students: list }, 200, approvalsCors);
  }

  // Prompt #3 — durable external-media clearance (YouTube / external hosting gate).
  if (request.method === 'POST' && path === '/api/approvals/external-media-clear') {
    let body;
    try {
      body = JSON.parse(await request.text() || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, approvalsCors);
    }
    const itemType = String(body.item_type || body.content_kind || '').trim().toLowerCase();
    const itemId = String(body.item_id || body.content_id || body.id || '').trim();
    if (!itemType || !itemId) {
      return jsonResponse({ ok: false, error: 'missing_item' }, 400, approvalsCors);
    }
    const contentKind = itemType === 'poll' ? 'poll_contribution' : itemType;
    const restrictedSet = await loadRestrictedStudentIdSet(db);
    let videoKey = '';
    let imageKey = '';
    let peopleRows = [];
    if (contentKind === 'news') {
      const row = await db
        .prepare('SELECT video_r2_key, image_r2_key FROM lantern_news_submissions WHERE id = ?')
        .bind(itemId)
        .first();
      if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404, approvalsCors);
      videoKey = row.video_r2_key || '';
      imageKey = row.image_r2_key || '';
      peopleRows = await listContentPeople(db, 'news', itemId);
    } else if (contentKind === 'poll_contribution') {
      const row = await db
        .prepare('SELECT image_url FROM lantern_poll_contributions WHERE id = ?')
        .bind(itemId)
        .first();
      if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404, approvalsCors);
      imageKey = row.image_url || '';
      peopleRows = await listContentPeople(db, 'poll_contribution', itemId);
    } else {
      return jsonResponse({ ok: false, error: 'unsupported_item_type' }, 400, approvalsCors);
    }
    const knownRestricted = knownRestrictedPeopleFromRows(peopleRows, restrictedSet);
    if (knownRestricted.length) {
      return jsonResponse(
        {
          ok: false,
          error: 'known_restricted_student_associated',
          known_restricted_people: knownRestricted,
        },
        403,
        approvalsCors
      );
    }
    const fingerprint = computeExternalAssetFingerprint({
      videoKey,
      imageKey,
      peopleKeys: peopleRows.map((p) => p.person_key).filter(Boolean),
    });
    const saved = await recordExternalMediaClearance(db, {
      contentKind,
      contentId: itemId,
      clearedBy: reviewerLabelFromAccount(account),
      assetFingerprint: fingerprint,
    });
    if (!saved.ok) return jsonResponse({ ok: false, error: saved.error || 'clearance_failed' }, 503, approvalsCors);
    return jsonResponse({ ok: true, clearance: saved }, 200, approvalsCors);
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
    // Prompt #92 — acting staff identity is always server-derived from the authenticated
    // session account; client-supplied reviewed_by_staff_name/staff_name/staff_id fields are
    // no longer trusted (they cannot be used to impersonate another staff member).
    const staffName = reviewerLabelFromAccount(account);
    const staffId = sessionTeacherId(account);
    const approval = await db.prepare('SELECT id, item_type, item_id, status FROM lantern_approvals WHERE id = ?').bind(id).first();
    if (!approval) return jsonResponse({ ok: false, error: 'Approval not found' }, 404, approvalsCors);
    const approvalStatus = String(approval.status || '').trim().toLowerCase();
    if (approvalStatus !== 'pending' && approvalStatus !== 'approved') {
      return jsonResponse({ ok: false, error: 'Already reviewed' }, 400, approvalsCors);
    }
    const now = new Date().toISOString();
    // Prompt #211 — for poll_contribution, finalize canonical poll BEFORE marking approval approved
    // (and repair already-approved rows that never got a lantern_polls insert).
    if (approval.item_type === 'poll_contribution') {
      try {
        const pc = await db.prepare(
          'SELECT id, character_name, question, choices_json, image_url, fallback_key, status FROM lantern_poll_contributions WHERE id = ?'
        ).bind(approval.item_id).first();
        if (!pc) return jsonResponse({ ok: false, error: 'Contribution not found' }, 404, approvalsCors);
        const pub = await finalizePollContributionPublish(db, origin, pc, {
          now,
          reviewedBy: staffName,
        });
        if (!pub.ok) {
          return jsonResponse({ ok: false, error: pub.error || 'poll_publish_failed', detail: pub.detail || null }, 503, approvalsCors);
        }
        if (approvalStatus === 'pending') {
          await db.prepare(
            'UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
          ).bind('approved', now, staffId || null, staffName, null, id).run();
        }
        try {
          if (pc.character_name) {
            // Prompt #224 — first student Poll publish today may +1; mission progress is once-ever without Nugget.
            try {
              await awardStudentDailyContentCreationReward(db, env, {
                type: 'poll',
                characterName: pc.character_name,
                authorType: 'student',
                sourceRef: pc.id,
              });
            } catch (_) {}
            await ensureContentApprovedMissionCompletion(db, env, 'poll', pc.character_name, pc.id);
          }
        } catch (_) {}
        return jsonResponse({ ok: true, id, status: 'approved', poll_id: pub.pollId }, 200, approvalsCors);
      } catch (e) {
        return jsonResponse({ ok: false, error: 'poll_publish_failed' }, 503, approvalsCors);
      }
    }
    if (approvalStatus !== 'pending') {
      return jsonResponse({ ok: false, error: 'Already reviewed' }, 400, approvalsCors);
    }
    await db.prepare(
      'UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
    ).bind('approved', now, staffId || null, staffName, null, id).run();
    if (approval.item_type === 'news') {
      await db.prepare(
        'UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ? WHERE id = ?'
      ).bind('approved', now, staffId || null, staffName, approval.item_id).run();
      try {
        const newsRow = await db
          .prepare('SELECT author_name, author_type, category, image_r2_key, body, title FROM lantern_news_submissions WHERE id = ?')
          .bind(approval.item_id)
          .first();
        if (newsRow && newsRow.author_name) {
          await awardAchievementsForNewsApproved(db, newsRow.author_name, approval.item_id);
          const authorType = String(newsRow.author_type || 'student').trim().toLowerCase();
          // Prompt #177 — peer Shout-Out news (with or without media) completes Shout-Out Someone.
          if (isPeerShoutOutNewsSubmission(newsRow)) {
            try {
              await awardStudentDailyContentCreationReward(db, env, {
                type: 'shoutout',
                characterName: newsRow.author_name,
                authorType,
                sourceRef: approval.item_id,
              });
            } catch (_) {}
            await ensureContentApprovedMissionCompletion(db, env, 'shoutout', newsRow.author_name, approval.item_id);
          } else {
            const cat = String(newsRow.category || '').trim().toLowerCase();
            const hasImage = !!(newsRow.image_r2_key && String(newsRow.image_r2_key).trim());
            // Prompt #165 — only explicit Photo category news counts as First Photo Share.
            if (cat === 'photo' && hasImage) {
              await ensureContentApprovedMissionCompletion(db, env, 'photo', newsRow.author_name, approval.item_id);
            } else {
              // Prompt #224 — first student News/Update publish today may +1 Nugget.
              try {
                await awardStudentDailyContentCreationReward(db, env, {
                  type: 'news',
                  characterName: newsRow.author_name,
                  authorType,
                  sourceRef: approval.item_id,
                });
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
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
    // Prompt #92 — server-derived staff identity (see approve above); client fields ignored.
    const staffName = reviewerLabelFromAccount(account);
    const staffId = sessionTeacherId(account);
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
    // Prompt #92 — server-derived staff identity (see approve above); client fields ignored.
    const staffName = reviewerLabelFromAccount(account);
    const staffId = sessionTeacherId(account);
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
    // Prompt #92 — server-derived staff identity (see approve above); client fields ignored.
    const staffId = sessionTeacherId(account);
    const staffName = reviewerLabelFromAccount(account);
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

/** Moderation: report/flag (authenticated user) + flagged list (staff). Prompt #117. */
async function handleModerationRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'POST' && path === '/api/report') {
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
    if (pilotAccountRequiresChangePassword(account)) {
      return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const norm = resolveReportTargetIds(body.item_type || body.type || '', body.item_id || body.id || '');
    const itemId = norm ? norm.itemId : '';
    const reason = String(body.reason || '').trim().slice(0, 500);
    if (!norm) return jsonResponse({ ok: false, error: 'Invalid item_type' }, 400, cors);
    if (!itemId) return jsonResponse({ ok: false, error: 'Missing item_type or item_id' }, 400, cors);

    const reportedBy = reporterIdentityFromAccount(account, pilotEconomyCharacterName);
    if (!reportedBy) return jsonResponse({ ok: false, error: 'Missing reported_by' }, 400, cors);

    const now = new Date().toISOString();
    const audit = reportQuarantineAuditLabel(account);
    const hide = await quarantineReportedContent(db, norm.hideKind, itemId, audit, now);
    if (!hide.ok) {
      return jsonResponse({ ok: false, error: hide.error || 'quarantine_failed' }, hide.code || 400, cors);
    }

    const id = 'flag-' + crypto.randomUUID();
    try {
      await db
        .prepare(
          'INSERT INTO lantern_content_flags (id, item_type, item_id, reported_by, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(id, norm.canonical, itemId, reportedBy, reason || null, now)
        .run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Report failed' }, 500, cors);
    }
    return jsonResponse(
      {
        ok: true,
        id,
        created_at: now,
        item_type: norm.canonical,
        item_id: itemId,
        quarantined: true,
        already_hidden: !!hide.already_hidden,
        hidden_at: hide.hidden_at || now,
        status_label: reportStatusLabel(hide.hidden_by || audit) || 'REPORTED — HIDDEN PENDING REVIEW',
      },
      200,
      cors
    );
  }

  if (request.method === 'GET' && path === '/api/moderation/flagged') {
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
    if (!isTeacherLike(account)) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const rows = await db
      .prepare(
        'SELECT id, item_type, item_id, reported_by, reason, created_at FROM lantern_content_flags ORDER BY created_at DESC LIMIT ?'
      )
      .bind(limit)
      .all();
    const list = [];
    for (const r of rows.results || []) {
      const norm = normalizeReportItemType(r.item_type);
      let hiddenAt = null;
      let hiddenBy = null;
      if (norm && r.item_id) {
        try {
          if (norm.hideKind === 'news') {
            const row = await db
              .prepare('SELECT hidden_at, hidden_by FROM lantern_news_submissions WHERE id = ?')
              .bind(r.item_id)
              .first();
            hiddenAt = row && row.hidden_at;
            hiddenBy = row && row.hidden_by;
          } else if (norm.hideKind === 'poll') {
            const row = await db
              .prepare('SELECT hidden_at, hidden_by FROM lantern_polls WHERE id = ?')
              .bind(r.item_id)
              .first();
            hiddenAt = row && row.hidden_at;
            hiddenBy = row && row.hidden_by;
          } else if (norm.hideKind === 'mission') {
            const row = await db
              .prepare('SELECT hidden_at, hidden_by FROM lantern_mission_submissions WHERE id = ?')
              .bind(r.item_id)
              .first();
            hiddenAt = row && row.hidden_at;
            hiddenBy = row && row.hidden_by;
          } else if (norm.hideKind === 'feed') {
            const row = await db
              .prepare('SELECT hidden_at, hidden_by, status FROM lantern_feed_items WHERE id = ?')
              .bind(r.item_id)
              .first();
            hiddenAt = row && row.hidden_at;
            hiddenBy = row && row.hidden_by;
            if (!hiddenAt && row && String(row.status || '').toLowerCase() === 'hidden') {
              hiddenAt = r.created_at;
            }
          }
        } catch (_) {}
      }
      const pendingReview = !!(hiddenAt && String(hiddenAt).trim());
      list.push({
        id: r.id,
        item_type: r.item_type,
        item_id: r.item_id,
        reported_by: r.reported_by,
        reason: r.reason,
        created_at: r.created_at,
        hidden_at: hiddenAt || null,
        hidden_by: hiddenBy || null,
        quarantine_pending: pendingReview,
        status_label: pendingReview
          ? reportStatusLabel(hiddenBy) || 'REPORTED — HIDDEN PENDING REVIEW'
          : 'Reported',
        report_quarantine: isReportQuarantineLabel(hiddenBy),
      });
    }
    return jsonResponse({ ok: true, flags: list }, 200, cors);
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
    // Prompt #211 — session identity/role is authoritative (mirror news/create).
    const account = await getPilotAccountFromRequest(request, env);
    if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
    if (pilotAccountRequiresChangePassword(account)) {
      return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
    }
    const sessionRole = String(account.role || '').trim().toLowerCase();
    const staffPublisher = isPollPublisherRole(sessionRole);
    const clientClaim = String(body.author_type || body.role || '').trim().toLowerCase();
    if (clientClaim && isPollPublisherRole(clientClaim) && !staffPublisher) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    // Prompt #170 — persist the exact durable account key from session. Client
    // character_name / author_name / display labels are not identity authority.
    const characterName = durableAccountKeyFromPilotAccount(account);
    if (!characterName) return jsonResponse({ ok: false, error: 'character_name required' }, 400, cors);
    const question = (body.question || '').trim().slice(0, 500);
    let choices = parsePollChoices(body.choices);
    const imageUrl = (body.image_url || '').trim().slice(0, 500) || null;
    const fallbackKeyRaw = (body.fallback_key || '').trim();
    const ALLOWED_FB = ['poll', 'news', 'creation', 'generic', 'shoutout', 'explain'];
    if (!question) return jsonResponse({ ok: false, error: 'question required' }, 400, cors);
    if (choices.length < 2 || choices.length > 5) return jsonResponse({ ok: false, error: 'Provide 2–5 answer choices' }, 400, cors);
    // Prompt #186 — canonical Poll fallback when no image; do not require style picker.
    const fallbackResolved = imageUrl
      ? null
      : (ALLOWED_FB.includes(fallbackKeyRaw) ? fallbackKeyRaw : 'poll');
    const peopleNorm = await normalizePeoplePayload(db, body.people, { requireRecognizedOne: false });
    if (!peopleNorm.ok) return jsonResponse({ ok: false, error: peopleNorm.error }, 400, cors);
    const contribId = 'pcontrib_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const choicesJson = JSON.stringify(choices);
    const fb = fallbackResolved;
    const contribStatus = staffPublisher ? 'approved' : 'pending';
    try {
      await db.prepare(
        'INSERT INTO lantern_poll_contributions (id, character_name, question, choices_json, image_url, fallback_key, status, created_at, reviewed_at, reviewed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        contribId,
        characterName,
        question,
        choicesJson,
        imageUrl,
        fb,
        contribStatus,
        now,
        staffPublisher ? now : null,
        staffPublisher ? (characterName || 'Teacher') : null
      ).run();
    } catch (e) {
      // Older schemas may lack reviewed_* on insert — fall back without them.
      try {
        await db.prepare(
          'INSERT INTO lantern_poll_contributions (id, character_name, question, choices_json, image_url, fallback_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(contribId, characterName, question, choicesJson, imageUrl, fb, contribStatus, now).run();
      } catch (e2) {
        return jsonResponse({ ok: false, error: 'Poll submissions require DB migration 029 (lantern_poll_contributions)' }, 503, cors);
      }
    }
    try {
      await replaceContentPeople(db, 'poll_contribution', contribId, peopleNorm.people, account.username || characterName);
    } catch (_) {
      return jsonResponse({ ok: false, error: 'people_schema_required' }, 503, cors);
    }
    if (staffPublisher) {
      const pc = {
        id: contribId,
        character_name: characterName,
        question,
        choices_json: choicesJson,
        image_url: imageUrl,
        fallback_key: fb,
        status: 'approved',
      };
      const pub = await finalizePollContributionPublish(db, origin, pc, {
        now,
        reviewedBy: characterName || 'Teacher',
      });
      if (!pub.ok) {
        return jsonResponse({ ok: false, error: pub.error || 'poll_publish_failed', detail: pub.detail || null }, 503, cors);
      }
      try {
        await awardAchievementsForPollContribute(db, characterName, contribId);
      } catch (_) {}
      try {
        // Staff immediate publish (#211): no student daily content_reward.
        // Create-a-Poll mission progress may still mark; Nugget skipped (#224 skipReward).
        await ensureContentApprovedMissionCompletion(db, env, 'poll', characterName, contribId);
      } catch (_) {}
      return jsonResponse({
        ok: true,
        id: contribId,
        poll_id: pub.pollId,
        status: 'approved',
        message: 'Published.',
      }, 200, cors);
    }
    const approvalId = 'appr_poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    await db.prepare(
      'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(approvalId, 'poll_contribution', contribId, 'pending', characterName, characterName, null, now).run();
    try {
      await awardAchievementsForPollContribute(db, characterName, contribId);
    } catch (_) {}
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
    // Prompt #186 — canonical Poll fallback when no image on resubmit.
    const fallbackResolved = imageUrl
      ? null
      : (ALLOWED_FB.includes(fallbackKeyRaw) ? fallbackKeyRaw : 'poll');
    const peopleNorm = await normalizePeoplePayload(db, body.people, { requireRecognizedOne: false });
    if (!peopleNorm.ok) return jsonResponse({ ok: false, error: peopleNorm.error }, 400, cors);
    const row = await db.prepare('SELECT id, status FROM lantern_poll_contributions WHERE id = ? AND character_name = ?').bind(contribId, characterName).first();
    if (!row) return jsonResponse({ ok: false, error: 'Contribution not found' }, 404, cors);
    if ((row.status || '') !== 'returned') return jsonResponse({ ok: false, error: 'Can only resubmit returned polls' }, 400, cors);
    const now = new Date().toISOString();
    const choicesJson = JSON.stringify(choices);
    const fb = fallbackResolved;
    await db.prepare(
      'UPDATE lantern_poll_contributions SET question = ?, choices_json = ?, image_url = ?, fallback_key = ?, status = ?, decision_note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?'
    ).bind(question, choicesJson, imageUrl, fb, 'pending', null, null, null, contribId).run();
    try {
      await replaceContentPeople(db, 'poll_contribution', contribId, peopleNorm.people, characterName);
    } catch (_) {
      return jsonResponse({ ok: false, error: 'people_schema_required' }, 503, cors);
    }
    const approvalId = 'appr_poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    await db.prepare(
      'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(approvalId, 'poll_contribution', contribId, 'pending', characterName, characterName, null, now).run();
    return jsonResponse({ ok: true, id: contribId, status: 'pending', message: 'Resubmitted for teacher approval.' }, 200, cors);
  }

  // Prompt #213 — admin hide/restore for published polls (Feed visibility).
  if (request.method === 'POST' && path === '/api/polls/hide') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    let body;
    try { body = JSON.parse(await request.text() || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors); }
    const id = parseModerationBodyId(body);
    const hiddenBy = adminAuditLabel(gate.account);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id, approved_at FROM lantern_polls WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    const now = new Date().toISOString();
    try {
      await db.prepare('UPDATE lantern_polls SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, hiddenBy, id).run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Poll hide requires DB migration 067 (hidden_at on lantern_polls)' }, 503, pilotCors);
    }
    return jsonResponse({ ok: true, id, hidden_at: now }, 200, pilotCors);
  }

  if (request.method === 'POST' && path === '/api/polls/restore') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    let body;
    try { body = JSON.parse(await request.text() || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors); }
    const id = parseModerationBodyId(body);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id FROM lantern_polls WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    try {
      await db.prepare('UPDATE lantern_polls SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Poll restore requires DB migration 067 (hidden_at on lantern_polls)' }, 503, pilotCors);
    }
    return jsonResponse({ ok: true, id }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/polls/hidden') {
    const pilotCors = corsForPilot(request);
    const gate = await requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    let rows;
    try {
      rows = await db.prepare(
        "SELECT id, question, character_name, created_at, approved_at, hidden_at, hidden_by FROM lantern_polls WHERE hidden_at IS NOT NULL AND hidden_at != '' ORDER BY hidden_at DESC"
      ).all();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Poll hide requires DB migration 067 (hidden_at on lantern_polls)' }, 503, pilotCors);
    }
    const list = (rows.results || []).map((r) => ({
      id: r.id,
      question: r.question || '',
      character_name: r.character_name || '',
      created_at: r.created_at || '',
      approved_at: r.approved_at || null,
      hidden_at: r.hidden_at || null,
      hidden_by: r.hidden_by || null,
      removal_label: removalStatusLabel(r.hidden_by),
      removed_by_author: isAuthorRemovalLabel(r.hidden_by),
    }));
    return jsonResponse({ ok: true, polls: list }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/polls') {
    let rows;
    try {
      rows = await db.prepare(
        "SELECT id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL AND (hidden_at IS NULL OR hidden_at = '') ORDER BY approved_at DESC LIMIT 50"
      ).all();
    } catch (e) {
      try {
        rows = await db.prepare(
          'SELECT id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 50'
        ).all();
      } catch (e2) {
        rows = await db.prepare(
          'SELECT id, mission_submission_id, question, choices_json, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 50'
        ).all();
      }
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
    if (pollId === 'hide' || pollId === 'restore' || pollId === 'hidden' || pollId === 'contribute' || pollId === 'contributions' || pollId === 'returned' || pollId === 'resubmit' || pollId === 'vote') {
      return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
    }
    let row;
    try {
      row = await db.prepare(
        "SELECT id, question, choices_json, image_url, character_name, created_at FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL AND (hidden_at IS NULL OR hidden_at = '')"
      ).bind(pollId).first();
    } catch (e) {
      try {
        row = await db.prepare('SELECT id, question, choices_json, image_url, character_name, created_at FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL').bind(pollId).first();
      } catch (e2) {
        row = await db.prepare('SELECT id, question, choices_json, character_name, created_at FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL').bind(pollId).first();
      }
    }
    if (!row) return jsonResponse({ ok: false, error: 'Poll not found' }, 404, cors);
    let choices = [];
    try { choices = JSON.parse(row.choices_json || '[]'); } catch (_) {}
    if (!Array.isArray(choices)) choices = [];
    const avatarIndex = await loadPilotAvatarKeyIndex(db);
    const authorAvatarKey = resolveAuthorAvatarKey(avatarIndex, {
      character_name: row.character_name,
      author_name: row.character_name,
    }) || null;
    const staffNameIndex = await loadStaffPublicNameIndex(db);
    const authorPublicLabel = resolveAuthorPublicLabel(staffNameIndex, {
      actor_id: row.character_name,
      author_name: row.character_name,
      author_type: '',
      authorAvatarKey,
    }) || null;
    // Prompt #215 — voter identity + result privacy from authenticated session only.
    // Do NOT trust ?character_name= to unlock aggregate results for an unvoted viewer.
    const pilotAccount = await getPilotAccountFromRequest(request, env);
    let characterName = '';
    if (pilotAccount) {
      const identity = resolveEconomyGamePlayTransact(pilotAccount, null, pilotEconomyCharacterName);
      if (identity && identity.ok) characterName = String(identity.characterName || '').trim();
    }
    const voteRow = characterName
      ? await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ?').bind(pollId, characterName).first()
      : null;
    const hasVoted = !!voteRow;
    const votedChoiceIndex = hasVoted ? Math.floor(Number(voteRow.choice_index)) : null;
    let pollReward = null;
    if (hasVoted && characterName) {
      try {
        pollReward = await creditPollCompletionReward(db, env, pollId, characterName);
      } catch (_) {
        pollReward = { ok: false, status: 'failed', voter_nuggets: 0 };
      }
    }
    let results = null;
    if (hasVoted) {
      const voteRows = await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ?').bind(pollId).all();
      const counts = {};
      (voteRows.results || []).forEach(v => { counts[v.choice_index] = (counts[v.choice_index] || 0) + 1; });
      const total = (voteRows.results || []).length;
      results = choices.map((c, i) => ({
        choice: c,
        count: counts[i] || 0,
        percentage: total > 0 ? Math.round(((counts[i] || 0) / total) * 100) : 0,
        is_yours: votedChoiceIndex === i,
      }));
    }
    return jsonResponse({
      ok: true,
      poll: {
        id: row.id,
        question: row.question,
        choices,
        image_url: row.image_url || null,
        character_name: row.character_name,
        author_avatar_key: authorAvatarKey,
        author_public_label: authorPublicLabel,
        created_at: row.created_at,
      },
      has_voted: hasVoted,
      voted_choice_index: hasVoted ? votedChoiceIndex : null,
      results,
      ...pollRewardResponseFields(pollReward),
    }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/polls/vote') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const pollId = (body.poll_id || '').trim();
    const choiceIndex = Math.floor(Number(body.choice_index));
    if (!pollId) return jsonResponse({ ok: false, error: 'Missing poll_id' }, 400, cors);

    // Prompt #96: character_name -- and therefore who receives the +1 Nugget participation
    // reward -- must come from the authenticated session, never straight from the request body.
    // Reuses the same session-derived identity resolution as the game_play economy transact path
    // (student: session-derived only, ignores any client-supplied name; teacher/admin: may vote on
    // behalf of an explicit character for testing/demo, matching existing economy conventions).
    const pilotAccount = await getPilotAccountFromRequest(request, env);
    const identityAuth = resolveEconomyGamePlayTransact(pilotAccount, body.character_name, pilotEconomyCharacterName);
    if (!identityAuth.ok) {
      return jsonResponse({ ok: false, error: identityAuth.error }, identityAuth.code || 403, cors);
    }
    const characterName = identityAuth.characterName;

    let poll;
    try {
      poll = await db.prepare(
        "SELECT id, choices_json FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL AND (hidden_at IS NULL OR hidden_at = '')"
      ).bind(pollId).first();
    } catch (e) {
      poll = await db.prepare('SELECT id, choices_json FROM lantern_polls WHERE id = ? AND approved_at IS NOT NULL').bind(pollId).first();
    }
    if (!poll) return jsonResponse({ ok: false, error: 'Poll not found' }, 404, cors);
    let choices = [];
    try { choices = JSON.parse(poll.choices_json || '[]'); } catch (_) {}
    if (choiceIndex < 0 || choiceIndex >= choices.length) return jsonResponse({ ok: false, error: 'Invalid choice' }, 400, cors);
    const existing = await db.prepare('SELECT id, choice_index FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ?').bind(pollId, characterName).first();
    if (existing) {
      const lockedChoice = Math.floor(Number(existing.choice_index));
      const voteRows = await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ?').bind(pollId).all();
      const counts = {};
      (voteRows.results || []).forEach(v => { counts[v.choice_index] = (counts[v.choice_index] || 0) + 1; });
      const total = (voteRows.results || []).length;
      const results = choices.map((c, i) => ({
        choice: c,
        count: counts[i] || 0,
        percentage: total > 0 ? Math.round(((counts[i] || 0) / total) * 100) : 0,
        is_yours: i === lockedChoice,
      }));
      let replayReward = { ok: true, status: 'already', voter_nuggets: 0 };
      try {
        replayReward = await creditPollCompletionReward(db, env, pollId, characterName);
      } catch (_) {
        replayReward = { ok: false, status: 'failed', voter_nuggets: 0 };
      }
      return jsonResponse({
        ok: false,
        error: 'Already voted',
        already_voted: true,
        voted_choice_index: lockedChoice,
        results,
        ...pollRewardResponseFields(replayReward),
      }, 400, cors);
    }
    const now = new Date().toISOString();
    const voteId = 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try {
      await db.prepare('INSERT INTO lantern_poll_votes (id, poll_id, character_name, choice_index, created_at) VALUES (?, ?, ?, ?, ?)').bind(voteId, pollId, characterName, choiceIndex, now).run();
    } catch (e) {
      // Concurrent duplicate: UNIQUE(poll_id, character_name) — return locked vote, never insert again.
      if (e && /UNIQUE/i.test(String(e.message || e))) {
        const again = await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ?').bind(pollId, characterName).first();
        const lockedChoice = again != null ? Math.floor(Number(again.choice_index)) : choiceIndex;
        const voteRows = await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ?').bind(pollId).all();
        const counts = {};
        (voteRows.results || []).forEach(v => { counts[v.choice_index] = (counts[v.choice_index] || 0) + 1; });
        const total = (voteRows.results || []).length;
        const results = choices.map((c, i) => ({
          choice: c,
          count: counts[i] || 0,
          percentage: total > 0 ? Math.round(((counts[i] || 0) / total) * 100) : 0,
          is_yours: i === lockedChoice,
        }));
        return jsonResponse({
          ok: false,
          error: 'Already voted',
          already_voted: true,
          voted_choice_index: lockedChoice,
          results,
          ...pollRewardResponseFields(await creditPollCompletionReward(db, env, pollId, characterName).catch(function () {
            return { ok: false, status: 'failed', voter_nuggets: 0 };
          })),
        }, 400, cors);
      }
      throw e;
    }
    let pollReward = { ok: false, status: 'failed', voter_nuggets: 0 };
    try {
      pollReward = await creditPollCompletionReward(db, env, pollId, characterName);
    } catch (_) {}
    const voteRows = await db.prepare('SELECT choice_index FROM lantern_poll_votes WHERE poll_id = ?').bind(pollId).all();
    const counts = {};
    (voteRows.results || []).forEach(v => { counts[v.choice_index] = (counts[v.choice_index] || 0) + 1; });
    const total = (voteRows.results || []).length;
    const results = choices.map((c, i) => ({
      choice: c,
      count: counts[i] || 0,
      percentage: total > 0 ? Math.round(((counts[i] || 0) / total) * 100) : 0,
      is_yours: i === choiceIndex,
    }));
    return jsonResponse({
      ok: true,
      results,
      voted_choice_index: choiceIndex,
      ...pollRewardResponseFields(pollReward),
    }, 200, cors);
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

/** Games — culture/identity endpoints. FERPA-safe: public character list for Avatar Match only. */
async function handleGamesRoutes(request, url, path, env, cors) {
  const origin = url.origin || '';
  if (request.method === 'GET' && path === '/api/games/characters') {
    const db = env.DB;
    if (!db) return jsonResponse({ ok: true, characters: [] }, 200, cors);
    let accounts = [];
    let avatarByChar = {};
    try {
      const acc = await db
        .prepare(
          `SELECT username, display_name, public_display_name, first_name, last_name, honorific, role, is_active, student_character_name, mtss_student_id, teacher_id
           FROM lantern_pilot_accounts
           WHERE COALESCE(is_active, 1) = 1`
        )
        .all();
      accounts = acc.results || [];
    } catch (_) {
      return jsonResponse({ ok: true, characters: [] }, 200, cors);
    }
    try {
      const profiles = await db.prepare('SELECT character_name, current_avatar_key FROM lantern_avatar_profiles').all();
      (profiles.results || []).forEach((p) => {
        if (p.character_name && p.current_avatar_key) avatarByChar[p.character_name] = p.current_avatar_key;
      });
    } catch (_) {}
    const pool = uniqueAvatarMatchByLabel(
      buildAvatarMatchPool(accounts, avatarByChar, origin, avatarCharacterNameForPilotAccount)
    );
    return jsonResponse({ ok: true, characters: pool }, 200, cors);
  }
  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}

/** Leaderboards — daily (24h), weekly (7d), monthly (30d), school year (Aug 1 – May 31). */
async function handleLeaderboardRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'POST' && path === '/api/leaderboards/record') {
    // Prompt #128 — identity is session-owned. Client may send game id/name, score, score_display,
    // and run_id. Client character_name / account id / reward fields are ignored.
    // Prompt #159 — run_id is required and must match a successful paid game_play for this
    // session account and this catalog game. The UUID itself is not authority.
    const pilotAccount = await getPilotAccountFromRequest(request, env);
    const identityAuth = resolveEconomyGamePlayTransact(pilotAccount, '', pilotEconomyCharacterName);
    if (!identityAuth.ok) {
      return jsonResponse({ ok: false, error: identityAuth.error }, identityAuth.code || 403, cors);
    }
    const characterName = identityAuth.characterName;

    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }

    const game = resolveRegisteredLeaderboardGame(body.game_id || body.game_name);
    if (!game || !game.leaderboard || game.status !== 'playable') {
      return jsonResponse({ ok: false, error: 'invalid_game' }, 400, cors);
    }
    const gameName = game.name;

    const scoreCheck = validateLeaderboardScore(game, body.score);
    if (!scoreCheck.ok) {
      return jsonResponse({ ok: false, error: scoreCheck.error }, 400, cors);
    }
    const score = scoreCheck.score;
    const scoreDisplay = sanitizeScoreDisplay(body.score_display, score);
    const runId = sanitizeRunId(body.run_id || (body.meta && body.meta.run_id));
    if (!runId) {
      return jsonResponse({ ok: false, error: 'invalid_run' }, 400, cors);
    }
    const paidTx = await findPaidGamePlayByRunId(db, runId);
    const proof = evaluatePaidGamePlayRun(paidTx, { characterName, game, nowMs: Date.now() });
    if (!proof.ok) {
      return jsonResponse({ ok: false, error: proof.error || 'invalid_run' }, 400, cors);
    }
    const meta = body.meta && typeof body.meta === 'object' ? { ...body.meta } : {};
    delete meta.character_name;
    delete meta.username;
    delete meta.account_id;
    delete meta.nuggets;
    delete meta.reward;
    delete meta.delta;
    meta.run_id = runId;
    meta.game_id = game.id;

    try {
      const existing = await db.prepare(
        "SELECT id FROM lantern_leaderboard_entries WHERE character_name = ? AND game_name = ? AND json_extract(meta_json, '$.run_id') = ? LIMIT 1"
      ).bind(characterName, gameName, runId).first();
      if (existing && existing.id) {
        return jsonResponse({ ok: true, id: existing.id, idempotent: true, character_name: characterName, game_name: gameName }, 200, cors);
      }
    } catch (_) {}

    const now = new Date().toISOString();
    const id = 'lb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const beforeNames = await queryWeeklyTopCharacterNames(db, gameName, { nowMs: Date.parse(now) || Date.now() });
    try {
      await db.prepare(
        'INSERT INTO lantern_leaderboard_entries (id, game_name, character_name, score, score_display, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, gameName, characterName, score, scoreDisplay, JSON.stringify(meta), now).run();
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Leaderboard table not ready' }, 503, cors);
    }
    // Prompt #137 — marquee leaderboard-entry is a weekly top-8 state transition, not a score write.
    // Flag is stored in existing meta_json (no schema change). Improvement while already ranked is not an entry.
    try {
      const afterNames = await queryWeeklyTopCharacterNames(db, gameName, { nowMs: Date.parse(now) || Date.now() });
      if (detectLeaderboardEntryTransition(beforeNames, afterNames, characterName)) {
        const flagged = withBoardEntryMeta(meta, true);
        await db.prepare('UPDATE lantern_leaderboard_entries SET meta_json = ? WHERE id = ?').bind(JSON.stringify(flagged), id).run();
      }
    } catch (_) {}
    return jsonResponse({ ok: true, id, character_name: characterName, game_name: gameName }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/leaderboards') {
    const period = (url.searchParams.get('period') || 'weekly').trim();
    const requestedGame = (url.searchParams.get('game_name') || url.searchParams.get('game_id') || '').trim();
    const registered = requestedGame ? resolveRegisteredLeaderboardGame(requestedGame) : null;
    if (requestedGame && !registered) {
      return jsonResponse({ ok: true, period, entries: [] }, 200, cors);
    }
    const gameName = registered ? registered.name : '';
    const catalogNames = leaderboardGameNames();
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
    } else if (period === 'all_time' || period === 'all') {
      since = null;
    } else {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    const lowerBetter = gameName && isLowerIsBetterGame(gameName);
    const agg = lowerBetter ? 'MIN(score)' : 'MAX(score)';
    const orderBy = lowerBetter ? 'ORDER BY score ASC' : 'ORDER BY score DESC';
    const inPlaceholders = catalogNames.map(() => '?').join(',');
    let rows;
    try {
      // Prompt #99: also select score_display as a bare column alongside the single MIN()/MAX()
      // aggregate. SQLite (D1's engine) guarantees bare columns in this shape are taken from the
      // same row that produced the aggregate value, so this now returns the *actual* display
      // string (e.g. "342 ms", "12 taps") for each player's best score instead of always falling
      // back to the bare numeric score on the client (see lantern-games-page.js formatEntryLine).
      if (gameName) {
        if (since == null && !until) {
          rows = await db.prepare(
            `SELECT character_name, score_display, ${agg} AS score FROM lantern_leaderboard_entries WHERE game_name = ? GROUP BY character_name ${orderBy} LIMIT ?`
          ).bind(gameName, limit).all();
        } else if (until) {
          rows = await db.prepare(
            `SELECT character_name, score_display, ${agg} AS score FROM lantern_leaderboard_entries WHERE game_name = ? AND created_at >= ? AND created_at <= ? GROUP BY character_name ${orderBy} LIMIT ?`
          ).bind(gameName, since, until, limit).all();
        } else {
          rows = await db.prepare(
            `SELECT character_name, score_display, ${agg} AS score FROM lantern_leaderboard_entries WHERE game_name = ? AND created_at >= ? GROUP BY character_name ${orderBy} LIMIT ?`
          ).bind(gameName, since, limit).all();
        }
      } else {
        // Combined view: only registered production games (unlisted/lab names cannot leak).
        if (since == null && !until) {
          rows = await db.prepare(
            `SELECT character_name, score_display, MAX(score) AS score FROM lantern_leaderboard_entries WHERE game_name IN (${inPlaceholders}) GROUP BY character_name ORDER BY score DESC LIMIT ?`
          ).bind(...catalogNames, limit).all();
        } else if (until) {
          rows = await db.prepare(
            `SELECT character_name, score_display, MAX(score) AS score FROM lantern_leaderboard_entries WHERE game_name IN (${inPlaceholders}) AND created_at >= ? AND created_at <= ? GROUP BY character_name ORDER BY score DESC LIMIT ?`
          ).bind(...catalogNames, since, until, limit).all();
        } else {
          rows = await db.prepare(
            `SELECT character_name, score_display, MAX(score) AS score FROM lantern_leaderboard_entries WHERE game_name IN (${inPlaceholders}) AND created_at >= ? GROUP BY character_name ORDER BY score DESC LIMIT ?`
          ).bind(...catalogNames, since, limit).all();
        }
      }
    } catch (e) {
      return jsonResponse({ ok: true, period, entries: [] }, 200, cors);
    }
    // Prompt #99: same demo-persona filter as /api/news/approved and /api/recognition/list — see
    // worker/demo-persona-guard.js. Game leaderboards had never applied this filter, so a known
    // fake/demo persona name could still surface as though it were a real student's score.
    const filteredRows = filterOutDemoPersonas(rows.results || [], 'character_name');
    const nameIndex = await loadStaffPublicNameIndex(db);
    const entries = filteredRows.map((r, i) => {
      const key = String(r.character_name || '').trim();
      const low = key.toLowerCase();
      const row =
        (nameIndex.byUsername && nameIndex.byUsername[low]) ||
        (nameIndex.byStudentKey && nameIndex.byStudentKey[low]) ||
        (nameIndex.byTeacherId && nameIndex.byTeacherId[low]) ||
        null;
      const label = row ? resolvePublicDisplayName(row) : '';
      return {
        rank: i + 1,
        character_name: key,
        public_display_name: label || null,
        display_name: label || null,
        game_name: gameName || '',
        score: Number(r.score) || 0,
        score_display: r.score_display != null ? r.score_display : String(Number(r.score) || 0),
      };
    });
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
    const auth = await requireStaffPilotSession(request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    // Prompt #213 — Recognizing via canonical People picker OR free-text group/label.
    const shoutRec = await normalizeShoutOutRecognition(db, body.people, body.recognition_label);
    if (!shoutRec.ok) return jsonResponse({ ok: false, error: shoutRec.error }, 400, cors);
    const characterName = String(shoutRec.recognition_label || '').trim();
    const message = (body.message || '').trim().slice(0, 250);
    if (!characterName) return jsonResponse({ ok: false, error: 'Missing recognized person or recognition text' }, 400, cors);
    if (isKnownDemoPersonaName(characterName)) {
      return jsonResponse({ ok: false, error: 'demo_persona_not_allowed' }, 400, cors);
    }
    if (!message) return jsonResponse({ ok: false, error: 'Missing message' }, 400, cors);
    const category = (body.category || '').trim() || null;
    // Prompt #175 — same media contract as student Contribute Shout-Out / news pipeline (one of image|video|link).
    let imageR2Key = (body.image_r2_key || '').trim() || null;
    let fullImageR2Key = (body.full_image_r2_key || '').trim() || null;
    let videoR2Key = (body.video_r2_key || '').trim() || null;
    let linkUrl = (body.link_url || '').trim() || null;
    if (imageR2Key && !/^news\//.test(imageR2Key)) imageR2Key = null;
    if (fullImageR2Key && !/^news\//.test(fullImageR2Key)) fullImageR2Key = null;
    if (videoR2Key && !/^news\/video\//.test(videoR2Key)) videoR2Key = null;
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) linkUrl = null;
    if (linkUrl) linkUrl = linkUrl.slice(0, 2000);
    // Mutual exclusion: prefer video, then image, then link (matches student unified field).
    if (videoR2Key) {
      imageR2Key = null;
      fullImageR2Key = null;
      linkUrl = null;
    } else if (imageR2Key) {
      videoR2Key = null;
      linkUrl = null;
    } else if (linkUrl) {
      imageR2Key = null;
      fullImageR2Key = null;
      videoR2Key = null;
    }
    const createdByTeacherId = sessionTeacherId(auth.account) || String(auth.account.username || '').trim() || null;
    const createdByTeacherName = reviewerLabelFromAccount(auth.account);
    const id = 'rec-' + crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.prepare(
        'INSERT INTO lantern_teacher_recognition (id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name, image_r2_key, full_image_r2_key, video_r2_key, link_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, characterName, message, category, now, createdByTeacherId, createdByTeacherName, imageR2Key, fullImageR2Key, videoR2Key, linkUrl).run();
    } catch (e) {
      // Pre-migration fallback: text-only insert if media columns are absent.
      if (imageR2Key || fullImageR2Key || videoR2Key || linkUrl) {
        return jsonResponse({ ok: false, error: 'media_schema_required' }, 503, cors);
      }
      await db.prepare(
        'INSERT INTO lantern_teacher_recognition (id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, characterName, message, category, now, createdByTeacherId, createdByTeacherName).run();
    }
    try {
      await replaceContentPeople(db, 'recognition', id, shoutRec.people, auth.account.username);
    } catch (_) {
      return jsonResponse({ ok: false, error: 'people_schema_required' }, 503, cors);
    }
    try {
      await awardAchievementsForRecognition(db, characterName, category, message, id);
    } catch (_) {}
    return jsonResponse({
      ok: true,
      id,
      character_name: characterName,
      message,
      category,
      created_at: now,
      created_by_teacher_name: createdByTeacherName,
      image_r2_key: imageR2Key,
      full_image_r2_key: fullImageR2Key,
      video_r2_key: videoR2Key,
      link_url: linkUrl,
      recognition_mode: shoutRec.mode,
      people: publicPeopleForReview(shoutRec.people),
    }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/recognition/list') {
    const origin = url.origin || '';
    const characterName = (url.searchParams.get('character_name') || '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const fetchCap = characterName ? Math.min(100, limit + 40) : limit;
    let rows;
    const selectMedia = 'id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name, image_r2_key, full_image_r2_key, video_r2_key, link_url';
    const selectBasic = 'id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name';
    try {
      if (characterName) {
        rows = await db.prepare(
          `SELECT ${selectMedia} FROM lantern_teacher_recognition WHERE character_name = ? ORDER BY created_at DESC LIMIT ?`
        ).bind(characterName, fetchCap).all();
      } else {
        rows = await db.prepare(
          `SELECT ${selectMedia} FROM lantern_teacher_recognition ORDER BY created_at DESC LIMIT ?`
        ).bind(limit).all();
      }
    } catch (_) {
      if (characterName) {
        rows = await db.prepare(
          `SELECT ${selectBasic} FROM lantern_teacher_recognition WHERE character_name = ? ORDER BY created_at DESC LIMIT ?`
        ).bind(characterName, fetchCap).all();
      } else {
        rows = await db.prepare(
          `SELECT ${selectBasic} FROM lantern_teacher_recognition ORDER BY created_at DESC LIMIT ?`
        ).bind(limit).all();
      }
    }
    const profiles = await db.prepare('SELECT character_name, current_avatar_key FROM lantern_avatar_profiles').all();
    const avatarByChar = {};
    (profiles.results || []).forEach(p => {
      if (p.character_name && p.current_avatar_key) avatarByChar[p.character_name] = p.current_avatar_key;
    });
    const staffNameIndex = await loadStaffPublicNameIndex(db);
    const peopleByContent = await loadContentPeopleIndex(db);
    // Prompt #97: same demo-persona filter as /api/news/approved — see worker/demo-persona-guard.js.
    let list = filterOutDemoPersonas(rows.results || [], 'character_name').map(r => {
      const key = avatarByChar[r.character_name];
      const people = peopleByContent.get('recognition|' + String(r.id || '').trim()) || [];
      const overlaid = overlayRecognitionListRow(
        {
          id: r.id,
          character_name: r.character_name,
          created_by_teacher_id: r.created_by_teacher_id,
          created_by_teacher_name: r.created_by_teacher_name || '',
        },
        staffNameIndex,
        people
      );
      return {
        id: r.id,
        character_name: r.character_name,
        character_public_label: overlaid.character_public_label || null,
        message: r.message,
        category: r.category || '',
        created_at: r.created_at,
        created_by_teacher_name: r.created_by_teacher_name || '',
        created_by_teacher_public_label: overlaid.created_by_teacher_public_label || null,
        avatar_image: key ? origin + '/api/avatar/image?key=' + encodeURIComponent(key) : null,
        image_r2_key: r.image_r2_key || null,
        image_url: r.image_r2_key ? origin + '/api/news/image?key=' + encodeURIComponent(r.image_r2_key) : null,
        video_r2_key: r.video_r2_key || null,
        video_url: r.video_r2_key ? origin + '/api/news/video?key=' + encodeURIComponent(r.video_r2_key) : null,
        link_url: r.link_url || null,
      };
    });
    const forDisplay =
      url.searchParams.get('for_display') === '1' ||
      url.searchParams.get('for_display') === 'true' ||
      url.searchParams.get('surface') === 'hallway';
    if (forDisplay) {
      list = await filterRecognitionRowsForHallwayTv(db, list);
    }
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

/** Allowed reaction types (system-controlled vocabulary). Positive icons only. */
const REACTION_TYPES = ['clap', 'star', 'celebrate', 'heart', 'fire', 'lightbulb', 'teamwork', 'thumbsup', 'creative'];
/** Allowed item types for reactions (approved public content only). */
const REACTION_ITEM_TYPES = ['news', 'recognition', 'feed'];

/** Feature flags (env). Default false. */
function isEarlyEncouragerEnabled(env) { return (env.ENABLE_EARLY_ENCOURAGER_REWARD || '').toString().toLowerCase() === 'true'; }
function isReactionBreakdownEnabled(env) { return (env.ENABLE_REACTION_BREAKDOWN || '').toString().toLowerCase() === 'true'; }
function isInclusionBoostEnabled(env) { return (env.ENABLE_INCLUSION_BOOST || '').toString().toLowerCase() === 'true'; }

/** Grant one nugget for early encourager (called after reaction insert). Daily cap 3 per character. First 5 reactors per item eligible. */
export async function maybeGrantEarlyEncouragerReward(db, characterName, itemType, itemId, now, env) {
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
  // Prompt #169: transact first (staff → TMS staff ledger, never lantern_wallets).
  // Reference includes the account so TMS global uniqueness cannot steal another voter's credit.
  // Local eer row is written only after a successful (or idempotent) authoritative credit so
  // a failed reward can retry without requiring a new reaction.
  const reference = 'lantern:early_encourager:' + itemType + ':' + itemId + ':' + String(characterName || '').trim().toLowerCase();
  const applied = env
    ? await applyAuthoritativeNuggetDelta(db, env, {
        characterName,
        delta: 1,
        kind: 'early_encourager',
        source: 'reaction',
        note: 'Early encouragement',
        reference,
        now,
        meta: { item_type: itemType, item_id: itemId },
      })
    : { ok: false, status: 'failed', error: 'bridge_not_configured' };
  if (!applied.ok) {
    return { granted: false, error: applied.error || 'reward_failed', status: applied.status };
  }
  const rewardId = 'eer-' + crypto.randomUUID();
  try {
    await db.prepare(
      'INSERT INTO lantern_early_encourager_rewards (id, character_name, item_type, item_id, rewarded_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(rewardId, characterName, itemType, itemId, now).run();
  } catch (e) {
    if (!(e && /UNIQUE/i.test(String(e.message || e)))) throw e;
  }
  return { granted: true, nuggets: 1 };
}

/** Lantern student reactions — only on approved public content. No comments; icons only. */
async function handleReactionsRoutes(request, url, path, env, cors) {
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  const finalHandled = await handleFinalReactionRoutes(request, url, path, env, cors, {
    getPilotAccountFromRequest,
    pilotEconomyCharacterName,
    pilotAccountRequiresChangePassword,
    jsonResponse,
  });
  if (finalHandled) return finalHandled;

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
    } else if (itemType === 'feed') {
      const approved = await isApprovedFeedItem(db, itemId);
      if (!approved) return jsonResponse({ ok: false, error: 'Item not approved or not found' }, 400, cors);
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
      try { earlyReward = await maybeGrantEarlyEncouragerReward(db, characterName, itemType, itemId, now, env); } catch (_) { earlyReward = { granted: false }; }
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

  if (request.method === 'POST' && path === '/api/reactions/toggle') {
    const text = await request.text();
    let body;
    try { body = JSON.parse(text || '{}'); } catch (_) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors); }
    const itemType = (body.item_type || 'feed').trim().toLowerCase();
    const itemId = (body.item_id || '').trim();
    const reactionType = (body.reaction_type || '').trim().toLowerCase();
    const characterName = (body.character_name || '').trim();
    if (!REACTION_ITEM_TYPES.includes(itemType)) return jsonResponse({ ok: false, error: 'Invalid item_type' }, 400, cors);
    if (!itemId || !reactionType || !characterName) return jsonResponse({ ok: false, error: 'Missing fields' }, 400, cors);
    if (!REACTION_TYPES.includes(reactionType)) return jsonResponse({ ok: false, error: 'Invalid reaction_type' }, 400, cors);
    if (itemType === 'feed') {
      const approved = await isApprovedFeedItem(db, itemId);
      if (!approved) return jsonResponse({ ok: false, error: 'Item not approved or not found' }, 400, cors);
    } else if (itemType === 'news') {
      const row = await db.prepare('SELECT id, status FROM lantern_news_submissions WHERE id = ?').bind(itemId).first();
      if (!row || (row.status || '').toLowerCase() !== 'approved') return jsonResponse({ ok: false, error: 'Item not approved or not found' }, 400, cors);
    }
    const existing = await db.prepare(
      'SELECT id FROM lantern_reactions WHERE item_type = ? AND item_id = ? AND reaction_type = ? AND character_name = ?'
    ).bind(itemType, itemId, reactionType, characterName).first();
    if (existing) {
      await db.prepare('DELETE FROM lantern_reactions WHERE id = ?').bind(existing.id).run();
      return jsonResponse({ ok: true, toggled: 'off', item_type: itemType, item_id: itemId, reaction_type: reactionType }, 200, cors);
    }
    const id = 'react-' + crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO lantern_reactions (id, item_type, item_id, reaction_type, character_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, itemType, itemId, reactionType, characterName, now).run();
    return jsonResponse({ ok: true, toggled: 'on', id, item_type: itemType, item_id: itemId, reaction_type: reactionType }, 200, cors);
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
