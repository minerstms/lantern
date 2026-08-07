/**
 * Contribute Studio — production-scale detail emulator.
 * Renders the real opened-detail surface at --lantern-opened-content-max-width (520px),
 * then uniformly scales the assembled result to fit the Studio preview pane.
 */
(function (global) {
  'use strict';

  var DEFAULT_INTRINSIC_PX = 520;
  var viewportId = 'studioDetailViewport';
  var stageId = 'studioDetailScaleStage';
  var resizeObserver = null;
  var mutationObserver = null;
  var resizeScheduled = false;

  function readIntrinsicWidthPx() {
    try {
      var doc = global.document;
      if (!doc || !doc.documentElement) return DEFAULT_INTRINSIC_PX;
      var raw = global.getComputedStyle(doc.documentElement).getPropertyValue('--lantern-opened-content-max-width');
      if (raw) {
        var n = parseFloat(String(raw).trim());
        if (!isNaN(n) && n > 0) return n;
      }
    } catch (e) {}
    return DEFAULT_INTRINSIC_PX;
  }

  function getViewportEl() {
    return global.document.getElementById(viewportId);
  }

  function getMountEl() {
    return global.document.getElementById(stageId);
  }

  function scheduleApplyScale() {
    if (resizeScheduled) return;
    resizeScheduled = true;
    global.requestAnimationFrame(function () {
      resizeScheduled = false;
      applyScale();
    });
  }

  function applyScale() {
    var viewport = getViewportEl();
    var stage = getMountEl();
    if (!viewport || !stage) return;

    var intrinsicW = readIntrinsicWidthPx();
    viewport.style.setProperty('--studio-detail-intrinsic-width', intrinsicW + 'px');
    stage.style.width = intrinsicW + 'px';
    stage.style.maxWidth = intrinsicW + 'px';
    stage.style.minWidth = intrinsicW + 'px';

    var availableW = viewport.clientWidth;
    if (availableW <= 0) return;

    var scale = Math.min(1, availableW / intrinsicW);
    stage.style.setProperty('--studio-detail-scale', String(scale));
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.transformOrigin = 'top center';

    var naturalH = stage.offsetHeight || stage.scrollHeight || 0;
    var scaledH = Math.ceil(naturalH * scale);
    viewport.style.height = scaledH > 0 ? scaledH + 'px' : '';
    viewport.style.minHeight = scaledH > 0 ? scaledH + 'px' : '';
  }

  function bindObservers() {
    var viewport = getViewportEl();
    var stage = getMountEl();
    if (!viewport || !stage) return;

    if (global.ResizeObserver) {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new global.ResizeObserver(function () {
        scheduleApplyScale();
      });
      resizeObserver.observe(viewport);
      resizeObserver.observe(stage);
    }

    if (global.MutationObserver) {
      if (mutationObserver) mutationObserver.disconnect();
      mutationObserver = new global.MutationObserver(function () {
        scheduleApplyScale();
      });
      mutationObserver.observe(stage, { childList: true, subtree: true, characterData: true, attributes: true });
    }

    stage.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) {
        img.addEventListener('load', scheduleApplyScale, { once: true });
        img.addEventListener('error', scheduleApplyScale, { once: true });
      }
    });
  }

  function afterMount() {
    bindObservers();
    scheduleApplyScale();
    global.requestAnimationFrame(function () {
      scheduleApplyScale();
    });
  }

  function init() {
    if (!getViewportEl() || !getMountEl()) return;
    bindObservers();
    global.addEventListener('resize', scheduleApplyScale);
    scheduleApplyScale();
  }

  global.LanternStudioDetailEmulator = {
    readIntrinsicWidthPx: readIntrinsicWidthPx,
    getMountEl: getMountEl,
    getViewportEl: getViewportEl,
    applyScale: applyScale,
    afterMount: afterMount,
    init: init,
  };

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
