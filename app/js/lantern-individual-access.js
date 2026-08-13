/**
 * Prompt #142 — Teacher Individual Access board.
 * Pre-authorize a real student, then manage pending / pre-authorized / active device grants.
 */
(function (global) {
  'use strict';

  var Power = null;
  var listApi = null;
  var selectedStudent = null;
  var searchTimer = null;
  var inFlight = false;

  function apiBase() {
    var a = global.LANTERN_AVATAR_API;
    return a ? String(a).replace(/\/$/, '') : '';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setMsg(text, isError) {
    var el = $('individualAccessPreauthMsg');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--bad)' : 'var(--ink)';
  }

  function attentionRank(item) {
    if (!item) return 9;
    if (item.kind === 'pending') return 0;
    if (item.kind === 'preauthorized') return 1;
    if (item.kind === 'active') return 2;
    return 9;
  }

  function relativeLabel(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    return mins + ' min ago';
  }

  function expiresLabel(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    var remain = Math.max(0, Math.round((t - Date.now()) / 60000));
    var clock = '';
    try {
      clock = new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) {}
    if (remain < 1) return clock ? 'Expires ' + clock : 'Expires soon';
    return (clock ? 'Expires ' + clock + ' · ' : '') + remain + ' min left';
  }

  function studentLine(item) {
    var name = item.displayName || item.studentUsername || 'Student';
    var sid = item.studentId || item.studentUsername || '';
    if (sid && String(sid).toLowerCase() !== String(name).toLowerCase()) return name + ' · ' + sid;
    return sid ? name + ' · ' + sid : name;
  }

  function durationCell(item) {
    if (item.kind === 'pending') return relativeLabel(item.requestedAt) || 'Requested';
    if (item.kind === 'preauthorized') return String(item.durationMinutes || '') + '-minute grant';
    if (item.kind === 'active') return expiresLabel(item.grantExpiresAt);
    return '';
  }

  function postJson(path, body) {
    return fetch(apiBase() + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json();
    });
  }

  function renderSelected() {
    var el = $('individualAccessSelectedStudent');
    if (!el) return;
    if (!selectedStudent) {
      el.textContent = 'Select a student from search results.';
      return;
    }
    var name = selectedStudent.display_name || selectedStudent.username;
    var sid = selectedStudent.student_id || selectedStudent.username;
    el.textContent = name + (sid ? ' · ' + sid : '');
  }

  function renderSearchResults(students) {
    var box = $('individualAccessStudentResults');
    if (!box) return;
    box.innerHTML = '';
    if (!students || !students.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    students.forEach(function (st) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lanternIndividualAccessResultBtn';
      var name = st.display_name || st.username;
      var sid = st.student_id || st.username;
      btn.textContent = name + (sid ? '  ' + sid : '');
      btn.addEventListener('click', function () {
        selectedStudent = st;
        renderSelected();
        box.hidden = true;
        var search = $('individualAccessStudentSearch');
        if (search) search.value = name;
      });
      box.appendChild(btn);
    });
  }

  function searchStudents(q) {
    var query = String(q || '').trim();
    if (!query) {
      renderSearchResults([]);
      return;
    }
    fetch(apiBase() + '/api/class-access/students?q=' + encodeURIComponent(query), { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        renderSearchResults((res && res.ok && res.students) || []);
      })
      .catch(function () {
        renderSearchResults([]);
      });
  }

  function preauthorize() {
    if (!selectedStudent || !selectedStudent.username) {
      setMsg('Select a real student from search results.', true);
      return;
    }
    var durationEl = $('individualAccessDuration');
    var duration = parseInt(durationEl && durationEl.value, 10);
    if (duration !== 15 && duration !== 30) {
      setMsg('Duration must be 15 or 30 minutes.', true);
      return;
    }
    var btn = $('individualAccessPreauthBtn');
    if (btn) btn.disabled = true;
    postJson('/api/class-access/preauthorize', {
      student_username: selectedStudent.username,
      duration_minutes: duration,
    })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (!res || !res.ok) {
          setMsg((res && res.error) || 'Could not pre-authorize.', true);
          return;
        }
        var name = res.student_display_name || selectedStudent.display_name || selectedStudent.username;
        setMsg(
          name +
            ' is pre-authorized for ' +
            res.durationMinutes +
            ' minutes. Waiting for student login.',
          false
        );
        refresh();
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        setMsg('Could not pre-authorize.', true);
      });
  }

  function boardItems(board) {
    var pending = (board && board.pending) || [];
    var pre = (board && board.preauthorized) || [];
    var active = (board && board.active) || [];
    return pending.concat(pre, active);
  }

  function renderExpanded(item, detail) {
    var actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexWrap = 'wrap';
    actions.style.gap = '8px';

    function act(label, className, path, body, okMsg) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = className;
      b.textContent = label;
      b.addEventListener('click', function () {
        b.disabled = true;
        postJson(path, body)
          .then(function (res) {
            if (!res || !res.ok) {
              b.disabled = false;
              setMsg((res && res.error) || 'Action failed', true);
              return;
            }
            setMsg(okMsg, false);
            refresh();
          })
          .catch(function () {
            b.disabled = false;
            setMsg('Action failed', true);
          });
      });
      actions.appendChild(b);
    }

    if (item.kind === 'preauthorized') {
      act('Cancel Pre-authorization', 'btn bad small', '/api/class-access/preauthorize/cancel', { id: item.id }, 'Pre-authorization cancelled');
    } else if (item.kind === 'pending') {
      act('Approve 15', 'btn good small', '/api/class-access/requests/approve', { id: item.id, duration_minutes: 15 }, 'Approved for 15 minutes');
      act('Approve 30', 'btn good small', '/api/class-access/requests/approve', { id: item.id, duration_minutes: 30 }, 'Approved for 30 minutes');
      act('Deny', 'btn bad small', '/api/class-access/requests/deny', { id: item.id }, 'Denied');
    } else if (item.kind === 'active') {
      act('Extend +15', 'btn small', '/api/class-access/requests/extend', { id: item.id, duration_minutes: 15 }, 'Extended +15 min');
      act('Extend +30', 'btn small', '/api/class-access/requests/extend', { id: item.id, duration_minutes: 30 }, 'Extended +30 min');
      act('Revoke', 'btn bad small', '/api/class-access/requests/revoke', { id: item.id }, 'Revoked');
    }
    detail.appendChild(actions);
  }

  function ensureList() {
    if (listApi) return listApi;
    Power = global.LanternPowerList;
    var mount = $('individualAccessBoardMount');
    if (!Power || !mount) return null;
    listApi = Power.create({
      mount: mount,
      className: 'lanternPowerList--individualAccess',
      columns: [
        { key: 'student', label: 'Student', sortable: true },
        { key: 'status', label: 'Status', sortable: true },
        { key: 'expires', label: 'Duration / Expires', sortable: true },
        { key: 'source', label: 'Source', sortable: true },
      ],
      defaultSort: { key: 'attention', dir: 'asc' },
      filters: [
        {
          id: 'status',
          label: 'Status',
          options: [
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'preauthorized', label: 'Pre-authorized' },
            { value: 'active', label: 'Active' },
          ],
        },
      ],
      searchPlaceholder: 'Search student or status…',
      emptyMessage: 'No individual access items right now.',
      getRowId: function (item) {
        return item.kind + ':' + item.id;
      },
      getSortValue: function (item, key) {
        if (key === 'attention') return attentionRank(item);
        if (key === 'student') return studentLine(item);
        if (key === 'status') return item.status || item.kind || '';
        if (key === 'expires') {
          return item.grantExpiresAt || item.claimExpiresAt || item.requestedAt || '';
        }
        if (key === 'source') return item.source || '';
        return '';
      },
      getSearchText: function (item) {
        return [studentLine(item), item.status, item.source, item.requestPhrase, item.studentUsername].join(' ');
      },
      matchFilter: function (item, filterId, value) {
        if (filterId === 'status') return item.kind === value || item.status === value;
        return true;
      },
      getCellHtml: function (item, key) {
        if (key === 'student') return esc(studentLine(item));
        if (key === 'expires') return esc(durationCell(item));
        if (key === 'source') return esc(item.source || '');
        return esc(item[key] || '');
      },
      getStatus: function (item) {
        if (item.kind === 'pending') return { label: 'Pending', tone: 'reported' };
        if (item.kind === 'preauthorized') return { label: 'Pre-authorized', tone: 'hidden' };
        if (item.kind === 'active') return { label: 'Active', tone: 'live' };
        return { label: item.status || '', tone: '' };
      },
      renderExpanded: renderExpanded,
    });
    return listApi;
  }

  function refresh() {
    if (inFlight) return Promise.resolve();
    var pill = $('accessRequestsPendingCountPill');
    if (!$('individualAccessBoardMount')) return Promise.resolve();
    inFlight = true;
    return fetch(apiBase() + '/api/class-access/individual-board', { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (board) {
        inFlight = false;
        if (!board || !board.ok) return;
        if (pill) pill.textContent = String((board.pending || []).length);
        var api = ensureList();
        if (api) api.setItems(boardItems(board));
      })
      .catch(function () {
        inFlight = false;
      });
  }

  function wireForm() {
    var search = $('individualAccessStudentSearch');
    var btn = $('individualAccessPreauthBtn');
    if (search) {
      search.addEventListener('input', function () {
        selectedStudent = null;
        renderSelected();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchStudents(search.value);
        }, 200);
      });
    }
    if (btn) btn.addEventListener('click', preauthorize);
  }

  function init() {
    if (!$('individualAccessCard')) return;
    wireForm();
    ensureList();
    refresh();
  }

  global.LanternIndividualAccess = {
    init: init,
    refresh: refresh,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
