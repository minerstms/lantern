/**
 * Prompt #95 — Teacher -> Nuggets workspace, backed by the REAL TMS Nugget Ledger.
 *
 * Replaces the earlier "Manual sale" implementation (Prompt #52), which searched a client-side,
 * localStorage-only demo character list (via the Lantern data helpers' character store) and
 * deducted from a separate Lantern-only wallet. That picker is not the authoritative TMS student
 * roster and must never be used for real TMS Nugget transactions.
 *
 * Every call here goes through Lantern's own authenticated API (/api/tms-nuggets/*), which in turn
 * calls a narrow server-to-server bridge into TMS Nuggets. Lantern never stores or duplicates a
 * TMS balance; every balance/history/redeem result shown here is a live read from TMS Nuggets.
 * Student results carry the authoritative TMS student_name (validated server-side on every
 * request) -- display text only, never invented client-side.
 */
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var overlay = el('teacherRewardOverlay');

  var students = []; // authoritative TMS roster rows only: [{student_name, student_id}]
  var selectedStudent = null;
  var searchDebounceTimer = null;
  var lastSearchQuery = '';
  var busy = false;

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
    return String(s || '').replace(/[&<>"']/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'; });
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

  function parseSaleAmount(raw) {
    var n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
  }

  function setBalanceLoading(show) {
    if (show) {
      var e = el('teacherRewardEarned');
      var s = el('teacherRewardSpent');
      var a = el('teacherRewardAvail');
      if (e) e.innerHTML = '<span class="teacherRewardSpinner"></span>';
      if (s) s.innerHTML = '<span class="teacherRewardSpinner"></span>';
      if (a) a.innerHTML = '<span class="teacherRewardSpinner"></span>';
    }
  }

  function setBalanceUI(b) {
    var e = el('teacherRewardEarned');
    var s = el('teacherRewardSpent');
    var a = el('teacherRewardAvail');
    if (e) e.textContent = b && b.earned != null ? String(b.earned) : '—';
    if (s) s.textContent = b && b.spent != null ? String(b.spent) : '—';
    if (a) a.textContent = b && b.available != null ? String(b.available) : '—';
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
      var label = isEarn ? 'Earned' : 'Redeemed';
      var teacherName = String(item.teacher_name || '').trim();
      var noteBit = (!isEarn && item.note) ? (' \u2022 ' + escapeHtml(item.note)) : '';
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
    var inp = el('teacherRewardStudentInput');
    if (inp) inp.value = selectedStudent ? selectedStudent.student_name : '';
    var pill = el('teacherRewardSelectedPill');
    var nameEl = el('teacherRewardSelectedNameEl');
    if (pill) {
      pill.style.display = selectedStudent ? 'block' : 'none';
      if (nameEl) nameEl.textContent = selectedStudent ? selectedStudent.student_name : '';
    }
  }

  function openStudentDropdown() {
    var dd = el('teacherRewardStudentDropdown');
    if (!dd) return;
    dd.classList.add('show');
    dd.setAttribute('aria-hidden', 'false');
  }
  function closeStudentDropdown() {
    var dd = el('teacherRewardStudentDropdown');
    if (!dd) return;
    dd.classList.remove('show');
    dd.setAttribute('aria-hidden', 'true');
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
        loadBalance();
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

  async function loadBalance() {
    var name = getSelectedStudentName();
    if (!name) {
      setBalanceUI(null);
      renderHistory([]);
      return;
    }
    setBalanceLoading(true);
    var res = await postTmsNuggets('ledger', { student_name: name });
    if (!res || !res.ok) {
      setBalanceUI(null);
      renderHistory([]);
      showModal('Nugget Ledger error', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml((res && res.error) || 'Unknown error') + '</div>');
      return;
    }
    setBalanceUI(res);
    renderHistory(res.recent_history || []);
  }

  function clearSaleForm() {
    var amountEl = el('teacherRewardSaleAmount');
    if (amountEl) amountEl.value = '1';
    if (el('teacherRewardNote')) el('teacherRewardNote').value = '';
  }

  function showRedeemConfirm(studentName, amount, note, onConfirm) {
    var noteLine = note ? '<div style="margin-top:8px;font-size:22px;opacity:.85;">Note: ' + escapeHtml(note) + '</div>' : '';
    showModal(
      'Confirm redemption',
      '<div style="font-size:22px;">Redeem <b>' + amount + '</b> Nugget' + (amount === 1 ? '' : 's') + ' for <b>' + escapeHtml(studentName) + '</b>?</div>' + noteLine +
      '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">' +
      '<button type="button" class="btn" id="teacherRewardSaleCancelBtn">Cancel</button>' +
      '<button type="button" class="btn good" id="teacherRewardSaleConfirmBtn">Redeem</button></div>'
    );
    var cancelBtn = el('teacherRewardSaleCancelBtn');
    var confirmBtn = el('teacherRewardSaleConfirmBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (confirmBtn) confirmBtn.addEventListener('click', function () {
      hideModal();
      if (typeof onConfirm === 'function') onConfirm();
    });
  }

  async function executeRedeem() {
    var studentName = getSelectedStudentName();
    var amount = parseSaleAmount(el('teacherRewardSaleAmount') && el('teacherRewardSaleAmount').value);
    var note = (el('teacherRewardNote') && el('teacherRewardNote').value || '').trim();

    if (!studentName || amount == null) return;

    var btn = el('teacherRewardRecordSaleBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Redeeming…'; }
    busy = true;

    var res = await postTmsNuggets('redeem', { student_name: studentName, amount: amount, note: note });

    if (btn) { btn.disabled = false; btn.textContent = 'Redeem Nugget'; }
    busy = false;

    if (!res || !res.ok) {
      showModal('Redemption failed', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml((res && res.error) || 'Unknown error') + '</div>');
      return;
    }

    setBalanceUI(res);
    renderHistory(res.recent_history || []);
    clearSaleForm();
    showModal(
      'Nugget redeemed',
      '<div style="font-weight:900; font-size:22px; margin-bottom:8px;">' + escapeHtml(res.student_name) + ' \u2014 ' + res.redeemed_amount + ' Nugget' + (res.redeemed_amount === 1 ? '' : 's') + '</div>' +
      '<div style="color:#b9c6ea; font-weight:800;">Available: <b style="color:#38d07c;">' + res.available + '</b></div>'
    );
  }

  function redeem() {
    if (busy) return;
    var studentName = getSelectedStudentName();
    var amount = parseSaleAmount(el('teacherRewardSaleAmount') && el('teacherRewardSaleAmount').value);
    var note = (el('teacherRewardNote') && el('teacherRewardNote').value || '').trim();

    if (!studentName) {
      showModal('Select a student', '<div style="font-size:22px;">Choose a real TMS student from the list above first.</div>');
      return;
    }
    if (amount == null) {
      showModal('Invalid amount', '<div style="font-size:22px;">Enter a whole number of Nuggets (minimum 1).</div>');
      return;
    }
    showRedeemConfirm(studentName, amount, note, executeRedeem);
  }

  function wireTeacherRewardTool() {
    if (!el('teacherRewardManualSalePanel')) return;

    var refreshBtn = el('teacherRewardRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      if (!getSelectedStudentName()) {
        showModal('Select a student', '<div style="font-size:22px;">Choose a student to load their TMS Nugget balance.</div>');
        return;
      }
      loadBalance();
    });

    var saleBtn = el('teacherRewardRecordSaleBtn');
    if (saleBtn) saleBtn.addEventListener('click', function () { redeem(); });

    var amountInput = el('teacherRewardSaleAmount');
    if (amountInput) {
      amountInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); redeem(); }
      });
    }

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
    }

    setSelectedStudent(null);
    setBalanceUI(null);
    renderHistory([]);
    clearSaleForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireTeacherRewardTool);
  else wireTeacherRewardTool();
})();
