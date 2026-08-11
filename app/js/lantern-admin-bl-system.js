/**
 * Prompt #201 — Lantern Admin Device Access + Behavior Logger System Administration.
 * Calls POST /api/admin/tms-ops (Lantern admin session → TMS lantern-bridge admin/action).
 * Does not mutate production data on load; no staff-account CRUD (Lantern Staff is canonical).
 */
(function (global) {
  'use strict';

  function apiBase() {
    try {
      if (typeof global.LANTERN_AVATAR_API === 'string') return global.LANTERN_AVATAR_API;
    } catch (_) {}
    return '';
  }

  function postOps(action, payload) {
    var body = Object.assign({}, payload || {}, { action: action });
    return fetch(apiBase() + '/api/admin/tms-ops', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || (j && j.ok === false)) {
          var err = new Error((j && (j.error || j.message)) || ('HTTP ' + r.status));
          err.code = j && j.code;
          throw err;
        }
        return j;
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setMsg(id, text, isErr) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.style.color = isErr ? 'var(--bad, #ff4d6d)' : '';
  }

  /* ── Device Access ───────────────────────────────────────────── */
  var deviceTab = 'pending';

  function renderDevices(list) {
    var wrap = document.getElementById('lanternDeviceAccessList');
    if (!wrap) return;
    var devices = (list && list.devices) || [];
    if (!devices.length) {
      wrap.innerHTML = '<p class="pendingMeta">No devices in this list.</p>';
      return;
    }
    wrap.innerHTML = devices
      .map(function (d) {
        var title = esc(d.teacher_name || d.teacher_id || 'Staff') + ' · ' + esc(d.device_label || d.device_id || '');
        var meta =
          'Status: ' +
          esc(d.status || '') +
          (d.created_at ? ' · Created ' + esc(d.created_at) : '') +
          (d.last_seen_at ? ' · Last seen ' + esc(d.last_seen_at) : '');
        var actions = '';
        if (d.status === 'pending') {
          actions =
            '<button type="button" class="btn good" data-dev-act="approve" data-id="' +
            esc(d.device_id) +
            '">Approve</button>' +
            '<button type="button" class="btn" data-dev-act="deny" data-id="' +
            esc(d.device_id) +
            '">Deny</button>';
        } else if (d.status === 'approved') {
          actions =
            '<button type="button" class="btn" data-dev-act="revoke" data-id="' +
            esc(d.device_id) +
            '">Revoke</button>';
        }
        return (
          '<div class="lanternMgmtRecord" style="padding:12px;border-bottom:1px solid rgba(255,255,255,.08);">' +
          '<div style="font-weight:800;">' +
          title +
          '</div>' +
          '<div class="pendingMeta">' +
          meta +
          '</div>' +
          (d.user_agent ? '<div class="pendingMeta" style="font-size:14px;">' + esc(d.user_agent) + '</div>' : '') +
          (actions ? '<div class="acctPanelActions" style="margin-top:8px;">' + actions + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
  }

  function loadDevices() {
    setMsg('lanternDeviceAccessMsg', 'Loading…');
    return postOps('listDeviceRequests', { status: deviceTab })
      .then(function (res) {
        setMsg('lanternDeviceAccessMsg', '');
        renderDevices(res);
      })
      .catch(function (err) {
        setMsg('lanternDeviceAccessMsg', (err && err.message) || 'Failed to load devices', true);
      });
  }

  function bindDeviceAccess() {
    var pending = document.getElementById('lanternDevicesTabPending');
    var approved = document.getElementById('lanternDevicesTabApproved');
    var revoked = document.getElementById('lanternDevicesTabRevoked');
    function setTab(tab, btn) {
      deviceTab = tab;
      [pending, approved, revoked].forEach(function (b) {
        if (b) b.classList.toggle('primary', b === btn);
      });
      loadDevices();
    }
    if (pending) pending.addEventListener('click', function () { setTab('pending', pending); });
    if (approved) approved.addEventListener('click', function () { setTab('approved', approved); });
    if (revoked) revoked.addEventListener('click', function () { setTab('revoked', revoked); });
    var list = document.getElementById('lanternDeviceAccessList');
    if (list) {
      list.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-dev-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-dev-act');
        var id = btn.getAttribute('data-id');
        var action =
          act === 'approve' ? 'approveDevice' : act === 'deny' ? 'denyDevice' : act === 'revoke' ? 'revokeDevice' : '';
        if (!action || !id) return;
        btn.disabled = true;
        postOps(action, { device_id: id })
          .then(function () { return loadDevices(); })
          .catch(function (err) {
            setMsg('lanternDeviceAccessMsg', (err && err.message) || 'Action failed', true);
            btn.disabled = false;
          });
      });
    }
    var refresh = document.getElementById('lanternDeviceAccessRefresh');
    if (refresh) refresh.addEventListener('click', loadDevices);
  }

  /* ── Shared BL roster helpers ────────────────────────────────── */
  var cachedStudents = [];
  var cachedCategories = [];
  var cachedGradeGroups = [];

  function loadStudents() {
    return postOps('getStudentGradeAssignments', {}).then(function (res) {
      cachedStudents = (res && res.students) || [];
      cachedGradeGroups = (res && res.grade_groups) || [];
      return cachedStudents;
    });
  }

  function loadCategories() {
    return postOps('getGroupCategories', { admin_mode: true }).then(function (res) {
      cachedCategories = (res && res.categories) || [];
      return cachedCategories;
    });
  }

  function allGroups() {
    var out = [];
    (cachedCategories || []).forEach(function (c) {
      (c.groups || []).forEach(function (g) {
        out.push(Object.assign({}, g, { category_name: c.name || '' }));
      });
    });
    return out;
  }

  /* ── Groups ──────────────────────────────────────────────────── */
  function renderGroups() {
    var wrap = document.getElementById('lanternBlGroupsList');
    if (!wrap) return;
    if (!cachedCategories.length) {
      wrap.innerHTML =
        '<p class="pendingMeta">No groups yet. Use Seed default groups if the database schema is already applied.</p>';
      return;
    }
    wrap.innerHTML = cachedCategories
      .map(function (c) {
        var groups = (c.groups || [])
          .map(function (g) {
            return (
              '<li>' +
              esc(g.name) +
              (g.is_hidden ? ' <span class="pendingMeta">(hidden)</span>' : '') +
              '</li>'
            );
          })
          .join('');
        return (
          '<div style="margin-bottom:12px;"><div class="h" style="font-size:18px;">' +
          esc(c.name) +
          '</div><ul style="margin:6px 0 0 18px;">' +
          (groups || '<li class="pendingMeta">No groups</li>') +
          '</ul></div>'
        );
      })
      .join('');
  }

  function refreshGroupsPanel() {
    setMsg('lanternBlGroupsMsg', 'Loading…');
    return loadCategories()
      .then(function () {
        setMsg('lanternBlGroupsMsg', '');
        renderGroups();
        fillBulkGroupSelect();
      })
      .catch(function (err) {
        setMsg('lanternBlGroupsMsg', (err && err.message) || 'Failed to load groups', true);
      });
  }

  function bindGroups() {
    var seed = document.getElementById('lanternBlSeedGroupsBtn');
    if (seed) {
      seed.addEventListener('click', function () {
        seed.disabled = true;
        postOps('seedDefaultGroups', {})
          .then(function (res) {
            setMsg('lanternBlGroupsMsg', (res && res.message) || 'Default groups seeded.');
            return refreshGroupsPanel();
          })
          .catch(function (err) {
            setMsg('lanternBlGroupsMsg', (err && err.message) || 'Seed failed', true);
          })
          .then(function () {
            seed.disabled = false;
          });
      });
    }
    var add = document.getElementById('lanternBlAddGroupBtn');
    if (add) {
      add.addEventListener('click', function () {
        var nameEl = document.getElementById('lanternBlNewGroupName');
        var catEl = document.getElementById('lanternBlNewGroupCategory');
        var name = nameEl ? String(nameEl.value || '').trim() : '';
        var catId = catEl ? Number(catEl.value) : 0;
        if (!name || !catId) {
          setMsg('lanternBlGroupsMsg', 'Category and group name required.', true);
          return;
        }
        add.disabled = true;
        postOps('createGroup', { category_id: catId, name: name })
          .then(function () {
            if (nameEl) nameEl.value = '';
            setMsg('lanternBlGroupsMsg', 'Group created.');
            return refreshGroupsPanel();
          })
          .catch(function (err) {
            setMsg('lanternBlGroupsMsg', (err && err.message) || 'Create failed', true);
          })
          .then(function () {
            add.disabled = false;
          });
      });
    }
    var refresh = document.getElementById('lanternBlGroupsRefresh');
    if (refresh) refresh.addEventListener('click', refreshGroupsPanel);
  }

  function fillNewGroupCategorySelect() {
    var sel = document.getElementById('lanternBlNewGroupCategory');
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML =
      '<option value="">— Category —</option>' +
      cachedCategories
        .map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
        })
        .join('');
    if (cur) sel.value = cur;
  }

  /* ── Bulk assign ─────────────────────────────────────────────── */
  function fillBulkGroupSelect() {
    fillNewGroupCategorySelect();
    var sel = document.getElementById('lanternBlBulkGroupSelect');
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML =
      '<option value="">— Select group —</option>' +
      allGroups()
        .map(function (g) {
          return (
            '<option value="' +
            esc(g.id) +
            '">' +
            esc(g.category_name ? g.category_name + ' / ' : '') +
            esc(g.name) +
            '</option>'
          );
        })
        .join('');
    if (cur) sel.value = cur;
  }

  function renderBulkStudents() {
    var wrap = document.getElementById('lanternBlBulkStudentList');
    var qEl = document.getElementById('lanternBlBulkStudentSearch');
    var groupId = Number((document.getElementById('lanternBlBulkGroupSelect') || {}).value || 0);
    if (!wrap) return;
    var q = qEl ? String(qEl.value || '').trim().toLowerCase() : '';
    var rows = (cachedStudents || []).filter(function (s) {
      var name = String(s.student_name || s.name || '').toLowerCase();
      return !q || name.indexOf(q) >= 0;
    });
    if (!groupId) {
      wrap.innerHTML = '<p class="pendingMeta">Select a group first.</p>';
      return;
    }
    if (!rows.length) {
      wrap.innerHTML = '<p class="pendingMeta">No students match.</p>';
      return;
    }
    wrap.innerHTML = rows
      .slice(0, 200)
      .map(function (s) {
        var name = s.student_name || s.name || '';
        var sid = s.student_id || '';
        return (
          '<label style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;">' +
          '<input type="checkbox" data-bulk-student="1" data-name="' +
          esc(name) +
          '" data-sid="' +
          esc(sid) +
          '"/>' +
          '<span>' +
          esc(name) +
          (sid ? ' <span class="pendingMeta">(' + esc(sid) + ')</span>' : '') +
          '</span></label>'
        );
      })
      .join('');
  }

  function bindBulk() {
    var sel = document.getElementById('lanternBlBulkGroupSelect');
    var search = document.getElementById('lanternBlBulkStudentSearch');
    var refresh = document.getElementById('lanternBlBulkRefresh');
    function reload() {
      setMsg('lanternBlBulkMsg', 'Loading…');
      return Promise.all([loadStudents(), loadCategories()])
        .then(function () {
          fillBulkGroupSelect();
          renderBulkStudents();
          setMsg('lanternBlBulkMsg', '');
        })
        .catch(function (err) {
          setMsg('lanternBlBulkMsg', (err && err.message) || 'Load failed', true);
        });
    }
    if (sel) sel.addEventListener('change', renderBulkStudents);
    if (search) search.addEventListener('input', renderBulkStudents);
    if (refresh) refresh.addEventListener('click', reload);
    var list = document.getElementById('lanternBlBulkStudentList');
    if (list) {
      list.addEventListener('change', function (ev) {
        var cb = ev.target;
        if (!cb || !cb.getAttribute || !cb.getAttribute('data-bulk-student')) return;
        var groupId = Number((document.getElementById('lanternBlBulkGroupSelect') || {}).value || 0);
        if (!groupId) return;
        var name = cb.getAttribute('data-name') || '';
        var sid = cb.getAttribute('data-sid') || '';
        var action = cb.checked ? 'addStudentToGroup' : 'removeStudentFromGroup';
        cb.disabled = true;
        postOps(action, { student_name: name, student_id: sid, group_id: groupId })
          .then(function () {
            setMsg('lanternBlBulkMsg', (cb.checked ? 'Added ' : 'Removed ') + name);
          })
          .catch(function (err) {
            cb.checked = !cb.checked;
            setMsg('lanternBlBulkMsg', (err && err.message) || 'Update failed', true);
          })
          .then(function () {
            cb.disabled = false;
          });
      });
    }
    var panel = document.getElementById('lanternBlBulkPanel');
    if (panel) {
      panel.addEventListener('toggle', function () {
        if (panel.open) reload();
      });
    }
  }

  /* ── Grade assignments ───────────────────────────────────────── */
  function renderGrades(rows) {
    var wrap = document.getElementById('lanternBlGradeList');
    if (!wrap) return;
    var qEl = document.getElementById('lanternBlGradeSearch');
    var q = qEl ? String(qEl.value || '').trim().toLowerCase() : '';
    var list = (rows || []).filter(function (r) {
      var name = String(r.student_name || '').toLowerCase();
      return !q || name.indexOf(q) >= 0;
    });
    if (!list.length) {
      wrap.innerHTML = '<p class="pendingMeta">No students.</p>';
      return;
    }
    var grades = [
      { slug: 'grade-6', label: '6th' },
      { slug: 'grade-7', label: '7th' },
      { slug: 'grade-8', label: '8th' },
    ].map(function (g) {
      var found = (cachedGradeGroups || []).find(function (gg) {
        return gg.slug === g.slug;
      });
      return Object.assign({}, g, { id: found ? found.id : null });
    });
    wrap.innerHTML = list
      .slice(0, 250)
      .map(function (r) {
        var curId = r.grade_group_id != null ? Number(r.grade_group_id) : null;
        var btns = grades
          .map(function (g) {
            var on = curId != null && Number(g.id) === curId;
            return (
              '<button type="button" class="btn' +
              (on ? ' primary' : '') +
              '" data-grade-slug="' +
              g.slug +
              '" data-group-id="' +
              esc(g.id || '') +
              '" data-name="' +
              esc(r.student_name) +
              '" data-sid="' +
              esc(r.student_id || '') +
              '" data-on="' +
              (on ? '1' : '0') +
              '">' +
              g.label +
              '</button>'
            );
          })
          .join(' ');
        return (
          '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
          '<div style="min-width:160px;font-weight:700;">' +
          esc(r.student_name) +
          '</div>' +
          btns +
          '</div>'
        );
      })
      .join('');
  }

  var gradeRows = [];

  function loadGrades() {
    setMsg('lanternBlGradeMsg', 'Loading…');
    return loadStudents()
      .then(function () {
        gradeRows = cachedStudents;
        setMsg('lanternBlGradeMsg', '');
        renderGrades(gradeRows);
      })
      .catch(function (err) {
        setMsg('lanternBlGradeMsg', (err && err.message) || 'Failed to load grades', true);
      });
  }

  function bindGrades() {
    var search = document.getElementById('lanternBlGradeSearch');
    var refresh = document.getElementById('lanternBlGradeRefresh');
    if (search) search.addEventListener('input', function () { renderGrades(gradeRows); });
    if (refresh) refresh.addEventListener('click', loadGrades);
    var list = document.getElementById('lanternBlGradeList');
    if (list) {
      list.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-grade-slug]') : null;
        if (!btn) return;
        var name = btn.getAttribute('data-name') || '';
        var sid = btn.getAttribute('data-sid') || '';
        var groupId = Number(btn.getAttribute('data-group-id') || 0);
        var isOn = btn.getAttribute('data-on') === '1';
        if (!groupId) {
          setMsg('lanternBlGradeMsg', 'Grade group not found — seed groups first.', true);
          return;
        }
        var action = isOn ? 'removeStudentFromGroup' : 'addStudentToGroup';
        btn.disabled = true;
        postOps(action, { student_name: name, student_id: sid, group_id: groupId })
          .then(function () { return loadGrades(); })
          .catch(function (err) {
            setMsg('lanternBlGradeMsg', (err && err.message) || 'Update failed', true);
            btn.disabled = false;
          });
      });
    }
    var panel = document.getElementById('lanternBlGradePanel');
    if (panel) {
      panel.addEventListener('toggle', function () {
        if (panel.open) loadGrades();
      });
    }
  }

  /* ── Rollover ────────────────────────────────────────────────── */
  var lastPlan = null;

  function renderRolloverPlan(plan) {
    lastPlan = plan;
    function set(id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = String(v != null ? v : '—');
    }
    set('lanternRolloverStatActive', plan.active_count);
    set('lanternRolloverStat67', plan.counts && plan.counts.grade6to7);
    set('lanternRolloverStat78', plan.counts && plan.counts.grade7to8);
    set('lanternRolloverStat8A', plan.counts && plan.counts.grade8toArchived);
    set('lanternRolloverStatExceptions', plan.counts && plan.counts.exceptions);
    var body = document.getElementById('lanternRolloverChangesBody');
    if (body) {
      var changes = plan.changes || [];
      body.innerHTML = changes.length
        ? changes
            .map(function (c) {
              return (
                '<tr><td>' +
                esc(c.student_name) +
                (c.student_id ? ' (' + esc(c.student_id) + ')' : '') +
                '</td><td>' +
                esc(c.from) +
                ' → ' +
                esc(c.to) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="2" class="pendingMeta">No eligible students.</td></tr>';
    }
    var exc = document.getElementById('lanternRolloverExceptionsBody');
    if (exc) {
      var exceptions = plan.exceptions || [];
      exc.innerHTML = exceptions.length
        ? exceptions
            .map(function (e) {
              return (
                '<tr><td>' +
                esc(e.student_name) +
                '</td><td>' +
                esc(e.reason || '') +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="2" class="pendingMeta">None</td></tr>';
    }
    var applyBtn = document.getElementById('lanternRolloverApplyBtn');
    if (applyBtn) applyBtn.style.display = plan.plan_hash ? '' : 'none';
    var previewWrap = document.getElementById('lanternRolloverPreviewWrap');
    if (previewWrap) previewWrap.style.display = '';
  }

  function bindRollover() {
    var yearInput = document.getElementById('lanternRolloverSchoolYearInput');
    if (yearInput && !yearInput.value) {
      var now = new Date();
      var startY = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
      yearInput.value = startY + '-' + (startY + 1);
    }
    var preview = document.getElementById('lanternRolloverPreviewBtn');
    var apply = document.getElementById('lanternRolloverApplyBtn');
    var undo = document.getElementById('lanternRolloverUndoBtn');
    if (preview) {
      preview.addEventListener('click', function () {
        setMsg('lanternRolloverMsg', 'Building preview…');
        postOps('previewStudentRollover', {})
          .then(function (res) {
            var plan = res.plan || res;
            renderRolloverPlan(plan);
            setMsg('lanternRolloverMsg', 'Preview ready. Confirm before applying.');
            if (undo) undo.style.display = '';
          })
          .catch(function (err) {
            setMsg('lanternRolloverMsg', (err && err.message) || 'Preview failed', true);
          });
      });
    }
    if (apply) {
      apply.addEventListener('click', function () {
        if (!lastPlan || !lastPlan.plan_hash) {
          setMsg('lanternRolloverMsg', 'Preview first.', true);
          return;
        }
        var typed = window.prompt('Type ADVANCE to apply school-year rollover:');
        if (String(typed || '').trim() !== 'ADVANCE') {
          setMsg('lanternRolloverMsg', 'Cancelled.', true);
          return;
        }
        apply.disabled = true;
        postOps('applyStudentRollover', {
          plan_hash: lastPlan.plan_hash,
          school_year_label: yearInput ? yearInput.value : '',
          confirm: 'ADVANCE',
        })
          .then(function (res) {
            setMsg('lanternRolloverMsg', (res && res.message) || 'Rollover applied.');
            lastPlan = null;
            apply.style.display = 'none';
          })
          .catch(function (err) {
            setMsg('lanternRolloverMsg', (err && err.message) || 'Apply failed', true);
          })
          .then(function () {
            apply.disabled = false;
          });
      });
    }
    if (undo) {
      undo.addEventListener('click', function () {
        if (!window.confirm('Undo the most recent rollover batch?')) return;
        undo.disabled = true;
        postOps('undoLastStudentRollover', {})
          .then(function (res) {
            setMsg('lanternRolloverMsg', (res && res.message) || 'Undo complete.');
          })
          .catch(function (err) {
            setMsg('lanternRolloverMsg', (err && err.message) || 'Undo failed', true);
          })
          .then(function () {
            undo.disabled = false;
          });
      });
    }
  }

  /* ── Student ops (duplicate IDs; identity editing stays on Students) ── */
  function bindStudentOps() {
    var btn = document.getElementById('lanternBlDupReportBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      setMsg('lanternBlStudentOpsMsg', 'Loading…');
      postOps('getStudentDuplicateReport', {})
        .then(function (res) {
          var wrap = document.getElementById('lanternBlDupReportList');
          var dups = (res && (res.duplicates || res.rows || res.report)) || [];
          if (wrap) {
            if (!dups.length) {
              wrap.innerHTML = '<p class="pendingMeta">No duplicate Student IDs found.</p>';
            } else {
              wrap.innerHTML = dups
                .map(function (d) {
                  return (
                    '<div class="pendingMeta" style="padding:6px 0;">' +
                    esc(JSON.stringify(d)) +
                    '</div>'
                  );
                })
                .join('');
            }
          }
          setMsg('lanternBlStudentOpsMsg', '');
        })
        .catch(function (err) {
          setMsg('lanternBlStudentOpsMsg', (err && err.message) || 'Report failed', true);
        });
    });
  }

  function openHashTargets() {
    var hash = String(global.location.hash || '').toLowerCase();
    if (hash === '#system' || hash.indexOf('system') >= 0) {
      var sys = document.getElementById('adminSystemAdministrationCard');
      if (sys) sys.open = true;
      var bl = document.getElementById('lanternBlOpsPanel');
      if (bl) bl.open = true;
      try {
        if (sys) sys.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) {}
    }
    if (hash === '#device-access' || hash === '#devices') {
      var staff = document.getElementById('adminStaffCard');
      if (staff) staff.open = true;
      var da = document.getElementById('lanternDeviceAccessPanel');
      if (da) da.open = true;
      loadDevices();
    }
  }

  function init() {
    bindDeviceAccess();
    bindGroups();
    bindBulk();
    bindGrades();
    bindRollover();
    bindStudentOps();
    var daPanel = document.getElementById('lanternDeviceAccessPanel');
    if (daPanel) {
      daPanel.addEventListener('toggle', function () {
        if (daPanel.open) loadDevices();
      });
    }
    var groupsPanel = document.getElementById('lanternBlGroupsPanel');
    if (groupsPanel) {
      groupsPanel.addEventListener('toggle', function () {
        if (groupsPanel.open) refreshGroupsPanel();
      });
    }
    openHashTargets();
    global.addEventListener('hashchange', openHashTargets);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LanternAdminBlSystem = { postOps: postOps, loadDevices: loadDevices };
})(typeof window !== 'undefined' ? window : this);
