(function () {
  'use strict';
    (function(){ try { if (window.LANTERN_DATA) { if (window.LANTERN_DATA.ensureCharacters) window.LANTERN_DATA.ensureCharacters(); if (window.LANTERN_DATA.ensureCatalog) window.LANTERN_DATA.ensureCatalog(); if (window.LANTERN_DATA.ensureStartupMode) window.LANTERN_DATA.ensureStartupMode(); } } catch(e){} })();
    var createRun = (typeof LANTERN_API !== 'undefined' && LANTERN_API.createRun) ? LANTERN_API.createRun : null;
    const LS_ADOPTED = 'LANTERN_ADOPTED_CHARACTER';

    const el = (id)=>document.getElementById(id);
    const overlay = el('storePurchaseOverlay');

    let cosmetics = [];
    let students = [];
    let leaderboard = [];

    function tryPlayCash(){
      if (window.MTSS_SFX && typeof window.MTSS_SFX.playChaChing === 'function') {
        window.MTSS_SFX.playChaChing();
      }
    }

    function showModal(title, html){
      var t = el('storeModalTitle');
      var b = el('storeModalBody');
      if (!t || !b) return;
      t.textContent = title || '';
      b.innerHTML = html || '';
      if (overlay) overlay.style.display = 'flex';
    }
    function hideModal(){ if (overlay) overlay.style.display = 'none'; }

    if (el('storeModalCloseBtn')) el('storeModalCloseBtn').addEventListener('click', hideModal);
    if (overlay) overlay.addEventListener('click', (e)=>{ if (e.target === overlay) hideModal(); });

    function loadAdoptedOrRedirect(){
      try{
        if (typeof localStorage === 'undefined' || !localStorage.getItem) { return null; }
        var raw = localStorage.getItem(LS_ADOPTED);
        if (!raw) { return null; }
        var obj = JSON.parse(raw);
        if (!obj || !obj.name) { return null; }
        if (obj.isTest && obj.expires_at && new Date(obj.expires_at) <= new Date()) {
          try { localStorage.removeItem(LS_ADOPTED); } catch(e) {}
          return null;
        }
        return obj;
      }catch(e){
        return null;
      }
    }

    function getCharacterForStore(){
      var a = loadAdoptedOrRedirect();
      return a && a.name ? String(a.name).trim() : '';
    }

    let lbSortKey = 'earned';
    let lbSortDir = 'desc';

    function getLeaderboardFilteredAndSorted(){
      var term = (el('lbSearch') && el('lbSearch').value) ? String(el('lbSearch').value).trim().toLowerCase() : '';
      var rows = (leaderboard || []).slice();
      if (term) {
        rows = rows.filter(function(r){
          var name = String(r.student_name || r.character_name || '').toLowerCase();
          var avail = String(r.available ?? '').toLowerCase();
          var earned = String(r.earned ?? '').toLowerCase();
          var spent = String(r.spent ?? '').toLowerCase();
          return name.includes(term) || avail.includes(term) || earned.includes(term) || spent.includes(term);
        });
      }
      var key = lbSortKey;
      var dir = lbSortDir === 'asc' ? 1 : -1;
      rows.sort(function(a, b){
        var va, vb;
        if (key === 'student_name' || key === 'character_name') {
          va = String(a.student_name || a.character_name || '').toLowerCase();
          vb = String(b.student_name || b.character_name || '').toLowerCase();
        } else if (key === 'available' || key === 'earned' || key === 'spent') {
          va = Number(a[key] || 0);
          vb = Number(b[key] || 0);
        } else {
          va = Number(a.available || 0);
          vb = Number(b.available || 0);
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        var na = String(a.student_name || a.character_name || '').toLowerCase();
        var nb = String(b.student_name || b.character_name || '').toLowerCase();
        if (na < nb) return -1;
        if (na > nb) return 1;
        return 0;
      });
      return rows;
    }

    function formatTimestamp(ts){
      if (!ts) return '';
      try {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return ts;
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        var dateStr = y + '-' + m + '-' + day;
        var timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return { dateStr: dateStr, timeStr: timeStr };
      } catch (e) {
        return { dateStr: ts, timeStr: '' };
      }
    }

    function showStudentLedgerModal(name){
      callStudentHistory(name).then(function(data){
        if (!data.ok){
          showModal('History Error', '<div style="color:#ffcc66;font-weight:900;">' + (data.error || 'Unknown error') + '</div>');
          return;
        }
        var history = data.history || [];
        if (!history.length){
          showModal(name, '<div style="font-size:22px;">No nugget history yet.</div>');
          return;
        }
        var totals = data.totals || {};
        var html = '<div style="text-align:left;font-size:22px;">';
        html += '<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.25);font-weight:900;">Earned: ' + (totals.earned ?? 0) + ' • Spent: ' + (totals.spent ?? 0) + ' • Available: ' + (totals.available ?? 0) + '</div>';
        history.forEach(function(h){
          var tsParts = formatTimestamp(h.timestamp || '');
          var kind = String(h.kind || '').toUpperCase();
          var source = String(h.source || '').toUpperCase();
          var delta = Number(h.nugget_delta || 0);
          var deltaText = (delta>0?'+':'') + String(delta);
          var kindLabel = (source === 'REDEEM' || kind === 'REDEEM') ? '<span style="color:#ffcc66;font-weight:900;">REDEEM</span>' : (kind === 'POSITIVE' ? '<span style="color:#38d07c;font-weight:900;">POSITIVE</span>' : '<span style="font-weight:900;">'+kind+'</span>');
          html += '<div style="margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:8px;">';
          if (tsParts && tsParts.dateStr) html += '<div><b>' + tsParts.dateStr + '</b> <span style="color:#b9c6ea;font-weight:800;margin-left:6px;">' + (tsParts.timeStr || '') + '</span></div>';
          html += '<div>' + kindLabel + ' • <span style="font-weight:900;">' + deltaText + '</span></div>';
          html += '</div>';
        });
        html += '</div>';
        showModal(name + ' — Nugget History', html);
      });
    }

    function renderLeaderboard(){
      var body = el('lbBody');
      if (!body) return;
      body.innerHTML = "";
      var rows = getLeaderboardFilteredAndSorted();
      var lbCount = el('lbCount');
      if (lbCount) lbCount.textContent = String(rows.length);

      var rail = el('storeLbRailTrack');
      if (rail){
        if (!window.LanternCards || !window.LanternCards.specLeaderboardChipRailCard || !window.LanternCards.createStudentCard){
          if (window.LanternCanonicalFailClosed) window.LanternCanonicalFailClosed('LanternCards.specLeaderboardChipRailCard + createStudentCard required for store leaderboard rail');
          rail.innerHTML = '';
        } else {
          rail.innerHTML = '';
          rows.slice(0, 12).forEach(function(r, idx){
            var name = r.student_name || r.character_name || '';
            var chipEl = window.LanternCards.createStudentCard(window.LanternCards.specLeaderboardChipRailCard(idx + 1, name, 'Avail ' + String(r.available ?? '—'), idx));
            if (chipEl) rail.appendChild(chipEl);
          });
          rail.querySelectorAll('[data-lb-row]').forEach(function(chip){
            function openRow(){
              var i = parseInt(chip.getAttribute('data-lb-row'), 10);
              var r = rows[i];
              if (!r) return;
              var nm = r.student_name || r.character_name || '';
              showStudentLedgerModal(nm);
            }
            chip.addEventListener('click', openRow);
            chip.addEventListener('keydown', function(e){
              if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openRow(); }
            });
          });
        }
      }

      rows.forEach(function(r, idx){
        var tr = document.createElement('tr');
        var name = r.student_name || r.character_name || '';
        tr.innerHTML = '<td>' + (idx + 1) + '</td><td>' + escapeHtml(name) + '</td><td class="num">' + (r.available ?? '') + '</td><td class="num">' + (r.earned ?? '') + '</td><td class="num">' + (r.spent ?? '') + '</td>';
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function(){ showStudentLedgerModal(name); });
        body.appendChild(tr);
      });
    }

    function escapeHtml(s){
      return String(s||'').replace(/[&<>"']/g, function(c){ return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;'; });
    }

    function setBalanceLoading(show){
      if (show){
        var e = el('earned');
        var s = el('spent');
        var a = el('avail');
        if (e) e.innerHTML = '<span class="balanceSpinner"></span>';
        if (s) s.innerHTML = '<span class="balanceSpinner"></span>';
        if (a) a.innerHTML = '<span class="balanceSpinner"></span>';
      }
    }
    function setBalanceUI(b){
      var e = el('earned');
      var s = el('spent');
      var a = el('avail');
      if (e) e.textContent = String(b.earned ?? '—');
      if (s) s.textContent = String(b.spent ?? '—');
      if (a) a.textContent = String(b.available ?? '—');
      var hero = el('storeHeroAvail');
      if (hero) hero.textContent = String(b.available ?? '—');
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

    function callStudentHistory(characterName){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).storeStudentHistory({ student_name: characterName });
      });
    }

    function callGetCosmeticOwnership(characterName){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, owned: [], equipped: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(){ resolve({ ok: false, owned: [], equipped: {} }); }).getCosmeticOwnership({ character_name: characterName });
      });
    }

    function callPurchaseCosmetic(characterName, cosmeticId){
      if (economyApiBase && cosmetics && cosmetics.length) {
        var c = cosmetics.find(function(x){ return x.id === cosmeticId; });
        if (!c || c.purchasable === false) return Promise.resolve({ ok: false, error: 'Cosmetic not found or unlock only' });
        var cost = Number(c.cost) || 0;
        return callEconomyTransact(characterName, -cost, 'cosmetic', '', (c.name || cosmeticId) + ' purchase', {}).then(function(tRes){
          if (!tRes || !tRes.ok) return { ok: false, error: tRes && (tRes.error === 'insufficient' ? 'Not enough nuggets' : tRes.error) || 'Purchase failed' };
          var run = createRun ? createRun() : null;
          if (!run) return { ok: true, cosmetic: c, cost: cost, available_after: tRes.balance_after };
          return new Promise(function(resolve, reject){
            run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(err){ reject(err); }).purchaseCosmetic({ character_name: characterName, cosmetic_id: cosmeticId, economy_backend_charged: true, available_after: tRes.balance_after });
          });
        });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).purchaseCosmetic({ character_name: characterName, cosmetic_id: cosmeticId });
      });
    }

    function callGetDailyHuntStatus(name, page, spotCount){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, status: {} });
      var payload = { character_name: name || '', page: page || 'store' };
      if (spotCount !== undefined && spotCount !== null) payload.spot_count = spotCount;
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, status: {} }); }).getDailyHuntStatus(payload);
      });
    }

    function callClaimDailyNuggetHunt(name){
      var run = createRun ? createRun() : null;
      if (economyApiBase && run) {
        return new Promise(function(resolve, reject){
          run.withSuccessHandler(function(r){
            if (!r || !r.ok) { resolve(r); return; }
            var nuggets = r.nuggets || 1;
            callEconomyTransact(name, nuggets, 'daily_hunt', 'MISSION', 'Daily Hidden Nugget').then(function(tRes){
              if (tRes && tRes.ok) resolve(r); else resolve({ ok: false, error: tRes && tRes.error || 'Failed to credit nuggets' });
            });
          }).withFailureHandler(function(){ resolve({ ok: false }); }).claimDailyNuggetHunt({ character_name: name, economy_backend_charged: true });
        });
      }
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).claimDailyNuggetHunt({ character_name: name });
      });
    }

    function refreshDailyHunt(characterName){
      var hintEl = el('dailyHuntHintEl');
      var nuggetEl = el('storeDailyHuntNuggetEl');
      if (!hintEl && !nuggetEl) return;
      var spotSel = '.wrap .storeWalletCard, .wrap .card';
      var spots = document.querySelectorAll(spotSel);
      var spotCount = spots.length;
      callGetDailyHuntStatus(characterName || '', 'store', spotCount).then(function(res){
        var s = (res && res.status) || {};
        if (hintEl){
          hintEl.style.display = 'block';
          if (s.claimed){
            hintEl.textContent = 'Daily Hidden Nugget: Found! +' + (s.nuggets || 0) + ' nugget' + ((s.nuggets || 0) !== 1 ? 's' : '') + ' today';
            hintEl.classList.add('found');
          } else {
            hintEl.textContent = "Today's hidden nugget hint: " + (s.hint_text || '');
            hintEl.classList.remove('found');
          }
        }
        if (nuggetEl && characterName){
          if (s.onThisPage && spotCount > 0 && s.spotIndex !== undefined){
            var idx = Math.min(s.spotIndex, spotCount - 1);
            var container = spots[idx];
            if (container){
              if (nuggetEl.parentNode) nuggetEl.parentNode.removeChild(nuggetEl);
              container.style.position = 'relative';
              container.appendChild(nuggetEl);
              nuggetEl.style.display = 'flex';
              nuggetEl.style.position = 'absolute';
              nuggetEl.style.left = '';
              nuggetEl.style.top = '';
              nuggetEl.style.bottom = '10px';
              nuggetEl.style.right = '10px';
              nuggetEl.style.transform = '';
              var img = nuggetEl.querySelector('img');
              if (img){
                img.src = (s.rarity === 'ultra_rare') ? 'assets/icons/diamond.png' : 'assets/icons/nugget.png';
                img.alt = (s.rarity === 'ultra_rare') ? 'Rare diamond' : 'Hidden nugget';
              }
            } else { nuggetEl.style.display = 'none'; }
          } else { nuggetEl.style.display = 'none'; }
        } else if (nuggetEl){ nuggetEl.style.display = 'none'; }
      });
    }

    async function refreshBalance(){
      var characterName = getCharacterForStore();
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

    var CATEGORY_LABELS = {
      background: 'Backgrounds', frame: 'Frames', effect: 'Effects', decoration: 'Effects',
      accent: 'Titles', badge: 'Avatars', accessory: 'Avatars'
    };
    var RARITY_LABELS = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
    var RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    var COSMETIC_CATEGORY_ORDER = ['background', 'frame', 'effect', 'decoration', 'accent', 'badge', 'accessory'];

    function normalizeRarityKey(r){
      var x = String(r || 'common').toLowerCase();
      if (['common','uncommon','rare','epic','legendary'].indexOf(x) < 0) x = 'common';
      return x;
    }
    function storeBuyButtonLabel(c, characterName, ownedFlag, equippedFlag, isUnlockOnly, canBuy){
      if (equippedFlag) return 'Equipped';
      if (ownedFlag) return 'Owned';
      if (isUnlockOnly) return 'Unlock only';
      if (!characterName) return 'Adopt first';
      if (!canBuy) return 'Need nuggets';
      return 'Buy';
    }
    function storeBuyButtonDisabled(equippedFlag, ownedFlag, isUnlockOnly, characterName, canBuy){
      return equippedFlag || ownedFlag || isUnlockOnly || !characterName || !canBuy;
    }
    function nuggetIconHtml(){
      return '<img src="assets/icons/nugget.png" class="exploreCardCosmeticNugget" alt="" width="30" height="30">';
    }
    function cosmeticPriceBandHtml(c, characterName, ownedFlag, equippedFlag, isUnlockOnly, canBuy){
      if (isUnlockOnly) return '<span class="exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--locked">Mission unlock</span>';
      if (equippedFlag) return '<span class="exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--equipped">Active now</span>';
      if (ownedFlag) return '<span class="exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--owned">In your locker</span>';
      var cost = Number(c.cost) || 0;
      return nuggetIconHtml() + '<span>' + escapeHtml(String(cost)) + ' nuggets</span>';
    }
    function renderCosmetics(characterName, balance, ownership){
      var container = el('cosmeticsSectionsEl');
      if (!container) return;
      if (!window.LanternCards || !window.LanternCards.specCosmeticRailCard || !window.LanternCards.createStudentCard){
        if (window.LanternCanonicalFailClosed) window.LanternCanonicalFailClosed('LanternCards.specCosmeticRailCard + createStudentCard required for store cosmetics');
        return;
      }
      var LC = window.LanternCards;
      if (!cosmetics || cosmetics.length === 0){
        container.innerHTML = '<p class="note">No cosmetics in catalog yet.</p>';
        return;
      }
      var owned = (ownership && ownership.owned) || [];
      var equipped = (ownership && ownership.equipped) || {};
      var avail = Number(balance) || 0;
      var byCategory = {};
      cosmetics.forEach(function(c){
        var cat = c.category || 'other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(c);
      });
      container.innerHTML = '';
      var seenAvatars = false;
      COSMETIC_CATEGORY_ORDER.forEach(function(catKey){
        if (catKey === 'decoration') return;
        var items = byCategory[catKey];
        if (catKey === 'effect') items = (byCategory.effect || []).concat(byCategory.decoration || []);
        if (!items || items.length === 0) return;
        if (catKey === 'badge' || catKey === 'accessory'){
          if (seenAvatars) return;
          seenAvatars = true;
          items = (byCategory.badge || []).concat(byCategory.accessory || []);
        }
        var label = CATEGORY_LABELS[catKey] || catKey;
        items = items.slice().sort(function(a, b){
          var oa = RARITY_ORDER[a.rarity] != null ? RARITY_ORDER[a.rarity] : 5;
          var ob = RARITY_ORDER[b.rarity] != null ? RARITY_ORDER[b.rarity] : 5;
          return oa - ob;
        });
        var section = document.createElement('div');
        section.className = 'lockerSection';
        var hd = document.createElement('div');
        hd.className = 'lockerSectionHd';
        hd.textContent = label;
        section.appendChild(hd);
        var sub = document.createElement('p');
        sub.className = 'lockerSectionSub';
        sub.textContent = 'Equip purchases in Locker → Items.';
        section.appendChild(sub);
        /* L-Rail-3b: LanternScroller.mountStudentScroller — sole dynamic student-facing scroller path. */
        if (!window.LanternScroller || typeof window.LanternScroller.mountStudentScroller !== 'function') {
          if (window.LanternCanonicalFailClosed) window.LanternCanonicalFailClosed('LanternScroller.mountStudentScroller required for Store cosmetics rails');
          return;
        }
        var scroller = document.createElement('div');
        window.LanternScroller.mountStudentScroller(scroller, { ariaLabel: '' });
        items.forEach(function(c){
          var ownedFlag = owned.indexOf(c.id) >= 0;
          var equippedFlag = equipped[c.category] === c.id;
          var isUnlockOnly = c.purchasable === false;
          var canBuy = !!characterName && !isUnlockOnly && !ownedFlag && avail >= (Number(c.cost) || 0);
          var rar = normalizeRarityKey(c.rarity);
          var buyLabel = storeBuyButtonLabel(c, characterName, ownedFlag, equippedFlag, isUnlockOnly, canBuy);
          var card = LC.createStudentCard(LC.specCosmeticRailCard({
            title: c.name || c.id,
            icon: c.icon || '✨',
            rarityKey: rar,
            rarityLabel: RARITY_LABELS[c.rarity || 'common'] || 'Common',
            subline: (!ownedFlag && canBuy && !isUnlockOnly && characterName) ? ('Tap card · ' + buyLabel) : '',
            priceBandHtml: cosmeticPriceBandHtml(c, characterName, ownedFlag, equippedFlag, isUnlockOnly, canBuy),
            stateEquipped: equippedFlag,
            stateOwned: ownedFlag,
            stateLocked: isUnlockOnly,
            stateNeed: !!(characterName && !canBuy && !ownedFlag && !isUnlockOnly),
            reportId: c.id,
            dataAttrs: { 'cosmetic-id': String(c.id) }
          }));
          if (card) scroller.appendChild(card);
          if (card && characterName && !ownedFlag && canBuy && !isUnlockOnly){
            card.classList.add('exploreCard--activatable');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.addEventListener('click', function(ev){
              if (ev.target.closest('.exploreCardReportBtn')) return;
              if (card.getAttribute('data-lc-store-buying') === '1') return;
              card.setAttribute('data-lc-store-buying', '1');
              var id = c.id;
              callPurchaseCosmetic(characterName, id).then(function(r){
                card.removeAttribute('data-lc-store-buying');
                if (r && r.ok){
                  tryPlayCash();
                  showModal('Purchased!', '<div style="font-weight:900;font-size:28px;">' + escapeHtml(c.name || c.id) + ' purchased.</div><div style="color:#b9c6ea;margin-top:8px;">Equip in Locker → Items or Edit Profile.</div>');
                  refreshBalance().then(function(br){
                    var av = (br && br.ok && br.available != null) ? br.available : (r.available_after != null ? r.available_after : 0);
                    callGetCosmeticOwnership(characterName).then(function(o){
                      renderCosmetics(characterName, av, o);
                      renderFeaturedRail();
                    });
                  });
                } else {
                  showModal('Purchase failed', '<div style="color:#ffcc66;font-weight:900;">' + escapeHtml(r.error || 'Unknown error') + '</div>');
                }
              });
            });
          }
        });
        section.appendChild(scroller);
        container.appendChild(section);
      });
    }

    function renderFeaturedRail(){
      var track = el('storeFeaturedTrack');
      if (!track) return;
      if (!window.LanternCards || !window.LanternCards.specCosmeticRailCard || !window.LanternCards.createStudentCard) return;
      var LC = window.LanternCards;
      var out = [];
      (cosmetics || []).forEach(function(c){
        if (['rare','epic','legendary'].indexOf(String(c.rarity || '').toLowerCase()) >= 0) out.push(c);
      });
      out = out.slice(0, 12);
      track.innerHTML = '';
      if (!out.length){
        var ph = LC.createStudentCard(LC.specCosmeticRailCard({
          title: 'Spotlight',
          icon: '✨',
          rarityKey: 'common',
          rarityLabel: 'Lantern catalog',
          priceBandHtml: '<span class="exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--muted">Items load with your store</span>',
          placeholder: true,
          featured: true,
          role: 'presentation'
        }));
        if (ph) track.appendChild(ph);
        return;
      }
      out.forEach(function(c){
        var rar = normalizeRarityKey(c.rarity);
        var cost = Number(c.cost) || 0;
        var featCard = LC.createStudentCard(LC.specCosmeticRailCard({
          title: c.name || c.id,
          icon: c.icon || '✨',
          rarityKey: rar,
          rarityLabel: RARITY_LABELS[c.rarity || 'common'] || 'Rare',
          spotlight: true,
          priceBandHtml: nuggetIconHtml() + '<span>' + escapeHtml(String(cost)) + ' nuggets</span>',
          featured: true,
          reportId: c.id,
          role: 'presentation'
        }));
        if (featCard) track.appendChild(featCard);
      });
    }

    function renderFuturePlaceholders(){
      var tr = el('storeFutureTrack');
      if (!tr) return;
      if (!window.LanternCards || !window.LanternCards.specCosmeticRailCard || !window.LanternCards.createStudentCard) return;
      var LC = window.LanternCards;
      var items = [
        { icon: '📦', name: 'Card packs', stateLabel: 'Preview', locked: false },
        { icon: '🎵', name: 'Sound packs', stateLabel: 'Locked', locked: true },
        { icon: '🎮', name: 'Game unlocks', stateLabel: 'Locked', locked: true },
        { icon: '🎁', name: 'Seasonal bundle', stateLabel: 'Locked', locked: true }
      ];
      tr.innerHTML = '';
      items.forEach(function(x){
        var lblCls = x.locked ? 'exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--locked' : 'exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--preview';
        var footCls = 'exploreCardCosmeticBtn btn good' + (x.locked ? ' exploreCardCosmeticBtn--locked' : ' exploreCardCosmeticBtn--preview');
        var futCard = LC.createStudentCard(LC.specCosmeticRailCard({
          title: x.name,
          icon: x.icon,
          rarityKey: 'epic',
          subline: 'Coming soon · ' + (x.locked ? 'Locked' : 'Preview'),
          priceBandHtml: '<span class="' + lblCls + '">' + escapeHtml(x.stateLabel) + '</span>',
          future: true,
          stateLocked: x.locked,
          role: 'presentation'
        }));
        if (futCard) tr.appendChild(futCard);
      });
    }

    async function fullBootstrap(){
      var res = await callStoreBootstrap();
      if (!res.ok){
        showModal('Store Error', '<div style="color:#ffcc66;font-weight:900;">' + (res.error || 'Unknown error') + '</div>');
        return;
      }

      students = (res.students || []).map(function(s){ return (s && s.student_name != null) ? String(s.student_name).trim() : (typeof s === 'string' ? s.trim() : ''); }).filter(Boolean);
      cosmetics = res.cosmetics || [];
      leaderboard = (res.store_leaderboard || []);

      renderFuturePlaceholders();

      renderLeaderboard();

      var charName = getCharacterForStore();
      if (charName) {
        var balRes = await refreshBalance();
        if (balRes && balRes.ok) {
          var ownRes = await callGetCosmeticOwnership(charName);
          renderCosmetics(charName, balRes.available, ownRes);
        }
      } else {
        setBalanceUI({earned:'—', spent:'—', available:'—'});
        renderCosmetics('', 0, { owned: [], equipped: {} });
      }
      renderFeaturedRail();
    }

    var walletBtn = el('refreshStoreWalletBtn');
    if (walletBtn) walletBtn.addEventListener('click', function(){
      var charName = getCharacterForStore();
      if (!charName){
        showModal('No character', '<div style="font-size:22px;">Adopt a character in Locker → Overview first.</div>');
        return;
      }
      refreshBalance().then(function(balRes){
        if (balRes && charName) {
          callGetCosmeticOwnership(charName).then(function(o){
            renderCosmetics(charName, balRes.available, o);
          });
        }
      });
    });

    (function initLeaderboardControls(){
      var search = el('lbSearch');
      if (search) search.addEventListener('input', renderLeaderboard);
      function toggleSort(newKey){
        if (lbSortKey === newKey) {
          lbSortDir = (lbSortDir === 'asc' ? 'desc' : 'asc');
        } else {
          lbSortKey = newKey;
          lbSortDir = (newKey === 'student_name' || newKey === 'character_name' ? 'asc' : 'desc');
        }
        renderLeaderboard();
      }
      var colStudent = el('lbColStudent');
      var colAvail = el('lbColAvail');
      var colEarned = el('lbColEarned');
      var colSpent = el('lbColSpent');
      var colRank = el('lbColRank');
      if (colStudent) colStudent.addEventListener('click', function(){ toggleSort('student_name'); });
      if (colAvail) colAvail.addEventListener('click', function(){ toggleSort('available'); });
      if (colEarned) colEarned.addEventListener('click', function(){ toggleSort('earned'); });
      if (colSpent) colSpent.addEventListener('click', function(){ toggleSort('spent'); });
      if (colRank) colRank.addEventListener('click', function(){ toggleSort('available'); });
    })();

    (function(){
      var nuggetEl = el('storeDailyHuntNuggetEl');
      if (nuggetEl){
        nuggetEl.addEventListener('click', function(){
          var adopted = loadAdoptedOrRedirect();
          if (!adopted) return;
          callClaimDailyNuggetHunt(adopted.name).then(function(res){
            if (res && res.ok){
              tryPlayCash();
              var label = (res.rarity_label && res.rarity_label !== 'Common') ? ' ' + res.rarity_label + '!' : '';
              showModal('Hidden nugget found!', '<div style="font-size:28px;font-weight:900;color:#38d07c;">+' + (res.nuggets || 1) + ' nugget' + ((res.nuggets || 1) !== 1 ? 's' : '') + label + '</div>');
              nuggetEl.style.display = 'none';
              refreshDailyHunt(adopted.name);
              refreshBalance();
            }
          });
        });
      }
    })();

    async function init(){
      var adopted = loadAdoptedOrRedirect();
      if (!adopted) return;
      await fullBootstrap();
      refreshBalance();
      refreshDailyHunt(adopted.name);
    }
    document.addEventListener('lantern-class-access-resolved', function(e){ if (e.detail && e.detail.tokenValid && typeof init === 'function') init(); });
})();
