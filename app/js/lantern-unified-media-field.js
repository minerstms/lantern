/**
 * Lantern — one focusable media zone for submissions (photo, video, or link).
 * Feels like a field for kids: focus, caret, glow; typing rejected; paste/drop/choose work.
 * DEAD SIMPLE: mount per container; parent handles upload/crop and calls setPreviewHTML / clearPreview.
 */
(function (global) {
  var STYLE_ID = 'lantern-unified-media-field-styles';
  var LINK_RE = /^https?:\/\//i;

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.lanternUnifiedMediaField{',
      '  position:relative;min-height:120px;border:2px dashed rgba(255,255,255,.18);border-radius:14px;',
      '  background:rgba(0,0,0,.22);padding:16px 14px 14px;cursor:text;outline:none;',
      '  transition:box-shadow .2s ease,border-color .2s ease,background .2s ease;',
      '}',
      '.lanternUnifiedMediaField:focus,.lanternUnifiedMediaField:focus-visible{',
      '  border-color:rgba(90,167,255,.65);box-shadow:0 0 0 3px rgba(90,167,255,.35),0 0 24px rgba(90,167,255,.15);',
      '  background:rgba(90,167,255,.06);',
      '}',
      '.lanternUnifiedMediaField.lanternUnifiedMedia--preview{border-style:solid;border-color:rgba(255,255,255,.14);}',
      '.lanternUnifiedMediaField.lanternUnifiedMedia--preview:focus,.lanternUnifiedMediaField.lanternUnifiedMedia--preview:focus-visible{',
      '  border-color:rgba(90,167,255,.45);',
      '}',
      '.lanternUnifiedMediaEmpty{display:flex;flex-direction:column;align-items:stretch;gap:12px;text-align:center;}',
      '.lanternUnifiedMediaRow{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;min-height:44px;}',
      '.lanternUnifiedMediaCaretWrap{font-size:22px;font-weight:800;color:rgba(234,240,255,.85);display:inline-flex;align-items:center;gap:2px;}',
      '.lanternUnifiedMediaCaret{display:inline-block;width:3px;height:1.1em;background:var(--accent,#5aa7ff);margin-left:2px;animation:lanternUmCaretBlink 1s step-end infinite;vertical-align:-.15em;}',
      '@keyframes lanternUmCaretBlink{50%{opacity:0;}}',
      '.lanternUnifiedMediaHelper{font-size:20px;font-weight:700;color:var(--muted,#b9c6ea);line-height:1.35;max-width:100%;}',
      '.lanternUnifiedMediaHelper.lanternUnifiedMediaHelper--warn{color:#ffcc66;}',
      '.lanternUnifiedMediaChoose{',
      '  display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;border-radius:12px;',
      '  border:2px solid rgba(90,167,255,.45);background:rgba(90,167,255,.2);color:#eaf0ff;font-weight:900;font-size:22px;',
      '  font-family:inherit;cursor:pointer;margin-top:4px;',
      '}',
      '.lanternUnifiedMediaChoose:hover{background:rgba(90,167,255,.3);}',
      '.lanternUnifiedMediaChoose:active{transform:translateY(1px);}',
      '.lanternUnifiedMediaPreviewInner{text-align:center;}',
      '.lanternUnifiedMediaPreviewInner img{max-width:100%;max-height:240px;border-radius:12px;display:block;margin:0 auto 10px;}',
      '.lanternUnifiedMediaPreviewInner video{max-width:100%;max-height:200px;border-radius:12px;border:1px solid rgba(255,255,255,.12);display:block;margin:0 auto 10px;}',
      '.lanternUnifiedMediaLinkCard{padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(0,0,0,.2);word-break:break-all;text-align:left;}',
      '.lanternUnifiedMediaLinkCard a{color:var(--accent,#5aa7ff);font-weight:800;font-size:20px;}',
      '.lanternUnifiedMediaActions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px;}',
      '.lanternUnifiedMediaSecondary{margin-top:10px;text-align:center;}',
      '.lanternUnifiedMediaSecondary button{font-size:20px;font-weight:800;padding:8px 14px;border-radius:10px;border:1px solid rgba(90,167,255,.4);background:rgba(90,167,255,.12);color:#eaf0ff;cursor:pointer;font-family:inherit;}',
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function isPrintableKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Enter' && e.shiftKey) return false;
    if (e.key === 'Enter' || e.key === ' ') return false;
    return e.key.length === 1;
  }

  /**
   * @param {HTMLElement} container - empty host element
   * @param {Object} opt
   * @param {boolean} opt.allowImage
   * @param {boolean} opt.allowVideo
   * @param {boolean} opt.allowLink
   * @param {function(File)} [opt.onImageFile]
   * @param {function(File)} [opt.onVideoFile]
   * @param {function(string)} [opt.onLinkUrl]
   * @param {function(string)} [opt.onImageUrl] - pasted URL when image allowed but not generic link (missions)
   * @param {function(string)} [opt.onVideoUrl] - pasted URL for video link field
   * @param {function()} [opt.onClear]
   * @param {function()} [opt.onTypingHint]
   * @param {string} [opt.emptyHelper]
   * @param {string} [opt.focusedHelper]
   * @param {string} [opt.chooseLabel]
   * @param {{label:string,onClick:function}} [opt.libraryButton]
   */
  function mount(container, opt) {
    injectStyles();
    opt = opt || {};
    var allowImage = !!opt.allowImage;
    var allowVideo = !!opt.allowVideo;
    var allowLink = !!opt.allowLink;
    var emptyHelper = opt.emptyHelper || 'Click here, then paste, drag a file, or choose one.';
    var focusedHelper = opt.focusedHelper || 'Ready — add a photo, video, or link.';
    var chooseLabel = opt.chooseLabel || 'Choose a file';

    var root = document.createElement('div');
    root.className = 'lanternUnifiedMediaField';
    root.setAttribute('tabindex', '0');
    root.setAttribute('role', 'textbox');
    root.setAttribute('aria-multiline', 'false');
    root.setAttribute('aria-label', 'Add photo, video, or link. Paste, drag, or choose a file.');
    root.setAttribute('data-help', opt.helpKey || 'unified_media');

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.setAttribute('aria-hidden', 'true');
    fileInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
    var acceptParts = [];
    if (allowImage) acceptParts.push('image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif');
    if (allowVideo) acceptParts.push('video/mp4', 'video/webm');
    fileInput.accept = acceptParts.length ? acceptParts.join(',') : 'image/*';

    var emptyEl = document.createElement('div');
    emptyEl.className = 'lanternUnifiedMediaEmpty';
    var row = document.createElement('div');
    row.className = 'lanternUnifiedMediaRow';
    var caretWrap = document.createElement('span');
    caretWrap.className = 'lanternUnifiedMediaCaretWrap';
    caretWrap.innerHTML = '<span class="lanternUnifiedMediaLine">Add photo, video, or link</span><span class="lanternUnifiedMediaCaret" aria-hidden="true"></span>';
    var helper = document.createElement('div');
    helper.className = 'lanternUnifiedMediaHelper';
    helper.textContent = emptyHelper;
    var chooseBtn = document.createElement('button');
    chooseBtn.type = 'button';
    chooseBtn.className = 'lanternUnifiedMediaChoose';
    chooseBtn.textContent = chooseLabel;
    row.appendChild(caretWrap);
    emptyEl.appendChild(row);
    emptyEl.appendChild(helper);
    emptyEl.appendChild(chooseBtn);

    var previewHost = document.createElement('div');
    previewHost.className = 'lanternUnifiedMediaPreviewHost';
    previewHost.style.display = 'none';

    var secondary = document.createElement('div');
    secondary.className = 'lanternUnifiedMediaSecondary';
    secondary.style.display = opt.libraryButton ? 'block' : 'none';
    if (opt.libraryButton) {
      var libBtn = document.createElement('button');
      libBtn.type = 'button';
      libBtn.textContent = opt.libraryButton.label || 'Pick from library';
      libBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof opt.libraryButton.onClick === 'function') opt.libraryButton.onClick();
      });
      secondary.appendChild(libBtn);
    }

    root.appendChild(fileInput);
    root.appendChild(emptyEl);
    root.appendChild(previewHost);
    root.appendChild(secondary);
    container.innerHTML = '';
    container.appendChild(root);

    var state = { preview: false, hintTimer: null };

    function rebuildAccept() {
      var parts = [];
      if (allowImage) parts.push('image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif');
      if (allowVideo) parts.push('video/mp4', 'video/webm');
      fileInput.accept = parts.length ? parts.join(',') : 'image/*';
    }
    function setAllows(a) {
      if (a) {
        allowImage = !!a.allowImage;
        allowVideo = !!a.allowVideo;
        allowLink = !!a.allowLink;
        rebuildAccept();
      }
    }

    function routeFile(file) {
      if (!file || !file.type) return;
      if (file.type.indexOf('image/') === 0 && allowImage && typeof opt.onImageFile === 'function') {
        opt.onImageFile(file);
        return;
      }
      if (file.type.match(/^video\/(mp4|webm)$/) && allowVideo && typeof opt.onVideoFile === 'function') {
        opt.onVideoFile(file);
        return;
      }
      if (typeof opt.onTypingHint === 'function') opt.onTypingHint('Use a photo, short video (MP4/WebM), or a link.');
    }

    function routePastedUrl(url) {
      var u = String(url || '').trim().slice(0, 2000);
      if (!LINK_RE.test(u)) return false;
      if (typeof opt.onPasteUrl === 'function' && opt.onPasteUrl(u)) return true;
      if (allowLink && typeof opt.onLinkUrl === 'function') {
        opt.onLinkUrl(u);
        return true;
      }
      if (allowVideo && !allowLink && typeof opt.onVideoUrl === 'function') {
        opt.onVideoUrl(u);
        return true;
      }
      if (allowImage && !allowLink && typeof opt.onImageUrl === 'function') {
        opt.onImageUrl(u);
        return true;
      }
      if (allowVideo && typeof opt.onVideoUrl === 'function') {
        opt.onVideoUrl(u);
        return true;
      }
      if (allowImage && typeof opt.onImageUrl === 'function') {
        opt.onImageUrl(u);
        return true;
      }
      return false;
    }

    function onPaste(e) {
      if (state.preview) return;
      var active = document.activeElement;
      if (active !== root && !root.contains(active)) return;
      var items = e.clipboardData && e.clipboardData.items;
      if (items) {
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0 && allowImage) {
            var f = items[i].getAsFile();
            if (f) {
              e.preventDefault();
              e.stopPropagation();
              if (typeof opt.onImageFile === 'function') opt.onImageFile(f);
              return;
            }
          }
        }
      }
      var text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      text = text.trim();
      if (text && LINK_RE.test(text)) {
        if (routePastedUrl(text)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }

    function onPasteCapture(e) {
      onPaste(e);
    }

    chooseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });

    root.addEventListener('click', function (e) {
      if (e.target === chooseBtn || chooseBtn.contains(e.target)) return;
      if (previewHost.style.display === 'block' && previewHost.contains(e.target)) return;
      root.focus();
    });

    root.addEventListener('focus', function () {
      if (!state.preview) helper.textContent = focusedHelper;
    });
    root.addEventListener('blur', function () {
      if (!state.preview) {
        helper.textContent = emptyHelper;
        helper.classList.remove('lanternUnifiedMediaHelper--warn');
      }
    });

    root.addEventListener('keydown', function (e) {
      if (state.preview) return;
      if (isPrintableKey(e)) {
        e.preventDefault();
        helper.textContent = 'This spot is for a photo, video, or link — not typing. Paste a link, drag a file, or tap Choose a file.';
        helper.classList.add('lanternUnifiedMediaHelper--warn');
        clearTimeout(state.hintTimer);
        state.hintTimer = setTimeout(function () {
          helper.classList.remove('lanternUnifiedMediaHelper--warn');
          helper.textContent = document.activeElement === root ? focusedHelper : emptyHelper;
        }, 4500);
        if (typeof opt.onTypingHint === 'function') opt.onTypingHint();
      }
    });

    root.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      root.classList.add('lanternUnifiedMedia--drag');
    });
    root.addEventListener('dragleave', function (e) {
      e.preventDefault();
      root.classList.remove('lanternUnifiedMedia--drag');
    });
    root.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      root.classList.remove('lanternUnifiedMedia--drag');
      if (state.preview) return;
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) routeFile(files[0]);
    });

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) routeFile(f);
    });

    document.addEventListener('paste', onPasteCapture, true);

    return {
      root: root,
      setAllows: setAllows,
      focus: function () {
        try {
          root.focus();
        } catch (err) {}
      },
      setPreviewHTML: function (html) {
        state.preview = true;
        previewHost.innerHTML = html || '';
        previewHost.style.display = 'block';
        emptyEl.style.display = 'none';
        root.classList.add('lanternUnifiedMedia--preview');
      },
      clearPreview: function () {
        state.preview = false;
        previewHost.innerHTML = '';
        previewHost.style.display = 'none';
        emptyEl.style.display = 'flex';
        root.classList.remove('lanternUnifiedMedia--preview');
        helper.textContent = document.activeElement === root ? focusedHelper : emptyHelper;
        if (typeof opt.onClear === 'function') opt.onClear();
      },
      /** Empty the visual only (no onClear). Use when parent already cleared data. */
      resetEmptyVisual: function () {
        state.preview = false;
        previewHost.innerHTML = '';
        previewHost.style.display = 'none';
        emptyEl.style.display = 'flex';
        root.classList.remove('lanternUnifiedMedia--preview');
        helper.textContent = document.activeElement === root ? focusedHelper : emptyHelper;
      },
      setSecondaryVisible: function (v) {
        secondary.style.display = v && opt.libraryButton ? 'block' : 'none';
      },
      updateLibraryButton: function (lib) {
        secondary.innerHTML = '';
        if (lib && lib.onClick) {
          opt.libraryButton = lib;
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = lib.label || 'Pick from library';
          b.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            lib.onClick();
          });
          secondary.appendChild(b);
          secondary.style.display = 'block';
        } else {
          opt.libraryButton = null;
          secondary.style.display = 'none';
        }
      },
      openFilePicker: function () {
        fileInput.click();
      },
      destroy: function () {
        document.removeEventListener('paste', onPasteCapture, true);
        clearTimeout(state.hintTimer);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  }

  global.LanternUnifiedMediaField = {
    mount: mount,
  };
})(typeof window !== 'undefined' ? window : this);
