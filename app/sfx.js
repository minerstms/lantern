// TMS Lantern SFX helper: cha_ching sound for Store.
(function (global) {
  var MTSS_SFX = {};
  var audio = null;
  var CHA_CHING_SRC = 'assets/cha_ching.mp3';

  function ensureAudio() {
    if (audio) return;
    if (typeof document !== 'undefined') {
      var tag = document.getElementById('mtssChaChing');
      if (tag && tag.src) {
        audio = tag;
        return;
      }
    }
    audio = new Audio(CHA_CHING_SRC);
    audio.preload = 'auto';
  }

  MTSS_SFX.init = function () {
    ensureAudio();
  };

  MTSS_SFX.playChaChing = function () {
    ensureAudio();
    if (!audio) return;
    try { audio.currentTime = 0; } catch (e) {}
    audio.volume = 1;
    try {
      var p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () { /* ignore */ });
      }
    } catch (e) {
      // ignore
    }
  };

  global.MTSS_SFX = MTSS_SFX;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      ensureAudio();
    } else {
      document.addEventListener('DOMContentLoaded', ensureAudio, { once: true });
    }
  }
})(typeof window !== 'undefined' ? window : self);
