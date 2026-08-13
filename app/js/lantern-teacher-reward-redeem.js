/**
 * Prompt #95 / #173 — Teacher → Nuggets workspace on the authoritative TMS Nugget Ledger.
 *
 * Student Nugget Dashboard (Current Balance / Total Earned / Total Spent) plus This Transaction
 * (Earn | Spend). Every call goes through Lantern /api/tms-nuggets/* → TMS bridge. No localStorage
 * wallet authority. Admin Nugget Adjustment (#172) remains a separate privileged Admin tool.
 */
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var overlay = el('teacherRewardOverlay');

  var students = [];
  var selectedStudent = null;
  var searchDebounceTimer = null;
  var lastSearchQuery = '';
  var busy = false;
  var lastDashboard = null; // { current_balance, total_earned, total_spent, ... }
  var pendingIdempotencyKey = '';

  function showModal(title, html) {
    var t = el('teacherRewardModalTitle');
    var b = el('teacherRewardModalBody');
    if (!t || !b) return;
    t.textContent = title || '';
    b.innerHTML = html || '';
    if (overlay) overlay.style.display = 'flex';
  }
  function hideModal() { if (overlay) overlay.style.display = 'none'; }

  if (el('teacherRewardModalCloseBtn')) el('teacherRewardModalCloseBtn').addEventListener('click', hideModal);
  if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) hideModal(); });

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

  function parseAmount(raw) {
    if (raw === '' || raw == null) return null;
    var n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
    return n;
  }

  function getDirection() {
    var checked = document.querySelector('input[name="teacherRewardDirection"]:checked');
    return checked && checked.value === 'spend' ? 'spend' : 'earn';
  }

  function syncDirectionUi() {
    var dir = getDirection();
    var earnLab = el('teacherRewardDirEarnLabel');
    var spendLab = el('teacherRewardDirSpendLabel');
    if (earnLab) {
      earnLab.classList.toggle('is-active', dir === 'earn');
      earnLab.classList.remove('is-active-spend');
    }
    if (spendLab) {
      spendLab.classList.toggle('is-active', dir === 'spend');
      spendLab.classList.toggle('is-active-spend', dir === 'spend');
    }
    var btn = el('teacherRewardRecordSaleBtn');
    if (btn && !busy) btn.textContent = dir === 'spend' ? 'Spend Nuggets' : 'Add Nuggets';
    updateBalanceAfterPreview();
  }

  function setPanelsVisible(hasStudent) {
    var dash = el('teacherRewardDashWrap');
    var txn = el('teacherRewardTxnWrap');
    var hist = el('teacherRewardHistoryWrap');
    if (dash) dash.hidden = !hasStudent;
    if (txn) txn.hidden = !hasStudent;
    if (hist) hist.style.display = hasStudent ? 'block' : 'none';
  }

  function setBalanceLoading(show) {
    if (!show) return;
    ['teacherRewardEarned', 'teacherRewardSpent', 'teacherRewardAvail'].forEach(function (id) {
      var node = el(id);
      if (node) node.innerHTML = '<span class="teacherRewardSpinner"></span>';
    });
  }

  function applyDashboard(b) {
    lastDashboard = b && b.ok !== false ? {
      current_balance: b.current_balance != null ? Number(b.current_balance) : (b.available != null ? Number(b.available) : null),
      total_earned: b.total_earned != null ? Number(b.total_earned) : (b.earned != null ? Number(b.earned) : null),
      total_spent: b.total_spent != null ? Number(b.total_spent) : (b.spent != null ? Number(b.spent) : null),
    } : null;
    var a = el('teacherRewardAvail');
    var e = el('teacherRewardEarned');
    var s = el('teacherRewardSpent');
    if (a) a.textContent = lastDashboard && lastDashboard.current_balance != null ? String(lastDashboard.current_balance) : '—';
    if (e) e.textContent = lastDashboard && lastDashboard.total_earned != null ? String(lastDashboard.total_earned) : '—';
    if (s) s.textContent = lastDashboard && lastDashboard.total_spent != null ? String(lastDashboard.total_spent) : '—';
    updateBalanceAfterPreview();
  }

  function updateBalanceAfterPreview() {
    var preview = el('teacherRewardBalanceAfter');
    var btn = el('teacherRewardRecordSaleBtn');
    if (!preview) return;
    if (!selectedStudent || !lastDashboard || lastDashboard.current_balance == null) {
      preview.textContent = 'Balance After: —';
      preview.classList.remove('is-blocked');
      if (btn && !busy) btn.disabled = false;
      return;
    }
    var amount = parseAmount(el('teacherRewardSaleAmount') && el('teacherRewardSaleAmount').value);
    if (amount == null) {
      preview.textContent = 'Balance After: —';
      preview.classList.remove('is-blocked');
      if (btn && !busy) btn.disabled = false;
      return;
    }
    var dir = getDirection();
    var current = Number(lastDashboard.current_balance);
    if (dir === 'spend' && amount > current) {
      preview.textContent = 'Insufficient Nuggets';
      preview.classList.add('is-blocked');
      if (btn && !busy) btn.disabled = true;
      return;
    }
    var next = dir === 'spend' ? current - amount : current + amount;
    preview.textContent = 'Balance After: ' + next + ' Nuggets';
    preview.classList.remove('is-blocked');
    if (btn && !busy) btn.disabled = false;
  }

  function renderHistory(history) {
    var box = el('teacherRewardHistoryList');
    if (!box) return;
    box.innerHTML = '';
    var items = (history || []).slice(0, 8);
    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'note note-tight';
      empty.textContent = 'No activity yet.';
      box.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var isEarn = item.type === 'earned';
      var amount = Math.abs(Number(item.amount) || 0);
      var amountText = (isEarn ? '+' : '\u2212') + String(amount);
      var label = isEarn ? 'Earned' : 'Spent';
      var teacherName = String(item.teacher_name || '').trim();
      var noteBit = item.note ? (' \u2022 ' + escapeHtml(item.note)) : '';
      var row = document.createElement('div');
      row.className = 'teacherRewardHistoryRow';
      row.innerHTML =
        '<span class="teacherRewardHistoryLabel">' + escapeHtml(label) + '</span>' +
        '<span class="teacherRewardHistoryDetail">' + escapeHtml(teacherName) + noteBit + '</span>' +
        '<span class="teacherRewardHistoryAmount ' + (isEarn ? 'earned' : 'redeemed') + '">' + escapeHtml(amountText) + '</span>';
      box.appendChild(row);
    });
  }

  function getSelectedStudentName() {
    return selectedStudent ? selectedStudent.student_name : '';
  }

  function setSelectedStudent(student) {
    selectedStudent = student || null;
    pendingIdempotencyKey = '';
    var inp = el('teacherRewardStudentInput');
    if (inp) inp.value = selectedStudent ? selectedStudent.student_name : '';
    var pill = el('teacherRewardSelectedPill');
    var nameEl = el('teacherRewardSelectedNameEl');
    if (pill) {
      pill.style.display = selectedStudent ? 'block' : 'none';
      if (nameEl) nameEl.textContent = selectedStudent ? selectedStudent.student_name : '';
    }
    setPanelsVisible(!!selectedStudent);
    if (!selectedStudent) {
      applyDashboard(null);
      renderHistory([]);
    }
  }

  function layoutStudentDropdown() {
    var inp = el('teacherRewardStudentInput');
    var dd = el('teacherRewardStudentDropdown');
    if (!inp || !dd || !dd.classList.contains('show')) return;
    var rect = inp.getBoundingClientRect();
    var gap = 12;
    var available = Math.floor((window.innerHeight || 0) - rect.bottom - gap);
    var narrow = (window.innerWidth || 0) < 700;
    var cap = narrow
      ? Math.floor((window.innerHeight || 0) * 0.55)
      : 500;
    var h = Math.min(cap, Math.max(0, available));
    if (!Number.isFinite(h) || h < 80) h = Math.min(cap, 80);
    dd.style.maxHeight = h + 'px';
    dd.style.width = Math.round(rect.width) + 'px';
  }

  function openStudentDropdown() {
    var dd = el('teacherRewardStudentDropdown');
    var panel = el('teacher-rewards');
    if (!dd) return;
    dd.classList.add('show');
    dd.setAttribute('aria-hidden', 'false');
    if (panel) panel.classList.add('is-picker-open');
    layoutStudentDropdown();
  }
  function closeStudentDropdown() {
    var dd = el('teacherRewardStudentDropdown');
    var panel = el('teacher-rewards');
    if (!dd) return;
    dd.classList.remove('show');
    dd.setAttribute('aria-hidden', 'true');
    dd.style.maxHeight = '';
    dd.style.width = '';
    if (panel) panel.classList.remove('is-picker-open');
  }

  function renderStudentDropdown() {
    var box = el('teacherRewardStudentDropdown');
    if (!box) return;
    box.innerHTML = '';
    if (!students.length) {
      var empty = document.createElement('div');
      empty.className = 'studentDropdownEmpty';
      empty.textContent = lastSearchQuery ? 'No matching TMS students' : 'Type to search TMS students…';
      box.appendChild(empty);
      box.classList.add('show');
      return;
    }
    students.forEach(function (s) {
      var div = document.createElement('div');
      div.className = 'studentDropdownItem';
      div.setAttribute('role', 'option');
      div.textContent = s.student_name;
      div.addEventListener('click', function () {
        setSelectedStudent(s);
        closeStudentDropdown();
        loadDashboard();
      });
      box.appendChild(div);
    });
    openStudentDropdown();
  }

  function searchStudents(query) {
    lastSearchQuery = (query || '').trim();
    postTmsNuggets('students/search', { query: lastSearchQuery, limit: 25 }).then(function (res) {
      students = (res && res.ok && Array.isArray(res.students)) ? res.students : [];
      renderStudentDropdown();
    });
  }

  async function loadDashboard() {
    var name = getSelectedStudentName();
    if (!name) {
      applyDashboard(null);
      renderHistory([]);
      setPanelsVisible(false);
      return;
    }
    setBalanceLoading(true);
    var res = await postTmsNuggets('ledger', { student_name: name });
    if (!res || !res.ok) {
      applyDashboard(null);
      renderHistory([]);
      showModal('Nugget Ledger error', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml((res && res.error) || 'Unknown error') + '</div>');
      return;
    }
    applyDashboard(res);
    renderHistory(res.recent_history || []);
  }

  function clearTxnForm() {
    var amountEl = el('teacherRewardSaleAmount');
    if (amountEl) amountEl.value = '1';
    if (el('teacherRewardNote')) el('teacherRewardNote').value = '';
    pendingIdempotencyKey = '';
    updateBalanceAfterPreview();
  }

  function newIdempotencyKey() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'txn-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function showTxnConfirm(dir, studentName, amount, reason, onConfirm) {
    var verb = dir === 'spend' ? 'Spend' : 'Add';
    var after = null;
    if (lastDashboard && lastDashboard.current_balance != null) {
      after = dir === 'spend'
        ? Number(lastDashboard.current_balance) - amount
        : Number(lastDashboard.current_balance) + amount;
    }
    showModal(
      'Confirm transaction',
      '<div style="font-size:22px;">' + verb + ' <b>' + amount + '</b> Nugget' + (amount === 1 ? '' : 's') +
      (dir === 'spend' ? ' from ' : ' to ') + '<b>' + escapeHtml(studentName) + '</b>?</div>' +
      '<div style="margin-top:8px;font-size:22px;opacity:.85;">Reason: ' + escapeHtml(reason) + '</div>' +
      (after != null ? '<div style="margin-top:8px;font-size:22px;">Balance After: <b>' + after + '</b> Nuggets</div>' : '') +
      '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">' +
      '<button type="button" class="btn" id="teacherRewardSaleCancelBtn">Cancel</button>' +
      '<button type="button" class="btn good" id="teacherRewardSaleConfirmBtn">' + escapeHtml(verb) + '</button></div>'
    );
    var cancelBtn = el('teacherRewardSaleCancelBtn');
    var confirmBtn = el('teacherRewardSaleConfirmBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (confirmBtn) confirmBtn.addEventListener('click', function () {
      hideModal();
      if (typeof onConfirm === 'function') onConfirm();
    });
  }

  async function executeTransaction() {
    var studentName = getSelectedStudentName();
    var amount = parseAmount(el('teacherRewardSaleAmount') && el('teacherRewardSaleAmount').value);
    var reason = (el('teacherRewardNote') && el('teacherRewardNote').value || '').trim();
    var dir = getDirection();
    if (!studentName || amount == null || !reason) return;

    if (!pendingIdempotencyKey) pendingIdempotencyKey = newIdempotencyKey();
    var idem = pendingIdempotencyKey;

    var btn = el('teacherRewardRecordSaleBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = dir === 'spend' ? 'Spending…' : 'Adding…';
    }
    busy = true;

    var res;
    if (dir === 'spend') {
      res = await postTmsNuggets('redeem', { student_name: studentName, amount: amount, note: reason });
    } else {
      res = await postTmsNuggets('award', {
        student_name: studentName,
        amount: amount,
        note: reason,
        idempotency_key: idem,
      });
    }

    busy = false;
    syncDirectionUi();

    if (!res || !res.ok) {
      var err = (res && res.error) || 'Unknown error';
      var code = res && res.code ? String(res.code) : '';
      if (err === 'insufficient_balance' || code === 'insufficient_balance') {
        showModal('Insufficient Nuggets', '<div style="color:#ffcc66;font-weight:900;">Not enough Nuggets for that Spend.</div>');
      } else if (err === 'reason_required') {
        showModal('Reason required', '<div style="font-size:22px;">Enter a short reason before submitting.</div>');
      } else {
        showModal('Transaction failed', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml(err) + '</div>');
      }
      await loadDashboard();
      return;
    }

    pendingIdempotencyKey = '';
    applyDashboard(res);
    renderHistory(res.recent_history || []);
    clearTxnForm();

    var displayName = res.student_name || studentName;
    if (dir === 'spend') {
      var spentAmt = res.redeemed_amount != null ? res.redeemed_amount : amount;
      showModal(
        'Nuggets spent',
        '<div style="font-weight:900;font-size:22px;">Spent ' + spentAmt + ' Nugget' + (spentAmt === 1 ? '' : 's') +
        ' from ' + escapeHtml(displayName) + '\'s balance.</div>' +
        '<div style="color:#b9c6ea;font-weight:800;margin-top:8px;">Current Balance: <b style="color:#38d07c;">' +
        (res.available != null ? res.available : '—') + '</b></div>'
      );
    } else {
      var awarded = res.awarded_amount != null ? res.awarded_amount : amount;
      showModal(
        'Nuggets added',
        '<div style="font-weight:900;font-size:22px;">Added ' + awarded + ' Nugget' + (awarded === 1 ? '' : 's') +
        ' to ' + escapeHtml(displayName) + '.' +
        (res.idempotent ? ' (duplicate request ignored)' : '') + '</div>' +
        '<div style="color:#b9c6ea;font-weight:800;margin-top:8px;">Current Balance: <b style="color:#38d07c;">' +
        (res.available != null ? res.available : '—') + '</b></div>'
      );
    }
  }

  function submitTransaction() {
    if (busy) return;
    var studentName = getSelectedStudentName();
    var amount = parseAmount(el('teacherRewardSaleAmount') && el('teacherRewardSaleAmount').value);
    var reason = (el('teacherRewardNote') && el('teacherRewardNote').value || '').trim();
    var dir = getDirection();

    if (!studentName) {
      showModal('Select a student', '<div style="font-size:22px;">Choose a real TMS student from the list above first.</div>');
      return;
    }
    if (amount == null) {
      showModal('Invalid amount', '<div style="font-size:22px;">Enter a whole number of Nuggets (minimum 1).</div>');
      return;
    }
    if (!reason) {
      showModal('Reason required', '<div style="font-size:22px;">Enter a short reason for this transaction.</div>');
      return;
    }
    if (dir === 'spend' && lastDashboard && lastDashboard.current_balance != null && amount > Number(lastDashboard.current_balance)) {
      showModal('Insufficient Nuggets', '<div style="font-size:22px;">Current Balance is ' + lastDashboard.current_balance + '.</div>');
      return;
    }
    showTxnConfirm(dir, studentName, amount, reason, executeTransaction);
  }

  function wireTeacherRewardTool() {
    if (!el('teacherRewardManualSalePanel')) return;

    var refreshBtn = el('teacherRewardRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      if (!getSelectedStudentName()) {
        showModal('Select a student', '<div style="font-size:22px;">Choose a student to load their Nugget dashboard.</div>');
        return;
      }
      loadDashboard();
    });

    var saleBtn = el('teacherRewardRecordSaleBtn');
    if (saleBtn) saleBtn.addEventListener('click', function () { submitTransaction(); });

    Array.prototype.forEach.call(document.querySelectorAll('input[name="teacherRewardDirection"]'), function (radio) {
      radio.addEventListener('change', function () {
        pendingIdempotencyKey = '';
        syncDirectionUi();
      });
    });

    var amountInput = el('teacherRewardSaleAmount');
    if (amountInput) {
      amountInput.addEventListener('input', updateBalanceAfterPreview);
      amountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitTransaction(); }
      });
    }
    var noteInput = el('teacherRewardNote');
    if (noteInput) noteInput.addEventListener('input', function () { /* reason only */ });

    var inp = el('teacherRewardStudentInput');
    var dd = el('teacherRewardStudentDropdown');
    if (inp && dd) {
      inp.addEventListener('focus', function () { searchStudents(inp.value); });
      inp.addEventListener('input', function () {
        if (selectedStudent && inp.value.trim() !== selectedStudent.student_name) setSelectedStudent(null);
        clearTimeout(searchDebounceTimer);
        var q = inp.value;
        searchDebounceTimer = setTimeout(function () { searchStudents(q); }, 200);
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeStudentDropdown(); });
      inp.addEventListener('blur', function () { setTimeout(closeStudentDropdown, 180); });
      dd.addEventListener('mousedown', function (e) { e.preventDefault(); });
      window.addEventListener('resize', layoutStudentDropdown);
      window.addEventListener('scroll', layoutStudentDropdown, true);
    }

    setSelectedStudent(null);
    applyDashboard(null);
    renderHistory([]);
    clearTxnForm();
    syncDirectionUi();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireTeacherRewardTool);
  else wireTeacherRewardTool();
})();
