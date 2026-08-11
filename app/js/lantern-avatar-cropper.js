/**
 * Canonical Lantern avatar cropper (Locker + Admin).
 * Exact Cropper.js options and output encoding shared by self-service and System Admin.
 * Requires: cropperjs, DOM ids avatarCropOverlay / avatarCropImage / controls.
 */
(function (global) {
  'use strict';

  var OUTPUT_WIDTH = 384;
  var OUTPUT_HEIGHT = 384;
  var OUTPUT_MIME = 'image/jpeg';
  var OUTPUT_QUALITY = 0.85;
  var MAX_FILE_BYTES = 3 * 1024 * 1024;
  var MIN_NATURAL = 128;
  var CROPPER_OPTIONS = {
    aspectRatio: 1,
    viewMode: 1,
    background: false,
    autoCropArea: 0.9,
  };

  var cropper = null;
  var openGuard = false;
  var submitting = false;
  var imageReady = false;
  var imageLoading = false;
  var loadToken = 0;
  var previewUrl = null;
  var selectedFile = null;
  var activeSession = null;
  var wired = false;

  function el(id) {
    return document.getElementById(id);
  }

  function destroyCropper() {
    if (cropper) {
      try {
        cropper.destroy();
      } catch (_) {}
      cropper = null;
    }
  }

  function setError(msg) {
    var errorEl = el('avatarCropError');
    if (errorEl) errorEl.textContent = msg || '';
  }

  function setImageStatus(opts) {
    opts = opts || {};
    var statusEl = el('avatarCropImageStatus');
    if (!statusEl) return;
    if (opts.loading) {
      statusEl.textContent = 'Preparing image…';
      return;
    }
    statusEl.textContent = '';
  }

  function syncSubmitState() {
    var submitBtn = el('avatarCropSubmitBtn');
    if (!submitBtn) return;
    var session = activeSession;
    var label = session && session.submitLabel != null ? String(session.submitLabel) : 'Submit avatar';
    submitBtn.textContent = label;
    var allowed = true;
    if (session && typeof session.isSubmitAllowed === 'function') {
      try {
        allowed = !!session.isSubmitAllowed({
          imageReady: imageReady,
          imageLoading: imageLoading,
          submitting: submitting,
        });
      } catch (_) {
        allowed = false;
      }
    } else {
      allowed = imageReady && !submitting;
    }
    submitBtn.disabled = !allowed;
  }

  function resetImageState(opts) {
    opts = opts || {};
    loadToken += 1;
    imageReady = false;
    imageLoading = false;
    previewUrl = null;
    selectedFile = null;
    if (!opts.keepCropper) destroyCropper();
    var imgEl = el('avatarCropImage');
    if (imgEl) {
      imgEl.onload = null;
      imgEl.onerror = null;
      imgEl.removeAttribute('src');
    }
    setImageStatus({});
    syncSubmitState();
  }

  function closeOverlay() {
    var overlayEl = el('avatarCropOverlay');
    var statusEl = el('avatarCropBalanceStatus');
    var imageStatusEl = el('avatarCropImageStatus');
    if (overlayEl) overlayEl.classList.remove('show');
    setError('');
    if (statusEl) statusEl.textContent = '';
    if (imageStatusEl) imageStatusEl.textContent = '';
    submitting = false;
    var session = activeSession;
    activeSession = null;
    resetImageState({ keepCropper: false });
    if (session && typeof session.onClose === 'function') {
      try {
        session.onClose();
      } catch (_) {}
    }
  }

  function validateFile(file) {
    if (!file) return 'Please choose an image file.';
    if (!/^image\//i.test(file.type || '')) return 'Please choose an image file.';
    if (file.size && file.size > MAX_FILE_BYTES) return 'Image is too large. Please keep it under 3MB.';
    return '';
  }

  function getCroppedDataUrl() {
    if (!cropper || !imageReady) return null;
    var canvas = cropper.getCroppedCanvas({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT });
    if (!canvas) return null;
    if (canvas.width < MIN_NATURAL || canvas.height < MIN_NATURAL) return null;
    return canvas.toDataURL(OUTPUT_MIME, OUTPUT_QUALITY);
  }

  function wireOnce() {
    if (wired) return;
    wired = true;

    var cropCloseBtn = el('avatarCropCloseBtn');
    var cropCancelBtn = el('avatarCropCancelBtn');
    if (cropCloseBtn) cropCloseBtn.addEventListener('click', closeOverlay);
    if (cropCancelBtn) cropCancelBtn.addEventListener('click', closeOverlay);

    var cropOverlay = el('avatarCropOverlay');
    if (cropOverlay) {
      cropOverlay.addEventListener('click', function (e) {
        if (e.target !== cropOverlay) return;
        if (openGuard) return;
        closeOverlay();
      });
    }

    var zoomInBtn = el('avatarCropZoomInBtn');
    var zoomOutBtn = el('avatarCropZoomOutBtn');
    var rotateBtn = el('avatarCropRotateLeftBtn');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', function () {
        if (cropper && imageReady) cropper.zoom(0.15);
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', function () {
        if (cropper && imageReady) cropper.zoom(-0.15);
      });
    }
    if (rotateBtn) {
      rotateBtn.addEventListener('click', function () {
        if (cropper && imageReady) cropper.rotate(90);
      });
    }

    var cropSubmitBtn = el('avatarCropSubmitBtn');
    if (cropSubmitBtn) {
      cropSubmitBtn.addEventListener('click', function () {
        var session = activeSession;
        var errorEl = el('avatarCropError');
        if (!session) return;
        if (submitting) return;
        if (!imageReady || !cropper) {
          if (errorEl) errorEl.textContent = imageLoading ? 'Preparing image…' : 'No image to crop.';
          return;
        }
        if (typeof session.isSubmitAllowed === 'function' && !session.isSubmitAllowed({
          imageReady: imageReady,
          imageLoading: imageLoading,
          submitting: submitting,
        })) {
          if (errorEl) errorEl.textContent = (session.blockedMessage && session.blockedMessage()) || 'Cannot submit yet.';
          return;
        }
        var dataUrl;
        try {
          dataUrl = getCroppedDataUrl();
          if (!dataUrl) {
            if (errorEl) errorEl.textContent = 'Unable to crop image.';
            return;
          }
        } catch (_) {
          if (errorEl) errorEl.textContent = 'Unable to crop image.';
          return;
        }
        submitting = true;
        syncSubmitState();
        Promise.resolve()
          .then(function () {
            return session.onConfirm(dataUrl);
          })
          .then(function (res) {
            submitting = false;
            if (!res || !res.ok) {
              syncSubmitState();
              if (errorEl) errorEl.textContent = (res && res.error) || 'Failed to submit avatar.';
              if (typeof session.onConfirmFailed === 'function') session.onConfirmFailed(res);
              return;
            }
            closeOverlay();
            if (typeof session.onConfirmSuccess === 'function') session.onConfirmSuccess(res);
          })
          .catch(function () {
            submitting = false;
            syncSubmitState();
            if (errorEl) errorEl.textContent = 'Failed to submit avatar.';
          });
      });
    }
  }

  /**
   * @param {File} file
   * @param {object} session
   * @param {string} [session.submitLabel]
   * @param {function} [session.isSubmitAllowed]
   * @param {function} [session.blockedMessage]
   * @param {function(dataUrl): Promise|{ok,error}} session.onConfirm
   * @param {function} [session.onConfirmSuccess]
   * @param {function} [session.onConfirmFailed]
   * @param {function} [session.onOpen]
   * @param {function} [session.onClose]
   * @param {string} [session.balanceStatusHtml] — text for #avatarCropBalanceStatus
   */
  function openFromFile(file, session) {
    wireOnce();
    var errorEl = el('avatarCropError');
    var imgEl = el('avatarCropImage');
    var overlayEl = el('avatarCropOverlay');
    if (!imgEl || !overlayEl) {
      return { ok: false, error: 'Cropper UI is missing on this page.' };
    }
    var v = validateFile(file);
    if (v) {
      if (errorEl) errorEl.textContent = v;
      return { ok: false, error: v };
    }

    activeSession = session || {};
    setError('');
    resetImageState({ keepCropper: false });
    var token = loadToken;
    selectedFile = file;
    imageLoading = true;
    imageReady = false;
    setImageStatus({ loading: true });
    syncSubmitState();

    var balanceEl = el('avatarCropBalanceStatus');
    if (balanceEl) {
      balanceEl.textContent =
        activeSession.balanceStatusText != null ? String(activeSession.balanceStatusText) : '';
    }

    overlayEl.classList.add('show');
    openGuard = true;
    setTimeout(function () {
      openGuard = false;
    }, 400);

    if (typeof activeSession.onOpen === 'function') {
      try {
        activeSession.onOpen({ syncSubmitState: syncSubmitState, setBalanceStatus: setBalanceStatus });
      } catch (_) {}
    }

    var reader = new FileReader();
    reader.onload = function (ev) {
      if (token !== loadToken) return;
      var url = ev.target && ev.target.result;
      if (!url) {
        imageLoading = false;
        setError('Could not load image.');
        setImageStatus({ error: true });
        syncSubmitState();
        return;
      }
      previewUrl = url;
      imgEl.onload = function () {
        if (token !== loadToken) return;
        try {
          var naturalMin = Math.min(imgEl.naturalWidth || 0, imgEl.naturalHeight || 0);
          if (naturalMin < MIN_NATURAL) {
            setError('Image is too small. Use an image at least 128×128.');
            imageLoading = false;
            imageReady = false;
            setImageStatus({ error: true });
            destroyCropper();
            overlayEl.classList.remove('show');
            syncSubmitState();
            return;
          }
          if (!global.Cropper) {
            imageLoading = false;
            imageReady = false;
            setError('Cropper not loaded. Refresh the page.');
            setImageStatus({ error: true });
            syncSubmitState();
            return;
          }
          destroyCropper();
          cropper = new global.Cropper(imgEl, CROPPER_OPTIONS);
          imageLoading = false;
          imageReady = true;
          setImageStatus({ ready: true });
          syncSubmitState();
        } catch (_) {
          imageLoading = false;
          imageReady = false;
          setError('Could not start cropper.');
          setImageStatus({ error: true });
          syncSubmitState();
        }
      };
      imgEl.onerror = function () {
        if (token !== loadToken) return;
        imageLoading = false;
        imageReady = false;
        setError('Could not load image.');
        setImageStatus({ error: true });
        syncSubmitState();
      };
      imgEl.src = url;
    };
    reader.onerror = function () {
      if (token !== loadToken) return;
      imageLoading = false;
      imageReady = false;
      setError('Could not load image.');
      setImageStatus({ error: true });
      syncSubmitState();
    };
    reader.readAsDataURL(file);
    return { ok: true };
  }

  function setBalanceStatus(text) {
    var statusEl = el('avatarCropBalanceStatus');
    if (statusEl) statusEl.textContent = text != null ? String(text) : '';
    syncSubmitState();
  }

  function setSubmitLabel(label) {
    if (activeSession) activeSession.submitLabel = label;
    syncSubmitState();
  }

  global.LanternAvatarCropper = {
    OUTPUT_WIDTH: OUTPUT_WIDTH,
    OUTPUT_HEIGHT: OUTPUT_HEIGHT,
    OUTPUT_MIME: OUTPUT_MIME,
    OUTPUT_QUALITY: OUTPUT_QUALITY,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    MIN_NATURAL: MIN_NATURAL,
    CROPPER_OPTIONS: CROPPER_OPTIONS,
    validateFile: validateFile,
    openFromFile: openFromFile,
    close: closeOverlay,
    syncSubmitState: syncSubmitState,
    setBalanceStatus: setBalanceStatus,
    setSubmitLabel: setSubmitLabel,
    getCroppedDataUrl: getCroppedDataUrl,
    isImageReady: function () {
      return !!imageReady;
    },
    isSubmitting: function () {
      return !!submitting;
    },
  };
})(typeof window !== 'undefined' ? window : self);
