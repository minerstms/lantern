/**
 * Contribute Studio RIGHT — uniform scale of canonical production modal preview.
 * Renders at ~520px natural width; one scale factor applied to the whole stage.
 */
(function (global) {
  'use strict';

  var DEFAULT_CANONICAL_W = 520;
  var MIN_SCALE = 0.58;

  function readCanonicalWidth() {
    if (!global.document || !global.document.documentElement) return DEFAULT_CANONICAL_W;
    var raw = global.getComputedStyle(global.document.documentElement)
      .getPropertyValue('--lantern-opened-content-max-width')
      .trim();
    var n = parseFloat(raw);
    return n > 0 ? n : DEFAULT_CANONICAL_W;
  }

  /**
   * One uniform scale from available inner width; floor at MIN_SCALE.
   */
  function computeScale(availableW, canonicalW) {
    canonicalW = canonicalW > 0 ? canonicalW : readCanonicalWidth();
    availableW = Math.max(0, availableW || 0);
    if (availableW <= 0 || canonicalW <= 0) return 1;
    var s = availableW / canonicalW;
    if (s > 1) s = 1;
    if (s < MIN_SCALE) s = MIN_SCALE;
    return s;
  }

  function measureStageNaturalHeight(stage) {
    if (!stage) return 0;
    stage.style.transform = 'none';
    return Math.max(stage.offsetHeight, stage.scrollHeight);
  }

  function applyScale(host) {
    if (!host) return null;
    var scaleHost = host.querySelector('.studioOpenedPreviewScaleHost');
    var stage = host.querySelector('.studioOpenedPreviewScaleStage');
    if (!scaleHost || !stage) return null;

    var canonicalW = readCanonicalWidth();
    stage.style.width = canonicalW + 'px';
    stage.style.transform = 'none';
    stage.style.transformOrigin = 'top left';

    var naturalH = measureStageNaturalHeight(stage);
    var availableW = host.clientWidth;
    var scale = computeScale(availableW, canonicalW);
    var scaledW = canonicalW * scale;
    var scaledH = naturalH * scale;

    scaleHost.style.width = scaledW + 'px';
    scaleHost.style.height = scaledH + 'px';
    scaleHost.style.marginLeft = 'auto';
    scaleHost.style.marginRight = 'auto';

    stage.style.transform = 'scale(' + scale + ')';

    host.style.setProperty('--studio-opened-preview-scale', String(scale));
    host.style.setProperty('--studio-opened-preview-scaled-w', scaledW + 'px');
    host.style.setProperty('--studio-opened-preview-scaled-h', scaledH + 'px');

    return {
      canonicalW: canonicalW,
      naturalH: naturalH,
      scale: scale,
      scaledW: scaledW,
      scaledH: scaledH
    };
  }

  function attach(host) {
    if (!host) return;
    applyScale(host);
    if (host._studioPreviewScaleRO || typeof global.ResizeObserver !== 'function') return;
    host._studioPreviewScaleRO = new global.ResizeObserver(function () {
      applyScale(host);
    });
    host._studioPreviewScaleRO.observe(host);
    var stage = host.querySelector('.studioOpenedPreviewScaleStage');
    if (stage) host._studioPreviewScaleRO.observe(stage);
  }

  function scheduleAttach(host) {
    if (!host) return;
    attach(host);
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(function () { applyScale(host); });
    }
    global.setTimeout(function () { applyScale(host); }, 60);
    global.setTimeout(function () { applyScale(host); }, 200);
  }

  function wrapModal(modal) {
    var scaleHost = global.document.createElement('div');
    scaleHost.className = 'studioOpenedPreviewScaleHost';
    var stage = global.document.createElement('div');
    stage.className = 'studioOpenedPreviewScaleStage';
    if (modal) stage.appendChild(modal);
    scaleHost.appendChild(stage);
    return scaleHost;
  }

  global.LANTERN_STUDIO_OPENED_PREVIEW_SCALE = {
    CANONICAL_WIDTH: DEFAULT_CANONICAL_W,
    MIN_SCALE: MIN_SCALE,
    readCanonicalWidth: readCanonicalWidth,
    computeScale: computeScale,
    wrapModal: wrapModal,
    applyScale: applyScale,
    attach: attach,
    scheduleAttach: scheduleAttach
  };
})(typeof window !== 'undefined' ? window : self);
