    /* ===== Bootstrap: catalog only (no fake character seeding on Locker) ===== */
    (function(){
      try {
        if (window.LANTERN_DATA && window.LANTERN_DATA.ensureCatalog) window.LANTERN_DATA.ensureCatalog();
        if (window.LANTERN_DATA && window.LANTERN_DATA.ensureStartupMode) window.LANTERN_DATA.ensureStartupMode();
      } catch (e) {}
    })();

    /* ===== PRESERVED: Core logic — identity from GET /api/locker/me only ===== */
    var createRun = (typeof LANTERN_API !== 'undefined' && LANTERN_API.createRun) ? LANTERN_API.createRun : null;

    var lockerBootPending = true;
    var runProfileEntry = function(){};

    window.LANTERN_LOCKER_BOOT = function(locker){
      lockerBootPending = false;
      runProfileEntry();
    };

    function getLockerMe(){
      if (window.LanternLockerMe && typeof window.LanternLockerMe.getLockerMe === 'function') {
        return window.LanternLockerMe.getLockerMe();
      }
      return (typeof window !== 'undefined' && window.LANTERN_LOCKER_ME && window.LANTERN_LOCKER_ME.ok) ? window.LANTERN_LOCKER_ME : null;
    }

    function lockerCategoryItems(cat) {
      if (window.LanternLockerMe && typeof window.LanternLockerMe.lockerCategoryItems === 'function') {
        return window.LanternLockerMe.lockerCategoryItems(cat);
      }
      if (!cat) return [];
      if (Array.isArray(cat)) return cat;
      return Array.isArray(cat.items) ? cat.items : [];
    }

    function lockerCategoryAvailable(cat) {
      if (window.LanternLockerMe && typeof window.LanternLockerMe.lockerCategoryAvailable === 'function') {
        return window.LanternLockerMe.lockerCategoryAvailable(cat);
      }
      if (!cat) return false;
      if (Array.isArray(cat)) return true;
      return cat.available !== false;
    }

    function slugFromOwnedItemName(name) {
      return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function ownedCosmeticIdsFromLocker(locker) {
      var ownedCat = locker && locker.owned_items ? locker.owned_items : {};
      if (Array.isArray(ownedCat.owned_ids) && ownedCat.owned_ids.length) {
        return ownedCat.owned_ids.slice();
      }
      var catalog = (window.LANTERN_DATA && window.LANTERN_DATA.getCosmetics) ? window.LANTERN_DATA.getCosmetics() : [];
      var items = lockerCategoryItems(ownedCat);
      var ids = [];
      items.forEach(function(o) {
        var cid = o.item_id ? String(o.item_id).trim() : '';
        if (!cid) return;
        if (catalog.length) {
          var exact = catalog.find(function(c) { return c.id === cid; });
          if (exact) { ids.push(exact.id); return; }
          var bySlug = catalog.find(function(c) {
            return slugFromOwnedItemName(c.name) === cid || slugFromOwnedItemName(c.id) === cid;
          });
          if (bySlug) { ids.push(bySlug.id); return; }
        }
        ids.push(cid);
      });
      return ids;
    }

    const el = (id)=>document.getElementById(id);
    const toastEl = el('toast');

    function studentKeyForPostLive(){
      var a = getAdopted();
      if (!a) return '';
      return String(a.character_id || a.name || '').trim();
    }

    /** Delegates to shared js/lantern-post-live-notify.js (same localStorage as Explore). */
    function maybeToastPostLiveAfterBundle(list){
      if (window.LanternPostLiveNotify && typeof window.LanternPostLiveNotify.notifyFromBundle === 'function') {
        window.LanternPostLiveNotify.notifyFromBundle(list, toastEl, studentKeyForPostLive());
      }
    }

    function toast(msg){
      if (!toastEl) return;
      toastEl.classList.remove('toast--postLive');
      toastEl.innerHTML = '';
      clearTimeout(toastEl._lanternPostLiveT);
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      clearTimeout(toastEl._t);
      toastEl._t = setTimeout(function(){ toastEl.style.display='none'; }, 2400);
    }

    function getAdopted(){
      var locker = getLockerMe();
      if (window.LanternLockerMe && typeof window.LanternLockerMe.adoptedFromLocker === 'function') {
        return window.LanternLockerMe.adoptedFromLocker(locker);
      }
      if (!locker) return null;
      var acct = locker.account || {};
      var id = locker.identity || {};
      var role = String(acct.role || '').trim().toLowerCase();
      var displayName = (acct.display_name && String(acct.display_name).trim()) || acct.username || '';
      if (role === 'teacher' || role === 'admin') {
        return { character_id: acct.username, name: acct.username, display_name: displayName, username: acct.username, role: role, teacher_id: id.teacher_id || null, avatar: '🌟' };
      }
      var walletKey = String(id.economy_key || id.economy_character_name || id.student_character_name || acct.username || '').trim();
      if (!walletKey) return null;
      return { character_id: walletKey, name: walletKey, display_name: displayName, student_character_name: id.student_character_name || '', username: acct.username || '', role: role, avatar: '🌟' };
    }

    function getStudentDisplayName(){
      var locker = getLockerMe();
      if (window.LanternLockerMe && typeof window.LanternLockerMe.displayNameFromLocker === 'function') {
        var dn = window.LanternLockerMe.displayNameFromLocker(locker);
        if (dn) return dn;
      }
      var a = getAdopted();
      if (a && a.display_name && String(a.display_name).trim()) return String(a.display_name).trim();
      if (a && a.student_character_name && String(a.student_character_name).trim()) return String(a.student_character_name).trim();
      if (a && a.username && String(a.username).trim()) return String(a.username).trim();
      return (a && a.name) ? String(a.name) : '';
    }
    var profileStats = { creations: null, achievements: null, recognitions: null };
    function setProfileHeroStats(updates){
      if (updates.creations !== undefined) profileStats.creations = updates.creations;
      if (updates.achievements !== undefined) profileStats.achievements = updates.achievements;
      if (updates.recognitions !== undefined) profileStats.recognitions = updates.recognitions;
      var cEl = el('profileStatCreationsEl');
      var aEl = el('profileStatAchievementsEl');
      var rEl = el('profileStatRecognitionsEl');
      if (cEl) cEl.textContent = profileStats.creations !== null ? String(profileStats.creations) : '—';
      if (aEl) aEl.textContent = profileStats.achievements !== null ? String(profileStats.achievements) : '—';
      if (rEl) rEl.textContent = profileStats.recognitions !== null ? String(profileStats.recognitions) : '—';
    }

    /* Lightweight nugget progress: client-only milestones (50 nugget steps). No backend. */
    function updateNuggetProgress(current){
      var n = Number(current) || 0;
      var step = 50;
      var nextMilestone = n < step ? step : (Math.floor(n / step) + 1) * step;
      var prevMilestone = nextMilestone - step;
      var pct = prevMilestone <= n ? Math.min(100, ((n - prevMilestone) / step) * 100) : 0;
      var labelEl = el('nuggetProgressLabelEl');
      var fillEl = el('nuggetProgressFillEl');
      var barEl = el('nuggetProgressBarEl');
      if (labelEl) labelEl.textContent = 'Progress to ' + nextMilestone;
      if (fillEl) fillEl.style.width = pct + '%';
      if (barEl) { barEl.setAttribute('aria-valuenow', Math.round(pct)); }
    }

    var FALLBACK_CHARACTERS = [];
    function getCharacters(){
      return [];
    }

    function addNuggets(name, amount){
      if (!window.LANTERN_DATA || !window.LANTERN_DATA.getFromLS || !window.LANTERN_DATA.setToLS) return;
      var LS = window.LANTERN_DATA.LS_KEYS || {};
      var activity = window.LANTERN_DATA.getFromLS(LS.ACTIVITY, []) || [];
      activity.push({
        timestamp: new Date().toISOString(),
        character_name: name,
        nugget_delta: amount,
        kind: 'POSITIVE',
        source: 'TESTING',
        note_text: 'Testing control',
      });
      window.LANTERN_DATA.setToLS(LS.ACTIVITY, activity);
    }

    function clearPurchasesForCharacter(name){
      if (!window.LANTERN_DATA || !window.LANTERN_DATA.getFromLS || !window.LANTERN_DATA.setToLS) return;
      var LS = window.LANTERN_DATA.LS_KEYS || {};
      var purchases = window.LANTERN_DATA.getFromLS(LS.PURCHASES, []) || [];
      purchases = purchases.filter(function(p){ return p.character_name !== name; });
      window.LANTERN_DATA.setToLS(LS.PURCHASES, purchases);
    }

    function clearActivityForCharacter(name){
      if (!window.LANTERN_DATA || !window.LANTERN_DATA.getFromLS || !window.LANTERN_DATA.setToLS) return;
      var LS = window.LANTERN_DATA.LS_KEYS || {};
      var activity = window.LANTERN_DATA.getFromLS(LS.ACTIVITY, []) || [];
      activity = activity.filter(function(a){ return a.character_name !== name; });
      window.LANTERN_DATA.setToLS(LS.ACTIVITY, activity);
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
    function callGetBalance(name){
      if (window.LanternWallet && typeof window.LanternWallet.fetchMyBalance === 'function' && (name == null || String(name).trim() === '')) {
        return window.LanternWallet.fetchMyBalance();
      }
      if (window.LanternWallet && typeof window.LanternWallet.fetchBalance === 'function') {
        return window.LanternWallet.fetchBalance(name);
      }
      if (economyApiBase != null || typeof fetch === 'function') {
        var prefix = economyApiBase != null ? economyApiBase : '';
        var balanceUrl = (name == null || String(name).trim() === '')
          ? prefix + '/api/economy/balance'
          : prefix + '/api/economy/balance?character_name=' + encodeURIComponent(name);
        return fetch(balanceUrl, { credentials: 'include', cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(res){
          if (window.LanternWallet && typeof window.LanternWallet.normalizeWalletBalance === 'function') {
            return window.LanternWallet.normalizeWalletBalance(res, name || '');
          }
          if (res && res.ok) {
            var av = res.available != null ? Number(res.available) : Number(res.balance);
            if (!Number.isFinite(av)) return { ok: false, error: 'invalid_balance_payload', available: null };
            return { ok: true, available: av, earned: res.earned, spent: res.spent, student_name: res.character_name || name };
          }
          return { ok: false, error: (res && res.error) || 'Failed', available: null };
        }).catch(function(){ return { ok: false, error: 'Network error', available: null }; });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, available: null });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, available: null }); }).storeGetBalance({ student_name: name });
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
      if (economyApiBase == null) return Promise.resolve({ ok: false, error: 'Economy API not configured' });
      var prefix = economyApiBase != null ? economyApiBase : '';
      return fetch(prefix + '/api/economy/transact', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_name: characterName, delta: delta, kind: kind || 'misc', source: source || '', note: note || '', meta: meta || {} })
      }).then(function(r){ return r.json(); }).catch(function(){ return { ok: false, error: 'Network error' }; });
    }

    function callStudentHistory(name){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, history: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, history: [] }); }).storeStudentHistory({ student_name: name });
      });
    }

    function callGetPosts(name){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, posts: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, posts: [] }); }).getPosts({ character_name: name });
      });
    }

    function callGetProfile(name){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, profile: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, profile: {} }); }).getProfile({ character_name: name });
      });
    }

    function callSaveProfile(name, updates){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).saveProfile({ character_name: name, updates: updates });
      });
    }

    function callSubmitAvatarUpload(name, imageData, cost){
      // Prompt #234 — student self-upload is closed. Do not charge Nuggets.
      return Promise.resolve({ ok: false, error: 'student_avatar_upload_disabled' });
    }

    function callGetAvatarStatus(name){
      var base = (typeof window !== 'undefined' && typeof window.LANTERN_AVATAR_API !== 'undefined' && window.LANTERN_AVATAR_API !== null) ? String(window.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
      if (base != null) {
        return fetch(base + '/api/avatar/status?character_name=' + encodeURIComponent(name))
          .then(function(r){ return r.json(); })
          .then(function(s){ return (s && s.ok && s.status) ? { ok: true, status: s.status } : { ok: false, status: {} }; })
          .catch(function(){ return { ok: false, status: {} }; });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, status: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, status: {} }); }).getAvatarStatus({ character_name: name });
      });
    }

    function callGetMissions(name){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, missions: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, missions: {} }); }).getMissions({ character_name: name });
      });
    }

    function callGetActiveTeacherMissions(){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, missions: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, missions: [] }); }).getActiveTeacherMissions();
      });
    }
    function callGetActiveTeacherMissionsForCharacter(characterName){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, missions: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, missions: [] }); }).getActiveTeacherMissionsForCharacter({ character_name: characterName });
      });
    }

    function callGetMissionSubmissionsForCharacter(name){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, submissions: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, submissions: [] }); }).getMissionSubmissionsForCharacter({ character_name: name });
      });
    }

    function callSubmitMissionCompletion(missionId, characterName, submissionType, submissionContent){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(err){ resolve({ ok: false, error: String(err && err.message || err) }); }).submitMissionCompletion({ mission_id: missionId, character_name: characterName, submission_type: submissionType, submission_content: submissionContent });
      });
    }

    function callResubmitMissionSubmission(id, submissionContent){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(err){ resolve({ ok: false, error: String(err && err.message || err) }); }).resubmitMissionSubmission({ id: id, submission_content: submissionContent });
      });
    }

    function callGetAchievements(name){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, achievements: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, achievements: [] }); }).getAchievements({ character_name: name });
      });
    }

    function callGetReactionsForPosts(postIds, name){
      var run = createRun ? createRun() : null;
      if (!run || !postIds || postIds.length === 0) return Promise.resolve({ ok: true, reactions: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: true, reactions: {} }); }).getReactionsForPosts({ post_ids: postIds, character_name: name });
      });
    }

    function callTogglePostReaction(postId, name, type){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).togglePostReaction({ post_id: postId, character_name: name, reaction_type: type });
      });
    }

    function callResubmitPostForApproval(postId){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).resubmitPostForApproval({ post_id: postId });
      });
    }

    function callGetCommentsForPost(postId){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, comments: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, comments: [] }); }).getCommentsForPost({ post_id: postId });
      });
    }

    function callAddComment(postId, characterName, text){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).addComment({ post_id: postId, character_name: characterName, text: text });
      });
    }

    function callGetDiscoveryFeed(limit){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, feed: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, feed: [] }); }).getDiscoveryFeed({ limit: limit || 12 });
      });
    }

    function callGetActivityEvents(limit){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, events: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, events: [] }); }).getActivityEvents({ limit: limit || 20 });
      });
    }

    function callGetRecognitionForCharacter(name){
      var locker = getLockerMe();
      if (locker && locker.ok && locker.recognitions && lockerCategoryAvailable(locker.recognitions)) {
        return Promise.resolve({ ok: true, recognition: lockerCategoryItems(locker.recognitions) });
      }
      var apiBase = (typeof window !== 'undefined' && typeof window.LANTERN_AVATAR_API !== 'undefined' && window.LANTERN_AVATAR_API !== null) ? String(window.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
      if (apiBase && name) {
        return fetch(apiBase + '/api/recognition/list?character_name=' + encodeURIComponent(name) + '&limit=50').then(function(r){ return r.json(); }).then(function(res){ return res && res.ok ? res : { ok: false, recognition: [] }; }).catch(function(){ return { ok: false, recognition: [] }; });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: true, recognition: [] });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r && r.ok ? r : { ok: true, recognition: [] }); }).withFailureHandler(function(){ resolve({ ok: true, recognition: [] }); }).getRecognitionForCharacter({ character_name: name || '' });
      });
    }

    function callGetCosmeticOwnership(name){
      var locker = getLockerMe();
      if (locker && locker.ok) {
        var ownedCat = locker.owned_items || {};
        var eqCat = locker.equipped_items || {};
        var ownedIds = ownedCosmeticIdsFromLocker(locker);
        var equipUnavailable = eqCat.available === false;
        var equippedMap = (!equipUnavailable && eqCat.equipped && typeof eqCat.equipped === 'object')
          ? eqCat.equipped
          : lockerCategoryItems(eqCat).reduce(function(acc, row) {
            if (row && row.category && row.item_id) acc[row.category] = row.item_id;
            return acc;
          }, {});
        return Promise.resolve({
          ok: lockerCategoryAvailable(ownedCat) || ownedIds.length > 0,
          owned: ownedIds,
          equipped: equipUnavailable ? {} : equippedMap,
          equip_unavailable: equipUnavailable,
          equip_reason: eqCat.reason || null,
          owned_reason: ownedCat.reason || null,
        });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, owned: [], equipped: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, owned: [], equipped: {} }); }).getCosmeticOwnership({ character_name: name });
      });
    }

    function callEquipCosmetic(name, cosmeticId, category){
      var locker = getLockerMe();
      if (locker && locker.ok && locker.equipped_items && locker.equipped_items.available === false) {
        return Promise.resolve({ ok: false, error: 'equipped_items_not_server_backed', reason: locker.equipped_items.reason });
      }
      if (window.LanternLockerMe && typeof window.LanternLockerMe.callEquipCosmetic === 'function') {
        return window.LanternLockerMe.callEquipCosmetic(category, cosmeticId || '');
      }
      return Promise.resolve({ ok: false, error: 'equip_api_unavailable' });
    }

    function callPurchaseCosmetic(characterName, cosmeticId){
      var cosmetics = (window.LANTERN_DATA && window.LANTERN_DATA.getCosmetics) ? window.LANTERN_DATA.getCosmetics() : [];
      var c = cosmetics.find(function(x){ return x.id === cosmeticId; });
      if (!c || c.purchasable === false) return Promise.resolve({ ok: false, error: 'Cosmetic not found or unlock only' });
      var cost = Number(c.cost) || 0;
      if (economyApiBase != null) {
        var idemKey = 'cosmetic-' + cosmeticId + '-' + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()));
        return callEconomyTransact(characterName, 0, 'cosmetic', '', (c.name || cosmeticId) + ' purchase', {
          cosmetic_id: cosmeticId,
          item_name: c.name || cosmeticId,
          idempotency_key: idemKey,
        }).then(function(tRes){
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
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ ok: false, error: String(err && err.message || err) }); }).purchaseCosmetic({ character_name: characterName, cosmetic_id: cosmeticId });
      });
    }

    function callClaimDailyCheckIn(name){
      if (economyApiBase != null) {
        var run = createRun ? createRun() : null;
        if (!run) return Promise.resolve({ ok: false });
        return new Promise(function(resolve){
          run.withSuccessHandler(function(r){
            if (!r || !r.ok) { resolve(r); return; }
            callEconomyTransact(name, r.nuggets || 3, 'daily_checkin', 'MISSION', 'Daily Check-In', {}).then(function(tRes){
              if (tRes && tRes.ok) resolve(r); else resolve({ ok: false, error: tRes && tRes.error || 'Failed' });
            });
          }).withFailureHandler(function(){ resolve({ ok: false }); }).claimDailyCheckIn({ character_name: name, economy_backend_charged: true });
        });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).claimDailyCheckIn({ character_name: name });
      });
    }

    function callCompleteHiddenNugget(name){
      if (economyApiBase != null) {
        var run = createRun ? createRun() : null;
        if (!run) return Promise.resolve({ ok: false });
        return new Promise(function(resolve){
          run.withSuccessHandler(function(r){
            if (!r || !r.ok) { resolve(r); return; }
            callEconomyTransact(name, r.nuggets || 5, 'hidden_nugget', 'MISSION', 'Hidden Nugget', {}).then(function(tRes){
              if (tRes && tRes.ok) resolve(r); else resolve({ ok: false, error: tRes && tRes.error || 'Failed' });
            });
          }).withFailureHandler(function(){ resolve({ ok: false }); }).completeHiddenNugget({ character_name: name, economy_backend_charged: true });
        });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).completeHiddenNugget({ character_name: name });
      });
    }

    function callGetDailyHuntStatus(name, page, spotCount){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, status: {} });
      var payload = { character_name: name || '', page: page || 'index' };
      if (spotCount !== undefined && spotCount !== null) payload.spot_count = spotCount;
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, status: {} }); }).getDailyHuntStatus(payload);
      });
    }

    function callClaimDailyNuggetHunt(name){
      if (economyApiBase != null) {
        var run = createRun ? createRun() : null;
        if (!run) return Promise.resolve({ ok: false });
        return new Promise(function(resolve, reject){
          run.withSuccessHandler(function(r){
            if (!r || !r.ok) { resolve(r); return; }
            callEconomyTransact(name, r.nuggets || 1, 'daily_hunt', 'MISSION', 'Daily Hidden Nugget', {}).then(function(tRes){
              if (tRes && tRes.ok) resolve(r); else resolve({ ok: false, error: tRes && tRes.error || 'Failed' });
            });
          }).withFailureHandler(function(){ resolve({ ok: false }); }).claimDailyNuggetHunt({ character_name: name, economy_backend_charged: true });
        });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).claimDailyNuggetHunt({ character_name: name });
      });
    }

    function esc(s){
      return String(s||'').replace(/[&<>"']/g, function(c){ return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;'; });
    }

    var myCreationsItemsCache = [];
    function getProfileApiBase(){
      return (typeof window !== 'undefined' && typeof window.LANTERN_AVATAR_API !== 'undefined' && window.LANTERN_AVATAR_API !== null) ? String(window.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
    }

    function pollContributionChoicesPlain(item){
      var ch = item && item.choices;
      if (!ch) return '';
      if (typeof ch === 'string') return ch;
      if (!Array.isArray(ch)) return '';
      return ch.map(function(c){
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') return String(c.label || c.text || c.value || '').trim();
        return '';
      }).filter(Boolean).join(' ');
    }

    function rawMyCreationStatus(st){ return String(st || '').trim().toLowerCase(); }

    function myCreationInAllTab(entry){
      var s = rawMyCreationStatus(entry.status);
      return s === 'pending' || s === 'returned' || s === 'approved' || s === 'accepted';
    }

    function myCreationMatchesStatusTab(entry, statusFilter){
      if (!statusFilter || statusFilter === 'all') return myCreationInAllTab(entry);
      var s = rawMyCreationStatus(entry.status);
      if (statusFilter === 'pending') return s === 'pending';
      if (statusFilter === 'returned') return s === 'returned';
      if (statusFilter === 'approved') return s === 'approved' || s === 'accepted';
      return false;
    }

    function missionSubmissionPreviewText(s){
      var t = (s.submission_type || '').trim();
      var c = String(s.submission_content || '').trim();
      if (t === 'text' && c){
        try {
          var o = JSON.parse(c);
          if (o && typeof o === 'object') return String(o.text || o.body || o.caption || '').trim().slice(0, 240);
        } catch (e) {}
      }
      if (c && t !== 'image_url' && t !== 'video') return c.slice(0, 240);
      return '';
    }

    function normalizePollContributionItem(raw){
      var item = raw || {};
      return {
        contentType: 'poll_contribution',
        canonicalId: 'poll_contribution:' + String(item.id || ''),
        status: item.status || '',
        title: String(item.question || 'Poll').trim() || 'Poll',
        previewText: pollContributionChoicesPlain(item),
        decisionNote: (item.decision_note != null && String(item.decision_note).trim()) ? String(item.decision_note).trim() : null,
        createdAt: item.created_at || '',
        sortKey: (item.reviewed_at || item.created_at || ''),
        raw: item
      };
    }

    function normalizeMissionSubmissionItem(raw){
      var s = raw || {};
      var note = (s.returned_reason != null && String(s.returned_reason).trim()) ? String(s.returned_reason).trim() : null;
      return {
        contentType: 'mission_submission',
        canonicalId: 'mission_submission:' + String(s.id || ''),
        status: s.status || '',
        title: String(s.mission_title || 'Mission').trim() || 'Mission',
        previewText: missionSubmissionPreviewText(s),
        decisionNote: note,
        createdAt: s.created_at || '',
        sortKey: (s.reviewed_at || s.returned_at || s.created_at || ''),
        raw: s
      };
    }

    function normalizeNewsSubmissionItem(raw){
      var n = raw || {};
      var note = (n.decision_note != null && String(n.decision_note).trim()) ? String(n.decision_note).trim() : null;
      return {
        contentType: 'news_submission',
        canonicalId: 'news_submission:' + String(n.id || ''),
        status: n.status || '',
        title: String(n.title || 'News').trim() || 'News',
        previewText: String(n.body || '').replace(/\s+/g, ' ').trim().slice(0, 280),
        decisionNote: note,
        createdAt: n.created_at || '',
        sortKey: (n.reviewed_at || n.created_at || ''),
        raw: n
      };
    }

    function fetchMyCreationsBundle(){
      var locker = getLockerMe();
      if (locker && locker.ok && locker.submissions && lockerCategoryAvailable(locker.submissions)) {
        var out = [];
        lockerCategoryItems(locker.submissions).forEach(function(item){
          if (!item || !item.id) return;
          if (item.type === 'poll_contribution') out.push(normalizePollContributionItem(item));
          else if (item.type === 'mission_submission') out.push(normalizeMissionSubmissionItem(item));
          else if (item.type === 'news_submission') out.push(normalizeNewsSubmissionItem(item));
        });
        return Promise.resolve(out);
      }
      return Promise.resolve([]);
    }

    var LS_PROFILE_NEWS_AUTHOR = 'LANTERN_PROFILE_NEWS_AUTHOR_TYPE';
    function getProfileNewsAuthorType(){
      try {
        var v = localStorage.getItem(LS_PROFILE_NEWS_AUTHOR);
        if (v === 'teacher' || v === 'staff' || v === 'admin' || v === 'student') return v;
      } catch (e) {}
      return 'student';
    }
    function setProfileNewsAuthorType(v){
      try { localStorage.setItem(LS_PROFILE_NEWS_AUTHOR, v); } catch (e) {}
    }

    function callGetNewsForAuthorProfile(name){
      var apiBase = getProfileApiBase();
      if (apiBase === null) return Promise.resolve({ ok: false, news: [] });
      return fetch(apiBase + '/api/news/mine?author_name=' + encodeURIComponent(name || '')).then(function (r) { return r.json(); }).then(function (res) {
        return res && res.news ? { ok: true, news: res.news } : { ok: false, news: [] };
      }).catch(function () { return { ok: false, news: [] }; });
    }

    function formatProfileNewsDate(iso){
      if (!iso) return '';
      try { var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(); } catch (e) { return ''; }
    }

    function renderProfileMyArticles(){
      var container = el('profileMyArticlesEl');
      var typeSelect = el('profileNewsAuthorType');
      if (!container) return;
      if (typeSelect){
        var saved = getProfileNewsAuthorType();
        if (typeSelect.querySelector('option[value="' + saved + '"]')) typeSelect.value = saved;
      }
      var authorType = (typeSelect && typeSelect.value) || 'student';
      var authorName = authorType === 'teacher' ? 'Teacher' : authorType === 'staff' ? 'Staff' : authorType === 'admin' ? 'Admin' : (getAdopted() ? getAdopted().name : '');
      if (!authorName){
        container.innerHTML = '<p class="profileMyArticlesPlaceholder">Choose your role above to see articles for that identity.</p>';
        return;
      }
      container.innerHTML = '<p class="profileMyArticlesPlaceholder">Loading…</p>';
      callGetNewsForAuthorProfile(authorName).then(function (res){
        var list = res.news || [];
        if (!list.length){
          container.innerHTML = '<p class="profileMyArticlesPlaceholder">No articles yet.</p>';
          return;
        }
        container.innerHTML = '';
        list.forEach(function (n){
          var div = document.createElement('div');
          div.className = 'myArticleItem';
          var status = (n.status || 'pending').toLowerCase();
          var statusText = status === 'approved' ? 'Published' : (status === 'rejected' ? 'Rejected' : (status === 'returned' ? 'Returned for improvements' : 'Pending approval'));
          var metaParts = [];
          if (status === 'approved' && n.approved_at) metaParts.push('Published ' + formatProfileNewsDate(n.approved_at));
          if (status === 'returned' && n.returned_at) metaParts.push('Returned ' + formatProfileNewsDate(n.returned_at));
          if (n.created_at && status === 'pending') metaParts.push('Submitted ' + formatProfileNewsDate(n.created_at));
          var metaHtml = metaParts.length ? '<div class="myArticleMeta">' + esc(metaParts.join(' · ')) + '</div>' : '';
          var feedbackNote = (n.decision_note || n.returned_reason || '').trim();
          var feedbackHtml = (status === 'returned' && feedbackNote) ? '<div class="myArticleFeedback">Teacher feedback: ' + esc(feedbackNote) + '</div>' : '';
          div.innerHTML = '<div class="myArticleStatus ' + status + '">' + statusText + '</div><div class="myArticleTitle">' + esc(n.title || 'Untitled') + '</div>' + metaHtml + feedbackHtml + '<div class="myArticleActions"></div>';
          var actions = div.querySelector('.myArticleActions');
          if (status === 'returned'){
            var btn = document.createElement('button');
            btn.className = 'btn';
            btn.type = 'button';
            btn.textContent = 'Edit & Resubmit';
            btn.style.marginTop = '10px';
            btn.addEventListener('click', function (){
              try {
                sessionStorage.setItem('LANTERN_NEWS_ARTICLE_RESUBMIT', JSON.stringify({
                  id: n.id,
                  title: n.title || '',
                  body: n.body || ''
                }));
              } catch (e) {}
              window.location.href = 'contribute.html?type=post';
            });
            actions.appendChild(btn);
          }
          container.appendChild(div);
        });
      });
    }

    var currentProfile = null;
    var FRAME_OPTIONS = [{ v: 'none', l: 'None' }, { v: 'gold', l: 'Gold' }, { v: 'blue', l: 'Blue' }, { v: 'green', l: 'Green' }, { v: 'purple', l: 'Purple' }];
    /* Supported profile themes: internal key and user-facing name. Same set drives body[data-theme] and hero theme tint/cards. */
    var THEME_OPTIONS = [
      { v: 'classic', l: 'Classic Lantern' },
      { v: 'midnight', l: 'Midnight Blue' },
      { v: 'sunset', l: 'Sunset Gold' },
      { v: 'forest', l: 'Forest Green' },
      { v: 'violet', l: 'Cosmic Violet' }
    ];

    /**
     * Map a profile post row to LanternCards feed model (Locker featured showcase only).
     * Keeps the same post fields as the legacy hand-built block; noNavigate on the card preserves non-navigating behavior.
     */
    function profileFeaturedPostToCardModel(post, accountName){
      var type = String((post && post.type) || 'link').trim() || 'link';
      var url = String((post && post.url) || '').trim();
      var cap = (post && post.caption) ? String(post.caption) : '';
      var model = {
        type: type,
        id: String((post && post.id) || '').trim() || 'profile_featured',
        title: '⭐ Featured: ' + String((post && post.title) || 'Untitled').trim(),
        caption: cap,
        display_name: '',
        character_name: String(accountName || '').trim(),
        avatar: '🌟',
        frame: 'none',
        created_at: (post && post.created_at) ? String(post.created_at) : '',
        url: url,
        image_url: '',
        video_url: '',
        link_url: '',
        lantern_route: { surface: 'locker', pipeline: 'profile_featured_post' }
      };
      if (type === 'image') {
        model.image_url = url || String((post && post.image_url) || (post && post.image) || '').trim();
      } else if (type === 'video') {
        model.video_url = url;
        model.image_url = String((post && post.preview_src) || (post && post.thumbnail) || (post && post.image) || '').trim();
      } else if (type === 'link' || type === 'webapp' || type === 'project') {
        model.link_url = url;
      }
      return model;
    }

    function renderFeaturedPost(profile, posts){
      var featEl = document.getElementById('featuredPostEl');
      if (!featEl) return;
      var adopted = getAdopted();
      var fid = (profile && profile.featured_post_id) || '';
      var post = fid ? posts.find(function(p){ return p.id === fid; }) : null;
      if (!post){
        featEl.style.display = 'none';
        featEl.innerHTML = '';
        return;
      }
      var LC = window.LanternCards;
      if (!LC || typeof LC.materializeFeedPostCard !== 'function' || !LC.CARD_MODE) {
        featEl.style.display = 'none';
        featEl.innerHTML = '';
        return;
      }
      featEl.style.display = 'block';
      featEl.innerHTML = '';
      var cardModel = profileFeaturedPostToCardModel(post, adopted && adopted.name ? adopted.name : '');
      function mountFeatured(card){
        featEl.appendChild(card);
      }
      if (window.LanternAvatar && typeof window.LanternAvatar.attachCanonicalAvatarsToItems === 'function' && String(cardModel.character_name || '').trim()) {
        window.LanternAvatar.attachCanonicalAvatarsToItems([cardModel]).then(function(){
          mountFeatured(LC.materializeFeedPostCard(cardModel, {
            mode: LC.CARD_MODE.RAIL,
            noNavigate: true,
            extraClass: 'lockerFeaturedPostExplore'
          }));
        });
      } else {
        mountFeatured(LC.materializeFeedPostCard(cardModel, {
          mode: LC.CARD_MODE.RAIL,
          noNavigate: true,
          extraClass: 'lockerFeaturedPostExplore'
        }));
      }
    }

    function refreshProfileFeaturedPost(profile){
      var adopted = getAdopted();
      if (!adopted || !String(adopted.name || '').trim()) return;
      callGetPosts(adopted.name).then(function(res){
        var posts = (res && res.posts) || [];
        renderFeaturedPost(profile || {}, posts);
      }).catch(function(){ renderFeaturedPost(profile || {}, []); });
    }

    /* ===== Creator reaction summary (feature-flagged; uses breakdown API) ===== */
    function renderCreatorReactionSummary(characterName){
      var section = el('creatorReactionSummarySection');
      var barsEl = el('creatorReactionBarsEl');
      var notEnoughEl = el('creatorReactionNotEnoughEl');
      if (!section || !barsEl || !notEnoughEl) return;
      section.style.display = 'none';
      barsEl.innerHTML = '';
      notEnoughEl.style.display = 'none';
      if (!characterName || !window.LANTERN_REACTIONS || !window.LANTERN_REACTIONS.getBreakdown) return;
      if (!window.LANTERN_FEATURE_FLAGS || typeof window.LANTERN_FEATURE_FLAGS.isEnabled !== 'function') return;
      var apiBase = (typeof window !== 'undefined' && typeof window.LANTERN_AVATAR_API !== 'undefined' && window.LANTERN_AVATAR_API !== null) ? String(window.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
      if (apiBase === null) return;
      var flagsPromise = window.LANTERN_REACTIONS.getFeatureFlags ? window.LANTERN_REACTIONS.getFeatureFlags() : Promise.resolve({});
      flagsPromise.then(function(){
        if (!window.LANTERN_FEATURE_FLAGS.isEnabled('ENABLE_REACTION_BREAKDOWN')) return;
        fetch(apiBase + '/api/news/mine?author_name=' + encodeURIComponent(characterName)).then(function(r){ return r.json(); }).then(function(res){
          if (!res || !res.ok || !res.news) { section.style.display = 'block'; notEnoughEl.style.display = 'block'; return; }
          var approvedIds = (res.news || []).filter(function(n){ return n.status === 'approved' && n.id; }).map(function(n){ return n.id; });
          if (approvedIds.length === 0) { section.style.display = 'block'; notEnoughEl.style.display = 'block'; return; }
          var getBreakdown = window.LANTERN_REACTIONS.getBreakdown;
          var vocab = window.LANTERN_REACTIONS.REACTION_VOCAB || [];
          var labels = window.LANTERN_REACTIONS.REACTION_TYPE_LABELS || {};
          var aggregated = {};
          var promises = approvedIds.map(function(id){ return getBreakdown('news', id, characterName, false); });
          Promise.all(promises).then(function(results){
            results.forEach(function(br){
              if (br && br.ok && br.breakdown && Array.isArray(br.breakdown)) {
                br.breakdown.forEach(function(row){
                  var t = (row.reaction_type || '').toLowerCase();
                  if (t) aggregated[t] = (aggregated[t] || 0) + (row.count || 0);
                });
              }
            });
            var total = 0;
            Object.keys(aggregated).forEach(function(k){ total += aggregated[k]; });
            if (total < 5) {
              section.style.display = 'block';
              notEnoughEl.style.display = 'block';
              return;
            }
            var sorted = Object.keys(aggregated).map(function(k){ return { type: k, count: aggregated[k], pct: Math.round((aggregated[k] / total) * 100) }; }).sort(function(a,b){ return (b.count || 0) - (a.count || 0); });
            var html = '';
            sorted.forEach(function(row){
              var voc = vocab.find(function(r){ return r.type === row.type; });
              var emoji = voc ? voc.emoji : '';
              var label = labels[row.type] || row.type;
              html += '<div class="creatorReactionBarRow"><span class="barLabel">' + emoji + ' ' + esc(label) + '</span><div class="barTrack"><div class="barFill" style="width:' + (row.pct || 0) + '%"></div></div><span class="barPct">' + (row.pct || 0) + '%</span></div>';
            });
            barsEl.innerHTML = html;
            notEnoughEl.style.display = 'none';
            section.style.display = 'block';
          });
        }).catch(function(){ section.style.display = 'block'; notEnoughEl.style.display = 'block'; });
      });
    }

    function refreshStudentPickerAvatars(){
      /* Removed with authenticated Locker — no student picker avatars. */
    }
    function renderPicker(){
      /* Removed: authenticated Locker has no student picker. */
    }

    function wireCreateTestStudentModal(){
      /* Removed: test student flow is not available in production Locker. */
    }

    function todayStr(){
      var d = new Date();
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      var day = d.getDate();
      return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    }

    function refreshDailyHunt(characterName, page){
      var hintEl = el('dailyHuntHintEl');
      var nuggetEl = el('dailyHuntNuggetEl');
      if (!hintEl && !nuggetEl) return;
      var spotSel = '#lockerPanelOverview .lanternExplorePageContainer, #lockerPanelStore .lockerSection, #lockerPanelItems .lockerSection';
      var spots = document.querySelectorAll(spotSel);
      var spotCount = spots.length;
      callGetDailyHuntStatus(characterName || '', page || 'index', spotCount).then(function(res){
        var s = (res && res.status) || {};
        if (hintEl){
          hintEl.style.display = 'block';
          if (s.claimed){
            hintEl.textContent = 'Daily Hidden Nugget: Found! +' + (s.nuggets || 0) + ' nugget' + ((s.nuggets || 0) !== 1 ? 's' : '') + ' today';
            hintEl.classList.add('found');
          } else if (s.onThisPage){
            hintEl.textContent = "Today's hidden nugget hint: " + (s.hint_text || '');
            hintEl.classList.remove('found');
          } else {
            hintEl.textContent = "Today's hidden nugget hint: " + (s.hint_text || '');
            hintEl.classList.remove('found');
          }
        }
        if (nuggetEl){
          if (s.onThisPage && characterName && spotCount > 0 && s.spotIndex !== undefined){
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
            } else {
              nuggetEl.style.display = 'none';
            }
          } else {
            nuggetEl.style.display = 'none';
          }
        }
      });
    }

    /* ===== Profile rails: same Explore cards (materializeFeedPostCard) ===== */
    function lanternProfileDisplayName(){
      var vm = typeof window !== 'undefined' && window.LANTERN_STUDENT_PROFILE_VIEW;
      return (vm && vm.displayName) ? String(vm.displayName) : 'You';
    }

    /* ===== Activity feed from history (Phase 6 recognition) ===== */
    function getActivityLabel(h){
      var source = String(h.source || '').toUpperCase();
      var kind = String(h.kind || '').toUpperCase();
      var note = String(h.note_text || '').trim();
      var delta = Number(h.nugget_delta || 0);
      if (note.indexOf('Spotlight') >= 0) return { text: 'Teacher Spotlight', icon: '⭐', spotlight: true };
      if (source === 'CURATION') {
        if (note.indexOf('Spotlighted post') >= 0) return { text: note, icon: '⭐', spotlight: true };
        if (note.indexOf('Featured:') >= 0) return { text: note, icon: '🌟', spotlight: true };
        if (note.indexOf('Teacher Pick') >= 0) return { text: note, icon: '🏆', spotlight: true };
        if (note.indexOf('Teacher praise') >= 0) return { text: note, icon: '💬', spotlight: true };
        return { text: note || 'Teacher curation', icon: '✨', spotlight: true };
      }
      if (note.indexOf('Achievement:') === 0) return { text: note, icon: '🏆', spotlight: false };
      if (note === 'Post created') return { text: 'Post created', icon: '📝', spotlight: false };
      if (note === 'Daily Check-In') return { text: 'Daily check-in claimed', icon: '✅', spotlight: false };
      if (note === 'Hidden Nugget') return { text: 'Hidden nugget found', icon: '<img src="assets/icons/nugget.png" alt="Nugget" class="activityIconImg">', spotlight: false };
      if (note === 'Daily Nugget Hunt') return { text: 'Daily nugget hunt +' + (delta || 0), icon: '<img src="assets/icons/nugget.png" alt="Nugget" class="activityIconImg">', spotlight: false };
      if (note === 'First Game Played') return { text: 'First game played', icon: '🎮', spotlight: false };
      if (source === 'APPROVAL' && delta > 0) return { text: 'Teacher approved +' + delta, icon: '✨', spotlight: false };
      if (kind === 'REDEEM'){
        var itemId = h.item_id || '';
        var itemName = h.item_name || '';
        if (itemId === 'game_play') return { text: 'Game: ' + (itemName || 'Played'), icon: '🎮', spotlight: false };
        return { text: 'Store purchase' + (itemName ? ': ' + itemName : ''), icon: '🛒', spotlight: false };
      }
      if (delta >= 0) return { text: '+' + delta + ' nuggets', icon: '✨', spotlight: false };
      return { text: 'Spent ' + Math.abs(delta) + ' nuggets', icon: '🛒', spotlight: false };
    }
    function myCreationCardMetaLine(entry){
      var s = rawMyCreationStatus(entry.status);
      var note = entry.decisionNote ? String(entry.decisionNote) : '';
      var snip = note.length > 40 ? note.slice(0, 40) + '…' : note;
      if (s === 'returned') return 'Needs Attention' + (snip ? ' · ' + snip : '');
      if (s === 'pending') return 'Your post is waiting for approval';
      if (s === 'approved' || s === 'accepted') return 'Approved';
      if (s === 'rejected') return 'Rejected';
      return entry.status || '';
    }

    function myCreationMatchesSearch(entry, qNorm){
      if (!qNorm) return true;
      var typeLabel = entry.contentType === 'poll_contribution' ? 'poll' : (entry.contentType === 'mission_submission' ? 'mission' : 'news');
      var hay = [entry.title, entry.previewText, entry.decisionNote, typeLabel].map(function(p){ return String(p || '').toLowerCase(); }).join(' ');
      return hay.indexOf(qNorm) >= 0;
    }

    function filterMyCreationsForTab(list, statusFilter){
      return (list || []).filter(function(entry){ return myCreationMatchesStatusTab(entry, statusFilter); });
    }

    function syncNeedsAttentionNavCountFromCache(){
      var n = filterMyCreationsForTab(myCreationsItemsCache, 'returned').length;
      try {
        document.dispatchEvent(new CustomEvent('lantern-needs-attention-count', { detail: { count: n } }));
      } catch (e) {}
    }

    /* ===== PRESERVED: showProfile with new layout ===== */
    /* Profile contains multiple optional feature modules; one failing module should not break the whole page. */
    function safeProfileStep(label, fn){
      try { fn(); } catch (err) { console.error('[Profile]', label, 'failed', err); }
    }

    function pulseNuggetDisplayIfGain(balanceEl, oldVal, newVal) {
      if (!balanceEl) return;
      var o = Number(oldVal);
      var n = Number(newVal);
      if (!Number.isFinite(n) || !Number.isFinite(o) || n <= o) return;
      balanceEl.classList.remove('nuggetHit');
      void balanceEl.offsetWidth;
      balanceEl.classList.add('nuggetHit');
    }

    function refreshProfileWalletBalanceFromServer(){
      var adopted = getAdopted();
      if (!adopted || !String(adopted.name || '').trim()) return;
      if (!el('balanceEl')) return;
      if (window.LanternWallet && typeof window.LanternWallet.refreshBalance === 'function') {
        var beBind = el('balanceEl');
        if (beBind && typeof window.LanternWallet.bindElement === 'function' && !beBind.getAttribute('data-lantern-economy-bound')) {
          beBind.setAttribute('data-lantern-economy-bound', '1');
          window.LanternWallet.bindElement(beBind, { format: 'number' });
          window.LanternWallet.subscribe(function (snap) {
            if (snap && snap.ok && snap.available != null) {
              var nv = Number(snap.available);
              if (typeof studentProfileVM !== 'undefined' && studentProfileVM) studentProfileVM.nuggets = nv;
              updateNuggetProgress(nv);
            }
          });
        }
        return window.LanternWallet.refreshBalance({ force: true });
      }
      callGetBalance().then(function(res){
        safeProfileStep('balanceVisibility', function(){
          if (!res || !res.ok || res.available == null) return;
          var nv = Number(res.available) || 0;
          var vm = typeof window !== 'undefined' ? window.LANTERN_STUDENT_PROFILE_VIEW : null;
          var be = el('balanceEl');
          var oldN = NaN;
          if (be && be.textContent) {
            var parsed = parseInt(String(be.textContent).trim(), 10);
            if (Number.isFinite(parsed)) oldN = parsed;
          }
          if (!Number.isFinite(oldN) && vm && vm.nuggets != null && Number.isFinite(Number(vm.nuggets))) {
            oldN = Number(vm.nuggets);
          }
          if (vm) vm.nuggets = nv;
          if (be) {
            pulseNuggetDisplayIfGain(be, oldN, nv);
            be.textContent = String(nv);
          }
          updateNuggetProgress(nv);
        });
      }).catch(function(){});
    }

    var profileWalletVisibilityWired = false;
    function wireProfileWalletVisibilityOnce(){
      if (profileWalletVisibilityWired) return;
      profileWalletVisibilityWired = true;
      function runProfileWalletRefreshFromReturnEvents(){
        refreshProfileWalletBalanceFromServer();
      }
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState !== 'visible') return;
        runProfileWalletRefreshFromReturnEvents();
      });
      window.addEventListener('focus', runProfileWalletRefreshFromReturnEvents);
      window.addEventListener('pageshow', function(e){
        if (e.persisted) runProfileWalletRefreshFromReturnEvents();
      });
    }

    var DEFAULT_HERO_TITLE = 'Creative Student';

    function applyProfileIdentityIdLine(friendlyName, walletKey){
      var idEl = el('profileIdentityIdEl');
      if (!idEl) return;
      var f = (friendlyName || '').trim();
      var w = (walletKey || '').trim();
      if (!w || f === w) {
        idEl.textContent = '';
        idEl.style.display = 'none';
        idEl.setAttribute('aria-hidden', 'true');
        return;
      }
      idEl.textContent = 'ID: ' + w;
      idEl.style.display = 'block';
      idEl.removeAttribute('aria-hidden');
    }

    function applyProfileHeroIdentity(vm){
      var dnEl = el('profileDisplayNameEl');
      var stEl = el('profileStatusEl');
      var name = (vm && vm.displayName) ? String(vm.displayName).trim() : '';
      if (dnEl) {
        dnEl.textContent = name || '—';
      }
      if (stEl) {
        var ht = (vm && vm.heroTitle) ? String(vm.heroTitle).trim() : '';
        stEl.textContent = ht || DEFAULT_HERO_TITLE;
      }
      var wk = (vm && vm.walletKey != null) ? String(vm.walletKey).trim() : '';
      applyProfileIdentityIdLine(name, wk);
    }

    function showProfile(){
      var adopted = getAdopted();
      var needCharEl = el('pilotLockerNeedCharacter');
      if (needCharEl) needCharEl.style.display = 'none';
      var ctx = document.getElementById('lanternAppBarContext');
      var _lp = (typeof LANTERN_NAV !== 'undefined' && LANTERN_NAV.getCurrentPage) ? LANTERN_NAV.getCurrentPage() : '';
      var isProfilePage = _lp === 'profile' || _lp === 'locker';
      if (lockerBootPending) return;
      if (!adopted || !adopted.name){
        if (needCharEl) needCharEl.style.display = 'block';
        if (isProfilePage && ctx) {
          ctx.textContent = 'Locker';
          ctx.classList.remove('lanternAppBarContext--empty');
        }
        return;
      }

      if (isProfilePage && ctx) {
        ctx.innerHTML = '<span class="lanternAppBarContextGlow">' + esc(getStudentDisplayName() || adopted.name) + '</span>';
        ctx.classList.remove('lanternAppBarContext--empty');
      }
      if (typeof setLegendSelection === 'function') setLegendSelection(null);

      var locker = getLockerMe();
      var lockerProfile = locker && locker.profile ? locker.profile : {};
      var accountRole = adopted.role || (locker && locker.account && locker.account.role) || 'student';
      var heroTitleDefault = String(accountRole).trim().toLowerCase() === 'teacher' ? 'Teacher' : (String(accountRole).trim().toLowerCase() === 'admin' ? 'Admin' : 'Creative Student');
      var studentProfileVM = {
        id: adopted.name,
        name: adopted.name,
        walletKey: adopted.name,
        displayName: getStudentDisplayName() || adopted.name || '—',
        heroTitle: heroTitleDefault,
        avatar: (adopted.avatar || '').trim() || '🌟',
        motto: '',
        nuggets: 0,
        stats: { creations: 0, achievements: 0, recognitions: 0 },
        praise_types: [],
        has_spotlight: false,
        custom_avatar: '',
        frame: 'none',
        theme: 'default'
      };
      if (typeof window !== 'undefined') window.LANTERN_STUDENT_PROFILE_VIEW = studentProfileVM;

      myCreationsItemsCache = [];
      syncNeedsAttentionNavCountFromCache();

      setProfileHeroStats({ creations: 0, achievements: 0, recognitions: 0 });
      updateNuggetProgress(0);

      var revEl = el('avatarRevealEl');
      var contentEl = el('avatarContentEl');
      if (revEl) revEl.classList.remove('revealed');
      if (contentEl) contentEl.innerHTML = '';
      if (ctx) {
        ctx.innerHTML = '<span class="lanternAppBarContextGlow">' + esc(studentProfileVM.displayName) + '</span>';
        ctx.classList.remove('lanternAppBarContext--empty');
      }
      applyProfileHeroIdentity(studentProfileVM);
      var bioElInit = el('bioEl');
      if (bioElInit) {
        bioElInit.textContent = studentProfileVM.motto || 'Add a bio or tagline';
        bioElInit.classList.add('placeholder');
      }

      var avatarApiBase = getProfileApiBase();
      try { console.log('[profile] current character for profile', adopted.name || ''); } catch(_) {}
      callGetProfile(adopted.name).then(function(res){
        var profile = (res && res.profile) || {};
        var leg = String((profile.avatar || adopted.avatar || '').trim() || '');
        if (window.LanternAvatar && typeof window.LanternAvatar.getLegacyEmojiForCharacter === 'function' && !leg) {
          leg = window.LanternAvatar.getLegacyEmojiForCharacter(adopted.name);
        }
        if (window.LanternAvatar && typeof window.LanternAvatar.getCanonicalAvatar === 'function') {
          return window.LanternAvatar.getCanonicalAvatar(adopted.name, leg || undefined).then(function(canon){
            return { profile: profile, canon: canon || { imageUrl: null, emoji: leg || '🌟' } };
          });
        }
        return { profile: profile, canon: { imageUrl: null, emoji: leg || '🌟' } };
      }).then(function(bundle){
        var p = (bundle && bundle.profile) || {};
        var canon = (bundle && bundle.canon) || { imageUrl: null, emoji: '🌟' };
        if (lockerProfile && lockerProfile.avatar) {
          canon = { imageUrl: lockerProfile.avatar, emoji: canon.emoji || '🌟' };
        }
        studentProfileVM.displayName = (p.display_name || '').trim() || getStudentDisplayName() || adopted.name || '—';
        studentProfileVM.heroTitle = (p.hero_title || '').trim();
        studentProfileVM.motto = (p.bio || '').trim();
        studentProfileVM.avatar = (p.avatar || '').trim() || adopted.avatar || '🌟';
        studentProfileVM.frame = (p.frame || 'none').trim();
        studentProfileVM.theme = (p.theme || 'default').trim();
        studentProfileVM.custom_avatar = (canon.imageUrl && String(canon.imageUrl).trim()) ? String(canon.imageUrl).trim() : '';
        if (ctx) ctx.innerHTML = '<span class="lanternAppBarContextGlow">' + esc(studentProfileVM.displayName) + '</span>';
        applyProfileHeroIdentity(studentProfileVM);
        var bioEl = el('bioEl');
        if (bioEl) {
          bioEl.textContent = studentProfileVM.motto || 'Add a bio or tagline';
          bioEl.classList.toggle('placeholder', !studentProfileVM.motto);
        }
        var contentEl = el('avatarContentEl');
        var revEl = el('avatarRevealEl');
        if (contentEl && revEl) {
          revEl.classList.remove('revealed');
          if (canon.imageUrl && String(canon.imageUrl).trim()) {
            var img = document.createElement('img');
            img.alt = 'Avatar';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            img.onload = function(){ revEl.classList.add('revealed'); };
            img.src = String(canon.imageUrl).trim();
            contentEl.innerHTML = '';
            contentEl.appendChild(img);
          } else {
            var fallbackUrl = (window.LanternAvatar && window.LanternAvatar.canonicalFallbackAvatarUrl)
              ? window.LanternAvatar.canonicalFallbackAvatarUrl()
              : '/assets/fallback-avatar.png';
            var img = document.createElement('img');
            img.alt = 'Avatar';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            img.onload = function(){ revEl.classList.add('revealed'); };
            img.onerror = function(){ revEl.classList.add('revealed'); };
            img.src = fallbackUrl;
            contentEl.innerHTML = '';
            contentEl.appendChild(img);
          }
        }
        var hero = el('profileHeroEl') || document.querySelector('.profileHero');
        if (hero) {
          var t = (studentProfileVM.theme || '').trim();
          if (t === 'warm') t = 'sunset'; else if (t === 'cool') t = 'midnight'; else if (t === 'default' || !{ classic: 1, midnight: 1, sunset: 1, forest: 1, violet: 1 }[t]) t = '';
          hero.className = 'profileHero' + (studentProfileVM.frame && studentProfileVM.frame !== 'none' ? ' frame-' + studentProfileVM.frame : '') + (t ? ' theme-' + t : '');
        }
        currentProfile = profile;
        refreshProfileFeaturedPost(profile);
        fetchMyCreationsBundle().then(function(list){
          maybeToastPostLiveAfterBundle(list || []);
          myCreationsItemsCache = list || [];
          syncNeedsAttentionNavCountFromCache();
        }).catch(function(){
          myCreationsItemsCache = [];
          syncNeedsAttentionNavCountFromCache();
        });
        var avatarStatusPromise = Promise.resolve({
          ok: true,
          status: {
            active_image: lockerProfile.avatar || null,
            has_pending: !!(lockerProfile.avatar_pending && lockerProfile.avatar_pending.image),
            pending_image: lockerProfile.avatar_pending ? lockerProfile.avatar_pending.image : null,
          },
        });
        return Promise.all([
          callGetCosmeticOwnership(adopted.name),
          avatarStatusPromise
        ]);
      }).then(function(results){
        safeProfileStep('cosmeticsAndAvatarStatus', function(){
        var cosRes = results && results[0];
        var avatarRes = results && results[1];
        var equipped = (cosRes && cosRes.equipped) || {};
        var cosmetics = (window.LANTERN_DATA && window.LANTERN_DATA.getCosmetics) ? window.LANTERN_DATA.getCosmetics() : [];
        var lockerSurface = document.querySelector('.lanternLockerSurface');
        if (lockerSurface && window.LANTERN_SURFACE_THEME) {
          window.LANTERN_SURFACE_THEME.applyLockerTheme(lockerSurface, equipped, { effectLayerId: 'cosmeticEffectLayer' });
        }
        var hero = el('profileHeroEl') || document.querySelector('.profileHero');
        if (hero) {
        [].slice.call(hero.classList).forEach(function(cls){ if (cls.indexOf('cosmetic-') === 0) hero.classList.remove(cls); });
        var badgeEl = el('cosmeticBadgeEl');
        var accessoryEl = el('cosmeticAccessoryEl');
        var decorationEl = el('cosmeticDecorationEl');
        if (badgeEl) badgeEl.style.display = 'none';
        if (accessoryEl) accessoryEl.style.display = 'none';
        if (decorationEl) decorationEl.style.display = 'none';
        if (lockerSurface && window.LANTERN_SURFACE_THEME) {
          document.body.removeAttribute('data-background');
          document.body.removeAttribute('data-theme');
          document.body.removeAttribute('data-effect');
        } else {
        if (equipped.background) {
          var bgVal = equipped.background.replace('bg_', '');
          hero.classList.add('cosmetic-bg-' + bgVal);
          document.body.setAttribute('data-background', bgVal);
        } else {
          document.body.removeAttribute('data-background');
        }
        var accentKey = equipped.accent && equipped.accent.replace('accent_', '');
        var accentToTheme = { gold: 'classic', sunset: 'sunset', blue: 'midnight', green: 'forest', arcade: 'violet', silver: 'classic', rainbow: 'classic', glow: 'classic' };
        var profileTheme = (studentProfileVM && studentProfileVM.theme) ? String(studentProfileVM.theme).trim().toLowerCase() : '';
        if (profileTheme === 'default') profileTheme = 'classic';
        if (profileTheme === 'warm') profileTheme = 'sunset';
        if (profileTheme === 'cool') profileTheme = 'midnight';
        var themeVal = (accentKey && accentToTheme[accentKey]) || profileTheme || 'classic';
        var allowed = { classic: 1, midnight: 1, sunset: 1, forest: 1, violet: 1 };
        if (!allowed[themeVal]) themeVal = 'classic';
        document.body.setAttribute('data-theme', themeVal);
        if (hero) {
          hero.className = hero.className.replace(/\btheme-\w+/g, '').trim();
          hero.classList.add('theme-' + themeVal);
        }
        if (equipped.effect) {
          var effectVal = (equipped.effect || '').replace('effect_', '');
          document.body.setAttribute('data-effect', effectVal);
        } else {
          document.body.removeAttribute('data-effect');
        }
        if (equipped.accent) hero.classList.add('cosmetic-accent-' + equipped.accent.replace('accent_', ''));
        if (equipped.frame) hero.classList.add('cosmetic-frame-' + equipped.frame.replace('frame_', ''));
        }
        var badgeId = equipped.badge;
        if (badgeId && badgeEl) {
          var c = cosmetics.find(function(x){ return x.id === badgeId; });
          if (c) { badgeEl.textContent = c.icon || ''; badgeEl.style.display = 'flex'; }
        }
        var accId = equipped.accessory;
        if (accId && accessoryEl) {
          var ac = cosmetics.find(function(x){ return x.id === accId; });
          if (ac) { accessoryEl.textContent = ac.icon || ''; accessoryEl.style.display = 'block'; }
        }
        var decId = equipped.decoration;
        if (decId && decorationEl) {
          var dc = cosmetics.find(function(x){ return x.id === decId; });
          if (dc) { decorationEl.textContent = dc.icon || ''; decorationEl.style.display = 'block'; }
        }
        }
        // Avatar status / pending preview
        var status = (avatarRes && avatarRes.status) || {};
        var pendingStatusEl = el('pendingAvatarStatusEl');
        if (pendingStatusEl) {
          if (status.has_pending && status.pending_image) {
            pendingStatusEl.style.display = 'block';
            pendingStatusEl.innerHTML = '<div style=\"font-weight:900;margin-bottom:4px;\">Avatar awaiting approval</div><div style=\"font-size:19px;color:var(--muted);margin-bottom:6px;\">A teacher is reviewing your new avatar.</div><img src=\"' + esc(status.pending_image) + '\" alt=\"Pending avatar\" style=\"width:72px;height:72px;border-radius:18px;object-fit:cover;box-shadow:0 4px 10px rgba(0,0,0,.4);\">';
          } else {
            pendingStatusEl.style.display = 'none';
            pendingStatusEl.innerHTML = '';
          }
        }
        });
      }).catch(function(){ currentProfile = {}; });

      callGetBalance().then(function(res){
        safeProfileStep('balance', function(){
          if (!res || !res.ok || res.available == null) return;
          var be = el('balanceEl');
          var oldN = NaN;
          if (be && be.textContent) {
            var parsed = parseInt(String(be.textContent).trim(), 10);
            if (Number.isFinite(parsed)) oldN = parsed;
          }
          if (!Number.isFinite(oldN)) oldN = Number(studentProfileVM.nuggets) || 0;
          studentProfileVM.nuggets = Number(res.available) || 0;
          if (be) {
            pulseNuggetDisplayIfGain(be, oldN, studentProfileVM.nuggets);
            be.textContent = String(studentProfileVM.nuggets);
          }
          updateNuggetProgress(studentProfileVM.nuggets);
        });
      }).catch(function(){});

      var lockerForHistory = getLockerMe();
      var walletHistory = (lockerForHistory && lockerForHistory.wallet && Array.isArray(lockerForHistory.wallet.transactions))
        ? lockerForHistory.wallet.transactions.map(function(tx){
            return {
              timestamp: tx.created_at,
              note_text: tx.note || tx.kind || '',
              nugget_delta: tx.delta,
              kind: tx.kind,
              source: tx.source,
            };
          })
        : [];
      Promise.resolve([
        { ok: true, history: walletHistory },
        (function(){
          var achCat = lockerForHistory && lockerForHistory.achievements;
          var unavailable = achCat && achCat.available === false;
          var achievementItems = unavailable ? [] : lockerCategoryItems(achCat);
          return {
            ok: true,
            achievements: achievementItems,
            achievements_unavailable: !!unavailable,
            achievements_reason: achCat && achCat.reason ? achCat.reason : null,
          };
        })(),
      ]).then(function(results){
        safeProfileStep('historyAndAchievements', function(){
          var history = (results[0] && results[0].history) || [];
          var achResult = results[1] || {};
          var achievements = achResult.achievements || [];
          var unlockedCount = achievements.filter(function(a){ return a.unlocked; }).length;
          studentProfileVM.stats.achievements = achResult.achievements_unavailable ? null : unlockedCount;
          setProfileHeroStats({ achievements: achResult.achievements_unavailable ? null : unlockedCount });
          studentProfileVM.has_spotlight = achievements.some(function(a){ return a.id === 'teacher_spotlight' && a.unlocked; });
          var badge = el('spotlightBadgeEl');
          if (badge) badge.style.display = studentProfileVM.has_spotlight ? 'flex' : 'none';
        });
      }).catch(function(){});

      callGetMissions(adopted.name).then(function(res){
        safeProfileStep('missions', function(){
          var missions = (res && res.missions) || {};
          var nuggetEl = document.getElementById('hiddenNuggetEl');
          if (nuggetEl) nuggetEl.style.display = (missions.hidden_nugget ? 'none' : 'flex');
        });
      }).catch(function(){});

      callGetActiveTeacherMissionsForCharacter(adopted.name).then(function(res){
        safeProfileStep('teacherMissionsBadge', function(){
          var n = (res && res.missions) ? res.missions.length : 0;
          var badge = document.getElementById('lanternNavMissionsBadge');
          if (badge) badge.textContent = n > 0 ? String(n) : '';
        });
      }).catch(function(){});

      safeProfileStep('refreshDailyHunt', function(){ refreshDailyHunt(adopted.name, 'index'); });

      safeProfileStep('creatorReactionSummary', function(){ renderCreatorReactionSummary(adopted.name); });
      safeProfileStep('wirePostsUI', wirePostsUI);
      safeProfileStep('wireEditProfile', wireEditProfile);
      safeProfileStep('wireMissions', wireMissions);
      safeProfileStep('wireSpotlightBadge', wireSpotlightBadge);
    }

    /* Legend panel: rotating tips when idle; click badge/icon shows meaning; clear selection returns to rotation */
    var legendSelectedKey = null;
    var legendTipIndex = 0;
    var LEGEND_TIPS = [
      { key: 'nugget_wallet', text: 'Your nugget balance. Earn nuggets from missions, daily hunt, and teacher approvals.' },
      { key: 'edit_profile', text: 'Change your name, bio, avatar, and equip items from the Store.' },
      { key: 'new_post', text: 'Share something you made. It goes to a teacher for approval first.' },
      { key: 'content_tabs', text: 'My Creations: your Contribute polls, mission submissions, and news articles from the server — tabs All / Pending / Needs Attention (returned) / Approved. Mission “accepted” counts as Approved. Search only filters what you already loaded.' },
      { key: 'achievements', text: 'Badges you earn for things like your first post, daily nugget, or teacher pick.' },
      { key: 'trophy_case', text: 'Your Wins uses the same Lantern cards as the feed (horizontal scroll); locked achievements look muted.' },
      { key: 'teacher_spotlight', text: 'You were spotlighted by a teacher. It’s a special recognition in Locker → Overview.' }
    ];
    function getLegendText(key){
      if (!key) return '';
      if (key === 'teacher_spotlight') return 'You were spotlighted by a teacher. It’s a special recognition in Locker → Overview.';
      var tip = LEGEND_TIPS.find(function(t){ return t.key === key; });
      return tip ? tip.text : (typeof LANTERN_HELP !== 'undefined' && LANTERN_HELP.getText ? LANTERN_HELP.getText(key) : '');
    }
    function setLegendSelection(key){
      legendSelectedKey = key || null;
      var panel = el('profileLegendPanelEl');
      var textEl = el('profileLegendTextEl');
      if (!textEl) return;
      if (legendSelectedKey) {
        textEl.textContent = getLegendText(legendSelectedKey) || ('Legend: ' + legendSelectedKey);
      } else {
        var tip = LEGEND_TIPS[legendTipIndex % LEGEND_TIPS.length];
        textEl.textContent = tip ? tip.text : 'Tap a badge or icon to learn what it means.';
      }
    }
    function advanceLegendTip(){
      if (legendSelectedKey) return;
      legendTipIndex = (legendTipIndex + 1) % LEGEND_TIPS.length;
      var tip = LEGEND_TIPS[legendTipIndex];
      var textEl = el('profileLegendTextEl');
      if (textEl && tip) textEl.textContent = tip.text;
    }
    (function initLegendPanel(){
      setInterval(advanceLegendTip, 5000);
      document.addEventListener('click', function(e){
        var target = e.target;
        var trigger = null;
        var node = target;
        while (node && node !== document.body) {
          var key = node.getAttribute && node.getAttribute('data-help');
          if (key) { trigger = key; break; }
          if (node.id === 'spotlightBadgeEl') { trigger = 'teacher_spotlight'; break; }
          node = node.parentNode;
        }
        var panel = el('profileLegendPanelEl');
        if (trigger) {
          setLegendSelection(trigger);
          return;
        }
        if (panel && !panel.contains(target)) setLegendSelection(null);
      });
    })();

    var spotlightBadgeWired = false;
    function wireSpotlightBadge(){
      if (spotlightBadgeWired) return;
      spotlightBadgeWired = true;
      var badge = el('spotlightBadgeEl');
      if (!badge) return;
      badge.addEventListener('click', function(e){
        e.stopPropagation();
        if (typeof setLegendSelection === 'function') setLegendSelection('teacher_spotlight');
      });
    }

    var missionsWired = false;
    function wireMissions(){
      if (missionsWired) return;
      missionsWired = true;
      var nuggetEl = el('hiddenNuggetEl');
      if (nuggetEl){
        nuggetEl.addEventListener('click', function(){
          var adopted = getAdopted();
          if (!adopted) return;
          callCompleteHiddenNugget(adopted.name).then(function(res){
            if (res && res.ok){
              toast('+5 nuggets! Hidden nugget found!');
              nuggetEl.style.display = 'none';
              showProfile();
            } else if (res && res.already){
              toast('Already found');
              nuggetEl.style.display = 'none';
              showProfile();
            } else {
              toast('Failed');
            }
          });
        });
      }
      var dailyNuggetEl = el('dailyHuntNuggetEl');
      if (dailyNuggetEl){
        dailyNuggetEl.addEventListener('click', function(){
          var adopted = getAdopted();
          if (!adopted) return;
          callClaimDailyNuggetHunt(adopted.name).then(function(res){
            if (res && res.ok){
              if (window.MTSS_SFX && typeof window.MTSS_SFX.playChaChing === 'function') window.MTSS_SFX.playChaChing();
              var label = (res.rarity_label && res.rarity_label !== 'Common') ? ' ' + res.rarity_label + '!' : '';
              toast('+' + (res.nuggets || 1) + ' nugget' + ((res.nuggets || 1) !== 1 ? 's' : '') + label + ' — Hidden nugget found!');
              if (res.secret_unlock) setTimeout(function(){ toast('Secret cosmetic unlocked! Equip it in Edit Profile.'); }, 600);
              dailyNuggetEl.style.display = 'none';
              refreshDailyHunt(adopted.name, 'index');
              showProfile();
            } else if (res && res.already){
              toast('Already claimed today');
              refreshDailyHunt(adopted.name, 'index');
              showProfile();
            } else {
              toast(res.error || 'Failed');
            }
          });
        });
      }
    }

    var profileWired = false;
    function wireEditProfile(){
      if (profileWired) return;
      profileWired = true;
      var overlay = el('editProfileOverlay');
      var form = el('editProfileForm');
      var framePicker = el('editProfileFramePicker');
      var themePicker = el('editProfileThemePicker');
      var featuredSelect = el('editProfileFeaturedPost');
    var currentAvatarStatus = null;

    function refreshProfileBalanceDisplay(res){
      if (!res || !res.ok || res.available == null) return;
      var n = Number(res.available) || 0;
      var be = el('balanceEl');
      var oldN = NaN;
      if (be && be.textContent) {
        var parsed = parseInt(String(be.textContent).trim(), 10);
        if (Number.isFinite(parsed)) oldN = parsed;
      }
      if (!Number.isFinite(oldN)) oldN = Number(studentProfileVM.nuggets) || 0;
      studentProfileVM.nuggets = n;
      if (be) {
        pulseNuggetDisplayIfGain(be, oldN, studentProfileVM.nuggets);
        be.textContent = String(studentProfileVM.nuggets);
      }
      updateNuggetProgress(studentProfileVM.nuggets);
    }

    function refreshWalletAfterAvatarPurchase(){
      if (window.LanternLockerMe && typeof window.LanternLockerMe.invalidateLockerMe === 'function') {
        window.LanternLockerMe.invalidateLockerMe();
      }
      var refresh = window.LanternWallet && window.LanternWallet.refreshAllVisible
        ? window.LanternWallet.refreshAllVisible({ force: true })
        : callGetBalance();
      return Promise.resolve(refresh).then(function(res){
        refreshProfileBalanceDisplay(res);
        return res;
      });
    }

      function buildFramePicker(selected){
        if (!framePicker) return;
        framePicker.innerHTML = '';
        FRAME_OPTIONS.forEach(function(o){
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'opt' + (o.v === selected ? ' selected' : '');
          btn.textContent = o.l;
          btn.dataset.value = o.v;
          btn.addEventListener('click', function(){
            framePicker.querySelectorAll('.opt').forEach(function(b){ b.classList.remove('selected'); });
            btn.classList.add('selected');
          });
          framePicker.appendChild(btn);
        });
      }

      function normalizeThemeForPicker(theme){
        var t = (theme || '').trim() || 'classic';
        if (t === 'default') return 'classic';
        if (t === 'warm') return 'sunset';
        if (t === 'cool') return 'midnight';
        return t;
      }
      function buildThemePicker(selected){
        var sel = normalizeThemeForPicker(selected);
        if (!themePicker) return;
        themePicker.innerHTML = '';
        THEME_OPTIONS.forEach(function(o){
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'opt' + (o.v === sel ? ' selected' : '');
          btn.textContent = o.l;
          btn.dataset.value = o.v;
          btn.addEventListener('click', function(){
            themePicker.querySelectorAll('.opt').forEach(function(b){ b.classList.remove('selected'); });
            btn.classList.add('selected');
          });
          themePicker.appendChild(btn);
        });
      }

      var COSMETIC_CATEGORIES = [
        { key: 'frame', label: 'Profile Frame' },
        { key: 'background', label: 'Page background' },
        { key: 'badge', label: 'Badge' },
        { key: 'accessory', label: 'Accessory' },
        { key: 'decoration', label: 'Decoration' },
        { key: 'accent', label: 'Card theme (from Store)', hint: 'Overrides Profile theme above. Rainbow, Glow, and Silver use Classic style.' }
      ];

      function buildCosmeticEquip(owned, equipped, cosmetics, opts){
        opts = opts || {};
        var wrap = el('editProfileCosmeticsEl');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (opts.equip_unavailable) {
          var msg = '<p class="note" style="margin:0;">Owned items sync from your account purchases. Equipping items requires server storage (not yet available).</p>';
          if (owned && owned.length) {
            msg += '<p class="note" style="margin:8px 0 0;">You own ' + owned.length + ' item(s) from Store purchases.</p>';
          }
          wrap.innerHTML = msg;
          return;
        }
        if (!owned || owned.length === 0){
          wrap.innerHTML = '<p class="note" style="margin:0;">No cosmetics yet. Buy some in the Store!</p>';
          return;
        }

        COSMETIC_CATEGORIES.forEach(function(cat){
          var ownedInCat = (cosmetics || []).filter(function(c){ return c.category === cat.key && owned.indexOf(c.id) >= 0; });
          if (ownedInCat.length === 0) return;
          var row = document.createElement('div');
          row.className = 'cosmeticEquipRow';

          var lbl = document.createElement('span');
          lbl.style.color = 'var(--muted)';
          lbl.style.fontWeight = '800';
          var currentName = '';
          if (equipped[cat.key]) {
            var current = ownedInCat.find(function(c){ return c.id === equipped[cat.key]; });
            currentName = current ? (current.name || current.id) : '';
          }
          lbl.textContent = cat.label + (currentName ? ' — ' + currentName : ':');
          row.appendChild(lbl);
          if (cat.hint) {
            var hintSpan = document.createElement('span');
            hintSpan.style.display = 'block';
            hintSpan.style.width = '100%';
            hintSpan.style.marginTop = '2px';
            hintSpan.style.marginBottom = '6px';
            hintSpan.style.fontSize = '18px';
            hintSpan.style.color = 'var(--muted)';
            hintSpan.textContent = cat.hint;
            row.appendChild(hintSpan);
          }

          var noneBtn = document.createElement('button');
          noneBtn.type = 'button';
          noneBtn.className = 'cosmeticEquipBtn' + (!equipped[cat.key] ? ' equipped' : '');
          noneBtn.textContent = '—';
          noneBtn.title = 'None';
          noneBtn.dataset.category = cat.key;
          noneBtn.dataset.id = '';
          noneBtn.addEventListener('click', function(){
            var adopted = getAdopted();
            if (!adopted) return;
            callEquipCosmetic(adopted.name, '', cat.key).then(function(r){
              if (r && r.ok){
                toast('Unequipped');
                var next = Object.assign({}, equipped);
                delete next[cat.key];
                buildCosmeticEquip(owned, next, cosmetics);
                showProfile();
              }
            });
          });
          row.appendChild(noneBtn);

          ownedInCat.forEach(function(c){
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cosmeticEquipBtn' + (equipped[cat.key] === c.id ? ' equipped' : '');
            btn.textContent = c.icon || '';
            btn.title = c.name || c.id;
            btn.dataset.category = cat.key;
            btn.dataset.id = c.id;
            btn.addEventListener('click', function(){
              var adopted = getAdopted();
              if (!adopted) return;
              callEquipCosmetic(adopted.name, c.id, cat.key).then(function(r){
                if (r && r.ok){
                  toast('Equipped');
                  var next = Object.assign({}, equipped, { [cat.key]: c.id });
                  buildCosmeticEquip(owned, next, cosmetics);
                  showProfile();
                }
              });
            });
            row.appendChild(btn);
          });

          wrap.appendChild(row);
        });

        // Optional: Style Studio / Remix — randomize from owned cosmetics
        if (owned && owned.length > 0){
          var studioRow = document.createElement('div');
          studioRow.className = 'cosmeticEquipRow';
          studioRow.style.marginTop = '12px';

          var studioLabel = document.createElement('span');
          studioLabel.style.color = 'var(--muted)';
          studioLabel.style.fontWeight = '800';
          studioLabel.textContent = 'Style Studio:';
          studioRow.appendChild(studioLabel);

          var remixBtn = document.createElement('button');
          remixBtn.type = 'button';
          remixBtn.className = 'cosmeticEquipBtn';
          remixBtn.textContent = 'Remix my look';
          remixBtn.title = 'Randomly equip a mix of your owned cosmetics';
          remixBtn.addEventListener('click', function(){
            var adopted = getAdopted();
            if (!adopted) return;
            var byCat = {};
            (cosmetics || []).forEach(function(c){
              if (owned.indexOf(c.id) >= 0){
                byCat[c.category] = byCat[c.category] || [];
                byCat[c.category].push(c);
              }
            });
            var promises = [];
            var nextEquipped = Object.assign({}, equipped);
            COSMETIC_CATEGORIES.forEach(function(cat){
              var list = byCat[cat.key] || [];
              if (!list.length) return;
              var pick = list[Math.floor(Math.random() * list.length)];
              promises.push(callEquipCosmetic(adopted.name, pick.id, cat.key).then(function(r){
                if (r && r.ok) nextEquipped[cat.key] = pick.id;
              }));
            });
            Promise.all(promises).then(function(){
              toast('Look remixed');
              buildCosmeticEquip(owned, nextEquipped, cosmetics);
              showProfile();
            });
          });
          studioRow.appendChild(remixBtn);
          wrap.appendChild(studioRow);
        }
      }

      function buildCosmeticBuyGrid(characterName, ownership, balance, cosmetics){
        var wrap = el('editProfileCosmeticsBuyEl');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!window.LanternCards || !window.LanternCards.specCosmeticRailCard || !window.LanternCards.createStudentCard){
          wrap.innerHTML = '<p class="note" style="margin:0;">Cards unavailable.</p>';
          return;
        }
        var LC = window.LanternCards;
        var RLAB = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
        function normR(r){
          var x = String(r || 'common').toLowerCase();
          if (['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(x) < 0) x = 'common';
          return x;
        }
        function nugImg(){
          return '<img src="assets/icons/nugget.png" class="exploreCardCosmeticNugget" alt="" width="30" height="30">';
        }
        function priceBandHtml(c, ownedFlag, isUnlockOnly){
          if (isUnlockOnly) return '<span class="exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--locked">Unlock only</span>';
          if (ownedFlag) return '<span class="exploreCardCosmeticPriceLabel exploreCardCosmeticPriceLabel--owned">Owned</span>';
          return nugImg() + '<span>' + esc(String(Number(c.cost) || 0)) + ' nuggets</span>';
        }
        var owned = (ownership && ownership.owned) || [];
        if (!cosmetics || cosmetics.length === 0){
          wrap.innerHTML = '<p class="note" style="margin:0;">No cosmetics available.</p>';
          return;
        }
        cosmetics.forEach(function(c){
          var ownedFlag = owned.indexOf(c.id) >= 0;
          var isUnlockOnly = c.purchasable === false;
          var canBuy = !isUnlockOnly && !ownedFlag && balance >= (Number(c.cost) || 0);
          var stateSub = (!ownedFlag && !canBuy && !isUnlockOnly) ? 'Locked' : '';
          var tapBuy = (!ownedFlag && canBuy && !isUnlockOnly) ? 'Tap card · Buy' : '';
          var card = LC.createStudentCard(LC.specCosmeticRailCard({
            title: c.name || c.id,
            icon: c.icon || '✨',
            rarityKey: normR(c.rarity),
            rarityLabel: RLAB[c.rarity || 'common'] || 'Common',
            subline: [stateSub, tapBuy].filter(Boolean).join(' · '),
            priceBandHtml: priceBandHtml(c, ownedFlag, isUnlockOnly),
            stateOwned: ownedFlag,
            stateLocked: isUnlockOnly,
            stateNeed: !ownedFlag && !canBuy && !isUnlockOnly,
            reportId: c.id,
            dataAttrs: { 'cosmetic-id': String(c.id) }
          }));
          if (!card) return;
          wrap.appendChild(card);
          if (!ownedFlag && canBuy && !isUnlockOnly && characterName){
            card.classList.add('exploreCard--activatable');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.addEventListener('click', function(ev){
              if (ev.target.closest('.exploreCardReportBtn')) return;
              if (card.getAttribute('data-lc-profile-buying') === '1') return;
              card.setAttribute('data-lc-profile-buying', '1');
              callPurchaseCosmetic(characterName, c.id).then(function(r){
                card.removeAttribute('data-lc-profile-buying');
                if (r && r.ok){
                  toast('Purchased! Equip it above.');
                  callGetCosmeticOwnership(characterName).then(function(o){
                    callGetBalance().then(function(bRes){
                      var nextOwnership = o || { owned: [], equipped: {} };
                      var nextBalance = (bRes && bRes.ok && bRes.available != null && Number.isFinite(Number(bRes.available)))
                        ? Number(bRes.available)
                        : 0;
                      buildCosmeticEquip(nextOwnership.owned || [], nextOwnership.equipped || {}, cosmetics);
                      buildCosmeticBuyGrid(characterName, nextOwnership, nextBalance, cosmetics);
                      showProfile();
                    });
                  });
                } else {
                  toast(r.error || 'Purchase failed');
                }
              });
            });
          }
        });
      }

      function populateForm(profile, posts, adopted, ownership, cosmetics, avatarStatus, balance){
        el('editProfileDisplayName').value = profile.display_name || '';
        var heroInput = el('editProfileHeroTitle');
        if (heroInput) heroInput.value = profile.hero_title || '';
        el('editProfileBio').value = profile.bio || '';
        currentAvatarStatus = avatarStatus && avatarStatus.status ? avatarStatus.status : {};
        var uploadStatusEl = el('avatarUploadStatus');
        if (uploadStatusEl){
          uploadStatusEl.textContent = currentAvatarStatus.active_image
            ? 'Your current avatar is shown on your profile. Ask an administrator to change it.'
            : 'No avatar assigned yet. Ask an administrator if you need one.';
          uploadStatusEl.style.color = 'var(--muted)';
        }
        buildFramePicker(profile.frame || 'none');
        buildThemePicker(normalizeThemeForPicker(profile.theme));
        buildCosmeticEquip(ownership.owned || [], ownership.equipped || {}, cosmetics || [], {
          equip_unavailable: !!ownership.equip_unavailable,
        });
        if (featuredSelect){
          featuredSelect.innerHTML = '<option value="">None</option>';
          (posts || []).forEach(function(p){
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.title || 'Untitled') + (p.pinned ? ' 📌' : '');
            if (p.id === (profile.featured_post_id || '')) opt.selected = true;
            featuredSelect.appendChild(opt);
          });
        }
        buildPraiseButtons(adopted && adopted.name || '', profile.praise_types || []);
      }

      function buildPraiseButtons(characterName, selectedTypes){
        var wrap = el('editProfilePraiseButtons');
        var previewRow = el('praisePreviewEl');
        var previewEmojis = el('praisePreviewEmojisEl');
        var previewZero = el('praisePreviewZeroEl');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!characterName || !window.LANTERN_REACTIONS || !window.LANTERN_REACTIONS.REACTION_VOCAB) return;
        var vocab = window.LANTERN_REACTIONS.REACTION_VOCAB;
        var selectedSet = {};
        (selectedTypes || []).forEach(function(t){ selectedSet[String(t).toLowerCase()] = true; });

        function updatePreview(){
          var types = [];
          wrap.querySelectorAll('input[data-reaction-type]:checked').forEach(function(c){ types.push(c.getAttribute('data-reaction-type')); });
          var selected = vocab.filter(function(r){ return selectedSet[r.type]; });
          if (previewEmojis) previewEmojis.textContent = selected.length > 0 ? selected.map(function(r){ return r.emoji; }).join(' ') : '';
          if (previewZero) previewZero.style.display = selected.length > 0 ? 'none' : 'inline';
        }

        vocab.forEach(function(r){
          var isSelected = !!selectedSet[r.type];
          var label = document.createElement('label');
          label.className = 'praiseOption' + (isSelected ? ' is-selected' : '');
          label.setAttribute('data-reaction-type', r.type);
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.setAttribute('data-reaction-type', r.type);
          cb.checked = isSelected;
          cb.addEventListener('change', function(){
            selectedSet[r.type] = cb.checked;
            label.classList.toggle('is-selected', cb.checked);
            var types = [];
            wrap.querySelectorAll('input[data-reaction-type]:checked').forEach(function(c){ types.push(c.getAttribute('data-reaction-type')); });
            var sel = vocab.filter(function(v){ return types.indexOf(v.type) >= 0; });
            if (previewEmojis) previewEmojis.textContent = sel.length > 0 ? sel.map(function(v){ return v.emoji; }).join(' ') : '';
            if (previewZero) previewZero.style.display = sel.length > 0 ? 'none' : 'inline';
            if (window.LANTERN_REACTIONS && window.LANTERN_REACTIONS.setPraisePreferences) {
              window.LANTERN_REACTIONS.setPraisePreferences(characterName, types).then(function(res){
                if (res && res.ok && toast) toast('Praise buttons updated');
              });
            }
          });
          label.appendChild(cb);
          label.appendChild(document.createTextNode(r.emoji + ' ' + (r.label || r.type)));
          wrap.appendChild(label);
        });
        updatePreview();
      }

      if (el('editProfileBtn')) el('editProfileBtn').addEventListener('click', function(){
        var adopted = getAdopted();
        if (!adopted) return;
        var promises = [
          callGetProfile(adopted.name),
          callGetPosts(adopted.name),
          callGetCosmeticOwnership(adopted.name),
          callGetAvatarStatus(adopted.name),
          callGetBalance()
        ];
        if (window.LANTERN_REACTIONS && window.LANTERN_REACTIONS.getPraisePreferences) {
          promises.push(window.LANTERN_REACTIONS.getPraisePreferences(adopted.name));
        } else {
          promises.push(Promise.resolve({ ok: true, reaction_types: [] }));
        }
        Promise.all(promises).then(function(results){
          var profile = (results[0] && results[0].profile) || {};
          var posts = (results[1] && results[1].posts) || [];
          var ownership = results[2] || { owned: [], equipped: {} };
          var avatarStatus = results[3] || { status: {} };
          var balanceRes = results[4] || {};
          var balance = (balanceRes && balanceRes.ok && balanceRes.available != null && Number.isFinite(Number(balanceRes.available)))
            ? Number(balanceRes.available)
            : 0;
          var praiseRes = results[5] || {};
          if (praiseRes && praiseRes.ok && praiseRes.reaction_types) profile.praise_types = praiseRes.reaction_types;
          var cosmetics = (window.LANTERN_DATA && window.LANTERN_DATA.getCosmetics) ? window.LANTERN_DATA.getCosmetics() : [];
          populateForm(profile, posts, adopted, ownership, cosmetics, avatarStatus, balance);
          if (overlay) overlay.classList.add('show');
        });
      });

      if (el('editProfileCloseBtn')) el('editProfileCloseBtn').addEventListener('click', function(){ if (overlay) overlay.classList.remove('show'); });
      if (overlay) overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.classList.remove('show'); });

      var openUploadBtn = el('openAvatarUploadBtn');
      if (openUploadBtn){
        openUploadBtn.hidden = true;
        openUploadBtn.setAttribute('hidden', 'hidden');
        openUploadBtn.style.display = 'none';
      }

      var fileInput = el('avatarFileInput');
      if (fileInput && fileInput.parentNode){
        fileInput.parentNode.removeChild(fileInput);
      }

      if (form){
        form.addEventListener('submit', function(e){
          e.preventDefault();
          var adopted = getAdopted();
          if (!adopted) return;
          var displayName = (el('editProfileDisplayName').value || '').trim();
          var heroTitle = el('editProfileHeroTitle') ? (el('editProfileHeroTitle').value || '').trim() : '';
          var bio = (el('editProfileBio').value || '').trim();
          var frameSel = framePicker && framePicker.querySelector('.opt.selected');
          var frame = frameSel ? frameSel.dataset.value : 'none';
          var themeSel = themePicker && themePicker.querySelector('.opt.selected');
          var theme = themeSel ? themeSel.dataset.value : 'classic';
          var featuredPostId = featuredSelect ? (featuredSelect.value || '').trim() : '';
          callSaveProfile(adopted.name, {
            display_name: displayName,
            hero_title: heroTitle,
            bio: bio,
            frame: frame,
            theme: theme,
            featured_post_id: featuredPostId
          }).then(function(res){
            if (res && res.ok){
              toast('Profile saved');
              var editOverlay = document.getElementById('editProfileOverlay');
              if (editOverlay) editOverlay.classList.remove('show');
              showProfile();
            } else {
              toast('Failed to save');
            }
          }).catch(function(){
            toast('Failed to save');
          });
        });
      }
    }

    var postsWired = false;
    function wirePostsUI(){
      if (postsWired) return;
      postsWired = true;
      /* Prompt #117 ARCHIVE: Profile post creation entry retired — do not deep-link to archived Create mode. */
      if (el('newPostBtn')) {
        el('newPostBtn').style.display = 'none';
        el('newPostBtn').setAttribute('aria-hidden', 'true');
        el('newPostBtn').addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          window.location.href = 'contribute.html';
        });
      }
      var pnat = el('profileNewsAuthorType');
      if (pnat && !pnat._lanternProfileNewsAuthorBound){
        pnat._lanternProfileNewsAuthorBound = true;
        pnat.addEventListener('change', function(){
          setProfileNewsAuthorType(pnat.value);
          renderProfileMyArticles();
        });
      }
    }

    function submitForApproval(){
      var adopted = getAdopted();
      var run = createRun ? createRun() : null;
      if (!adopted || !run) return;
      run.withSuccessHandler(function(){ toast('Submitted for approval'); showProfile(); }).withFailureHandler(function(){ toast('Failed'); }).submitForApproval({ character_name: adopted.name, submission_type: 'mission', note: 'Test submission' });
    }

    /** Student switch control removed — Locker identity comes from the server session only. */
    function wireSwitchStudentButtonOnce(){}

    /** Beta report overlay: no opener button on Locker after Testing Controls removal; wiring stays safe if markup is reintroduced. */
    function wireBetaReportOnce(){
      if (window._lanternBetaReportWired) return;
      var overlay = el('betaReportOverlay');
      var openBtn = el('reportBetaIssueBtn');
      var closeBtn = el('betaReportCloseBtn');
      var cancelBtn = el('betaReportCancelBtn');
      var form = document.getElementById('betaReportForm');
      if (!overlay || !openBtn || !form) return;
      window._lanternBetaReportWired = true;
      function openBetaReport(){ overlay.style.display = 'flex'; }
      function closeBetaReport(){ overlay.style.display = 'none'; form.reset(); }
      openBtn.addEventListener('click', openBetaReport);
      if (closeBtn) closeBtn.addEventListener('click', closeBetaReport);
      if (cancelBtn) cancelBtn.addEventListener('click', closeBetaReport);
      form.addEventListener('submit', function(e){
        e.preventDefault();
        var apiBase = (typeof window !== 'undefined' && typeof window.LANTERN_AVATAR_API !== 'undefined' && window.LANTERN_AVATAR_API !== null) ? String(window.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
        if (apiBase === null){ toast('Beta reporting requires the API to be set.'); return; }
        var adopted = getAdopted();
        var reporterName = (adopted && adopted.name) ? adopted.name : 'Anonymous';
        var descEl = document.getElementById('betaReportDescription');
        var pageEl = document.getElementById('betaReportPage');
        var screenshotEl = document.getElementById('betaReportScreenshot');
        var description = (descEl && descEl.value || '').trim();
        if (!description){ toast('Please enter a description.'); return; }
        var payload = { reporter_name: reporterName, page: (pageEl && pageEl.value) || 'Other', description: description, screenshot_url: (screenshotEl && screenshotEl.value || '').trim() || null };
        fetch(apiBase + '/api/beta-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          .then(function(r){ return r.json(); })
          .then(function(res){
            if (res && res.ok){ toast('Report submitted. Thank you!'); closeBetaReport(); }
            else { toast(res && res.error ? res.error : 'Submit failed'); }
          })
          .catch(function(){ toast('Submit failed'); });
      });
    }

    /* All profile entry points (nav, student switch, redirects, deep links) converge here. When verify mode uses cloud, identity may be set async; runProfileEntry runs once identity is ready or when API is off. */
    wireProfileWalletVisibilityOnce();
    safeProfileStep('wireBetaReport', wireBetaReportOnce);
    runProfileEntry = function(){ showProfile(); };
    if (!lockerBootPending) runProfileEntry();

    /* Class access bootstrap runs from js/class-access.js on DOMContentLoaded. */