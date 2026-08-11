/**
 * Shared authoritative wallet balance — GET /api/economy/balance.
 * Self wallet uses session-scoped GET /api/economy/balance (no client identity param).
 * Empty LANTERN_AVATAR_API means same-origin /api (Pages proxy), not local runner.
 */
(function (global) {
  'use strict';

  var AVATAR_UPLOAD_COST = 1;

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

  function normalizeWalletBalance(res, fallbackName) {
    if (!res || !res.ok) {
      return {
        ok: false,
        error: (res && res.error) || 'Failed',
        message: (res && res.message) || null,
        available: null,
        earned: null,
        spent: null,
        economy_key: null,
        student_name: fallbackName || null,
        needs_linking: !!(res && res.error === 'tms_identity_not_linked'),
      };
    }
    var available = finiteWalletNumber(res.available);
    if (available === null) available = finiteWalletNumber(res.balance);
    if (available === null) {
      return {
        ok: false,
        error: 'invalid_balance_payload',
        available: null,
        earned: null,
        spent: null,
        economy_key: (res.character_name || fallbackName || '').trim() || null,
        student_name: (res.character_name || fallbackName || '').trim() || fallbackName || null,
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
    };
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
        return { ok: false, error: 'Network error', available: null, earned: null, spent: null };
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false, error: 'Network error' };
      });
  }

  function fetchMyBalance() {
    if (economyApiBase() !== null || typeof global.fetch === 'function') {
      return fetchBalanceFromHttp(null);
    }
    return fetchBalanceFromLocalRunner('');
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

  function refreshAllVisibleWalletDisplays(opts) {
    opts = opts || {};
    if (global.LanternStoreWallet && typeof global.LanternStoreWallet.refresh === 'function') {
      return global.LanternStoreWallet.refresh(
        Object.assign({ force: true, silent: true, allowHidden: true }, opts)
      );
    }
    return fetchMyBalance();
  }

  global.LanternWallet = {
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
  };
})(typeof window !== 'undefined' ? window : self);
