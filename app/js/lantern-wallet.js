/**
 * Shared authoritative wallet balance — GET /api/economy/balance.
 * Self wallet uses session-scoped GET /api/economy/balance (no client identity param).
 * Empty LANTERN_AVATAR_API means same-origin /api (Pages proxy), not local runner.
 * Prompt #170 — one signed-in balance state; every personal meter subscribes to it.
 */
(function (global) {
  'use strict';

  var AVATAR_UPLOAD_COST = 1;
  var VISIBILITY_MIN_MS = 4000;
  var DEDUPE_MS = 800;

  var listeners = [];
  var inFlight = null;
  var lastFetchAt = 0;
  var visibilityHooked = false;
  var boundElements = [];

  var state = {
    status: 'idle',
    available: null,
    earned: null,
    spent: null,
    lastGoodAvailable: null,
    stale: false,
    error: null,
    code: null,
    principal_type: null,
    economy_authority: null,
    needs_linking: false,
    no_nugget_account: false,
    ok: false,
  };

  function economyApiBase() {
    if (typeof global === 'undefined') return null;
    var raw =
      typeof global.LANTERN_ECONOMY_API !== 'undefined' &&
      global.LANTERN_ECONOMY_API !== null &&
      String(global.LANTERN_ECONOMY_API).trim() !== ''
        ? global.LANTERN_ECONOMY_API
        : global.LANTERN_AVATAR_API;
    if (typeof raw === 'undefined' || raw === null) return null;
    return String(raw).replace(/\/$/, '');
  }

  function economyBalanceUrl(characterName) {
    var base = economyApiBase();
    var prefix = base != null ? base : '';
    if (characterName != null && String(characterName).trim() !== '') {
      return prefix + '/api/economy/balance?character_name=' + encodeURIComponent(String(characterName).trim());
    }
    return prefix + '/api/economy/balance';
  }

  function finiteWalletNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function isNeedsLink(res) {
    if (!res) return false;
    return !!(
      res.code === 'needs_link' ||
      res.error === 'tms_identity_not_linked' ||
      res.error === 'tms_student_not_found' ||
      res.needs_linking
    );
  }

  function isNoNuggetAccount(res) {
    if (!res) return false;
    return !!(res.code === 'no_nugget_account' || res.error === 'no_nugget_account');
  }

  function normalizeWalletBalance(res, fallbackName) {
    if (!res || !res.ok) {
      return {
        ok: false,
        error: (res && res.error) || 'Failed',
        code: (res && (res.code || res.error)) || 'unavailable',
        message: (res && res.message) || null,
        available: null,
        earned: null,
        spent: null,
        economy_key: null,
        student_name: fallbackName || null,
        needs_linking: isNeedsLink(res),
        no_nugget_account: isNoNuggetAccount(res),
        principal_type: (res && res.principal_type) || null,
        economy_authority: (res && res.economy_authority) || null,
      };
    }
    var available = finiteWalletNumber(res.available);
    if (available === null) available = finiteWalletNumber(res.balance);
    if (available === null) {
      return {
        ok: false,
        error: 'invalid_balance_payload',
        code: 'unavailable',
        available: null,
        earned: null,
        spent: null,
        economy_key: (res.character_name || fallbackName || '').trim() || null,
        student_name: (res.character_name || fallbackName || '').trim() || fallbackName || null,
        needs_linking: false,
        no_nugget_account: false,
      };
    }
    var earned = finiteWalletNumber(res.earned);
    var spent = finiteWalletNumber(res.spent);
    var economyKey = (res.character_name || fallbackName || '').trim() || null;
    return {
      ok: true,
      available: available,
      earned: earned,
      spent: spent,
      economy_key: economyKey,
      student_name: economyKey,
      needs_linking: false,
      no_nugget_account: false,
      principal_type: res.principal_type || null,
      economy_authority: res.economy_authority || null,
    };
  }

  function snapshotState() {
    return {
      status: state.status,
      ok: state.ok,
      available: state.available,
      earned: state.earned,
      spent: state.spent,
      lastGoodAvailable: state.lastGoodAvailable,
      stale: state.stale,
      error: state.error,
      code: state.code,
      principal_type: state.principal_type,
      economy_authority: state.economy_authority,
      needs_linking: state.needs_linking,
      no_nugget_account: state.no_nugget_account,
    };
  }

  function notify() {
    var snap = snapshotState();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snap);
      } catch (_) {}
    }
    for (var j = 0; j < boundElements.length; j++) {
      var item = boundElements[j];
      if (item && item.el) renderBalance(item.el, item.options || {});
    }
  }

  function applyNormalized(res) {
    if (res && res.ok && res.available != null) {
      state.status = 'ok';
      state.ok = true;
      state.available = res.available;
      state.earned = res.earned;
      state.spent = res.spent;
      state.lastGoodAvailable = res.available;
      state.stale = false;
      state.error = null;
      state.code = null;
      state.needs_linking = false;
      state.no_nugget_account = false;
      state.principal_type = res.principal_type || null;
      state.economy_authority = res.economy_authority || null;
      return;
    }
    if (res && res.no_nugget_account) {
      state.status = 'no_nugget_account';
      state.ok = false;
      state.available = null;
      state.error = res.error || 'no_nugget_account';
      state.code = 'no_nugget_account';
      state.needs_linking = false;
      state.no_nugget_account = true;
      state.stale = false;
      return;
    }
    if (res && res.needs_linking) {
      state.status = 'needs_link';
      state.ok = false;
      state.available = null;
      state.error = res.error || 'needs_link';
      state.code = 'needs_link';
      state.needs_linking = true;
      state.no_nugget_account = false;
      state.stale = false;
      return;
    }
    state.status = 'error';
    state.ok = false;
    state.error = (res && res.error) || 'Balance unavailable';
    state.code = (res && res.code) || 'unavailable';
    state.needs_linking = false;
    state.no_nugget_account = false;
    if (state.lastGoodAvailable != null) {
      state.available = state.lastGoodAvailable;
      state.stale = true;
    } else {
      state.available = null;
      state.stale = false;
    }
  }

  function fetchBalanceFromLocalRunner(characterName) {
    var createRun =
      typeof global.LANTERN_API !== 'undefined' && global.LANTERN_API.createRun ? global.LANTERN_API.createRun() : null;
    if (!createRun) {
      return Promise.resolve({ ok: false, error: 'API not loaded', available: null, earned: null, spent: null });
    }
    var lockerName = String(characterName || '').trim();
    if (!lockerName && global.LanternLockerMe && typeof global.LanternLockerMe.economyKeyFromLocker === 'function') {
      var locker = global.LanternLockerMe.getLockerMe ? global.LanternLockerMe.getLockerMe() : null;
      lockerName = global.LanternLockerMe.economyKeyFromLocker(locker);
    }
    return new Promise(function (resolve) {
      createRun
        .withSuccessHandler(function (res) {
          resolve(normalizeWalletBalance(res, lockerName));
        })
        .withFailureHandler(function () {
          resolve({ ok: false, error: 'local_runner_failed', available: null, earned: null, spent: null });
        })
        .storeGetBalance({ student_name: lockerName });
    });
  }

  function fetchBalanceFromHttp(characterName) {
    if (typeof global.fetch !== 'function') {
      return fetchBalanceFromLocalRunner(characterName);
    }
    var url = economyBalanceUrl(characterName);
    return global
      .fetch(url, { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        return normalizeWalletBalance(res, characterName || '');
      })
      .catch(function () {
        return { ok: false, error: 'Network error', code: 'unavailable', available: null, earned: null, spent: null };
      });
  }

  function economyTransactUrl() {
    if (!canUseHttpEconomy()) return null;
    var base = economyApiBase();
    return (base != null ? base : '') + '/api/economy/transact';
  }

  function canUseHttpEconomy() {
    return economyApiBase() !== null || typeof global.fetch === 'function';
  }

  function postEconomyTransact(body) {
    var url = economyTransactUrl();
    if (!url || typeof global.fetch !== 'function') {
      return Promise.resolve({ ok: false, error: 'economy_unavailable' });
    }
    return global
      .fetch(url, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res && res.ok) {
          refreshBalance({ force: true });
        }
        return res;
      })
      .catch(function () {
        return { ok: false, error: 'Network error' };
      });
  }

  function fetchMyBalance() {
    return refreshBalance({ force: true });
  }

  function fetchAuthoritativeBalance(characterName) {
    var explicit = characterName != null && String(characterName).trim() !== '';
    if (!explicit) {
      return fetchMyBalance();
    }
    if (economyApiBase() !== null || typeof global.fetch === 'function') {
      return fetchBalanceFromHttp(String(characterName).trim());
    }
    return fetchBalanceFromLocalRunner(String(characterName).trim());
  }

  function refreshBalance(opts) {
    opts = opts || {};
    var now = Date.now();
    if (!opts.force && inFlight) return inFlight;
    if (!opts.force && state.status === 'ok' && now - lastFetchAt < DEDUPE_MS) {
      return Promise.resolve(snapshotState());
    }
    if (state.status === 'idle' || state.status === 'loading') {
      state.status = 'loading';
      notify();
    }
    lastFetchAt = now;
    var req =
      economyApiBase() !== null || typeof global.fetch === 'function'
        ? fetchBalanceFromHttp(null)
        : fetchBalanceFromLocalRunner('');
    inFlight = req.then(function (res) {
      applyNormalized(res);
      notify();
      return snapshotState();
    }).then(function (snap) {
      inFlight = null;
      return snap;
    }, function () {
      inFlight = null;
      applyNormalized({ ok: false, error: 'Network error', code: 'unavailable' });
      notify();
      return snapshotState();
    });
    return inFlight;
  }

  function getState() {
    return snapshotState();
  }

  function getBalance() {
    if (state.status === 'ok' || state.status === 'needs_link' || state.status === 'no_nugget_account') {
      return Promise.resolve(snapshotState());
    }
    return refreshBalance();
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return function () {};
    listeners.push(callback);
    try {
      callback(snapshotState());
    } catch (_) {}
    ensureVisibilityHook();
    return function unsubscribe() {
      listeners = listeners.filter(function (fn) {
        return fn !== callback;
      });
    };
  }

  function formatBalanceText(options) {
    options = options || {};
    var format = options.format || 'number';
    if (state.status === 'loading' || state.status === 'idle') {
      if (format === 'full') return '… Nuggets';
      if (format === 'compact') return '… Nuggets';
      return '…';
    }
    if (state.status === 'needs_link') return 'Needs Link';
    if (state.status === 'no_nugget_account') {
      return format === 'full' ? 'No Nugget account' : 'N/A';
    }
    if (state.status === 'error' && state.lastGoodAvailable == null) {
      return format === 'number' ? '—' : 'Balance unavailable';
    }
    var n = state.available;
    if (n == null) {
      return format === 'number' ? '—' : 'Balance unavailable';
    }
    var num = String(n);
    if (state.stale && format !== 'number') {
      if (format === 'full') return num + ' Nuggets available (stale)';
      return num + ' Nuggets (stale)';
    }
    if (format === 'full') return num + ' Nuggets available';
    if (format === 'compact') return num + ' Nuggets';
    return num;
  }

  function renderBalance(element, options) {
    if (!element) return;
    var text = formatBalanceText(options);
    if (element.textContent !== text) element.textContent = text;
    if (typeof element.setAttribute !== 'function') return;
    if (state.status === 'error' && state.stale) {
      element.setAttribute('title', 'Balance unavailable — last known amount');
    } else if (state.status === 'needs_link') {
      element.setAttribute('title', 'Nugget account needs linking');
    } else if (state.status === 'no_nugget_account') {
      element.setAttribute('title', 'No Nugget account');
    } else if (state.status === 'error') {
      element.setAttribute('title', 'Balance unavailable');
    } else if (typeof element.removeAttribute === 'function') {
      element.removeAttribute('title');
    }
  }

  function bindElement(element, options) {
    if (!element) return function () {};
    var opts = options || {};
    boundElements.push({ el: element, options: opts });
    renderBalance(element, opts);
    ensureVisibilityHook();
    if (state.status === 'idle') refreshBalance();
    return function unbind() {
      boundElements = boundElements.filter(function (item) {
        return item.el !== element;
      });
    };
  }

  function refreshAllVisibleWalletDisplays(opts) {
    opts = opts || {};
    var shared = refreshBalance({ force: true });
    if (global.LanternStoreWallet && typeof global.LanternStoreWallet.refresh === 'function') {
      return shared.then(function (snap) {
        return global.LanternStoreWallet.refresh(
          Object.assign({ force: true, silent: true, allowHidden: true }, opts)
        ).then(function () {
          return snap;
        });
      });
    }
    return shared;
  }

  function ensureVisibilityHook() {
    if (visibilityHooked || typeof global.document === 'undefined') return;
    visibilityHooked = true;
    var lastVis = 0;
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden) return;
      var now = Date.now();
      if (now - lastVis < VISIBILITY_MIN_MS) return;
      lastVis = now;
      refreshBalance({ force: true });
    });
  }

  var api = {
    AVATAR_UPLOAD_COST: AVATAR_UPLOAD_COST,
    economyApiBase: economyApiBase,
    economyBalanceUrl: economyBalanceUrl,
    economyTransactUrl: economyTransactUrl,
    canUseHttpEconomy: canUseHttpEconomy,
    postEconomyTransact: postEconomyTransact,
    normalizeWalletBalance: normalizeWalletBalance,
    fetchBalance: fetchAuthoritativeBalance,
    fetchMyBalance: fetchMyBalance,
    refreshAllVisible: refreshAllVisibleWalletDisplays,
    getState: getState,
    getBalance: getBalance,
    refreshBalance: refreshBalance,
    renderBalance: renderBalance,
    bindElement: bindElement,
    subscribe: subscribe,
    formatBalanceText: formatBalanceText,
  };

  global.LanternWallet = api;
  global.LanternEconomy = api;
})(typeof window !== 'undefined' ? window : self);
