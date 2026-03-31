(function () {
  'use strict';
  (function(){ try { if (window.LANTERN_DATA) { if (window.LANTERN_DATA.ensureCharacters) window.LANTERN_DATA.ensureCharacters(); if (window.LANTERN_DATA.ensureCatalog) window.LANTERN_DATA.ensureCatalog(); if (window.LANTERN_DATA.ensureStartupMode) window.LANTERN_DATA.ensureStartupMode(); } } catch(e){} })();

  var createRun = (typeof LANTERN_API !== 'undefined' && LANTERN_API.createRun) ? LANTERN_API.createRun : null;
  var el = function (id) { return document.getElementById(id); };
  var overlay = el('teacherRewardOverlay');

  var catalog = [];
  var students = [];
  var selectedStudentName = '';
  var selectedItemId = '';

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

  var economyApiBase = (typeof window !== 'undefined' && (window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API)) ? (window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';

  function callStoreBootstrap(){
    var run = createRun ? createRun() : null;
    if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
    return new Promise(function(resolve){
      run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).storeBootstrap();
    });
  }

  function callGetBalance(characterName){
    if (economyApiBase) {
      return fetch(economyApiBase + '/api/economy/balance?character_name=' + encodeURIComponent(characterName)).then(function(r){ return r.json(); }).then(function(res){
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
    if (!economyApiBase) return Promise.resolve({ ok: false });
    return fetch(economyApiBase + '/api/economy/transact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_name: characterName, delta: delta, kind: kind || 'misc', source: source || '', note: note || '', meta: {} })
    }).then(function(r){ return r.json(); }).catch(function(){ return { ok: false }; });
  }

  function callRedeem(characterName, itemId, qty, note){
    var cat = (window.LANTERN_DATA && window.LANTERN_DATA.ensureCatalog) ? window.LANTERN_DATA.ensureCatalog() : [];
    var item = cat.find(function(x){ return x.item_id === itemId; }) || (cat[0] || { item_id: 'GENERIC', item_name: 'Reward', cost: 1 });
    var cost = Number(item.cost) || 1;
    var totalCost = cost * (Math.max(1, Math.floor(Number(qty) || 1)));
    if (economyApiBase) {
      return callEconomyTransact(characterName, -totalCost, 'store_redeem', 'REDEEM', note || item.item_name).then(function(tRes){
        if (!tRes || !tRes.ok) return { ok: false, error: tRes && (tRes.error === 'insufficient' ? 'Not enough nuggets. Need ' + totalCost + ', available ' + (tRes.available || 0) : tRes.error) || 'Redeem failed' };
        var run = createRun ? createRun() : null;
        if (!run) return { ok: true, student_name: characterName, item: item, qty: qty, total_cost: totalCost, available_before: (tRes.balance_after || 0) + totalCost, available_after: tRes.balance_after };
        return new Promise(function(resolve, reject){
          run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(err){ reject(err); }).storeRedeem({ student_name: characterName, item_id: itemId, qty: qty, note: note, economy_backend_charged: true, available_after: tRes.balance_after });
        });
      });
    }
    var run = createRun ? createRun() : null;
    if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
    return new Promise(function(resolve){
      run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).storeRedeem({ student_name: characterName, item_id: itemId, qty: qty, note: note });
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

  function setSelectedItem(itemId){
    selectedItemId = (itemId && String(itemId).trim()) || '';
    renderCatalogSelectionState();
    updateSelectedItemHint();
  }

  function updateSelectedItemHint(){
    var hint = el('teacherRewardSelectedHint');
    if (!hint) return;
    if (!selectedItemId){
      hint.textContent = 'No catalog item selected.';
      hint.classList.remove('hasSelection');
      return;
    }
    var it = catalog.find(function(x){ return (x.item_id || '') === selectedItemId; });
    hint.textContent = 'Selected: ' + (it ? (it.item_name || it.item_id) : selectedItemId);
    hint.classList.add('hasSelection');
  }

  function renderCatalogSelectionState(){
    var grid = el('teacherRewardCatalogGrid');
    if (!grid) return;
    grid.querySelectorAll('.teacherRewardCatalogPick').forEach(function(card){
      var id = (card.dataset && card.dataset.itemId) || '';
      card.classList.toggle('is-selected', id === selectedItemId);
    });
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
      showModal('Balance Error', '<div style="color:#ffcc66;font-weight:900;">' + (res.error || 'Unknown error') + '</div>');
      return null;
    }
    setBalanceUI(res);
    return res;
  }

  function renderCatalogCards(){
    var grid = el('teacherRewardCatalogGrid');
    if (!grid) return;
    grid.innerHTML = '';
    (catalog || []).forEach(function(it){
      var card = document.createElement('div');
      card.className = 'teacherRewardCatalogPick';
      card.dataset.itemId = it.item_id || '';
      card.innerHTML = '<div class="teacherRewardCatalogName">' + escapeHtml(it.item_name || it.item_id || '') + '</div><div class="teacherRewardCatalogCost">' + (Number(it.cost) || 0) + ' nuggets</div>';
      card.addEventListener('click', function(){
        setSelectedItem(it.item_id || '');
      });
      grid.appendChild(card);
    });
    renderCatalogSelectionState();
    updateSelectedItemHint();
  }

  function setQty(v){
    var n = Math.max(1, Math.floor(Number(v)) || 1);
    var q = el('teacherRewardQty');
    var d = el('teacherRewardQtyDisplay');
    if (q) q.value = String(n);
    if (d) d.textContent = String(n);
  }

  async function issueReward(){
    var characterName = getSelectedStudent();
    var itemId = selectedItemId;
    var qty = Math.max(1, Math.floor(Number(el('teacherRewardQty') && el('teacherRewardQty').value || 1)));
    var note = (el('teacherRewardNote') && el('teacherRewardNote').value || '').trim();

    if (!characterName){
      showModal('Select a character', '<div style="font-size:22px;">Choose a student from the list above first.</div>');
      return;
    }
    if (!itemId){
      showModal('Select an item', '<div style="font-size:22px;">Tap a catalog card to select an item, then tap Issue reward.</div>');
      return;
    }

    var btn = el('teacherRewardIssueBtn');
    if (btn){
      btn.disabled = true;
      btn.textContent = 'Issuing…';
    }

    var res = await callRedeem(characterName, itemId, qty, note);

    if (btn){
      btn.disabled = false;
      btn.textContent = 'Issue reward';
    }

    if (!res.ok){
      showModal('Issue failed', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml(res.error || 'Unknown error') + '</div><div style="margin-top:14px;font-size:22px;opacity:.9;">Not enough nuggets on this student’s wallet? Refresh balance and try a smaller quantity or a lower-cost item.</div>');
      return;
    }

    tryPlayCash();
    showModal('Issued ✅', '<div style="font-weight:900; font-size:22px; margin-bottom:8px;">' + escapeHtml(res.student_name) + ' — ' + res.qty + ' × ' + escapeHtml(res.item.item_name) + '</div><div style="color:#b9c6ea; font-weight:800;">Cost: ' + res.total_cost + ' nuggets<br/>Available: ' + res.available_before + ' → <b style="color:#38d07c;">' + res.available_after + '</b></div>');

    setQty(1);
    if (el('teacherRewardNote')) el('teacherRewardNote').value = '';
    setBalanceUI({ earned: res.earned != null ? res.earned : '—', spent: res.spent != null ? res.spent : '—', available: String(res.available_after) });
    var balRes = await callGetBalance(characterName);
    if (balRes && balRes.ok) setBalanceUI(balRes);
    updateSelectedItemHint();
  }

  async function bootstrapTeacherRewardTool(){
    if (!el('teacherRewardCatalogGrid')) return;
    var res = await callStoreBootstrap();
    if (!res.ok){
      showModal('Rewards data error', '<div style="color:#ffcc66;font-weight:900;">' + (res.error || 'Unknown error') + '</div>');
      return;
    }
    students = (res.students || []).map(function(s){ return (s && s.student_name != null) ? String(s.student_name).trim() : (typeof s === 'string' ? s.trim() : ''); }).filter(Boolean);
    catalog = res.catalog || [];
    closeStudentDropdown();
    renderCatalogCards();
    setSelectedStudent('');
    setBalanceUI({ earned: '—', spent: '—', available: '—' });
    setQty(1);
    if (el('teacherRewardNote')) el('teacherRewardNote').value = '';
    selectedItemId = '';
    updateSelectedItemHint();
  }

  function wireTeacherRewardTool(){
    if (!el('teacherRewardCatalogGrid')) return;

    var refreshBtn = el('teacherRewardRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function(){
      var charName = getSelectedStudent();
      if (!charName){
        showModal('Select a character', '<div style="font-size:22px;">Choose a student to load their balance.</div>');
        return;
      }
      refreshBalance();
    });

    var issueBtn = el('teacherRewardIssueBtn');
    if (issueBtn) issueBtn.addEventListener('click', function(){ issueReward(); });

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

    var qp = el('teacherRewardQtyPlus');
    var qm = el('teacherRewardQtyMinus');
    if (qp) qp.addEventListener('click', function(){ setQty(Number(el('teacherRewardQty').value || 1) + 1); });
    if (qm) qm.addEventListener('click', function(){ setQty(Number(el('teacherRewardQty').value || 1) - 1); });

    bootstrapTeacherRewardTool();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireTeacherRewardTool);
  else wireTeacherRewardTool();
})();
