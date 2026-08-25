/**
 * Prompt #251B — Teacher Tools Review Submissions client for GET /api/review/queue
 * and POST /api/review/action. Does not reimplement authorization.
 */
(function (global) {
  'use strict';

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return null;
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function load() {
    var base = apiBase();
    if (base === null) return Promise.resolve({ ok: false, items: [] });
    return fetch(base + '/api/review/queue', { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res || !res.ok) return { ok: false, items: [] };
        return { ok: true, items: res.items || [], count: res.count };
      })
      .catch(function () {
        return { ok: false, items: [] };
      });
  }

  function act(body) {
    var base = apiBase();
    if (base === null) return Promise.resolve({ ok: false, error: 'api_unavailable' });
    return fetch(base + '/api/review/action', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false, error: 'action_failed' };
      });
  }

  function history(itemType, itemId) {
    var base = apiBase();
    if (base === null) return Promise.resolve({ ok: false, events: [] });
    return fetch(
      base +
        '/api/moderation/history?item_type=' +
        encodeURIComponent(itemType) +
        '&item_id=' +
        encodeURIComponent(itemId),
      { credentials: 'include' }
    )
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false, events: [] };
      });
  }

  function toLegacyEntries(items) {
    var classroom = [];
    var schoolwide = [];
    (items || []).forEach(function (it) {
      var state = String(it.queue_state || 'PENDING_REVIEW');
      if (it.item_type === 'mission_submission') {
        classroom.push({
          type: 'mission',
          queueItem: it,
          item: {
            id: it.item_id,
            mission_title: it.title,
            character_name: it.submitter,
            submitter: it.submitter,
            submitter_key: it.submitter_key || it.submitter,
            submitter_public_label: it.submitter_public_label || '',
            created_at: it.created_at,
            status: it.status,
            queue_state: state,
            report_count: it.report_count,
            reasons: it.reasons,
            reporters: it.reporters,
          },
        });
      } else {
        schoolwide.push({
          type: 'approval_item',
          queueItem: it,
          item: {
            id: it.approval_id || it.item_id,
            item_id: it.item_id,
            item_type: it.item_type,
            title: it.title,
            submitter: it.submitter,
            submitter_key: it.submitter_key || it.submitter,
            submitter_public_label: it.submitter_public_label || '',
            created_at: it.created_at,
            status: it.status,
            queue_state: state,
            report_count: it.report_count,
            reasons: it.reasons,
            reporters: it.reporters,
            hidden_at: it.hidden_at,
            hidden_by: it.hidden_by,
            poll_choices: it.poll_choices,
            poll_question: it.title,
            preview_url: it.preview_url,
            contribution_id: it.contribution_id,
            legacy_author_unavailable: it.legacy_author_unavailable,
          },
        });
      }
    });
    return { classroom: classroom, schoolwide: schoolwide };
  }

  function stateChipLabel(state) {
    if (state === 'RESUBMITTED') return 'Resubmitted';
    if (state === 'REPORTED') return 'Reported';
    return 'Pending Review';
  }

  function studentSafeHistory(events) {
    var allow = { submitted: 1, returned: 1, resubmitted: 1, approved: 1, rejected: 1 };
    return (events || []).filter(function (ev) {
      return !!allow[String(ev.event_type || '').toLowerCase()];
    });
  }

  function staffHistoryLabel(ev) {
    var t = String(ev.event_type || '').toLowerCase();
    if (t === 'submitted') return 'Submitted';
    if (t === 'returned') return 'Returned' + (ev.note ? ' — ' + ev.note : '');
    if (t === 'resubmitted') return 'Resubmitted';
    if (t === 'approved') return 'Approved';
    if (t === 'rejected') return 'Rejected';
    if (t === 'reported') return 'Reported';
    if (t === 'report_dismissed') return 'Report dismissed';
    if (t === 'report_returned') return 'Returned from report';
    if (t === 'report_removed') return 'Report closed — kept hidden';
    return t;
  }

  global.LanternReviewQueue = {
    load: load,
    act: act,
    history: history,
    toLegacyEntries: toLegacyEntries,
    stateChipLabel: stateChipLabel,
    studentSafeHistory: studentSafeHistory,
    staffHistoryLabel: staffHistoryLabel,
  };
})(typeof window !== 'undefined' ? window : self);
