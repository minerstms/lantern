(function () {
  'use strict';
    (function(){ try { if (window.LANTERN_DATA) { if (window.LANTERN_DATA.ensureCatalog) window.LANTERN_DATA.ensureCatalog(); if (window.LANTERN_DATA.ensureStartupMode) window.LANTERN_DATA.ensureStartupMode(); } } catch(e){} })();
    var createRun = (typeof LANTERN_API !== 'undefined' && LANTERN_API.createRun) ? LANTERN_API.createRun : null;

    const el = (id)=>document.getElementById(id);
    const overlay = el('storePurchaseOverlay');

    let cosmetics = [];
    let students = [];
    var storeBootstrapped = false;
    var lastWalletRefreshAt = 0;
    var lastWalletRefreshPromise = null;
    var WALLET_REFRESH_DEDUPE_MS = 4000;
    var historyRows = [];
    var historyOffset = 0;
    var historyHasMore = false;
    var historyLoading = false;
    var historyError = null;
    var HISTORY_PAGE_SIZE = 25;

    function isStoreTabActive(){
      var panel = el('lockerPanelStore');
      return !!(panel && !panel.hidden);
    }

    function formatHistoryDate(iso){
      if (!iso) return { date: '—', time: '' };
      try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return { date: String(iso), time: '' };
        return {
          date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
        };
      } catch (e) {
        return { date: String(iso), time: '' };
      }
    }

    function formatTransactionLabel(tx){
      var kind = String(tx && tx.kind || '').toLowerCase();
      var source = String(tx && tx.source || '').toUpperCase();
      var note = String(tx && tx.note || '').trim();
      if (source === 'TEACHER_MANUAL_SALE') return note || 'Manual sale';
      if (kind === 'store_redeem' && source === 'TEACHER_MANUAL_SALE') return note || 'Manual sale';
      if (kind === 'cosmetic') return note || 'Store purchase';
      if (kind === 'store_redeem') return note || 'Store purchase';
      if (kind === 'daily_hunt') return 'Daily nugget hunt';
      if (source === 'MISSION' || kind === 'mission') return note || 'Mission reward';
      if (source.indexOf('MTSS') >= 0 || source.indexOf('NUGGET') >= 0) return note || 'Behavior Logger award';
      if (note) return note;
      if (kind) return kind.replace(/_/g, ' ');
      if (source) return source.replace(/_/g, ' ');
      return 'Nugget activity';
    }

    function formatDelta(delta){
      var n = Math.floor(Number(delta) || 0);
      if (n > 0) return '+' + n;
      return String(n);
    }

    function renderNuggetHistoryList(){
      var list = el('storeNuggetHistoryList');
      var loadMoreBtn = el('storeNuggetHistoryLoadMore');
      var retryBtn = el('storeNuggetHistoryRetry');
      if (!list) return;
      if (historyLoading && !historyRows.length) {
        list.innerHTML = '<p class="nuggetHistoryStatus">Loading…</p>';
        if (loadMoreBtn) loadMoreBtn.hidden = true;
        if (retryBtn) retryBtn.hidden = true;
        return;
      }
      if (historyError && !historyRows.length) {
        list.innerHTML = '<p class="nuggetHistoryStatus nuggetHistoryStatus--error">' + escapeHtml(historyError) + '</p>';
        if (loadMoreBtn) loadMoreBtn.hidden = true;
        if (retryBtn) retryBtn.hidden = false;
        return;
      }
      if (!historyRows.length) {
        list.innerHTML = '<p class="nuggetHistoryStatus">No Nugget activity yet.</p>';
        if (loadMoreBtn) loadMoreBtn.hidden = true;
        if (retryBtn) retryBtn.hidden = true;
        return;
      }
      var html = '';
      historyRows.forEach(function(tx){
        var when = formatHistoryDate(tx.created_at || tx.timestamp);
        var label = formatTransactionLabel(tx);
        var delta = formatDelta(tx.delta != null ? tx.delta : tx.nugget_delta);
        var deltaClass = Number(tx.delta != null ? tx.delta : tx.nugget_delta) >= 0 ? 'is-positive' : 'is-negative';
        html += '<div class="nuggetHistoryRow">';
        html += '<div class="nuggetHistoryRowMeta"><span class="nuggetHistoryDate">' + escapeHtml(when.date) + '</span>';
        if (when.time) html += '<span class="nuggetHistoryTime">' + escapeHtml(when.time) + '</span>';
        html += '</div>';
        html += '<div class="nuggetHistoryRowMain"><span class="nuggetHistoryLabel">' + escapeHtml(label) + '</span>';
        html += '<span class="nuggetHistoryDelta ' + deltaClass + '">' + escapeHtml(delta) + '</span></div>';
        html += '</div>';
      });
      list.innerHTML = html;
      if (loadMoreBtn) loadMoreBtn.hidden = !historyHasMore;
      if (retryBtn) retryBtn.hidden = true;
    }

    function callLockerWalletTransactions(offset, limit){
      var base = economyApiBase;
      if (!base) return Promise.resolve({ ok: false, error: 'API not configured' });
      var qs = '?offset=' + encodeURIComponent(String(offset || 0)) + '&limit=' + encodeURIComponent(String(limit || HISTORY_PAGE_SIZE));
      return fetch(base + '/api/locker/me/wallet/transactions' + qs, { credentials: 'include', cache: 'no-store' })
        .then(function(r){ return r.json(); })
        .catch(function(){ return { ok: false, error: 'Network error' }; });
    }

    function loadNuggetHistory(opts){
      opts = opts || {};
      if (!isStoreTabActive()) return Promise.resolve(null);
      if (historyLoading) return Promise.resolve(null);
      if (opts.reset) {
        historyRows = [];
        historyOffset = 0;
        historyHasMore = false;
        historyError = null;
      }
      historyLoading = true;
      renderNuggetHistoryList();
      return callLockerWalletTransactions(historyOffset, HISTORY_PAGE_SIZE).then(function(res){
        historyLoading = false;
        if (!res || !res.ok) {
          historyError = (res && res.error) ? String(res.error) : 'Could not load history';
          renderNuggetHistoryList();
          return null;
        }
        historyError = null;
        var batch = res.transactions || [];
        historyRows = historyRows.concat(batch);
        historyOffset = historyRows.length;
        historyHasMore = !!res.has_more;
        renderNuggetHistoryList();
        return res;
      });
    }

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
      if (window.LanternLockerMe && typeof window.LanternLockerMe.adoptedFromLocker === 'function') {
        var locker = window.LanternLockerMe.getLockerMe();
        var adopted = window.LanternLockerMe.adoptedFromLocker(locker);
        if (adopted && adopted.name) return adopted;
      }
      if (typeof window !== 'undefined' && window.LANTERN_LOCKER_ME && window.LANTERN_LOCKER_ME.ok && window.LanternLockerMe) {
        return window.LanternLockerMe.adoptedFromLocker(window.LANTERN_LOCKER_ME);
      }
      return null;
    }

    function getCharacterForStore(){
      var a = loadAdoptedOrRedirect();
      return a && a.name ? String(a.name).trim() : '';
    }

    function escapeHtml(s){
      return String(s||'').replace(/[&<>"']/g, function(c){ return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;'; });
    }

    function walletHasKnownValues(){
      var a = el('avail');
      return !!(a && a.textContent && a.textContent !== '—');
    }

    function setWalletRefreshing(show){
      var status = el('storeWalletRefreshStatus');
      if (status) status.textContent = show ? 'Refreshing…' : '';
      if (show && !walletHasKnownValues()) {
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
      var hero = el('storeHeroAvail');
      var oldHero = NaN;
      if (hero && hero.textContent && hero.textContent !== '—') {
        oldHero = parseInt(String(hero.textContent).trim(), 10);
      }
      if (!Number.isFinite(oldHero) && a && a.textContent && a.textContent !== '—') {
        oldHero = parseInt(String(a.textContent).trim(), 10);
      }
      if (e) e.textContent = String(b.earned ?? '—');
      if (s) s.textContent = String(b.spent ?? '—');
      if (a) a.textContent = String(b.available ?? '—');
      if (hero) {
        var nv =
          b.available !== undefined && b.available !== null && b.available !== '—'
            ? Number(b.available)
            : NaN;
        if (Number.isFinite(nv) && Number.isFinite(oldHero) && nv > oldHero) {
          hero.classList.remove('nuggetHit');
          void hero.offsetWidth;
          hero.classList.add('nuggetHit');
        }
        hero.textContent = String(b.available ?? '—');
      }
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
      if (window.LanternWallet && typeof window.LanternWallet.fetchMyBalance === 'function' && (characterName == null || String(characterName).trim() === '')) {
        return window.LanternWallet.fetchMyBalance();
      }
      if (window.LanternWallet && typeof window.LanternWallet.fetchBalance === 'function') {
        return window.LanternWallet.fetchBalance(characterName);
      }
      if (economyApiBase != null || typeof fetch === 'function') {
        var prefix = economyApiBase != null ? economyApiBase : '';
        var balanceUrl = (characterName == null || String(characterName).trim() === '')
          ? prefix + '/api/economy/balance'
          : prefix + '/api/economy/balance?character_name=' + encodeURIComponent(characterName);
        return fetch(balanceUrl, { credentials: 'include', cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(res){
          if (window.LanternWallet && typeof window.LanternWallet.normalizeWalletBalance === 'function') {
            return window.LanternWallet.normalizeWalletBalance(res, characterName || '');
          }
          if (res && res.ok) {
            var av = res.available != null ? Number(res.available) : Number(res.balance);
            if (!Number.isFinite(av)) return { ok: false, error: 'invalid_balance_payload' };
            return { ok: true, student_name: res.character_name || characterName, earned: res.earned, spent: res.spent, available: av };
          }
          return { ok: false, error: res && res.error || 'Failed' };
        }).catch(function(){ return { ok: false, error: 'Network error' }; });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ok:false, error: String(err && err.message || err)}); }).storeGetBalance({ student_name: characterName });
      });
    }

    function callEconomyTransact(characterName, delta, kind, source, note, meta){
      if (window.LanternWallet && typeof window.LanternWallet.postEconomyTransact === 'function' && window.LanternWallet.canUseHttpEconomy()) {
        return window.LanternWallet.postEconomyTransact({
          character_name: characterName,
          delta: delta,
          kind: kind || 'misc',
          source: source || '',
          note: note || '',
          meta: meta || {}
        });
      }
      if (economyApiBase == null) return Promise.resolve({ ok: false });
      return fetch(economyApiBase + '/api/economy/transact', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_name: characterName, delta: delta, kind: kind || 'misc', source: source || '', note: note || '', meta: meta || {} })
      }).then(function(r){ return r.json(); }).catch(function(){ return { ok: false }; });
    }

    function ownedIdsFromLockerMe() {
      var locker = (window.LanternLockerMe && window.LanternLockerMe.getLockerMe) ? window.LanternLockerMe.getLockerMe() : null;
      if (!locker || !locker.ok) return [];
      var ownedCat = locker.owned_items || {};
      if (Array.isArray(ownedCat.owned_ids) && ownedCat.owned_ids.length) {
        return ownedCat.owned_ids.slice();
      }
      var items = (window.LanternLockerMe && window.LanternLockerMe.lockerCategoryItems)
        ? window.LanternLockerMe.lockerCategoryItems(locker.owned_items)
        : [];
      var ids = [];
      items.forEach(function(o) {
        if (o && o.item_id) ids.push(String(o.item_id));
      });
      if (!ids.length || !cosmetics.length) return ids;
      return ids.map(function(cid) {
        var exact = cosmetics.find(function(c) { return c.id === cid; });
        if (exact) return exact.id;
        var slug = cid.toLowerCase();
        var bySlug = cosmetics.find(function(c) {
          return String(c.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === slug;
        });
        return bySlug ? bySlug.id : cid;
      });
    }

    function callGetCosmeticOwnership(characterName){
      var locker = (window.LanternLockerMe && window.LanternLockerMe.getLockerMe) ? window.LanternLockerMe.getLockerMe() : null;
      if (locker && locker.ok) {
        var ownedIds = ownedIdsFromLockerMe();
        var eqCat = locker.equipped_items || {};
        var equipped = (eqCat.available !== false && eqCat.equipped && typeof eqCat.equipped === 'object') ? eqCat.equipped : {};
        return Promise.resolve({
          ok: true,
          owned: ownedIds,
          equipped: equipped,
          equip_unavailable: eqCat.available === false,
          equip_reason: eqCat.reason || null,
        });
      }
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
        var idemKey = 'cosmetic-' + cosmeticId + '-' + (global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : String(Date.now()));
        return callEconomyTransact(characterName, 0, 'cosmetic', '', (c.name || cosmeticId) + ' purchase', {
          cosmetic_id: cosmeticId,
          item_name: c.name || cosmeticId,
          idempotency_key: idemKey,
        }).then(function(tRes){
          if (!tRes || !tRes.ok) return { ok: false, error: tRes && (tRes.error === 'insufficient' ? 'Not enough nuggets' : tRes.error) || 'Purchase failed' };
          if (window.LanternLockerMe && typeof window.LanternLockerMe.invalidateLockerMe === 'function') {
            window.LanternLockerMe.invalidateLockerMe();
          }
          if (window.LanternLockerMe && typeof window.LanternLockerMe.fetchLockerMe === 'function') {
            return window.LanternLockerMe.fetchLockerMe().then(function () {
              return { ok: true, cosmetic: c, cost: cost, available_after: tRes.balance_after };
            });
          }
          return { ok: true, cosmetic: c, cost: cost, available_after: tRes.balance_after };
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

    async function refreshStoreWallet(opts){
      opts = opts || {};
      if (!isStoreTabActive() && !opts.allowHidden) return null;
      var now = Date.now();
      if (!opts.force && now - lastWalletRefreshAt < WALLET_REFRESH_DEDUPE_MS && lastWalletRefreshPromise) {
        return lastWalletRefreshPromise;
      }
      lastWalletRefreshAt = now;
      lastWalletRefreshPromise = (async function(){
        var characterName = getCharacterForStore();
        if (!characterName){
          setWalletRefreshing(false);
          setBalanceUI({ earned: '—', spent: '—', available: '—' });
          return null;
        }
        setWalletRefreshing(true);
        var res = (window.LanternWallet && typeof window.LanternWallet.refreshBalance === 'function')
          ? await window.LanternWallet.refreshBalance({ force: !!opts.force })
          : await callGetBalance();
        setWalletRefreshing(false);
        if (res && (res.needs_linking || res.status === 'needs_link')) {
          setBalanceUI({ earned: '—', spent: '—', available: 'Needs Link' });
          return res;
        }
        if (res && (res.no_nugget_account || res.status === 'no_nugget_account')) {
          setBalanceUI({ earned: '—', spent: '—', available: 'N/A' });
          return res;
        }
        if (!res.ok){
          if (!walletHasKnownValues()) {
            setBalanceUI({ earned: '—', spent: '—', available: '—' });
          }
          if (!opts.silent) {
            showModal('Balance Error', '<div style="color:#ffcc66;font-weight:900;">' + (res.error || 'Unknown error') + '</div>');
          }
          return null;
        }
        setBalanceUI(res);
        return res;
      })();
      return lastWalletRefreshPromise;
    }

    function refreshBalance(opts){
      return refreshStoreWallet(opts);
    }

    async function handleStoreActivated(){
      if (!isStoreTabActive()) return;
      var adopted = loadAdoptedOrRedirect();
      if (!adopted) return;
      if (!storeBootstrapped) {
        await fullBootstrap();
      }
      await refreshStoreWallet({ force: true, silent: true });
      await loadNuggetHistory({ reset: true });
      refreshDailyHunt(adopted.name);
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
                  refreshStoreWallet({ force: true, silent: true }).then(function(br){
                    var av = (br && br.ok && br.available != null) ? br.available : (r.available_after != null ? r.available_after : 0);
                    callGetCosmeticOwnership(characterName).then(function(o){
                      renderCosmetics(characterName, av, o);
                      renderFeaturedRail();
                    });
                    loadNuggetHistory({ reset: true });
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
      storeBootstrapped = true;

      renderFuturePlaceholders();

      var charName = getCharacterForStore();
      if (charName) {
        var balRes = await refreshStoreWallet({ force: true, silent: true, allowHidden: true });
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

    if (window.LanternWallet && typeof window.LanternWallet.bindElement === 'function') {
      var heroAmt = el('storeHeroAvail');
      if (heroAmt && !heroAmt.getAttribute('data-lantern-economy-bound')) {
        heroAmt.setAttribute('data-lantern-economy-bound', '1');
        window.LanternWallet.bindElement(heroAmt, { format: 'number' });
      }
      var availAmt = el('avail');
      if (availAmt && !availAmt.getAttribute('data-lantern-economy-bound')) {
        availAmt.setAttribute('data-lantern-economy-bound', '1');
        window.LanternWallet.bindElement(availAmt, { format: 'number' });
      }
    }

    var walletBtn = el('refreshStoreWalletBtn');
    if (walletBtn) walletBtn.addEventListener('click', function(){
      var charName = getCharacterForStore();
      if (!charName){
        showModal('No character', '<div style="font-size:22px;">Adopt a character in Locker → Overview first.</div>');
        return;
      }
      refreshStoreWallet({ force: true }).then(function(balRes){
        if (balRes && charName) {
          callGetCosmeticOwnership(charName).then(function(o){
            renderCosmetics(charName, balRes.available, o);
          });
        }
        loadNuggetHistory({ reset: true });
      });
    });

    var historyLoadMoreBtn = el('storeNuggetHistoryLoadMore');
    if (historyLoadMoreBtn) historyLoadMoreBtn.addEventListener('click', function(){
      loadNuggetHistory({ reset: false });
    });
    var historyRetryBtn = el('storeNuggetHistoryRetry');
    if (historyRetryBtn) historyRetryBtn.addEventListener('click', function(){
      loadNuggetHistory({ reset: true });
    });

    document.addEventListener('lantern-store-tab-activated', function(){
      handleStoreActivated();
    });

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
              refreshStoreWallet({ force: true, silent: true }).then(function(){
                loadNuggetHistory({ reset: true });
              });
            }
          });
        });
      }
    })();

    (function wireStoreWalletVisibilityOnce(){
      if (typeof document === 'undefined') return;
      if (window._lanternStoreWalletVisibilityWired) return;
      window._lanternStoreWalletVisibilityWired = true;
      function runStoreWalletRefreshFromReturnEvents(){
        if (!isStoreTabActive()) return;
        refreshStoreWallet({ silent: true }).then(function(balRes){
          var charName = getCharacterForStore();
          if (balRes && charName) {
            callGetCosmeticOwnership(charName).then(function(o){
              renderCosmetics(charName, balRes.available, o);
            });
          }
          loadNuggetHistory({ reset: true });
        });
      }
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState !== 'visible') return;
        runStoreWalletRefreshFromReturnEvents();
      });
      window.addEventListener('focus', runStoreWalletRefreshFromReturnEvents);
      window.addEventListener('pageshow', function(e){
        if (e.persisted) runStoreWalletRefreshFromReturnEvents();
      });
    })();

    async function init(){
      var adopted = loadAdoptedOrRedirect();
      if (!adopted) return;
      await fullBootstrap();
      if (isStoreTabActive()) {
        await handleStoreActivated();
      }
    }

    window.LanternStoreWallet = {
      refresh: refreshStoreWallet,
      isStoreTabActive: isStoreTabActive,
      handleStoreActivated: handleStoreActivated,
    };

    document.addEventListener('lantern-class-access-resolved', function(e){ if (e.detail && e.detail.tokenValid && typeof init === 'function') init(); });
})();
