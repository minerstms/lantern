/**
 * Shared fullscreen Game Player — pregame hero from canonical catalog artwork, then mounts game surface.
 * Prompt #149: same game.image used on cards is the selected-game hero source of truth.
 */
(function (global) {
  'use strict';

  var state = {
    open: false,
    phase: 'closed', // closed | pregame | playing
    scrollY: 0,
    surface: null,
    mount: { parent: null, next: null },
    onExit: null,
    onPregameStart: null,
    returnFocus: null,
    escapeHandler: null,
    gameMeta: null,
    sponsoredFreeMission: false,
    sponsoredRewardAmount: 1,
  };
  var pregameUnsub = null;

  function el(id) {
    return document.getElementById(id);
  }

  function overlayEl() {
    return el('lanternGamePlayerOverlay');
  }

  function stageEl() {
    return el('lanternGamePlayerStage');
  }

  function pregameEl() {
    return el('lanternGamePlayerPregame');
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

  /** Resolve catalog entry + canonical artwork (same field as Games cards). */
  function resolveGameMeta(opts) {
    opts = opts || {};
    var cat = global.LANTERN_GAME_CATALOG;
    var game = null;
    if (cat) {
      if (opts.gameId && typeof cat.getGameById === 'function') game = cat.getGameById(opts.gameId);
      if (!game && opts.gameName && typeof cat.getGameByName === 'function') game = cat.getGameByName(opts.gameName);
      if (!game && opts.title && typeof cat.getGameByName === 'function') game = cat.getGameByName(opts.title);
    }
    var artwork = '';
    if (opts.artworkUrl) artwork = String(opts.artworkUrl);
    else if (game && game.image) artwork = String(game.image);
    var title = (opts.title || (game && game.name) || 'Game').trim();
    var description = '';
    if (opts.description != null) description = String(opts.description);
    else if (game && game.description) description = String(game.description);
    // Arcade / hunt / memory need max play area — large hero is pregame-only.
    // Trivia keeps the same rule for consistency (shared collapse, compact topbar chip).
    var heroDuringGameplay = opts.heroDuringGameplay === true;
    if (game && game.heroDuringGameplay === true) heroDuringGameplay = true;
    return {
      game: game,
      title: title,
      description: description,
      artworkUrl: artwork,
      heroDuringGameplay: heroDuringGameplay,
    };
  }

  function lockScroll() {
    state.scrollY = global.scrollY || global.document.documentElement.scrollTop || 0;
    if (global.LanternInteractiveSurface && typeof global.LanternInteractiveSurface.lockPage === 'function') {
      global.LanternInteractiveSurface.lockPage();
    } else {
      global.document.body.classList.add('lantern-game-player-scroll-lock');
      global.document.body.style.top = '-' + state.scrollY + 'px';
    }
    global.document.body.classList.add('lantern-game-player-active');
  }

  function unlockScroll() {
    if (global.LanternInteractiveSurface && typeof global.LanternInteractiveSurface.unlockPage === 'function') {
      global.LanternInteractiveSurface.unlockPage();
    } else {
      global.document.body.classList.remove('lantern-game-player-scroll-lock');
      global.document.body.style.top = '';
      global.scrollTo(0, state.scrollY);
    }
    global.document.body.classList.remove('lantern-game-player-active');
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

  function setPregameCost(text) {
    var costEl = el('lanternGamePlayerPregameCost');
    if (!costEl) return;
    var msg = text != null ? String(text).trim() : '';
    if (!msg) {
      costEl.textContent = '';
      costEl.hidden = true;
      costEl.setAttribute('hidden', '');
      return;
    }
    costEl.textContent = msg;
    costEl.hidden = false;
    costEl.removeAttribute('hidden');
  }

  function formatSponsoredRewardCopy(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n) || n < 0) n = 1;
    if (!(n > 0)) return '';
    return '+' + n + ' Nugget' + (n === 1 ? '' : 's');
  }

  function setSponsoredMissionPregameCost(amount) {
    var costEl = el('lanternGamePlayerPregameCost');
    if (!costEl) return;
    var rewardCopy = formatSponsoredRewardCopy(amount != null ? amount : state.sponsoredRewardAmount);
    var rewardHtml = rewardCopy
      ? (' <img src="assets/icons/nugget.png" alt="" class="lanternGamePlayerNuggetIcon" width="18" height="18"> ' + rewardCopy)
      : '';
    costEl.innerHTML = 'FREE TO PLAY · Complete the challenge to earn' + (rewardHtml || ' a mission reward');
    costEl.hidden = false;
    costEl.removeAttribute('hidden');
  }

  function setPregameStatus(text, kind) {
    var statusEl = el('lanternGamePlayerPregameStatus');
    if (!statusEl) return;
    var msg = text != null ? String(text).trim() : '';
    statusEl.classList.remove('is-error');
    if (!msg) {
      statusEl.textContent = '';
      statusEl.hidden = true;
      statusEl.setAttribute('hidden', '');
      return;
    }
    statusEl.textContent = msg;
    if (kind === 'error' || kind === 'insufficient') statusEl.classList.add('is-error');
    statusEl.hidden = false;
    statusEl.removeAttribute('hidden');
  }

  function clearPregameMessages() {
    setPregameStatus('');
  }

  function applyPregameBalance(cost, snap) {
    if (!state.open || state.phase !== 'pregame') return;
    if (!snap) return;
    if (snap.status === 'needs_link' || snap.needs_linking) {
      setPregameCost(cost + ' Nugget = 1 Play');
      setPregameStatus('Nugget account needs link', 'error');
      return;
    }
    if (snap.status === 'no_nugget_account' || snap.no_nugget_account) {
      setPregameCost(cost + ' Nugget = 1 Play');
      setPregameStatus('No Nugget account', 'error');
      return;
    }
    if (snap.status === 'ok' && snap.available != null) {
      var avail = Number(snap.available);
      setPregameCost(cost + ' Nugget = 1 Play. You currently have ' + avail + ' Nugget' + (avail === 1 ? '' : 's') + '.');
      if (Number.isFinite(avail) && avail < cost) {
        setPregameStatus('You need 1 Nugget to play.', 'insufficient');
      }
      return;
    }
    if (snap.status === 'error' && snap.lastGoodAvailable == null) {
      setPregameCost(cost + ' Nugget = 1 Play');
    }
  }

  function refreshPregameCostHint(gameName) {
    if (state.sponsoredFreeMission) {
      setSponsoredMissionPregameCost();
      return;
    }
    var paid = global.LanternGamesPaidStart;
    var cost = 1;
    if (paid && typeof paid.playCostForGame === 'function') {
      cost = paid.playCostForGame(gameName || (state.gameMeta && state.gameMeta.title) || '') || 1;
    }
    setPregameCost(cost + ' Nugget = 1 Play');
    if (global.LanternWallet && typeof global.LanternWallet.subscribe === 'function') {
      if (pregameUnsub) {
        pregameUnsub();
        pregameUnsub = null;
      }
      pregameUnsub = global.LanternWallet.subscribe(function (snap) {
        applyPregameBalance(cost, snap);
      });
      if (typeof global.LanternWallet.refreshBalance === 'function') {
        global.LanternWallet.refreshBalance();
      }
      return;
    }
    if (!paid || typeof paid.checkAffordable !== 'function') return;
    paid.checkAffordable(gameName || (state.gameMeta && state.gameMeta.title) || '').then(function (info) {
      if (!state.open || state.phase !== 'pregame') return;
      if (!info || !info.ok || info.available == null) {
        setPregameCost(cost + ' Nugget = 1 Play');
        return;
      }
      var avail = Number(info.available);
      setPregameCost(cost + ' Nugget = 1 Play. You currently have ' + avail + ' Nugget' + (avail === 1 ? '' : 's') + '.');
      if (info.affordable === false) {
        setPregameStatus('You need 1 Nugget to play.', 'insufficient');
      }
    }).catch(function () {});
  }

  function setPregameVisible(show) {
    var pre = pregameEl();
    var stage = stageEl();
    var overlay = overlayEl();
    if (pre) {
      if (show) {
        pre.hidden = false;
        pre.removeAttribute('hidden');
      } else {
        pre.hidden = true;
        pre.setAttribute('hidden', '');
      }
    }
    if (stage) {
      if (show) {
        stage.hidden = true;
        stage.setAttribute('hidden', '');
      } else {
        stage.hidden = false;
        stage.removeAttribute('hidden');
      }
    }
    if (overlay) {
      if (show) overlay.classList.add('lantern-game-player--pregame');
      else overlay.classList.remove('lantern-game-player--pregame');
      if (!show) overlay.classList.add('lantern-game-player--playing');
      else overlay.classList.remove('lantern-game-player--playing');
    }
  }

  function paintHero(meta) {
    var heroImg = el('lanternGamePlayerHeroImg');
    var titleArt = el('lanternGamePlayerTitleArt');
    var preTitle = el('lanternGamePlayerPregameTitle');
    var preDesc = el('lanternGamePlayerPregameDesc');
    var titleEl = el('lanternGamePlayerTitle');
    var url = meta && meta.artworkUrl ? meta.artworkUrl : '';
    var title = (meta && meta.title) || 'Game';

    if (titleEl) titleEl.textContent = title;
    if (preTitle) preTitle.textContent = title;
    if (preDesc) {
      preDesc.textContent = (meta && meta.description) || '';
      preDesc.hidden = !preDesc.textContent;
    }

    if (heroImg) {
      if (url) {
        heroImg.src = url;
        heroImg.alt = '';
        heroImg.hidden = false;
        heroImg.removeAttribute('hidden');
      } else {
        heroImg.removeAttribute('src');
        heroImg.hidden = true;
        heroImg.setAttribute('hidden', '');
      }
    }

    if (titleArt) {
      if (url) {
        titleArt.src = url;
        titleArt.alt = '';
      } else {
        titleArt.removeAttribute('src');
      }
      // Compact chip only during gameplay; hidden in pregame (large hero owns identity).
      titleArt.hidden = true;
      titleArt.setAttribute('hidden', '');
    }
  }

  function showTitleArtChip(show) {
    var titleArt = el('lanternGamePlayerTitleArt');
    if (!titleArt || !titleArt.getAttribute('src')) return;
    if (show) {
      titleArt.hidden = false;
      titleArt.removeAttribute('hidden');
    } else {
      titleArt.hidden = true;
      titleArt.setAttribute('hidden', '');
    }
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

  function beginGameplay() {
    if (!state.open || state.phase === 'playing') return false;
    var surface = state.surface;
    if (!surface) return false;
    setPregameVisible(false);
    reparentToStage(surface);
    state.phase = 'playing';
    // Compact identity chip during play (does not consume playable stage height).
    showTitleArtChip(true);
    var startBtn = el('lanternGamePlayerStartBtn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
    }
    return true;
  }

  function resetStartButton() {
    var startBtn = el('lanternGamePlayerStartBtn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
    }
  }

  function onStartClick() {
    if (!state.open || state.phase !== 'pregame') return;
    var startBtn = el('lanternGamePlayerStartBtn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Starting…';
    }
    // Clear prior failure while a genuine request is pending.
    clearPregameMessages();
    var starter = state.onPregameStart;
    if (typeof starter === 'function') {
      try {
        starter(function (ok, detail) {
          // done(false) = charge/preflight failed; stay on pregame with explanation.
          if (ok === false) {
            resetStartButton();
            applyPaidStartFailure(detail || {});
            return;
          }
          clearPregameMessages();
          if (!beginGameplay()) resetStartButton();
        });
      } catch (e) {
        resetStartButton();
        setPregameStatus('Couldn\'t start the game. Try again.', 'error');
      }
      return;
    }
    beginGameplay();
  }

  function applyPaidStartFailure(detail) {
    detail = detail || {};
    var err = String(detail.error || '').trim();
    var available = detail.available;
    if (err === 'insufficient') {
      var msg = 'You need 1 Nugget to play.';
      if (available != null && Number.isFinite(Number(available))) {
        msg += ' You currently have ' + Number(available) + ' Nugget' + (Number(available) === 1 ? '' : 's') + '.';
      }
      setPregameStatus(msg, 'insufficient');
      return;
    }
    if (err === 'wallet_error' || err === 'economy_unavailable' || err === 'transact_failed' || err === 'network') {
      setPregameStatus('Couldn\'t start the game. Try again.', 'error');
      return;
    }
    if (err === 'no_character') {
      setPregameStatus('Choose a character in Locker (Overview) to play.', 'error');
      return;
    }
    if (err === 'in_flight') {
      setPregameStatus('Start is already in progress. Wait a moment.', 'error');
      return;
    }
    setPregameStatus('Couldn\'t start the game. Try again.', 'error');
  }

  /**
   * @param {{
   *   title?: string,
   *   gameName?: string,
   *   gameId?: string,
   *   description?: string,
   *   artworkUrl?: string,
   *   surface: string|Element,
   *   onExit?: function,
   *   returnFocus?: Element,
   *   onPregameStart?: function(done: function): void,
   *   skipPregame?: boolean,
   *   heroDuringGameplay?: boolean
   * }} opts
   */
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
    state.onPregameStart = typeof opts.onPregameStart === 'function' ? opts.onPregameStart : null;
    state.returnFocus = opts.returnFocus || null;
    state.surface = surface;
    state.sponsoredFreeMission = opts.sponsoredFreeMission === true;
    var rewardRaw = opts.sponsoredRewardAmount != null ? Number(opts.sponsoredRewardAmount) : 1;
    state.sponsoredRewardAmount = Number.isFinite(rewardRaw) && rewardRaw >= 0 ? Math.trunc(rewardRaw) : 1;
    state.gameMeta = resolveGameMeta(opts);

    paintHero(state.gameMeta);
    lockScroll();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    state.open = true;
    bindEscape();

    var usePregame = !opts.skipPregame && pregameEl();
    if (usePregame) {
      state.phase = 'pregame';
      setPregameVisible(true);
      showTitleArtChip(false);
      clearPregameMessages();
      refreshPregameCostHint(state.gameMeta && (state.gameMeta.title || (state.gameMeta.game && state.gameMeta.game.name)));
      var startBtn = el('lanternGamePlayerStartBtn');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = 'Start';
        startBtn.focus();
      }
    } else {
      state.phase = 'playing';
      setPregameVisible(false);
      reparentToStage(surface);
      showTitleArtChip(!!(state.gameMeta && state.gameMeta.artworkUrl));
      var exitBtn = el('lanternGamePlayerExit');
      if (exitBtn) exitBtn.focus();
    }

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
    if (global.LanternGamesPaidStart && typeof global.LanternGamesPaidStart.clearLastRunId === 'function') {
      global.LanternGamesPaidStart.clearLastRunId();
    }

    if (state.surface) {
      reparentToHost(state.surface);
    }

    var overlay = overlayEl();
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('lantern-game-player--pregame');
      overlay.classList.remove('lantern-game-player--playing');
    }
    setPregameVisible(false);
    showTitleArtChip(false);

    if (state.open) unlockScroll();
    unbindEscape();

    var focusTarget = state.returnFocus;
    state.open = false;
    state.phase = 'closed';
    state.surface = null;
    state.onExit = null;
    state.onPregameStart = null;
    state.gameMeta = null;
    state.sponsoredFreeMission = false;
    state.sponsoredRewardAmount = 1;
    if (pregameUnsub) {
      pregameUnsub();
      pregameUnsub = null;
    }

    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus();
      } catch (e2) {}
    }
    state.returnFocus = null;
  }

  function wireControls() {
    var exitBtn = el('lanternGamePlayerExit');
    if (exitBtn && !exitBtn._lanternGamePlayerWired) {
      exitBtn._lanternGamePlayerWired = true;
      exitBtn.addEventListener('click', function () {
        close();
      });
    }
    var startBtn = el('lanternGamePlayerStartBtn');
    if (startBtn && !startBtn._lanternGamePlayerWired) {
      startBtn._lanternGamePlayerWired = true;
      startBtn.addEventListener('click', onStartClick);
    }
  }

  function init() {
    wireControls();
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LanternGamePlayer = {
    open: open,
    close: close,
    beginGameplay: beginGameplay,
    setPregameStatus: setPregameStatus,
    setPregameCost: setPregameCost,
    clearPregameMessages: clearPregameMessages,
    applyPaidStartFailure: applyPaidStartFailure,
    isOpen: function () {
      return state.open;
    },
    getPhase: function () {
      return state.phase;
    },
    resolveGameMeta: resolveGameMeta,
  };
})(typeof window !== 'undefined' ? window : globalThis);
