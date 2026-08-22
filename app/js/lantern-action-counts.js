/**
 * Prompt #251B — single client authority for notification badges.
 * GET /api/action-counts only. Do not recount returned rows from other APIs.
 */
(function (global) {
  'use strict';

  var last = { student_revision_count: null, staff_review_count: null, ok: false };
  var listeners = [];
  var inflight = null;
  var lastRefreshAt = 0;

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return null;
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function formatCount(n) {
    var v = Number(n) || 0;
    if (v <= 0) return '';
    if (v > 99) return '99+';
    return String(v);
  }

  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn(last);
      } catch (_) {}
    });
    try {
      document.dispatchEvent(new CustomEvent('lantern-action-counts', { detail: last }));
    } catch (_) {}
  }

  function applyBadge(el, count, labelBase) {
    if (!el) return;
    var n = Number(count) || 0;
    var text = formatCount(n);
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      el.removeAttribute('aria-label');
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.setAttribute('aria-label', (labelBase || 'Items') + ': ' + n);
  }

  function paintNavBadges() {
    var locker = document.querySelector('[data-action-badge="locker"]');
    var teacher = document.querySelector('[data-action-badge="teacher"]');
    applyBadge(locker, last.student_revision_count, 'Needs revision');
    applyBadge(teacher, last.staff_review_count, 'Submissions to review');
    var side = document.getElementById('teacherSidebarReviewBadge');
    if (side && last.staff_review_count != null) {
      applyBadge(side, last.staff_review_count, 'Review Submissions');
    }
    var pill = document.getElementById('pendingApprovalsBadge');
    if (pill && last.staff_review_count != null) {
      pill.textContent = String(Number(last.staff_review_count) || 0);
    }
    var overview = document.getElementById('teacherOverviewPendingCount');
    if (overview && last.staff_review_count != null) {
      overview.textContent = String(Number(last.staff_review_count) || 0);
    }
    var lockerHd = document.getElementById('lockerNeedsRevisionCount');
    if (lockerHd) {
      var sn = Number(last.student_revision_count) || 0;
      lockerHd.textContent = sn > 0 ? String(sn) : '';
      lockerHd.hidden = sn <= 0;
    }
  }

  function refresh(opts) {
    var force = !!(opts && opts.force);
    var now = Date.now();
    if (!force && inflight) return inflight;
    if (!force && now - lastRefreshAt < 800) {
      paintNavBadges();
      return Promise.resolve(last);
    }
    var base = apiBase();
    if (base === null) return Promise.resolve(last);
    lastRefreshAt = now;
    inflight = fetch(base + '/api/action-counts', { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        inflight = null;
        if (!res || !res.ok) return last;
        last = {
          ok: true,
          student_revision_count: Object.prototype.hasOwnProperty.call(res, 'student_revision_count')
            ? Number(res.student_revision_count) || 0
            : null,
          staff_review_count: Object.prototype.hasOwnProperty.call(res, 'staff_review_count')
            ? Number(res.staff_review_count) || 0
            : null,
        };
        emit();
        paintNavBadges();
        return last;
      })
      .catch(function () {
        inflight = null;
        return last;
      });
    return inflight;
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  document.addEventListener('lantern-action-counts-changed', function () {
    refresh({ force: true });
  });

  global.LanternActionCounts = {
    refresh: refresh,
    subscribe: subscribe,
    formatCount: formatCount,
    applyBadge: applyBadge,
    paintNavBadges: paintNavBadges,
    getStudentRevisionCount: function () {
      return last.student_revision_count;
    },
    getStaffReviewCount: function () {
      return last.staff_review_count;
    },
    getLast: function () {
      return last;
    },
  };
})(typeof window !== 'undefined' ? window : self);
