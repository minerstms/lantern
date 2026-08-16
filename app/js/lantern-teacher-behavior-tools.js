/**
 * Prompt #253 — Teacher Tools surfaces for the retired TMS Teacher Dashboard.
 *
 * Reuses TMS teacherDashboardData / assignStudentToPending via
 * /api/tms-nuggets/dashboard and /api/tms-nuggets/assign-pending.
 * Does not create a second Nugget ledger, change Nugget math, or add a
 * behavior-log write form. Behavior Logger remains the create path.
 */
(function () {
  'use strict';

  var lastPayload = null;
  var categories = [];
  var groups = [];
  var students = [];
  var busy = false;

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function postTmsNuggets(sub, payload) {
    return fetch('/api/tms-nuggets/' + sub, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Bad response' }; });
    }).catch(function () {
      return { ok: false, error: 'Network error' };
    });
  }

  function currentFilter() {
    var host = document.querySelector('[data-behavior-filter]');
    if (!host) return {};
    var typeSel = host.querySelector('[data-filter-type]');
    var catSel = host.querySelector('[data-filter-category]');
    var groupSel = host.querySelector('[data-filter-group]');
    var type = typeSel ? String(typeSel.value || 'all') : 'all';
    if (type === 'category' && catSel && catSel.value) {
      return { group_filter: { category_id: Number(catSel.value) } };
    }
    if (type === 'group' && groupSel && groupSel.value) {
      return { group_filter: { group_ids: [Number(groupSel.value)] } };
    }
    return {};
  }

  function syncFilterVisibility(host) {
    if (!host) return;
    var typeSel = host.querySelector('[data-filter-type]');
    var catSel = host.querySelector('[data-filter-category]');
    var groupSel = host.querySelector('[data-filter-group]');
    var type = typeSel ? String(typeSel.value || 'all') : 'all';
    if (catSel) catSel.hidden = type !== 'category';
    if (groupSel) groupSel.hidden = type !== 'group';
  }

  function fillFilterOptions() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-behavior-filter]'), function (host) {
      var catSel = host.querySelector('[data-filter-category]');
      var groupSel = host.querySelector('[data-filter-group]');
      if (catSel) {
        var keepCat = catSel.value;
        catSel.innerHTML = '<option value="">— Select category —</option>' + categories.map(function (c) {
          return '<option value="' + escapeHtml(String(c.id)) + '">' + escapeHtml(c.name) + '</option>';
        }).join('');
        if (keepCat) catSel.value = keepCat;
      }
      if (groupSel) {
        var keepGroup = groupSel.value;
        groupSel.innerHTML = '<option value="">— Select group —</option>' + groups.map(function (g) {
          return '<option value="' + escapeHtml(String(g.id)) + '">' + escapeHtml(g.name) + '</option>';
        }).join('');
        if (keepGroup) groupSel.value = keepGroup;
      }
      syncFilterVisibility(host);
    });
  }

  function studentOptionsHtml() {
    return '<option value="">— Select student —</option>' + students.map(function (s) {
      return '<option value="' + escapeHtml(s.student_name) + '">' + escapeHtml(s.student_name) + '</option>';
    }).join('');
  }

  function renderPending(pending) {
    var body = el('teacherPendingNuggetsBody');
    var pill = el('teacherPendingNuggetsCount');
    if (pill) pill.textContent = String((pending || []).length);
    if (!body) return;
    if (!pending || !pending.length) {
      body.innerHTML = '<tr><td colspan="4" class="placeholderRow">No pending Nuggets.</td></tr>';
      return;
    }
    body.innerHTML = pending.map(function (row) {
      var id = escapeHtml(row.log_id || '');
      return (
        '<tr data-pending-log="' + id + '">' +
        '<td>' + escapeHtml(row.kind || '') + '</td>' +
        '<td>' + escapeHtml(row.note_text || '') + '</td>' +
        '<td><select class="teacherSelect" data-pending-student>' + studentOptionsHtml() + '</select></td>' +
        '<td><button type="button" class="btn small good" data-assign-pending="' + id + '">Assign</button></td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderTotals(totals) {
    var body = el('teacherNuggetTotalsBody');
    if (!body) return;
    var rows = (totals || []).slice(0, 20);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" class="placeholderRow">No student totals yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (row, i) {
      return (
        '<tr><td>' + (i + 1) + '</td>' +
        '<td class="cellStudentName">' + escapeHtml(row.student_name) + '</td>' +
        '<td class="colTotal">' + escapeHtml(String(row.total)) + '</td></tr>'
      );
    }).join('');
  }

  function formatWhen(raw) {
    if (!raw) return '—';
    var d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleString();
  }

  function renderRecent(recent) {
    var body = el('teacherRecentLogsBody');
    var pill = el('teacherRecentLogsCount');
    if (pill) pill.textContent = String((recent || []).length);
    if (!body) return;
    if (!recent || !recent.length) {
      body.innerHTML = '<tr><td colspan="4" class="placeholderRow">No recent behavior logs.</td></tr>';
      return;
    }
    body.innerHTML = recent.slice(0, 50).map(function (row) {
      return (
        '<tr>' +
        '<td>' + escapeHtml(formatWhen(row.timestamp || row.last_updated)) + '</td>' +
        '<td class="cellStudentName">' + escapeHtml(row.student_name || '(pending)') + '</td>' +
        '<td>' + escapeHtml(row.kind || '') + '</td>' +
        '<td>' + escapeHtml(row.note_text || '') + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function applyPayload(data) {
    lastPayload = data && data.ok !== false ? data : null;
    if (!lastPayload) {
      renderPending([]);
      renderTotals([]);
      renderRecent([]);
      return;
    }
    if (Array.isArray(lastPayload.group_categories)) categories = lastPayload.group_categories;
    if (Array.isArray(lastPayload.groups)) groups = lastPayload.groups;
    if (Array.isArray(lastPayload.students)) students = lastPayload.students;
    fillFilterOptions();
    renderPending(lastPayload.pending || []);
    renderTotals(lastPayload.totalsByStudent || []);
    renderRecent(lastPayload.recent || []);
  }

  function loadDashboard() {
    if (busy) return Promise.resolve();
    busy = true;
    var payload = currentFilter();
    payload.include_bootstrap = true;
    return postTmsNuggets('dashboard', payload).then(function (data) {
      busy = false;
      if (!data || data.ok === false) {
        var err = (data && (data.error || data.message)) || 'Could not load teacher tools data.';
        if (el('teacherPendingNuggetsBody')) {
          el('teacherPendingNuggetsBody').innerHTML =
            '<tr><td colspan="4" class="placeholderRow">' + escapeHtml(err) + '</td></tr>';
        }
        if (el('teacherRecentLogsBody')) {
          el('teacherRecentLogsBody').innerHTML =
            '<tr><td colspan="4" class="placeholderRow">' + escapeHtml(err) + '</td></tr>';
        }
        return;
      }
      applyPayload(data);
    });
  }

  function assignPending(logId, studentName) {
    if (!logId || !studentName) return;
    return postTmsNuggets('assign-pending', { log_id: logId, student_name: studentName }).then(function (data) {
      if (!data || data.ok === false) {
        window.alert((data && (data.error || data.message)) || 'Could not assign student.');
        return;
      }
      return loadDashboard();
    });
  }

  function bindFilters() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-behavior-filter]'), function (host) {
      if (host.getAttribute('data-bound') === '1') return;
      host.setAttribute('data-bound', '1');
      host.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        if (t.getAttribute('data-filter-type')) {
          Array.prototype.forEach.call(document.querySelectorAll('[data-filter-type]'), function (sel) {
            sel.value = t.value;
          });
          syncFilterVisibility(host);
          Array.prototype.forEach.call(document.querySelectorAll('[data-behavior-filter]'), syncFilterVisibility);
        }
        if (t.getAttribute('data-filter-category') || t.getAttribute('data-filter-group') || t.getAttribute('data-filter-type')) {
          loadDashboard();
        }
      });
    });
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('[data-assign-pending]');
    if (!btn) return;
    var row = btn.closest('tr');
    var sel = row && row.querySelector('[data-pending-student]');
    var name = sel ? String(sel.value || '').trim() : '';
    if (!name) {
      window.alert('Select a student first.');
      return;
    }
    assignPending(btn.getAttribute('data-assign-pending'), name);
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-behavior-tools-refresh]'), function (btn) {
    btn.addEventListener('click', function () { loadDashboard(); });
  });

  bindFilters();
  loadDashboard();

  window.LanternTeacherBehaviorTools = {
    reload: loadDashboard,
  };
})();
