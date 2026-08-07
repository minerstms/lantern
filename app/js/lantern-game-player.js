/**
 * Shared fullscreen Game Player — mounts existing game surfaces after paid start.
 */
(function (global) {
  'use strict';

  var state = {
    open: false,
    scrollY: 0,
    surface: null,
    mount: { parent: null, next: null },
    onExit: null,
    returnFocus: null,
    escapeHandler: null,
  };

  function el(id) {
    return document.getElementById(id);
  }

  function overlayEl() {
    return el('lanternGamePlayerOverlay');
  }

  function stageEl() {
    return el('lanternGamePlayerStage');
  }

  function surfaceHostEl() {
    return el('lanternGamePlayerSurfaceHost');
  }

  function resolveSurface(surface) {
    if (!surface) return null;
    if (typeof surface === 'string') return el(surface);
    if (surface.nodeType === 1) return surface;
    return null;
  }

  function lockScroll() {
    state.scrollY = global.scrollY || global.document.documentElement.scrollTop || 0;
    global.document.body.classList.add('lantern-game-player-scroll-lock');
    global.document.body.style.top = '-' + state.scrollY + 'px';
    global.document.body.classList.add('lantern-game-player-active');
  }

  function unlockScroll() {
    global.document.body.classList.remove('lantern-game-player-scroll-lock');
    global.document.body.classList.remove('lantern-game-player-active');
    global.document.body.style.top = '';
    global.scrollTo(0, state.scrollY);
  }

  function reparentToStage(surface) {
    var stage = stageEl();
    if (!stage || !surface) return;
    state.mount.parent = surface.parentNode;
    state.mount.next = surface.nextSibling;
    stage.appendChild(surface);
    surface.classList.add('lanternGamePlayerMounted');
    surface.removeAttribute('hidden');
    if (surface.style) surface.style.display = '';
  }

  function reparentToHost(surface) {
    if (!surface) return;
    var host = surfaceHostEl();
    surface.classList.remove('lanternGamePlayerMounted');
    surface.classList.remove('open');
    if (host) {
      host.appendChild(surface);
    } else if (state.mount.parent) {
      if (state.mount.next) state.mount.parent.insertBefore(surface, state.mount.next);
      else state.mount.parent.appendChild(surface);
    }
    state.mount.parent = null;
    state.mount.next = null;
  }

  function bindEscape() {
    unbindEscape();
    state.escapeHandler = function (e) {
      if (e.key === 'Escape' && state.open) {
        e.preventDefault();
        close();
      }
    };
    global.document.addEventListener('keydown', state.escapeHandler);
  }

  function unbindEscape() {
    if (state.escapeHandler) {
      global.document.removeEventListener('keydown', state.escapeHandler);
      state.escapeHandler = null;
    }
  }

  function open(opts) {
    opts = opts || {};
    var overlay = overlayEl();
    var stage = stageEl();
    var surface = resolveSurface(opts.surface);
    if (!overlay || !stage || !surface) {
      return false;
    }
    if (state.open) close({ silent: true });

    state.onExit = typeof opts.onExit === 'function' ? opts.onExit : null;
    state.returnFocus = opts.returnFocus || null;
    state.surface = surface;

    var titleEl = el('lanternGamePlayerTitle');
    if (titleEl) titleEl.textContent = opts.title || 'Game';

    reparentToStage(surface);
    lockScroll();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    state.open = true;
    bindEscape();

    var exitBtn = el('lanternGamePlayerExit');
    if (exitBtn) exitBtn.focus();

    return true;
  }

  function close(opts) {
    opts = opts || {};
    if (!state.open && !opts.force) return;

    if (state.onExit && !opts.skipExit) {
      try {
        state.onExit();
      } catch (e) {}
    }

    if (state.surface) {
      reparentToHost(state.surface);
    }

    var overlay = overlayEl();
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }

    if (state.open) unlockScroll();
    unbindEscape();

    var focusTarget = state.returnFocus;
    state.open = false;
    state.surface = null;
    state.onExit = null;

    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus();
      } catch (e2) {}
    }
    state.returnFocus = null;
  }

  function wireExitButton() {
    var exitBtn = el('lanternGamePlayerExit');
    if (!exitBtn || exitBtn._lanternGamePlayerWired) return;
    exitBtn._lanternGamePlayerWired = true;
    exitBtn.addEventListener('click', function () {
      close();
    });
  }

  function init() {
    wireExitButton();
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LanternGamePlayer = {
    open: open,
    close: close,
    isOpen: function () {
      return state.open;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
