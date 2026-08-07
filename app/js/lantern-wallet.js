/**
 * Shared authoritative wallet balance — GET /api/economy/balance.
 * Used by Store, Profile, and Avatar purchase flows.
 */
(function (global) {
  'use strict';

  var AVATAR_UPLOAD_COST = 25;

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

  function adoptedCharacterName() {
    if (global.LanternLockerMe && typeof global.LanternLockerMe.adoptedFromLocker === 'function') {
      var locker = global.LanternLockerMe.getLockerMe ? global.LanternLockerMe.getLockerMe() : null;
      var adopted = global.LanternLockerMe.adoptedFromLocker(locker);
      if (adopted && adopted.name) return String(adopted.name).trim();
    }
    return '';
  }

  function fetchAuthoritativeBalance(characterName) {
    var name = String(characterName || adoptedCharacterName() || '').trim();
    if (!name) {
      return Promise.resolve({ ok: false, error: 'no_character', available: null, earned: null, spent: null });
    }
    var base = economyApiBase();
    if (base) {
      return global
        .fetch(base + '/api/economy/balance?character_name=' + encodeURIComponent(name), {
          credentials: 'include',
          cache: 'no-store',
        })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          if (res && res.ok) {
            return {
              ok: true,
              student_name: name,
              available: Number(res.balance) || 0,
              earned: res.earned,
              spent: res.spent,
            };
          }
          return {
            ok: false,
            error: (res && res.error) || 'Failed',
            available: null,
            earned: null,
            spent: null,
          };
        })
        .catch(function () {
          return { ok: false, error: 'Network error', available: null, earned: null, spent: null };
        });
    }
    var createRun =
      typeof global.LANTERN_API !== 'undefined' && global.LANTERN_API.createRun ? global.LANTERN_API.createRun() : null;
    if (!createRun) {
      return Promise.resolve({ ok: false, error: 'API not loaded', available: null, earned: null, spent: null });
    }
    return new Promise(function (resolve) {
      createRun
        .withSuccessHandler(function (res) {
          resolve(res || { ok: false, available: null });
        })
        .withFailureHandler(function () {
          resolve({ ok: false, available: null });
        })
        .storeGetBalance({ student_name: name });
    });
  }

  function refreshAllVisibleWalletDisplays(opts) {
    opts = opts || {};
    if (global.LanternStoreWallet && typeof global.LanternStoreWallet.refresh === 'function') {
      return global.LanternStoreWallet.refresh(
        Object.assign({ force: true, silent: true, allowHidden: true }, opts)
      );
    }
    return fetchAuthoritativeBalance();
  }

  global.LanternWallet = {
    AVATAR_UPLOAD_COST: AVATAR_UPLOAD_COST,
    economyApiBase: economyApiBase,
    fetchBalance: fetchAuthoritativeBalance,
    refreshAllVisible: refreshAllVisibleWalletDisplays,
  };
})(typeof window !== 'undefined' ? window : self);
