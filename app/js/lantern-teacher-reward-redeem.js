(function () {
  'use strict';
  (function(){ try { if (window.LANTERN_DATA) { if (window.LANTERN_DATA.ensureCharacters) window.LANTERN_DATA.ensureCharacters(); if (window.LANTERN_DATA.ensureStartupMode) window.LANTERN_DATA.ensureStartupMode(); } } catch(e){} })();

  var createRun = (typeof LANTERN_API !== 'undefined' && LANTERN_API.createRun) ? LANTERN_API.createRun : null;
  var el = function (id) { return document.getElementById(id); };
  var overlay = el('teacherRewardOverlay');

  var students = [];
  var selectedStudentName = '';

  function tryPlayCash(){
    if (window.MTSS_SFX && typeof window.MTSS_SFX.playChaChing === 'function') {
      window.MTSS_SFX.playChaChing();
    }
  }

  function showModal(title, html){
    var t = el('teacherRewardModalTitle');
    var b = el('teacherRewardModalBody');
    if (!t || !b) return;
    t.textContent = title || '';
    b.innerHTML = html || '';
    if (overlay) overlay.style.display = 'flex';
  }
  function hideModal(){ if (overlay) overlay.style.display = 'none'; }

  if (el('teacherRewardModalCloseBtn')) el('teacherRewardModalCloseBtn').addEventListener('click', hideModal);
  if (overlay) overlay.addEventListener('click', function (e){ if (e.target === overlay) hideModal(); });

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, function(c){ return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;'; });
  }

  var economyApiBase = (function () {
    if (typeof window === 'undefined') return null;
    var raw =
      typeof window.LANTERN_ECONOMY_API !== 'undefined' &&
      window.LANTERN_ECONOMY_API !== null &&
      String(window.LANTERN_ECONOMY_API).trim() !== ''
        ? window.LANTERN_ECONOMY_API
        : window.LANTERN_AVATAR_API;
    if (typeof raw === 'undefined' || raw === null) return null;
    return String(raw).replace(/\/$/, '');
  })();

  function callStoreBootstrap(){
    var run = createRun ? createRun() : null;
    if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
    return new Promise(function(resolve){
      run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).storeBootstrap();
    });
  }

  function callGetBalance(characterName){
    if (economyApiBase != null) {
      return fetch(economyApiBase + '/api/economy/balance?character_name=' + encodeURIComponent(characterName), { credentials: 'include' }).then(function(r){ return r.json(); }).then(function(res){
        if (res && res.ok) return { ok: true, student_name: characterName, earned: res.earned, spent: res.spent, available: res.balance };
        return { ok: false, error: res && res.error || 'Failed' };
      }).catch(function(){ return { ok: false, error: 'Network error' }; });
    }
    var run = createRun ? createRun() : null;
    if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
    return new Promise(function(resolve){
      run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).storeGetBalance({ student_name: characterName });
    });
  }

  function callEconomyTransact(characterName, delta, kind, source, note){
    if (economyApiBase == null) return Promise.resolve({ ok: false, error: 'Economy API not configured' });
    return fetch(economyApiBase + '/api/economy/transact', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_name: characterName, delta: delta, kind: kind || 'misc', source: source || '', note: note || '', meta: {} })
    }).then(function(r){ return r.json(); }).catch(function(){ return { ok: false, error: 'Network error' }; });
  }

  function parseSaleAmount(raw){
    var n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
  }

  function callManualSale(characterName, amount, note){
    var ledgerNote = (note && String(note).trim()) || 'Manual sale';
    if (economyApiBase) {
      return callEconomyTransact(characterName, -amount, 'store_redeem', 'TEACHER_MANUAL_SALE', ledgerNote).then(function(tRes){
        if (!tRes || !tRes.ok) {
          var errMsg = tRes && tRes.error === 'insufficient'
            ? 'Not enough nuggets. Need ' + amount + ', available ' + (tRes.available || 0)
            : (tRes && tRes.error || 'Sale failed');
          return { ok: false, error: errMsg };
        }
        return {
          ok: true,
          student_name: characterName,
          amount: amount,
          total_cost: amount,
          available_before: (tRes.balance_after != null ? Number(tRes.balance_after) : 0) + amount,
          available_after: tRes.balance_after,
          transaction_id: tRes.id || '',
        };
      });
    }
    var run = createRun ? createRun() : null;
    if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
    return new Promise(function(resolve){
      run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).storeManualSale({ student_name: characterName, amount: amount, note: ledgerNote });
    });
  }

  function setBalanceLoading(show){
    if (show){
      var e = el('teacherRewardEarned');
      var s = el('teacherRewardSpent');
      var a = el('teacherRewardAvail');
      if (e) e.innerHTML = '<span class="teacherRewardSpinner"></span>';
      if (s) s.innerHTML = '<span class="teacherRewardSpinner"></span>';
      if (a) a.innerHTML = '<span class="teacherRewardSpinner"></span>';
    }
  }

  function setBalanceUI(b){
    var e = el('teacherRewardEarned');
    var s = el('teacherRewardSpent');
    var a = el('teacherRewardAvail');
    if (e) e.textContent = String(b.earned ?? '—');
    if (s) s.textContent = String(b.spent ?? '—');
    if (a) a.textContent = String(b.available ?? '—');
  }

  function getSelectedStudent(){
    return selectedStudentName;
  }

  function setSelectedStudent(name){
    var s = (name && students.indexOf(name) !== -1) ? String(name).trim() : '';
    selectedStudentName = s;
    var inp = el('teacherRewardStudentInput');
    if (inp) inp.value = s || '';
    var pill = el('teacherRewardSelectedPill');
    var nameEl = el('teacherRewardSelectedNameEl');
    if (pill){
      pill.style.display = s ? 'block' : 'none';
      if (nameEl) nameEl.textContent = s || '';
    }
  }

  function clearSelectedStudentIfInvalid(){
    var v = (el('teacherRewardStudentInput') && el('teacherRewardStudentInput').value || '').trim();
    if (v !== selectedStudentName){
      selectedStudentName = '';
      var pill = el('teacherRewardSelectedPill');
      if (pill) pill.style.display = 'none';
    }
  }

  function openStudentDropdown(){
    var dd = el('teacherRewardStudentDropdown');
    if (!dd) return;
    dd.classList.add('show');
    dd.setAttribute('aria-hidden','false');
  }
  function closeStudentDropdown(){
    var dd = el('teacherRewardStudentDropdown');
    if (!dd) return;
    dd.classList.remove('show');
    dd.setAttribute('aria-hidden','true');
  }

  function renderStudentDropdown(filter){
    var q = (filter || '').trim().toLowerCase();
    var list = students.filter(function(s){ return !q || String(s).toLowerCase().indexOf(q) !== -1; });
    var box = el('teacherRewardStudentDropdown');
    if (!box) return;
    box.innerHTML = '';
    var selectRow = document.createElement('div');
    selectRow.className = 'studentDropdownItem';
    selectRow.setAttribute('role','option');
    selectRow.textContent = 'Clear selection';
    selectRow.addEventListener('click', function(){
      setSelectedStudent('');
      closeStudentDropdown();
      setBalanceUI({ earned: '—', spent: '—', available: '—' });
    });
    box.appendChild(selectRow);
    list.forEach(function(s){
      var div = document.createElement('div');
      div.className = 'studentDropdownItem';
      div.setAttribute('role','option');
      div.setAttribute('aria-selected', selectedStudentName === s ? 'true' : 'false');
      div.textContent = s;
      if (selectedStudentName === s) div.classList.add('selected');
      div.addEventListener('click', function(){
        setSelectedStudent(s);
        closeStudentDropdown();
        refreshBalance();
      });
      box.appendChild(div);
    });
    openStudentDropdown();
  }

  async function refreshBalance(){
    var characterName = getSelectedStudent();
    if (!characterName){
      setBalanceUI({ earned: '—', spent: '—', available: '—' });
      return null;
    }
    setBalanceLoading(true);
    var res = await callGetBalance(characterName);
    if (!res.ok){
      setBalanceUI({ earned: '—', spent: '—', available: '—' });
      showModal('Balance Error', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml(res.error || 'Unknown error') + '</div>');
      return null;
    }
    setBalanceUI(res);
    return res;
  }

  function clearSaleForm(){
    var amountEl = el('teacherRewardSaleAmount');
    if (amountEl) amountEl.value = '';
    if (el('teacherRewardNote')) el('teacherRewardNote').value = '';
  }

  function showSaleConfirm(characterName, amount, note, onConfirm){
    var noteLine = note ? '<div style="margin-top:8px;font-size:22px;opacity:.85;">Note: ' + escapeHtml(note) + '</div>' : '';
    showModal('Confirm sale', '<div style="font-size:22px;">Record a sale of <b>' + amount + '</b> Nuggets for <b>' + escapeHtml(characterName) + '</b>?</div>' + noteLine +
      '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">' +
      '<button type="button" class="btn" id="teacherRewardSaleCancelBtn">Cancel</button>' +
      '<button type="button" class="btn good" id="teacherRewardSaleConfirmBtn">Record Sale</button></div>');
    var cancelBtn = el('teacherRewardSaleCancelBtn');
    var confirmBtn = el('teacherRewardSaleConfirmBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (confirmBtn) confirmBtn.addEventListener('click', function(){
      hideModal();
      if (typeof onConfirm === 'function') onConfirm();
    });
  }

  async function executeRecordSale(){
    var characterName = getSelectedStudent();
    var amount = parseSaleAmount(el('teacherRewardSaleAmount') && el('teacherRewardSaleAmount').value);
    var note = (el('teacherRewardNote') && el('teacherRewardNote').value || '').trim();

    if (!characterName){
      showModal('Select a character', '<div style="font-size:22px;">Choose a student from the list above first.</div>');
      return;
    }
    if (amount == null){
      showModal('Invalid amount', '<div style="font-size:22px;">Enter a whole number of Nuggets (minimum 1).</div>');
      return;
    }

    var btn = el('teacherRewardRecordSaleBtn');
    if (btn){
      btn.disabled = true;
      btn.textContent = 'Recording…';
    }

    var res = await callManualSale(characterName, amount, note);

    if (btn){
      btn.disabled = false;
      btn.textContent = 'Record Sale';
    }

    if (!res.ok){
      showModal('Sale failed', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml(res.error || 'Unknown error') + '</div><div style="margin-top:14px;font-size:22px;opacity:.9;">Refresh balance and try a smaller amount if the student does not have enough Nuggets.</div>');
      return;
    }

    tryPlayCash();
    showModal('Sale recorded', '<div style="font-weight:900; font-size:22px; margin-bottom:8px;">' + escapeHtml(res.student_name) + ' — ' + res.amount + ' Nuggets</div><div style="color:#b9c6ea; font-weight:800;">Available: ' + res.available_before + ' → <b style="color:#38d07c;">' + res.available_after + '</b></div>');

    clearSaleForm();
    var balRes = await callGetBalance(characterName);
    if (balRes && balRes.ok) setBalanceUI(balRes);
    else if (res.available_after != null) setBalanceUI({ earned: '—', spent: '—', available: String(res.available_after) });
  }

  function recordSale(){
    var characterName = getSelectedStudent();
    var amount = parseSaleAmount(el('teacherRewardSaleAmount') && el('teacherRewardSaleAmount').value);
    var note = (el('teacherRewardNote') && el('teacherRewardNote').value || '').trim();

    if (!characterName){
      showModal('Select a character', '<div style="font-size:22px;">Choose a student from the list above first.</div>');
      return;
    }
    if (amount == null){
      showModal('Invalid amount', '<div style="font-size:22px;">Enter a whole number of Nuggets (minimum 1).</div>');
      return;
    }
    showSaleConfirm(characterName, amount, note, executeRecordSale);
  }

  async function bootstrapTeacherRewardTool(){
    if (!el('teacherRewardManualSalePanel')) return;
    var res = await callStoreBootstrap();
    if (!res.ok){
      showModal('Rewards data error', '<div style="color:#ffcc66;font-weight:900;">' + (res.error || 'Unknown error') + '</div>');
      return;
    }
    students = (res.students || []).map(function(s){ return (s && s.student_name != null) ? String(s.student_name).trim() : (typeof s === 'string' ? s.trim() : ''); }).filter(Boolean);
    closeStudentDropdown();
    setSelectedStudent('');
    setBalanceUI({ earned: '—', spent: '—', available: '—' });
    clearSaleForm();
  }

  function wireTeacherRewardTool(){
    if (!el('teacherRewardManualSalePanel')) return;

    var refreshBtn = el('teacherRewardRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function(){
      var charName = getSelectedStudent();
      if (!charName){
        showModal('Select a character', '<div style="font-size:22px;">Choose a student to load their balance.</div>');
        return;
      }
      refreshBalance();
    });

    var saleBtn = el('teacherRewardRecordSaleBtn');
    if (saleBtn) saleBtn.addEventListener('click', function(){ recordSale(); });

    var amountInput = el('teacherRewardSaleAmount');
    if (amountInput) {
      amountInput.addEventListener('keydown', function(e){
        if (e.key === 'Enter') { e.preventDefault(); recordSale(); }
      });
    }

    var inp = el('teacherRewardStudentInput');
    var dd = el('teacherRewardStudentDropdown');
    if (inp && dd){
      inp.addEventListener('focus', function(){ renderStudentDropdown(inp.value); });
      inp.addEventListener('input', function(){
        clearSelectedStudentIfInvalid();
        renderStudentDropdown(inp.value);
      });
      inp.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeStudentDropdown(); });
      inp.addEventListener('blur', function(){ setTimeout(closeStudentDropdown, 180); });
      dd.addEventListener('mousedown', function(e){ e.preventDefault(); });
    }

    bootstrapTeacherRewardTool();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireTeacherRewardTool);
  else wireTeacherRewardTool();
})();
