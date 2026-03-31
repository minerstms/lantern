    /* ===== Bootstrap: ensure base data exists ===== */
    (function(){
      try {
        if (window.LANTERN_DATA && window.LANTERN_DATA.ensureCharacters) window.LANTERN_DATA.ensureCharacters();
        if (window.LANTERN_DATA && window.LANTERN_DATA.ensureCatalog) window.LANTERN_DATA.ensureCatalog();
        if (window.LANTERN_DATA && window.LANTERN_DATA.ensureStartupMode) window.LANTERN_DATA.ensureStartupMode();
      } catch (e) {}
    })();

    /* ===== PRESERVED: Core logic ===== */
    var createRun = (typeof LANTERN_API !== 'undefined' && LANTERN_API.createRun) ? LANTERN_API.createRun : null;
    const LS_ADOPTED = 'LANTERN_ADOPTED_CHARACTER';

    var VERIFY_STUDENT_DISPLAY_NAMES = { zane_morrison: 'Zane Morrison', winnie_addair: 'Winnie Addair', brett_simms: 'Brett Simms', kimber_pace: 'Kimber Pace', velma_voss: 'Velma Voss', archie_rivers: 'Archie Rivers', raven_hart: 'Raven Hart', tori_sparks: 'Tori Sparks', miles_parker: 'Miles Parker', lola_luna: 'Lola Luna' };

    var verifyStudentContext = null;
    var studentVerifyIdentitySource = '';
    var studentIdentityFetchPending = false;
    var runProfileEntry = function(){};
    (function(){
      try {
        var params = new URLSearchParams(typeof location !== 'undefined' && location.search || '');
        var sim = params.get('simStudent');
        if (sim && String(sim).trim()) {
          var cname = String(sim).trim();
          verifyStudentContext = { character_name: cname, display_name: VERIFY_STUDENT_DISPLAY_NAMES[cname] || cname, avatar: '🌟' };
          studentVerifyIdentitySource = 'URL';
        }
      } catch(e) {}
    })();

    var VERIFY_STUDENT_AVATAR_PATHS = { zane_morrison: 'avatars/students/zane_morrison.png', winnie_addair: 'avatars/students/winnie_addair.png', brett_simms: 'avatars/students/brett_simms.png', kimber_pace: 'avatars/students/kimber_pace.png', velma_voss: 'avatars/students/velma_voss.png', archie_rivers: 'avatars/students/archie_rivers.png', raven_hart: 'avatars/students/raven_hart.png', tori_sparks: 'avatars/students/tori_sparks.png', miles_parker: 'avatars/students/miles_parker.png', lola_luna: 'avatars/students/lola_luna.png' };
    function updateStudentVerifyBanner(){
      var banner = document.getElementById('studentVerifyBanner');
      if (!banner) return;
      if (!verifyStudentContext) { banner.classList.remove('is-active'); return; }
      banner.classList.add('is-active');
      var srcEl = document.getElementById('studentVerifySource'); if (srcEl) srcEl.textContent = studentVerifyIdentitySource || 'Cloud';
      var nameEl = document.getElementById('studentVerifyDisplayName'); if (nameEl) nameEl.textContent = verifyStudentContext.display_name || verifyStudentContext.character_name || '—';
      var charEl = document.getElementById('studentVerifyCharacterName'); if (charEl) charEl.textContent = verifyStudentContext.character_name || '—';
      var emojiEl = document.getElementById('studentVerifyAvatarEmoji');
      var imgEl = document.getElementById('studentVerifyAvatarImg');
      if (emojiEl) { emojiEl.textContent = verifyStudentContext.avatar || '🌟'; emojiEl.setAttribute('aria-hidden', 'false'); }
      var avatarPath = VERIFY_STUDENT_AVATAR_PATHS[verifyStudentContext.character_name] || ('avatars/students/' + (verifyStudentContext.character_name || '') + '.png');
      if (imgEl && emojiEl && verifyStudentContext.character_name) {
        imgEl.alt = (verifyStudentContext.display_name || verifyStudentContext.character_name) + ' avatar';
        imgEl.src = avatarPath;
        imgEl.style.display = '';
        emojiEl.style.display = 'none';
        imgEl.onerror = function(){ imgEl.style.display = 'none'; emojiEl.style.display = ''; };
      } else if (imgEl) { imgEl.removeAttribute('src'); imgEl.style.display = 'none'; if (emojiEl) emojiEl.style.display = ''; }
    }

    const el = (id)=>document.getElementById(id);
    const toastEl = el('toast');

    function toast(msg){
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      clearTimeout(toastEl._t);
      toastEl._t = setTimeout(function(){ toastEl.style.display='none'; }, 2400);
    }

    function getAdopted(){
      if (verifyStudentContext) return { character_id: verifyStudentContext.character_name, name: verifyStudentContext.character_name, avatar: verifyStudentContext.avatar || '🌟' };
      try{
        var raw = localStorage.getItem(LS_ADOPTED);
        if (!raw) return null;
        var a = JSON.parse(raw);
        if (a && a.isTest && a.expires_at) {
          if (new Date(a.expires_at) <= new Date()) {
            try { localStorage.removeItem(LS_ADOPTED); } catch(e) {}
            return null;
          }
        }
        return a;
      }catch(e){ return null; }
    }

    function getStudentDisplayName(){
      if (verifyStudentContext) return verifyStudentContext.display_name || verifyStudentContext.character_name || '';
      try {
        var v = localStorage.getItem('LANTERN_VERIFY_NAME');
        if (v && String(v).trim()) return String(v).trim();
      } catch(e) {}
      var a = getAdopted();
      if (a && a.display_name && String(a.display_name).trim()) return String(a.display_name).trim();
      return (a && a.name) ? String(a.name) : '';
    }

    function setAdopted(char){
      try{
        localStorage.setItem(LS_ADOPTED, JSON.stringify(char));
      }catch(e){}
    }

    (function(){
      var apiBase = (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
      var params = new URLSearchParams(typeof location !== 'undefined' && location.search || '');
      if (params.get('simStudent')) return;
      if (!apiBase) return;
      studentIdentityFetchPending = true;
      var verifyP = fetch(apiBase + '/api/verify/state').then(function(r){ return r.json(); }).catch(function(){ return null; });
      var pilotP = fetch(apiBase + '/api/auth/me', { credentials: 'include' }).then(function(r){ return r.json(); }).catch(function(){ return null; });
      Promise.all([verifyP, pilotP]).then(function(pair){
        var res = pair[0];
        var pilot = pair[1];
        if (pilot && pilot.ok && pilot.authenticated && String(pilot.role || '').trim() === 'student') {
          verifyStudentContext = null;
          if (window.LanternPilotAuth && typeof window.LanternPilotAuth.applyStudentStorageFromSession === 'function') {
            window.LanternPilotAuth.applyStudentStorageFromSession(pilot);
          }
        } else if (res && res.ok && res.state && res.state.character_name) {
          var c = String(res.state.character_name).trim();
          var d = (res.state.display_name && String(res.state.display_name).trim()) || VERIFY_STUDENT_DISPLAY_NAMES[c] || c;
          verifyStudentContext = { character_name: c, display_name: d, avatar: '🌟' };
          studentVerifyIdentitySource = 'Cloud';
        }
        studentIdentityFetchPending = false;
        runProfileEntry();
        if (typeof updateStudentVerifyBanner === 'function') updateStudentVerifyBanner();
      }).catch(function(){
        studentIdentityFetchPending = false;
        runProfileEntry();
      });
    })();
    var profileStats = { creations: null, achievements: null, recognitions: null };
    var lanternWinsState = { rec: [], hist: [], spotlight: false };
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

    var FALLBACK_CHARACTERS = [
      { character_id: 'char1', name: 'Alex Adventure', avatar: '🌟', balance: 10, owned: [] },
      { character_id: 'char2', name: 'Sam Star', avatar: '⭐', balance: 5, owned: [] },
      { character_id: 'char3', name: 'Jordan Joy', avatar: '✨', balance: 15, owned: [] },
      { character_id: 'char4', name: 'Casey Cool', avatar: '🎯', balance: 0, owned: [] },
      { character_id: 'char5', name: 'Riley Rise', avatar: '🚀', balance: 8, owned: [] },
    ];
    function getCharacters(){
      var chars = (window.LANTERN_DATA && window.LANTERN_DATA.ensureCharacters) ? window.LANTERN_DATA.ensureCharacters() : [];
      if (!chars || chars.length === 0) chars = (window.LANTERN_DATA && window.LANTERN_DATA.DEFAULT_CHARACTERS) ? window.LANTERN_DATA.DEFAULT_CHARACTERS.slice() : FALLBACK_CHARACTERS.slice();
      return chars;
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

    var economyApiBase = (typeof window !== 'undefined' && (window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API)) ? (window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
    function callGetBalance(name){
      if (economyApiBase) {
        return fetch(economyApiBase + '/api/economy/balance?character_name=' + encodeURIComponent(name)).then(function(r){ return r.json(); }).then(function(res){
          if (res && res.ok) return { ok: true, available: res.balance, earned: res.earned, spent: res.spent };
          return { ok: false, available: 0 };
        }).catch(function(){ return { ok: false, available: 0 }; });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, available: 0 });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, available: 0 }); }).storeGetBalance({ student_name: name });
      });
    }
    function callEconomyTransact(characterName, delta, kind, source, note, meta){
      if (!economyApiBase) return Promise.resolve({ ok: false, error: 'Economy API not configured' });
      return fetch(economyApiBase + '/api/economy/transact', {
        method: 'POST',
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
      var base = (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
      if (base) {
        return fetch(base + '/api/avatar/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character_name: name, image: imageData })
        }).then(function(r){ return r.json(); }).then(function(upRes){
          if (!upRes || !upRes.ok) return Promise.reject(new Error(upRes && upRes.error || 'Upload failed'));
          if (economyApiBase) {
            return callEconomyTransact(name, -cost, 'avatar_upload', '', 'Avatar upload', {}).then(function(tRes){
              if (!tRes || !tRes.ok) return Promise.reject(new Error(tRes && tRes.error || 'Deduction failed'));
              return { ok: true, id: upRes.id, image_url: upRes.image_url, status: upRes.status };
            });
          }
          var run = createRun ? createRun() : null;
          if (!run) return { ok: true, id: upRes.id, image_url: upRes.image_url, status: upRes.status };
          return new Promise(function(resolve, reject){
            run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(err){ reject(err); }).submitAvatarUpload({ character_name: name, image_data: imageData, cost: cost, backend_only: true });
          }).then(function(){ return { ok: true, id: upRes.id, image_url: upRes.image_url, status: upRes.status }; });
        }).catch(function(err){ return { ok: false, error: String(err && err.message || err) }; });
      }
      if (economyApiBase) {
        return callEconomyTransact(name, -cost, 'avatar_upload', '', 'Avatar upload', {}).then(function(tRes){
          if (!tRes || !tRes.ok) return { ok: false, error: tRes && tRes.error || 'Deduction failed' };
          var run = createRun ? createRun() : null;
          if (!run) return { ok: true, id: 'local', status: 'pending' };
          return new Promise(function(resolve, reject){
            run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(err){ reject(err); }).submitAvatarUpload({ character_name: name, image_data: imageData, cost: cost, economy_backend_charged: true });
          }).then(function(r){ return { ok: true, id: (r && r.id) || 'local', status: 'pending' }; });
        }).catch(function(err){ return { ok: false, error: String(err && err.message || err) }; });
      }
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(err){ resolve({ ok: false, error: String(err && err.message || err) }); }).submitAvatarUpload({ character_name: name, image_data: imageData, cost: cost });
      });
    }

    function callGetAvatarStatus(name){
      var base = (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
      if (base) {
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
      var apiBase = (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
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
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, owned: [], equipped: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false, owned: [], equipped: {} }); }).getCosmeticOwnership({ character_name: name });
      });
    }

    function callEquipCosmetic(name, cosmeticId, category){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r); }).withFailureHandler(function(){ resolve({ ok: false }); }).equipCosmetic({ character_name: name, cosmetic_id: cosmeticId || '', category: category });
      });
    }

    function callPurchaseCosmetic(characterName, cosmeticId){
      var cosmetics = (window.LANTERN_DATA && window.LANTERN_DATA.getCosmetics) ? window.LANTERN_DATA.getCosmetics() : [];
      var c = cosmetics.find(function(x){ return x.id === cosmeticId; });
      if (!c || c.purchasable === false) return Promise.resolve({ ok: false, error: 'Cosmetic not found or unlock only' });
      var cost = Number(c.cost) || 0;
      if (economyApiBase) {
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
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ ok: false, error: String(err && err.message || err) }); }).purchaseCosmetic({ character_name: characterName, cosmetic_id: cosmeticId });
      });
    }

    function callClaimDailyCheckIn(name){
      if (economyApiBase) {
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
      if (economyApiBase) {
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
      if (economyApiBase) {
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
    var myCreationsSearchQuery = '';
    function getProfileApiBase(){
      return (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
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
      var apiBase = getProfileApiBase();
      var adopted = getAdopted();
      /* Must match missions.html / contribute.html / explore: API rows are keyed by canonical character_name (character_id), not display name. */
      var characterNameForApi = adopted && String((adopted.character_id || adopted.name || '')).trim();
      /* News student submissions store author_name from contribute (display name). */
      var newsAuthorMine = adopted && String((adopted.name || adopted.character_id || '')).trim();
      if (!apiBase || !characterNameForApi) return Promise.resolve([]);

      var urlPoll = apiBase + '/api/polls/contributions?character_name=' + encodeURIComponent(characterNameForApi);
      var urlMiss = apiBase + '/api/missions/submissions/character?character_name=' + encodeURIComponent(characterNameForApi);
      var urlNews = apiBase + '/api/news/mine?author_name=' + encodeURIComponent(newsAuthorMine);

      var pPoll = fetch(urlPoll).then(function(r){ return r.json(); }).then(function(res){ return (res && res.contributions) || []; }).catch(function(){ return []; });
      var pMiss = fetch(urlMiss).then(function(r){ return r.json(); }).then(function(res){ return (res && res.ok && res.submissions) ? res.submissions : []; }).catch(function(){ return []; });
      var pNews = fetch(urlNews).then(function(r){ return r.json(); }).then(function(res){ return (res && res.ok && res.news) ? res.news : []; }).catch(function(){ return []; });

      return Promise.all([pPoll, pMiss, pNews]).then(function(arr){
        var out = [];
        (arr[0] || []).forEach(function(item){ if (item && item.id) out.push(normalizePollContributionItem(item)); });
        (arr[1] || []).forEach(function(s){ if (s && s.id) out.push(normalizeMissionSubmissionItem(s)); });
        (arr[2] || []).forEach(function(n){ if (n && n.id) out.push(normalizeNewsSubmissionItem(n)); });
        try {
          console.log('[profile][my-creations] bundle', { character_name: characterNameForApi, news_author_name: newsAuthorMine, total: out.length });
        } catch(_) {}
        return out;
      });
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
      if (!apiBase) return Promise.resolve({ ok: false, news: [] });
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

    var submissionsStatusFilter = 'all';
    var currentProfile = null;
    var AVATAR_OPTIONS = ['🌟','⭐','✨','🎯','🚀','🎨','📚','🔥','💡','🌈']; // legacy emoji choices
    var FRAME_OPTIONS = [{ v: 'none', l: 'None' }, { v: 'gold', l: 'Gold' }, { v: 'blue', l: 'Blue' }, { v: 'green', l: 'Green' }, { v: 'purple', l: 'Purple' }];
    /* Supported profile themes: internal key and user-facing name. Same set drives body[data-theme] and hero theme tint/cards. */
    var THEME_OPTIONS = [
      { v: 'classic', l: 'Classic Lantern' },
      { v: 'midnight', l: 'Midnight Blue' },
      { v: 'sunset', l: 'Sunset Gold' },
      { v: 'forest', l: 'Forest Green' },
      { v: 'violet', l: 'Cosmic Violet' }
    ];

    // Avatar builder part options (first version)
    var AVATAR_BODY_OPTIONS = [
      { id: 'light', label: 'Light' },
      { id: 'medium', label: 'Medium' },
      { id: 'deep', label: 'Deep' },
    ];
    var AVATAR_HAIR_OPTIONS = [
      { id: 'brown_short', label: 'Short Brown' },
      { id: 'black_curly', label: 'Curly Black' },
      { id: 'blonde_long', label: 'Long Blonde' },
      { id: 'red_bun', label: 'Red Bun' },
    ];
    var AVATAR_FACE_OPTIONS = [
      { id: 'smile', label: 'Smile' },
      { id: 'confident', label: 'Confident' },
      { id: 'thoughtful', label: 'Thoughtful' },
    ];
    var AVATAR_TOP_OPTIONS = [
      { id: 'hoodie_blue', label: 'Blue Hoodie' },
      { id: 'hoodie_purple', label: 'Purple Hoodie' },
      { id: 'tee_orange', label: 'Orange Tee' },
      { id: 'tee_green', label: 'Green Tee' },
    ];
    var AVATAR_BOTTOM_OPTIONS = [
      { id: 'jeans', label: 'Jeans' },
      { id: 'black', label: 'Black Pants' },
      { id: 'grey', label: 'Grey Pants' },
      { id: 'red', label: 'Red Pants' },
    ];
    var AVATAR_ACCESSORY_OPTIONS = [
      { id: 'none', label: 'None' },
      { id: 'headphones', label: 'Headphones' },
      { id: 'glasses', label: 'Glasses' },
      { id: 'star_pin', label: 'Star Pin' },
    ];

    var DEFAULT_AVATAR_PARTS = {
      body: 'medium',
      hair: 'brown_short',
      face: 'smile',
      top: 'hoodie_blue',
      bottom: 'jeans',
      accessory: 'none',
    };

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
      var apiBase = (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
      if (!apiBase) return;
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

    /* ===== Student picker (when no student selected) — canonical avatar: approved image > legacy emoji > default ===== */
    function refreshStudentPickerAvatars(listEl){
      var list = listEl || el('characterList');
      if (!list || typeof window.LanternAvatar === 'undefined' || !window.LanternAvatar.getCanonicalAvatar) return;
      var buttons = list.querySelectorAll('.adopt-char-btn');
      [].forEach.call(buttons, function(btn){
        var name = (btn.dataset && btn.dataset.name) || '';
        var emoji = (btn.dataset && btn.dataset.avatar) || '🌟';
        window.LanternAvatar.getCanonicalAvatar(name, emoji).then(function(r){
          var first = btn.firstElementChild;
          if (!first) return;
          if (r.imageUrl){
            var img = document.createElement('img');
            img.src = r.imageUrl;
            img.alt = '';
            img.style.cssText = 'width:36px;height:36px;margin-right:12px;object-fit:cover;border-radius:50%;';
            first.parentNode.replaceChild(img, first);
          } else {
            first.textContent = r.emoji;
          }
        });
      });
    }
    function renderPicker(){
      var chars = getCharacters();
      var list = el('characterList');
      if (!list) return;
      list.innerHTML = '';
      chars.forEach(function(c){
        var btn = document.createElement('button');
        btn.className = 'btn primary adopt-char-btn';
        btn.setAttribute('data-id', c.character_id || '');
        btn.setAttribute('data-name', c.name || '');
        btn.setAttribute('data-avatar', c.avatar || '🌟');
        btn.style.marginBottom = '10px';
        btn.style.width = '100%';
        btn.style.justifyContent = 'flex-start';
        btn.innerHTML = '<span style="font-size:36px;margin-right:12px;">' + (c.avatar || '🌟') + '</span><span>' + (c.name || '') + '</span>';
        btn.addEventListener('click', function(){
          setAdopted({ character_id: c.character_id, name: c.name, avatar: c.avatar || '🌟' });
          testingWired = false;
          postsWired = false;
          showProfile();
        });
        list.appendChild(btn);
      });
      var apiBase = (typeof window !== 'undefined' && (window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API)) ? String(window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API).replace(/\/$/, '') : '';
      if (apiBase) {
        fetch(apiBase + '/api/test-students').then(function(r){ return r.json(); }).then(function(res){
          if (!res || !res.ok || !res.test_students || !res.test_students.length) return;
          res.test_students.forEach(function(t){
            var btn = document.createElement('button');
            btn.className = 'btn adopt-char-btn';
            btn.setAttribute('data-id', t.id || '');
            btn.setAttribute('data-name', t.character_name || '');
            btn.setAttribute('data-display-name', t.display_name || '');
            btn.setAttribute('data-expires', t.expires_at || '');
            btn.style.marginBottom = '10px';
            btn.style.width = '100%';
            btn.style.justifyContent = 'flex-start';
            btn.innerHTML = '<span style="font-size:36px;margin-right:12px;">🧪</span><span>' + (t.display_name || t.character_name) + '</span><span style="margin-left:8px;font-size:18px;color:var(--muted);">(Test)</span>';
            btn.addEventListener('click', function(){
              setAdopted({ name: t.character_name, display_name: t.display_name || t.character_name, avatar: '🧪', isTest: true, expires_at: t.expires_at });
              testingWired = false;
              postsWired = false;
              showProfile();
            });
            list.appendChild(btn);
          });
        }).catch(function(){});
      }
      refreshStudentPickerAvatars(list);
      wireCreateTestStudentModal();
    }

    function wireCreateTestStudentModal(){
      var overlay = el('createTestStudentOverlay');
      var openBtn = el('createTestStudentBtn');
      var closeBtn = el('createTestStudentClose');
      var cancelBtn = el('createTestStudentCancel');
      var submitBtn = el('createTestStudentSubmit');
      var nameInput = el('createTestStudentName');
      if (!overlay || !openBtn) return;
      if (openBtn._testStudentWired) return;
      openBtn._testStudentWired = true;
      function openModal(){ overlay.style.display = 'flex'; overlay.classList.add('show'); if (nameInput) nameInput.value = ''; var r = document.querySelector('input[name="createTestStudentDuration"]:checked'); if (r) r.checked = true; }
      function closeModal(){ overlay.style.display = 'none'; overlay.classList.remove('show'); }
      openBtn.addEventListener('click', openModal);
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });
      if (submitBtn && nameInput) {
        submitBtn.addEventListener('click', function(){
          var displayName = (nameInput.value || '').trim();
          if (!displayName) { toast('Enter a name'); return; }
          var durationRadio = document.querySelector('input[name="createTestStudentDuration"]:checked');
          var durationDays = durationRadio ? parseInt(durationRadio.value, 10) : 1;
          var apiBase = (typeof window !== 'undefined' && (window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API)) ? String(window.LANTERN_ECONOMY_API || window.LANTERN_AVATAR_API).replace(/\/$/, '') : '';
          if (!apiBase) { toast('Test students require the API'); return; }
          submitBtn.disabled = true;
          fetch(apiBase + '/api/test-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: displayName, duration_days: durationDays })
          }).then(function(r){ return r.json(); }).then(function(res){
            submitBtn.disabled = false;
            if (!res || !res.ok) { toast((res && res.error && res.error !== 'Not found') ? res.error : 'Could not create test student'); return; }
            closeModal();
            setAdopted({ name: res.character_name, display_name: res.display_name || res.character_name, avatar: '🧪', isTest: true, expires_at: res.expires_at });
            toast('You are now testing as ' + (res.display_name || res.character_name));
            testingWired = false;
            postsWired = false;
            showProfile();
          }).catch(function(){
            submitBtn.disabled = false;
            toast('Failed to create test student');
          });
        });
      }
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
      var spotSel = '#profileView .profileHero, #profileView .card, #profileView .section';
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
      if (s === 'pending') return 'Pending';
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

    function prepareProfileNeedsAttentionFromHash(){
      if ((location.hash || '') !== '#profileNeedsAttention') return;
      submissionsStatusFilter = 'returned';
      var tabsContainer = el('myCreationsTabs');
      if (tabsContainer) {
        tabsContainer.querySelectorAll('.contentTab').forEach(function(t){
          t.classList.toggle('active', (t.getAttribute('data-status') || '') === 'returned');
        });
      }
    }

    function finishProfileNeedsAttentionFromHash(){
      if ((location.hash || '') !== '#profileNeedsAttention') return;
      requestAnimationFrame(function(){
        var anchor = el('profileNeedsAttention');
        if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      try {
        history.replaceState(null, '', location.pathname + (location.search || ''));
      } catch (err) {}
    }

    function renderMyCreations(items, statusFilter, searchRaw){
      /* L-Rail-2: #postFeedEl is the canonical `.lanternScroller` (direct card children; no contentScrollerTrack). */
      var feed = el('postFeedEl');
      var emptyEl = el('postFeedEmpty');
      if (!feed) return;
      var LC = window.LanternCards;
      if (!LC || !LC.CARD_MODE) {
        if (emptyEl) emptyEl.style.display = 'block';
        syncNeedsAttentionNavCountFromCache();
        return;
      }
      var qNorm = String(searchRaw != null ? searchRaw : myCreationsSearchQuery || '').trim().toLowerCase();
      var afterTab = filterMyCreationsForTab(items, statusFilter);
      var list = afterTab.filter(function(e){ return myCreationMatchesSearch(e, qNorm); });
      try {
        console.log('[profile][my-creations] render', {
          statusFilter: statusFilter || 'all',
          search: qNorm || '(none)',
          tabCount: afterTab.length,
          visibleCount: list.length
        });
      } catch(_) {}
      list.sort(function(a, b){
        var ta = String(a.sortKey || a.createdAt || '').replace(/[^0-9]/g, '');
        var tb = String(b.sortKey || b.createdAt || '').replace(/[^0-9]/g, '');
        return tb.localeCompare(ta);
      });
      feed.innerHTML = '';
      feed.classList.remove('gridView');
      if (list.length === 0){
        if (emptyEl) {
          emptyEl.style.display = 'block';
          var iconEl = emptyEl.querySelector('.emptyStateIcon');
          var titleEl = emptyEl.querySelector('.emptyStateTitle');
          var hintEl = emptyEl.querySelector('.emptyStateHint');
          if (iconEl) iconEl.textContent = '📊';
          if (afterTab.length === 0){
            if (titleEl) titleEl.textContent = 'No creations in this tab';
            if (hintEl) hintEl.textContent = 'Submit work from Create (Contribute), Missions, or posts on Lantern (Explore) to see it here.';
          } else {
            if (titleEl) titleEl.textContent = 'No matching creations';
            if (hintEl) hintEl.textContent = 'Try a different search.';
          }
        }
        syncNeedsAttentionNavCountFromCache();
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';

      var dn = lanternProfileDisplayName();

      list.forEach(function(entry){
        var st = rawMyCreationStatus(entry.status);
        var isReturned = st === 'returned';
        var meta = myCreationCardMetaLine(entry);
        var card = null;

        if (entry.contentType === 'poll_contribution'){
          var pitem = entry.raw;
          var pollModel = { id: pitem.id, question: pitem.question || 'Poll', choices: pitem.choices || [], image_url: pitem.image_url || null, card_meta: meta };
          card = LC.materializePollRailCard(pollModel, {
            isReturned: isReturned,
            onActivate: function(){
              if (isReturned) window.location.href = 'contribute.html?type=poll&resubmit=' + encodeURIComponent(pitem.id);
            }
          });
        } else if (entry.contentType === 'mission_submission'){
          var ms = entry.raw;
          var imgT = (ms.submission_type === 'image_url' || ms.image_url);
          var vidT = (ms.submission_type === 'video' || ms.video_url);
          card = LC.materializeFeedPostCard({
            type: imgT ? 'image' : (vidT ? 'video' : 'create'),
            id: 'mission_' + ms.id,
            title: entry.title,
            caption: entry.previewText,
            display_name: dn,
            character_name: dn,
            avatar: '🛠',
            frame: 'none',
            created_at: ms.created_at || '',
            image_url: ms.image_url || '',
            video_url: ms.video_url || '',
            link_url: '',
            card_meta: meta,
            created_by_teacher_name: ms.created_by_teacher_name || 'Teacher',
            lantern_route: { surface: 'profile', pipeline: 'mission_submission' }
          }, {
            size: 'medium',
            mode: LC.CARD_MODE.RAIL,
            noNavigate: true,
            onCardActivate: function(){ window.location.href = 'missions.html'; }
          });
        } else if (entry.contentType === 'news_submission'){
          var nw = entry.raw;
          card = LC.materializeFeedPostCard({
            type: 'news',
            id: 'news_' + nw.id,
            title: entry.title,
            caption: entry.previewText.slice(0, 300),
            display_name: dn,
            character_name: dn,
            avatar: '📰',
            frame: 'none',
            created_at: nw.created_at || '',
            image_url: nw.image_url || '',
            video_url: nw.video_url || '',
            link_url: nw.link_url || '',
            card_meta: meta,
            lantern_route: { surface: 'profile', pipeline: 'news_submission' }
          }, {
            size: 'medium',
            mode: LC.CARD_MODE.RAIL,
            noNavigate: true,
            onCardActivate: function(){
              var nwr = entry.raw;
              var st = String((nwr && nwr.status) || '').toLowerCase();
              if (st === 'returned' && nwr){
                try {
                  sessionStorage.setItem('LANTERN_NEWS_ARTICLE_RESUBMIT', JSON.stringify({
                    id: nwr.id,
                    title: nwr.title || '',
                    body: nwr.body || ''
                  }));
                } catch (e) {}
                window.location.href = 'contribute.html?type=post';
                return;
              }
              window.location.href = 'explore.html';
            }
          });
        }

        if (card) feed.appendChild(card);
      });
      syncNeedsAttentionNavCountFromCache();
    }

    function renderYourWinsSpotlightRail(recognitionList, history, hasTeacherSpotlight){
      /* L-Rail-1: #spotlightRailEl is the canonical `.lanternScroller` (direct card children). */
      var rail = el('spotlightRailEl');
      if (!rail) return;
      var LC = window.LanternCards;
      if (!LC) return;
      var cards = [];
      var apiPickTitleKey = {};
      (recognitionList || []).forEach(function(r){
        var msg = String(r.message || '').trim();
        var cat = String(r.category || '');
        if (msg.indexOf('Teacher Pick:') === 0 || cat.indexOf('Teacher Pick') >= 0){
          var tit = msg.indexOf('Teacher Pick:') === 0 ? msg.replace(/^Teacher Pick:\s*/i, '').trim().toLowerCase() : msg.toLowerCase();
          if (tit) apiPickTitleKey[tit] = true;
        }
      });
      if (hasTeacherSpotlight){
        cards.push({ kind: 'spot', ts: 1e15, title: 'Teacher Spotlight', caption: 'Your work stood out.', emoji: '⭐' });
      }
      (recognitionList || []).slice(0, 12).forEach(function(r){
        var t = 0;
        try { t = new Date(r.created_at || 0).getTime() || 0; } catch (e) {}
        cards.push({ kind: 'rec', ts: t, r: r });
      });
      (history || []).forEach(function(h){
        var lbl = getActivityLabel(h);
        if (!lbl || !lbl.spotlight) return;
        var note = String(h.note_text || '');
        if (note.indexOf('Teacher Pick:') === 0){
          var tk = note.replace(/^Teacher Pick:\s*/i, '').trim().toLowerCase();
          if (tk && apiPickTitleKey[tk]) return;
        }
        var t = 0;
        try { t = new Date(h.timestamp || 0).getTime() || 0; } catch (e) {}
        cards.push({ kind: 'hist', ts: t, lbl: lbl, h: h });
      });
      cards.sort(function(a, b){ return b.ts - a.ts; });
      cards = cards.slice(0, 12);
      var dn = lanternProfileDisplayName();
      var posts = [];
      if (cards.length === 0){
            posts.push({ type: 'shoutout', title: 'Nothing here yet', caption: 'Teacher recognition, peer shout-outs (after approval), and teacher picks appear here as you earn them.', display_name: 'Spotlight', character_name: 'Spotlight', avatar: '⭐', frame: 'none', created_at: '', card_meta: 'Your wins', lantern_route: { surface: 'spotlight', pipeline: 'empty' } });
      } else {
        cards.forEach(function(c){
          if (c.kind === 'spot'){
            posts.push({ type: 'shoutout', title: c.title, caption: c.caption, display_name: dn, character_name: dn, avatar: '⭐', frame: 'none', created_at: '', card_meta: 'Badge', teacher_pick: true, lantern_route: { surface: 'spotlight', pipeline: 'teacher_spotlight_badge' } });
          } else if (c.kind === 'rec'){
            var r = c.r;
            var msgFull = String(r.message || '').trim() || 'Recognition';
            var fromT = (r.created_by_teacher_name || '').trim() ? r.created_by_teacher_name : 'Teacher';
            if ((r.category || '').trim()) fromT += ' · ' + r.category;
            var dateStr = '';
            try { var dt = new Date(r.created_at || ''); if (!isNaN(dt.getTime())) dateStr = dt.toLocaleDateString(); } catch (e) {}
            var rid = String(r.id || '');
            var peerShout = rid.indexOf('shoutout-news-') === 0;
            var pickD1 = !peerShout && ((String(r.category || '').indexOf('Teacher Pick') >= 0) || (String(r.message || '').indexOf('Teacher Pick:') === 0));
            var studentKey = String(r.character_name || '').trim() || dn;
            posts.push({
              type: 'shoutout',
              title: fromT,
              caption: msgFull,
              display_name: dn,
              character_name: studentKey,
              _canonicalAvatar: r._canonicalAvatar,
              avatar: '⭐',
              image_url: '',
              video_url: '',
              link_url: '',
              created_at: r.created_at || '',
              card_meta: dateStr,
              teacher_pick: true,
              lantern_route: { surface: 'spotlight', pipeline: peerShout ? 'peer_shoutout' : (pickD1 ? 'teacher_pick_recognition' : 'teacher_recognition') }
            });
          } else {
            var lbl = c.lbl;
            var full = lbl.text || '';
            var d = '';
            try { var dt2 = new Date(c.h.timestamp || ''); if (!isNaN(dt2.getTime())) d = dt2.toLocaleDateString(); } catch (e2) {}
            var titleLine = full.length > 56 ? full.slice(0, 56) + '…' : full;
            var tp = full.indexOf('Teacher Pick') >= 0;
            var tf = full.indexOf('Featured:') >= 0 || (full.indexOf('Featured') >= 0 && full.indexOf('Teacher Pick') < 0);
            posts.push({
              type: 'shoutout',
              title: titleLine || 'Moment',
              caption: full,
              display_name: dn,
              character_name: dn,
              avatar: '🌟',
              frame: 'none',
              created_at: c.h.timestamp || '',
              card_meta: d,
              teacher_pick: tp,
              teacher_featured: tf && !tp,
              lantern_route: { surface: 'spotlight', pipeline: 'history_spotlight', detail: full.slice(0, 100) }
            });
          }
        });
      }
      rail.innerHTML = '';
      var frag = document.createDocumentFragment();
      function mountSpotlightRail(list){
        list.forEach(function(p){
          var cap = String(p.caption || '').replace(/<[^>]*>/g, '');
          var pl = (p.lantern_route && p.lantern_route.pipeline) || '';
          frag.appendChild(LC.materializeFeedPostCard(p, {
            size: 'medium',
            noNavigate: true,
            mode: LC.CARD_MODE.RAIL,
            onCardActivate: function () {
              if (!window.LanternCardUI) return;
              if (pl === 'empty') window.LanternCardUI.openTextDetail('Spotlight', 'Your wins', cap);
              else window.LanternCardUI.openTextDetail(p.title, p.card_meta || '', cap || p.title);
            }
          }));
        });
        rail.appendChild(frag);
      }
      if (window.LanternAvatar && typeof window.LanternAvatar.attachCanonicalAvatarsToItems === 'function' && posts.length) {
        window.LanternAvatar.attachCanonicalAvatarsToItems(posts).then(function(){ mountSpotlightRail(posts); });
      } else {
        mountSpotlightRail(posts);
      }
    }

    function renderAchievements(achievements){
      /* L-Rail-1: #achievementsRailEl is the canonical `.lanternScroller`. */
      var rail = el('achievementsRailEl');
      var LC = window.LanternCards;
      if (!rail || !LC) return;
      var dn = lanternProfileDisplayName();
      var vm = typeof window !== 'undefined' && window.LANTERN_STUDENT_PROFILE_VIEW;
      var accName = (vm && vm.name) ? String(vm.name).trim() : (getAdopted() && getAdopted().name) ? String(getAdopted().name).trim() : '';
      var idChar = accName || dn;
      function mountAchievementsFrag(canonAv){
        var frag = document.createDocumentFragment();
        if (!achievements || achievements.length === 0){
          frag.appendChild(LC.materializeFeedPostCard({
            type: 'teach',
            title: 'Achievements',
            caption: '',
            display_name: dn,
            character_name: idChar,
            _canonicalAvatar: canonAv,
            avatar: '🏆',
            frame: 'none',
            created_at: '',
            card_meta: 'Keep creating to unlock badges',
            lantern_route: { surface: 'achievements', pipeline: 'placeholder' }
          }, { size: 'medium', noNavigate: true, mode: LC.CARD_MODE.RAIL, extraClass: 'exploreCardMuted' }));
        } else {
          achievements.forEach(function(a){
            var desc = (a.desc || '').trim();
            var ic = a.icon || '🏆';
            if (typeof ic === 'string' && ic.indexOf('<') >= 0) ic = '🏆';
            var achMeta = (a.unlocked ? 'Unlocked' : 'Locked') + (desc ? ' · ' + desc.replace(/\s+/g, ' ').trim().slice(0, 52) + (desc.length > 52 ? '…' : '') : '');
            frag.appendChild(LC.materializeFeedPostCard({
              type: 'teach',
              title: a.name || 'Badge',
              caption: '',
              display_name: dn,
              character_name: idChar,
              _canonicalAvatar: canonAv,
              avatar: ic,
              frame: 'none',
              created_at: '',
              card_meta: achMeta,
              lantern_route: { surface: 'achievements', flags: { unlocked: !!a.unlocked } }
            }, {
              size: 'medium',
              noNavigate: true,
              mode: LC.CARD_MODE.RAIL,
              extraClass: a.unlocked ? '' : 'exploreCardMuted',
              onCardActivate: function () {
                if (window.LanternCardUI) window.LanternCardUI.openTextDetail(a.name || 'Badge', a.unlocked ? 'Unlocked' : 'Locked', desc || 'Achievement milestone');
              }
            }));
          });
        }
        rail.innerHTML = '';
        rail.appendChild(frag);
      }
      if (accName && window.LanternAvatar && typeof window.LanternAvatar.attachCanonicalAvatarsToItems === 'function') {
        var stub = { character_name: accName };
        window.LanternAvatar.attachCanonicalAvatarsToItems([stub]).then(function(){ mountAchievementsFrag(stub._canonicalAvatar); });
      } else {
        mountAchievementsFrag(null);
      }
    }

    /* ===== PRESERVED: showProfile with new layout ===== */
    function normalizeAvatarParts(parts){
      var p = parts && typeof parts === 'object' ? parts : {};
      var body = p.body || DEFAULT_AVATAR_PARTS.body;
      var hair = p.hair || DEFAULT_AVATAR_PARTS.hair;
      var face = p.face || DEFAULT_AVATAR_PARTS.face;
      var top = p.top || DEFAULT_AVATAR_PARTS.top;
      var bottom = p.bottom || DEFAULT_AVATAR_PARTS.bottom;
      var accessory = p.accessory || DEFAULT_AVATAR_PARTS.accessory;
      return { body: body, hair: hair, face: face, top: top, bottom: bottom, accessory: accessory };
    }

    function getDefaultAvatarPartsFromEmoji(emoji){
      // Simple mapping from legacy emoji avatar to reasonable defaults
      var e = String(emoji || '').trim();
      if (!e) return Object.assign({}, DEFAULT_AVATAR_PARTS);
      if (e === '🚀' || e === '🎯') return { body: 'medium', hair: 'brown_short', face: 'confident', top: 'hoodie_blue', bottom: 'jeans', accessory: 'none' };
      if (e === '🎨' || e === '🌈') return { body: 'light', hair: 'blonde_long', face: 'smile', top: 'tee_orange', bottom: 'red', accessory: 'star_pin' };
      if (e === '📚' || e === '💡') return { body: 'deep', hair: 'black_curly', face: 'thoughtful', top: 'tee_green', bottom: 'black', accessory: 'glasses' };
      return Object.assign({}, DEFAULT_AVATAR_PARTS);
    }

    function buildAvatarFigureHTML(parts){
      var p = normalizeAvatarParts(parts);
      var cls = [
        'avatarFigure',
        'body-' + p.body,
        'hair-' + p.hair,
        'face-' + p.face,
        'top-' + p.top,
        'bottom-' + (p.bottom || 'jeans'),
        p.accessory && p.accessory !== 'none' ? ('accessory-' + p.accessory) : 'accessory-none'
      ].join(' ');
      return '<div class="' + cls + '">' +
        '<div class="avatarHead">' +
          '<div class="avatarHair"></div>' +
          '<div class="avatarFace"></div>' +
          '<div class="avatarEye left"></div>' +
          '<div class="avatarEye right"></div>' +
          '<div class="avatarAccessoryIcon"></div>' +
        '</div>' +
        '<div class="avatarBody"></div>' +
        '<div class="avatarBottom"></div>' +
        '<div class="avatarFeet"></div>' +
      '</div>';
    }

    function renderAvatarInto(el, parts){
      if (!el) return;
      el.innerHTML = buildAvatarFigureHTML(parts);
    }

    /* Profile contains multiple optional feature modules; one failing module should not break the whole page. */
    function safeProfileStep(label, fn){
      try { fn(); } catch (err) { console.error('[Profile]', label, 'failed', err); }
    }

    var DEFAULT_HERO_TITLE = 'Creative Student';

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
    }

    function showProfile(){
      if (typeof updateStudentVerifyBanner === 'function') updateStudentVerifyBanner();
      var adopted = getAdopted();
      var needCharEl = el('pilotLockerNeedCharacter');
      if (needCharEl) needCharEl.style.display = 'none';
      var ctx = document.getElementById('lanternAppBarContext');
      var _lp = (typeof LANTERN_NAV !== 'undefined' && LANTERN_NAV.getCurrentPage) ? LANTERN_NAV.getCurrentPage() : '';
      var isProfilePage = _lp === 'profile' || _lp === 'locker';
      if (!adopted || !adopted.name){
        var allowDemoPicker = window.LANTERN_DEV_STUDENT_PICKER === true;
        if (!allowDemoPicker) {
          el('pickerCard').style.display = 'none';
          el('profileView').style.display = 'none';
          if (needCharEl) needCharEl.style.display = 'block';
          if (isProfilePage && ctx) {
            ctx.textContent = 'Locker';
            ctx.classList.remove('lanternAppBarContext--empty');
          }
          return;
        }
        el('pickerCard').style.display = 'block';
        el('profileView').style.display = 'none';
        renderPicker();
        if (isProfilePage && ctx) {
          ctx.textContent = 'Locker';
          ctx.classList.remove('lanternAppBarContext--empty');
        }
        return;
      }

      el('pickerCard').style.display = 'none';
      el('profileView').style.display = 'block';
      if (isProfilePage && ctx) {
        ctx.innerHTML = '<span class="lanternAppBarContextGlow">' + esc(getStudentDisplayName() || adopted.name) + '</span>';
        ctx.classList.remove('lanternAppBarContext--empty');
      }
      if (typeof setLegendSelection === 'function') setLegendSelection(null);

      var badgeEl = el('testStudentBadgeEl');
      if (badgeEl) {
        if (adopted.isTest && adopted.expires_at) {
          var exp = new Date(adopted.expires_at);
          var now = new Date();
          var daysLeft = Math.max(0, Math.ceil((exp - now) / (24 * 60 * 60 * 1000)));
          badgeEl.textContent = 'Test Student · Expires in ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '');
          badgeEl.style.display = 'inline-block';
        } else {
          badgeEl.style.display = 'none';
          badgeEl.textContent = '';
        }
      }

      /* Normalized student profile view model: one data object per profile load. Future students render from the same template using this shape. */
      var studentProfileVM = {
        id: adopted.name,
        name: adopted.name,
        displayName: getStudentDisplayName() || adopted.name || '—',
        heroTitle: '',
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

      lanternWinsState = { rec: [], hist: [], spotlight: false };
      myCreationsItemsCache = [];
      myCreationsSearchQuery = '';
      submissionsStatusFilter = 'all';
      syncNeedsAttentionNavCountFromCache();
      var searchElReset = el('myCreationsSearchEl');
      if (searchElReset) searchElReset.value = '';
      var tabsStripReset = el('myCreationsTabs');
      if (tabsStripReset){
        tabsStripReset.querySelectorAll('.contentTab').forEach(function(t){
          var st = t.getAttribute('data-status') || '';
          t.classList.toggle('active', st === 'all');
        });
      }
      var spRail = el('spotlightRailEl');
      var achRail = el('achievementsRailEl');
      if (spRail && window.LanternCards){
        spRail.innerHTML = '';
        spRail.appendChild(window.LanternCards.materializeFeedPostCard({ id: 'profile_spotlight_loading', type: 'shoutout', title: 'Loading…', caption: '', display_name: 'Spotlight', character_name: 'Spotlight', avatar: '⭐', frame: 'none', created_at: '', card_meta: 'Fetching…' }, { size: 'medium', noNavigate: true, mode: window.LanternCards.CARD_MODE.RAIL }));
      }
      if (achRail && window.LanternCards){
        achRail.innerHTML = '';
        achRail.appendChild(window.LanternCards.materializeFeedPostCard({ id: 'profile_achievements_loading', type: 'teach', title: 'Loading…', caption: '', display_name: 'Achievements', character_name: 'Achievements', avatar: '🏆', frame: 'none', created_at: '', card_meta: 'Fetching…' }, { size: 'medium', noNavigate: true, mode: window.LanternCards.CARD_MODE.RAIL, extraClass: 'exploreCardMuted' }));
      }

      setProfileHeroStats({ creations: 0, achievements: 0, recognitions: 0 });
      updateNuggetProgress(0);
      safeProfileStep('wireTestingControls', wireTestingControls);

      var revEl = el('avatarRevealEl');
      var contentEl = el('avatarContentEl');
      if (revEl) revEl.classList.remove('revealed');
      if (contentEl) contentEl.innerHTML = '';
      if (ctx) {
        ctx.innerHTML = '<span class="lanternAppBarContextGlow">' + esc(studentProfileVM.displayName) + '</span>';
        ctx.classList.remove('lanternAppBarContext--empty');
      }
      applyProfileHeroIdentity(studentProfileVM);
      el('bioEl').textContent = studentProfileVM.motto || 'Add a bio or tagline';
      el('bioEl').classList.add('placeholder');

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
        studentProfileVM.displayName = (p.display_name || '').trim() || getStudentDisplayName() || adopted.name || '—';
        studentProfileVM.heroTitle = (p.hero_title || '').trim();
        studentProfileVM.motto = (p.bio || '').trim();
        studentProfileVM.avatar = (p.avatar || '').trim() || adopted.avatar || '🌟';
        studentProfileVM.frame = (p.frame || 'none').trim();
        studentProfileVM.theme = (p.theme || 'default').trim();
        studentProfileVM.custom_avatar = (canon.imageUrl && String(canon.imageUrl).trim()) ? String(canon.imageUrl).trim() : '';
        if (ctx) ctx.innerHTML = '<span class="lanternAppBarContextGlow">' + esc(studentProfileVM.displayName) + '</span>';
        applyProfileHeroIdentity(studentProfileVM);
        el('bioEl').textContent = studentProfileVM.motto || 'Add a bio or tagline';
        el('bioEl').classList.toggle('placeholder', !studentProfileVM.motto);
        var avatarParts = (p.avatar_parts && typeof p.avatar_parts === 'object')
          ? normalizeAvatarParts(p.avatar_parts)
          : getDefaultAvatarPartsFromEmoji(studentProfileVM.avatar);
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
            renderAvatarInto(contentEl, avatarParts);
            requestAnimationFrame(function(){ revEl.classList.add('revealed'); });
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
        callGetRecognitionForCharacter(adopted.name).then(function(res){
          safeProfileStep('recognition', function(){
          var list = (res && res.recognition) || [];
          studentProfileVM.stats.recognitions = list.length;
          setProfileHeroStats({ recognitions: list.length });
          function applyRec(l){
            lanternWinsState.rec = l;
            renderYourWinsSpotlightRail(lanternWinsState.rec, lanternWinsState.hist, lanternWinsState.spotlight);
          }
          if (window.LanternAvatar && typeof window.LanternAvatar.attachCanonicalAvatarsToItems === 'function' && list.length) {
            window.LanternAvatar.attachCanonicalAvatarsToItems(list).then(function(){ applyRec(list); });
          } else {
            applyRec(list);
          }
          });
        });
        if (avatarApiBase) {
          fetchMyCreationsBundle().then(function(list){
            safeProfileStep('myCreations', function(){
              myCreationsItemsCache = list || [];
              var visible = filterMyCreationsForTab(myCreationsItemsCache, 'all');
              setProfileHeroStats({ creations: visible.length });
              prepareProfileNeedsAttentionFromHash();
              renderMyCreations(myCreationsItemsCache, submissionsStatusFilter, myCreationsSearchQuery);
              finishProfileNeedsAttentionFromHash();
              safeProfileStep('profileMyArticles', function(){ renderProfileMyArticles(); });
            });
          }).catch(function(){
            safeProfileStep('myCreations', function(){
              myCreationsItemsCache = [];
              setProfileHeroStats({ creations: 0 });
              prepareProfileNeedsAttentionFromHash();
              renderMyCreations([], submissionsStatusFilter, myCreationsSearchQuery);
              finishProfileNeedsAttentionFromHash();
              safeProfileStep('profileMyArticles', function(){ renderProfileMyArticles(); });
            });
          });
        } else {
          safeProfileStep('myCreations', function(){
            myCreationsItemsCache = [];
            setProfileHeroStats({ creations: 0 });
            prepareProfileNeedsAttentionFromHash();
            renderMyCreations([], submissionsStatusFilter, myCreationsSearchQuery);
            finishProfileNeedsAttentionFromHash();
            safeProfileStep('profileMyArticles', function(){ renderProfileMyArticles(); });
          });
        }
        var avatarStatusPromise = avatarApiBase
          ? fetch(avatarApiBase + '/api/avatar/status?character_name=' + encodeURIComponent(adopted.name)).then(function(r){ return r.json(); }).then(function(s){ return (s && s.ok && s.status) ? { ok: true, status: s.status } : { ok: false, status: {} }; }).catch(function(){ return { ok: false, status: {} }; })
          : callGetAvatarStatus(adopted.name);
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
        var hero = el('profileHeroEl') || document.querySelector('.profileHero');
        if (!hero) return;
        [].slice.call(hero.classList).forEach(function(cls){ if (cls.indexOf('cosmetic-') === 0) hero.classList.remove(cls); });
        var badgeEl = el('cosmeticBadgeEl');
        var accessoryEl = el('cosmeticAccessoryEl');
        var decorationEl = el('cosmeticDecorationEl');
        if (badgeEl) badgeEl.style.display = 'none';
        if (accessoryEl) accessoryEl.style.display = 'none';
        if (decorationEl) decorationEl.style.display = 'none';
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

      callGetBalance(adopted.name).then(function(res){
        safeProfileStep('balance', function(){
          var n = res && (res.available != null) ? res.available : 0;
          studentProfileVM.nuggets = Number(n) || 0;
          el('balanceEl').textContent = String(studentProfileVM.nuggets);
          updateNuggetProgress(studentProfileVM.nuggets);
        });
      }).catch(function(){});

      Promise.all([
        callStudentHistory(adopted.name),
        callGetAchievements(adopted.name)
      ]).then(function(results){
        safeProfileStep('historyAndAchievements', function(){
          var history = (results[0] && results[0].history) || [];
          var achievements = (results[1] && results[1].achievements) || [];
          var unlockedCount = achievements.filter(function(a){ return a.unlocked; }).length;
          studentProfileVM.stats.achievements = unlockedCount;
          setProfileHeroStats({ achievements: unlockedCount });
          studentProfileVM.has_spotlight = achievements.some(function(a){ return a.id === 'teacher_spotlight' && a.unlocked; });
          var badge = el('spotlightBadgeEl');
          if (badge) badge.style.display = studentProfileVM.has_spotlight ? 'flex' : 'none';
          lanternWinsState.hist = history;
          lanternWinsState.spotlight = studentProfileVM.has_spotlight;
          renderYourWinsSpotlightRail(lanternWinsState.rec, lanternWinsState.hist, lanternWinsState.spotlight);
          renderAchievements(achievements);
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
      { key: 'trophy_case', text: 'Your Wins uses the same Explore cards as the feed (horizontal scroll); locked achievements look muted.' },
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
      var avatarPicker = el('editProfileAvatarPicker');
      var framePicker = el('editProfileFramePicker');
      var themePicker = el('editProfileThemePicker');
      var featuredSelect = el('editProfileFeaturedPost');
      var currentAvatarParts = null;
    var currentAvatarStatus = null;
    var avatarCropper = null;
    var avatarCropDataUrl = null;
    var avatarCropOpenGuard = false;

      function buildAvatarPicker(selectedParts){
        if (!avatarPicker) return;
        var baseParts = selectedParts && typeof selectedParts === 'object'
          ? normalizeAvatarParts(selectedParts)
          : Object.assign({}, DEFAULT_AVATAR_PARTS);
        currentAvatarParts = baseParts;
        avatarPicker.innerHTML = '';

        function buildRow(label, key, options){
          var row = document.createElement('div');
          row.className = 'cosmeticEquipRow';
          var lbl = document.createElement('span');
          lbl.style.color = 'var(--muted)';
          lbl.style.fontWeight = '800';
          lbl.textContent = label + ':';
          row.appendChild(lbl);
          options.forEach(function(opt){
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cosmeticEquipBtn' + (baseParts[key] === opt.id ? ' equipped' : '');
            btn.textContent = opt.label;
            btn.style.width = 'auto';
            btn.style.minWidth = '80px';
            btn.dataset.value = opt.id;
            btn.addEventListener('click', function(){
              baseParts[key] = opt.id;
              currentAvatarParts = normalizeAvatarParts(baseParts);
              row.querySelectorAll('.cosmeticEquipBtn').forEach(function(b){ b.classList.remove('equipped'); });
              btn.classList.add('equipped');
              // live preview
              var avatarContentEl = el('avatarContentEl');
              if (avatarContentEl) renderAvatarInto(avatarContentEl, currentAvatarParts);
            });
            row.appendChild(btn);
          });
          avatarPicker.appendChild(row);
        }

        buildRow('Body', 'body', AVATAR_BODY_OPTIONS);
        buildRow('Hair', 'hair', AVATAR_HAIR_OPTIONS);
        buildRow('Face', 'face', AVATAR_FACE_OPTIONS);
        buildRow('Top', 'top', AVATAR_TOP_OPTIONS);
        buildRow('Bottom', 'bottom', AVATAR_BOTTOM_OPTIONS);
        buildRow('Accessory', 'accessory', AVATAR_ACCESSORY_OPTIONS);
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

      function buildCosmeticEquip(owned, equipped, cosmetics){
        var wrap = el('editProfileCosmeticsEl');
        if (!wrap) return;
        wrap.innerHTML = '';
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
                    callGetBalance(characterName).then(function(bRes){
                      var nextOwnership = o || { owned: [], equipped: {} };
                      var nextBalance = Number((bRes && bRes.available) || 0);
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
        var avatarParts = (profile.avatar_parts && typeof profile.avatar_parts === 'object')
          ? normalizeAvatarParts(profile.avatar_parts)
          : getDefaultAvatarPartsFromEmoji(profile.avatar || (adopted && adopted.avatar) || '');
        buildAvatarPicker(avatarParts);
        currentAvatarStatus = avatarStatus && avatarStatus.status ? avatarStatus.status : {};
        var uploadStatusEl = el('avatarUploadStatus');
        if (uploadStatusEl){
          if (currentAvatarStatus.has_pending){
            uploadStatusEl.textContent = 'You already have an avatar awaiting approval.';
            uploadStatusEl.style.color = 'var(--muted)';
          } else {
            uploadStatusEl.textContent = 'Avatar uploads cost 25 nuggets and must be school-appropriate.';
            uploadStatusEl.style.color = 'var(--muted)';
          }
        }
        buildFramePicker(profile.frame || 'none');
        buildThemePicker(normalizeThemeForPicker(profile.theme));
        buildCosmeticEquip(ownership.owned || [], ownership.equipped || {}, cosmetics || []);
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
          callGetBalance(adopted.name)
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
          var balance = Number(balanceRes.available) || 0;
          var praiseRes = results[5] || {};
          if (praiseRes && praiseRes.ok && praiseRes.reaction_types) profile.praise_types = praiseRes.reaction_types;
          var cosmetics = (window.LANTERN_DATA && window.LANTERN_DATA.getCosmetics) ? window.LANTERN_DATA.getCosmetics() : [];
          populateForm(profile, posts, adopted, ownership, cosmetics, avatarStatus, balance);
          if (overlay) overlay.classList.add('show');
        });
      });

      if (el('editProfileCloseBtn')) el('editProfileCloseBtn').addEventListener('click', function(){ if (overlay) overlay.classList.remove('show'); });
      if (overlay) overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.classList.remove('show'); });
      var legacyToggle = el('legacyAvatarToggle');
      var legacyContent = el('legacyAvatarContent');
      if (legacyToggle && legacyContent){
        legacyToggle.addEventListener('click', function(){
          var isHidden = legacyContent.style.display === 'none';
          legacyContent.style.display = isHidden ? 'block' : 'none';
          legacyToggle.textContent = isHidden ? '▲ Legacy avatar (parts)' : '▼ Legacy avatar (parts)';
        });
      }

      function destroyAvatarCropper(){
        if (avatarCropper){
          avatarCropper.destroy();
          avatarCropper = null;
        }
      }

      function openAvatarFileChooser(){
        var adopted = getAdopted();
        if (!adopted) { toast('Adopt a character first'); return; }
        if (currentAvatarStatus && currentAvatarStatus.has_pending){
          toast('You already have an avatar awaiting approval.');
          return;
        }
        var input = el('avatarFileInput');
        if (input){
          input.value = '';
          input.click();
        }
      }

      var openUploadBtn = el('openAvatarUploadBtn');
      if (openUploadBtn){
        openUploadBtn.addEventListener('click', openAvatarFileChooser);
      }

      var fileInput = el('avatarFileInput');
      if (fileInput){
        fileInput.addEventListener('change', function(){
          var file = fileInput.files && fileInput.files[0];
          var errorEl = el('avatarCropError');
          if (errorEl) errorEl.textContent = '';
          if (!file){
            return;
          }
          if (!/^image\//i.test(file.type || '')){
            if (errorEl) errorEl.textContent = 'Please choose an image file.';
            return;
          }
          if (file.size && file.size > 3 * 1024 * 1024){
            if (errorEl) errorEl.textContent = 'Image is too large. Please keep it under 3MB.';
            return;
          }
          var reader = new FileReader();
          reader.onload = function(ev){
            var url = ev.target && ev.target.result;
            var imgEl = el('avatarCropImage');
            var overlayEl = el('avatarCropOverlay');
            if (!imgEl || !overlayEl) return;
            destroyAvatarCropper();
            imgEl.src = '';
            imgEl.removeAttribute('src');
            overlayEl.classList.add('show');
            avatarCropOpenGuard = true;
            setTimeout(function(){ avatarCropOpenGuard = false; }, 400);
            imgEl.onload = function(){
              try{
                var naturalMin = Math.min(imgEl.naturalWidth || 0, imgEl.naturalHeight || 0);
                if (naturalMin < 128){
                  if (errorEl) errorEl.textContent = 'Image is too small. Use an image at least 128×128.';
                  destroyAvatarCropper();
                  overlayEl.classList.remove('show');
                  return;
                }
                if (window.Cropper){
                  avatarCropper = new window.Cropper(imgEl, {
                    aspectRatio: 1,
                    viewMode: 1,
                    background: false,
                    autoCropArea: 0.9,
                  });
                } else {
                  if (errorEl) errorEl.textContent = 'Cropper not loaded. Refresh the page.';
                }
              }catch(e){
                if (errorEl) errorEl.textContent = 'Could not start cropper.';
              }
            };
            imgEl.onerror = function(){
              if (errorEl) errorEl.textContent = 'Could not load image.';
              overlayEl.classList.remove('show');
            };
            imgEl.src = url;
          };
          reader.readAsDataURL(file);
        });
      }

      function closeAvatarCropOverlay(){
        var overlayEl = el('avatarCropOverlay');
        var errorEl = el('avatarCropError');
        if (overlayEl) overlayEl.classList.remove('show');
        if (errorEl) errorEl.textContent = '';
        destroyAvatarCropper();
        avatarCropDataUrl = null;
      }

      var cropCloseBtn = el('avatarCropCloseBtn');
      var cropCancelBtn = el('avatarCropCancelBtn');
      if (cropCloseBtn) cropCloseBtn.addEventListener('click', closeAvatarCropOverlay);
      if (cropCancelBtn) cropCancelBtn.addEventListener('click', closeAvatarCropOverlay);
      var cropOverlay = el('avatarCropOverlay');
      if (cropOverlay){
        cropOverlay.addEventListener('click', function(e){
          if (e.target !== cropOverlay) return;
          if (avatarCropOpenGuard) return;
          closeAvatarCropOverlay();
        });
      }

      var zoomInBtn = el('avatarCropZoomInBtn');
      var zoomOutBtn = el('avatarCropZoomOutBtn');
      var rotateBtn = el('avatarCropRotateLeftBtn');
      if (zoomInBtn){
        zoomInBtn.addEventListener('click', function(){
          if (avatarCropper) avatarCropper.zoom(0.15);
        });
      }
      if (zoomOutBtn){
        zoomOutBtn.addEventListener('click', function(){
          if (avatarCropper) avatarCropper.zoom(-0.15);
        });
      }
      if (rotateBtn){
        rotateBtn.addEventListener('click', function(){
          if (avatarCropper) avatarCropper.rotate(90);
        });
      }

      var cropSubmitBtn = el('avatarCropSubmitBtn');
      if (cropSubmitBtn){
        cropSubmitBtn.addEventListener('click', function(){
          var adopted = getAdopted();
          var errorEl = el('avatarCropError');
          if (!adopted || !adopted.name){
            if (errorEl) errorEl.textContent = 'Adopt a character first.';
            return;
          }
          if (!avatarCropper){
            if (errorEl) errorEl.textContent = 'No image to crop.';
            return;
          }
          try{
            var canvas = avatarCropper.getCroppedCanvas({ width: 384, height: 384 });
            if (!canvas){
              if (errorEl) errorEl.textContent = 'Unable to crop image.';
              return;
            }
            if (canvas.width < 128 || canvas.height < 128){
              if (errorEl) errorEl.textContent = 'Cropped image is too small.';
              return;
            }
            var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            avatarCropDataUrl = dataUrl;
          }catch(e){
            if (errorEl) errorEl.textContent = 'Unable to crop image.';
            return;
          }
          cropSubmitBtn.disabled = true;
          callSubmitAvatarUpload(adopted.name, avatarCropDataUrl, 25).then(function(res){
            cropSubmitBtn.disabled = false;
            if (!res || !res.ok){
              if (errorEl) errorEl.textContent = (res && res.error) || 'Failed to submit avatar.';
              return;
            }
            toast('Avatar submitted for approval. -25 nuggets');
            closeAvatarCropOverlay();
            showProfile();
          });
        });
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
          var avatarParts = currentAvatarParts || getDefaultAvatarPartsFromEmoji(adopted.avatar || '🌟');
          callSaveProfile(adopted.name, {
            display_name: displayName,
            hero_title: heroTitle,
            bio: bio,
            avatar_parts: avatarParts,
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
      var tabsContainer = el('myCreationsTabs');
      if (tabsContainer) {
        tabsContainer.querySelectorAll('.contentTab').forEach(function(tab){
          tab.addEventListener('click', function(){
            tabsContainer.querySelectorAll('.contentTab').forEach(function(t){ t.classList.remove('active'); });
            tab.classList.add('active');
            var status = tab.getAttribute('data-status');
            if (status !== null) {
              submissionsStatusFilter = status.trim() || 'all';
              renderMyCreations(myCreationsItemsCache, submissionsStatusFilter, myCreationsSearchQuery);
            }
          });
        });
      }
      var searchEl = el('myCreationsSearchEl');
      if (searchEl && !searchEl._lanternMyCreationsSearchBound){
        searchEl._lanternMyCreationsSearchBound = true;
        searchEl.addEventListener('input', function(){
          myCreationsSearchQuery = searchEl.value;
          renderMyCreations(myCreationsItemsCache, submissionsStatusFilter, myCreationsSearchQuery);
        });
      }
      if (el('newPostBtn')) el('newPostBtn').addEventListener('click', function(){ window.location.href = 'contribute.html?type=profile_post'; });
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

    var testingWired = false;
    /**
     * Testing Controls: wired once per profile session while a student is selected (adopted.name set).
     * Re-wires after Switch Student. Uses live getAdopted() on each action so nuggets apply to the current student.
     */
    function wireTestingControls(){
      var adopted = getAdopted();
      if (!adopted || !String(adopted.name || '').trim()) return;
      if (testingWired) return;
      var add1 = el('add1Btn');
      var add5 = el('add5Btn');
      var add10 = el('add10Btn');
      var addCustom = el('addCustomBtn');
      if (!add1 || !add5 || !add10 || !addCustom) return;

      if (el('submitForApprovalBtn')) el('submitForApprovalBtn').addEventListener('click', submitForApproval);
      var switchBtn = el('switchCharBtn');
      if (switchBtn) {
        switchBtn.addEventListener('click', function(){
          setAdopted(null);
          testingWired = false;
          postsWired = false;
          showProfile();
        });
      }

      function applyNuggetAdd(amount, toastMsg){
        var a = getAdopted();
        if (!a || !String(a.name || '').trim()) { toast('Select a student first'); return; }
        var nm = String(a.name).trim();
        if (economyApiBase) {
          callEconomyTransact(nm, amount, 'testing', 'TESTING', 'Testing control', {}).then(function(tRes){
            if (tRes && tRes.ok) {
              var bal = tRes.balance_after != null ? tRes.balance_after : (tRes.available);
              if (el('balanceEl')) el('balanceEl').textContent = String(bal != null ? bal : 0);
              updateNuggetProgress(bal != null ? bal : 0);
              toast(toastMsg);
            } else { toast(tRes && tRes.error || 'Failed'); }
          });
        } else {
          addNuggets(nm, amount);
          toast(toastMsg);
          showProfile();
        }
      }
      el('add1Btn').addEventListener('click', function(){ applyNuggetAdd(1, '+1 nugget'); });
      el('add5Btn').addEventListener('click', function(){ applyNuggetAdd(5, '+5 nuggets'); });
      el('add10Btn').addEventListener('click', function(){ applyNuggetAdd(10, '+10 nuggets'); });
      el('addCustomBtn').addEventListener('click', function(){
        var n = Math.max(1, Math.min(999, Math.floor(Number(el('customAmount').value || 0)) || 0));
        if (!isFinite(n) || n < 1) n = 1;
        applyNuggetAdd(n, '+' + n + ' nuggets');
      });
      var resetWalletBtn = el('resetWalletBtn');
      if (resetWalletBtn) resetWalletBtn.addEventListener('click', function(){
        var a = getAdopted();
        if (!a || !String(a.name || '').trim()) { toast('Select a student first'); return; }
        if (!confirm('Reset wallet? This clears activity and purchases for this student.')) return;
        clearActivityForCharacter(a.name);
        clearPurchasesForCharacter(a.name);
        toast('Wallet reset');
        showProfile();
      });
      var clearPurchasesBtn = el('clearPurchasesBtn');
      if (clearPurchasesBtn) clearPurchasesBtn.addEventListener('click', function(){
        var a = getAdopted();
        if (!a || !String(a.name || '').trim()) { toast('Select a student first'); return; }
        if (!confirm('Clear all purchases for this student?')) return;
        clearPurchasesForCharacter(a.name);
        toast('Purchases cleared');
        showProfile();
      });

      if (el('seedDemoWorldBtn')) el('seedDemoWorldBtn').addEventListener('click', function(){
        var DATA = window.LANTERN_DATA;
        if (!DATA || !DATA.seedDemoWorld) { toast('Not available'); return; }
        var r = DATA.seedDemoWorld();
        if (r && r.ok) {
          toast('Sample content seeded'); showProfile();
          if (typeof window !== 'undefined' && window.location && window.location.reload) setTimeout(function(){ window.location.reload(); }, 800);
        } else { toast(r && r.error ? r.error : 'Failed'); }
      });

      if (el('clearDemoWorldBtn')) el('clearDemoWorldBtn').addEventListener('click', function(){
        var DATA = window.LANTERN_DATA;
        if (!DATA || !DATA.clearDemoWorld) { toast('Not available'); return; }
        var r = DATA.clearDemoWorld();
        if (r && r.ok) {
          toast('Sample content cleared'); showProfile();
          if (typeof window !== 'undefined' && window.location && window.location.reload) setTimeout(function(){ window.location.reload(); }, 500);
        } else { toast(r && r.error ? r.error : 'Failed'); }
      });

      if (el('minimalModeBtn')) el('minimalModeBtn').addEventListener('click', function(){
        var pw = (prompt('Enter password for Minimal Mode:') || '').trim();
        if (pw !== 'geppetto') { toast('Incorrect'); return; }
        var DATA = window.LANTERN_DATA;
        if (DATA && DATA.setMode) DATA.setMode('minimal');
        toast('Minimal mode. Reloading…');
        setTimeout(function(){ window.location.reload(); }, 400);
      });

      if (el('returnSeededBtn')) el('returnSeededBtn').addEventListener('click', function(){
        var DATA = window.LANTERN_DATA;
        if (DATA && DATA.setMode) DATA.setMode('seeded');
        toast('Seeded mode. Reloading…');
        setTimeout(function(){ window.location.reload(); }, 400);
      });

      if (el('resetAllBtn')) el('resetAllBtn').addEventListener('click', function(){
        if (!confirm('Reset ALL Lantern data? This clears characters, posts, activity, everything. You will need to adopt a character again.')) return;
        var DATA = window.LANTERN_DATA;
        if (!DATA || !DATA.resetAllLanternData) { toast('Not available'); return; }
        if (DATA.resetAllLanternData()) { toast('All data reset'); window.location.reload(); }
        else { toast('Reset failed'); }
      });

      var toggle = el('testingToggle');
      var body = el('testingBody');
      if (toggle && body){
        toggle.addEventListener('click', function(){
          body.style.display = body.style.display === 'none' ? '' : 'none';
          el('testingToggleIcon').textContent = body.style.display === 'none' ? '▼' : '▲';
        });
      }
      (function(){
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
          var apiBase = (typeof window !== 'undefined' && window.LANTERN_AVATAR_API) ? (window.LANTERN_AVATAR_API + '').replace(/\/$/, '') : '';
          if (!apiBase){ toast('Beta reporting requires the API to be set.'); return; }
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
      })();
      testingWired = true;
    }

    window.addEventListener('hashchange', function(){
      if ((location.hash || '') !== '#profileNeedsAttention') return;
      var adopted = getAdopted();
      if (!adopted || !adopted.name) return;
      var pv = el('profileView');
      if (pv && pv.style.display !== 'none') {
        prepareProfileNeedsAttentionFromHash();
        renderMyCreations(myCreationsItemsCache, submissionsStatusFilter, myCreationsSearchQuery);
        finishProfileNeedsAttentionFromHash();
      }
    });

    /* All profile entry points (nav, student switch, redirects, deep links) converge here. When verify mode uses cloud, identity may be set async; runProfileEntry runs once identity is ready or when API is off. */
    runProfileEntry = function(){ showProfile(); };
    if (!studentIdentityFetchPending) runProfileEntry();
    if (typeof updateStudentVerifyBanner === 'function') updateStudentVerifyBanner();

    /* Class access bootstrap runs from js/class-access.js on DOMContentLoaded. */