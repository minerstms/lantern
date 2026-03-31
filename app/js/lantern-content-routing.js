/**
 * Lantern — code-backed content routing & recognition rules (verify + Help Mode).
 * Single place to read intended behavior; explore.html / index.html implement specifics.
 * @see docs/lantern-content-routing-matrix.md
 */
(function (global) {
  'use strict';

  /** How an item can surface in Profile Spotlight rail */
  var SPOTLIGHT = {
    API_ROW: 'D1 lantern_teacher_recognition or merged shout-out via GET /api/recognition/list',
    HISTORY: 'Student activity history (local / Apps Script) with CURATION or Spotlight note',
    BADGE: 'teacher_spotlight achievement card',
    NONE: '—'
  };

  /**
   * Authoritative rows for verify matrix and console.
   * recognitionAlso: duplicate path into Spotlight-style visibility (not removal from primary destination).
   */
  var ROUTING_ROWS = [
    {
      id: 'teacher_recognition_manual',
      itemType: 'Teacher recognition (form)',
      normalDestinations: 'Spotlight (recognition API), Display/ticker if wired',
      approval: 'No',
      recognitionAlso: 'Yes — row is the recognition',
      spotlightEligible: 'Yes',
      code: 'lantern-worker POST /api/recognition/create; GET /api/recognition/list; teacher.html addRecognitionBtn'
    },
    {
      id: 'peer_shoutout_approved',
      itemType: 'Approved peer shout-out (news)',
      normalDestinations: 'School News (Explore Articles lane); body Shout-out… or Recognizing:',
      approval: 'Yes',
      recognitionAlso: 'Yes — merged into recognition list for named student',
      spotlightEligible: 'Yes (recipient only)',
      code: 'lantern-worker handleRecognitionRoutes list branch + parseShoutOutRecipientFromNews'
    },
    {
      id: 'teacher_pick_creation',
      itemType: 'Teacher Pick on approved creation',
      normalDestinations: 'Explore Announcements + Latest Posts (same post in both rails)',
      approval: 'Post must be approved first',
      recognitionAlso: 'Yes when LANTERN_AVATAR_API: POST /api/recognition/create from teacher.html; else history only',
      spotlightEligible: 'Yes',
      code: 'lantern-api.js curatePost; explore.html renderAll; teacher.html after curatePost; index dedupe'
    },
    {
      id: 'teacher_feature_creation',
      itemType: 'Teacher Featured creation',
      normalDestinations: 'Explore Announcements + Latest Posts',
      approval: 'Yes',
      recognitionAlso: 'Via activity history Spotlight (Featured: note), not auto D1 row',
      spotlightEligible: 'Yes (history)',
      code: 'lantern-api.js curatePost feature; index.html getActivityLabel'
    },
    {
      id: 'approved_creation',
      itemType: 'Approved student creation/post',
      normalDestinations: 'My Creations, Explore Latest Posts (+ Announcements if curated)',
      approval: 'Yes',
      recognitionAlso: 'No unless pick/feature/praise/spotlight',
      spotlightEligible: 'Only if curated/highlighted',
      code: 'getExploreFeed / getApprovedPosts; explore.html'
    },
    {
      id: 'mission_complete_default',
      itemType: 'Mission completion / default approval',
      normalDestinations: 'Missions UI, profile stats, optional Explore merge',
      approval: 'Usually yes',
      recognitionAlso: 'No by default',
      spotlightEligible: 'Only if teacher marks Spotlight on approve',
      code: 'lantern-api approveSubmission; worker /api/missions/submissions/approve'
    },
    {
      id: 'poll_published',
      itemType: 'Poll approval / publication',
      normalDestinations: 'Explore Missions & Actions / polls; vote APIs',
      approval: 'Yes',
      recognitionAlso: 'No',
      spotlightEligible: 'No unless separately recognized',
      code: 'worker approvals + lantern_polls'
    },
    {
      id: 'news_published',
      itemType: 'Published news/article (non-shout-out)',
      normalDestinations: 'Explore School News (Articles), Display',
      approval: 'Yes',
      recognitionAlso: 'No',
      spotlightEligible: 'No unless shout-out merge applies',
      code: '/api/news/approved; explore happening strip'
    },
    {
      id: 'game_scores',
      itemType: 'Game scores / leaderboards',
      normalDestinations: 'Leaderboards, Display arcade slides, profile nuggets',
      approval: 'N/A',
      recognitionAlso: 'Display aggregates only; no per-score D1 recognition',
      spotlightEligible: 'Hallway slides, not Profile Spotlight rail',
      code: 'lantern-api getDisplayFeed getGameLeaderboard; getActivityLabel spotlight false for game_play'
    },
    {
      id: 'thank_you_letter',
      itemType: 'Thank-you letter flow',
      normalDestinations: 'Teacher inbox; nuggets on accept',
      approval: 'Yes',
      recognitionAlso: 'No',
      spotlightEligible: 'No',
      code: 'thanks.html; approveThanks; missions quick card'
    }
  ];

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function getRowById(id) {
    var k = String(id || '').trim();
    for (var i = 0; i < ROUTING_ROWS.length; i++) {
      if (ROUTING_ROWS[i].id === k) return ROUTING_ROWS[i];
    }
    return null;
  }

  function buildVerifyTableHtml() {
    var h = '<div class="routingVerifyWrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><table class="routingVerifyTable" style="width:100%;border-collapse:collapse;font-size:20px;">';
    h += '<thead><tr style="text-align:left;border-bottom:2px solid rgba(255,255,255,.2);">';
    ['Item type', 'Normal destination(s)', 'Approval?', 'Also → recognition/Spotlight?', 'Spotlight eligible?', 'Code'].forEach(function (col) {
      h += '<th style="padding:10px 8px;vertical-align:bottom;font-weight:900;">' + esc(col) + '</th>';
    });
    h += '</tr></thead><tbody>';
    ROUTING_ROWS.forEach(function (r, idx) {
      h += '<tr style="border-bottom:1px solid rgba(255,255,255,.08);background:' + (idx % 2 ? 'rgba(0,0,0,.12)' : 'transparent') + ';">';
      h += '<td style="padding:10px 8px;vertical-align:top;font-weight:800;">' + esc(r.itemType) + '</td>';
      h += '<td style="padding:10px 8px;vertical-align:top;color:var(--muted);">' + esc(r.normalDestinations) + '</td>';
      h += '<td style="padding:10px 8px;vertical-align:top;">' + esc(r.approval) + '</td>';
      h += '<td style="padding:10px 8px;vertical-align:top;">' + esc(r.recognitionAlso) + '</td>';
      h += '<td style="padding:10px 8px;vertical-align:top;">' + esc(r.spotlightEligible) + '</td>';
      h += '<td style="padding:10px 8px;vertical-align:top;font-size:18px;color:var(--muted);word-break:break-word;">' + esc(r.code) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    h += '<p class="note" style="margin-top:14px;margin-bottom:0;"><strong>New vs Best:</strong> <code>explore.html</code> builds Best from pick/feature flags and New from full chronological feed — curated posts are <em>not</em> removed from New.</p>';
    return h;
  }

  function logVerifySummary(verbose) {
    if (typeof console === 'undefined') return;
    try {
      console.log('[LanternContentRouting] ' + ROUTING_ROWS.length + ' rows — docs/lantern-content-routing-matrix.md — Verify → Routing matrix card');
      if (verbose && console.table) {
        console.table(ROUTING_ROWS.map(function (r) {
          return { id: r.id, itemType: r.itemType, approval: r.approval, recognitionAlso: r.recognitionAlso.slice(0, 40), spotlight: r.spotlightEligible };
        }));
      }
    } catch (e) {}
  }

  /**
   * Help Mode: one-line fact for an item id (from ROUTING_ROWS).
   */
  function routingFactForItemType(itemId) {
    var row = getRowById(itemId);
    if (!row) return null;
    return row.itemType + ': ' + row.normalDestinations + '. Spotlight duplication: ' + row.recognitionAlso;
  }

  global.LanternContentRouting = {
    VERSION: 1,
    SPOTLIGHT_SOURCES: SPOTLIGHT,
    ROUTING_ROWS: ROUTING_ROWS,
    getRowById: getRowById,
    buildVerifyTableHtml: buildVerifyTableHtml,
    logVerifySummary: logVerifySummary,
    routingFactForItemType: routingFactForItemType
  };
})(typeof window !== 'undefined' ? window : this);
