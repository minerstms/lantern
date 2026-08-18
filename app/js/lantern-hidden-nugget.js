/**
 * Prompt #230 — Hidden Nugget reveal after poll/reaction races.
 * Display only. Server decides found/amount. Never trust a client "I found it" flag.
 */
(function (global) {
  'use strict';

  var BEAT_MS = 420;
  var HOLD_MS = 3200;

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function formatRewardCopy(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '';
    return '+' + Math.trunc(n) + ' Nugget' + (Math.trunc(n) === 1 ? '' : 's');
  }

  function payloadFromResponse(res) {
    var hn = res && res.hidden_nugget;
    if (!hn || !hn.found || hn.already) return null;
    return {
      found: true,
      amount: Number(hn.amount) || 0,
      copy: hn.copy || formatRewardCopy(hn.amount),
    };
  }

  function ensureStyle() {
    if (global.document.getElementById('lanternHiddenNuggetStyle')) return;
    var style = global.document.createElement('style');
    style.id = 'lanternHiddenNuggetStyle';
    style.textContent =
      '.lanternHiddenNuggetReveal{position:fixed;inset:auto 16px 24px 16px;z-index:80;max-width:520px;margin:0 auto;padding:16px 18px;border-radius:18px;background:linear-gradient(180deg,#1d2b4a 0%,#10192d 100%);color:#eaf0ff;box-shadow:0 10px 28px rgba(0,0,0,.35);text-align:center;font-size:24px;line-height:1.3;}' +
      '.lanternHiddenNuggetReveal h2{margin:0 0 6px;font-size:28px;}' +
      '.lanternHiddenNuggetReveal .hnAmount{font-weight:800;color:#ffe27a;}' +
      '.lanternHiddenNuggetReveal.is-pop{animation:lanternHnPop .28s ease-out;}' +
      '@media (prefers-reduced-motion: reduce){.lanternHiddenNuggetReveal.is-pop{animation:none;}}' +
      '@keyframes lanternHnPop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}';
    global.document.head.appendChild(style);
  }

  function playSparkleIfAllowed() {
    var a = global.LANTERN_RACE_AUDIO;
    if (a && typeof a.playSparkle === 'function') a.playSparkle();
  }

  function showReveal(payload, host) {
    if (!payload || !payload.found) return;
    ensureStyle();
    var existing = global.document.getElementById('lanternHiddenNuggetReveal');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var box = global.document.createElement('div');
    box.id = 'lanternHiddenNuggetReveal';
    box.className = 'lanternHiddenNuggetReveal is-pop';
    box.setAttribute('role', 'status');
    var amount = formatRewardCopy(payload.amount);
    box.innerHTML =
      '<h2>✨ Hidden Nugget!</h2>' +
      (amount ? '<div class="hnAmount">' + amount + '</div>' : '<div>Found for today.</div>');
    var parent = host && host.appendChild ? host : global.document.body;
    parent.appendChild(box);
    playSparkleIfAllowed();
    if (global.LanternWallet && typeof global.LanternWallet.refreshBalance === 'function' && payload.amount > 0) {
      global.LanternWallet.refreshBalance({ force: true });
    }
    global.setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, HOLD_MS);
  }

  function scheduleAfterRace(payload, host) {
    if (!payload) return;
    var wait = prefersReducedMotion() ? 0 : BEAT_MS;
    global.setTimeout(function () {
      showReveal(payload, host);
    }, wait);
  }

  global.LANTERN_HIDDEN_NUGGET = {
    formatRewardCopy: formatRewardCopy,
    payloadFromResponse: payloadFromResponse,
    showReveal: showReveal,
    scheduleAfterRace: scheduleAfterRace,
    prefersReducedMotion: prefersReducedMotion,
  };
})(typeof window !== 'undefined' ? window : self);
