/**
 * TMS Lantern — shared writing enforcement module.
 * Blocks paste, drag/drop, and burst insertion (10+ chars).
 * Reusable for thank-you letters and grade reflections.
 */
(function (global) {
  var BURST_THRESHOLD = 10;
  var EXPECTATIONS_MSG = 'Write your own response.\nNo pasting or drag/drop.\nType naturally.';

  function countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    var t = text.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function createWarningOverlay(container, onDismiss) {
    var overlay = document.createElement('div');
    overlay.className = 'writingGuardOverlay';
    overlay.setAttribute('role', 'alert');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);';
    var card = document.createElement('div');
    card.className = 'writingGuardCard';
    card.style.cssText = 'max-width:360px;margin:16px;padding:24px;background:linear-gradient(180deg,#1a2744,#0f1b33);border:2px solid rgba(255,77,109,.5);border-radius:18px;box-shadow:0 16px 40px rgba(0,0,0,.5);text-align:center;';
    card.innerHTML = '<p style="margin:0 0 16px;font-size:26px;font-weight:900;color:#ff4d6d;">Writing rules</p><p style="margin:0 0 20px;font-size:22px;line-height:1.5;color:#b9c6ea;white-space:pre-line;">' + EXPECTATIONS_MSG.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p><button type="button" class="writingGuardDismiss" style="height:52px;padding:0 24px;border-radius:14px;font-weight:900;font-size:22px;border:2px solid rgba(90,167,255,.5);background:rgba(90,167,255,.2);color:#eaf0ff;cursor:pointer;">OK</button>';
    overlay.appendChild(card);
    var dismissBtn = card.querySelector('.writingGuardDismiss');
    function close() {
      overlay.remove();
      if (typeof onDismiss === 'function') onDismiss();
    }
    dismissBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  /**
   * Attach writing guard to a textarea.
   * @param {HTMLTextAreaElement} textarea
   * @param {Object} opts - { minWords, onWordCount }
   * @returns {Object} - { getWordCount, destroy }
   */
  function attach(textarea, opts) {
    if (!textarea || textarea.tagName !== 'TEXTAREA') return { getWordCount: countWords, destroy: function () {} };
    opts = opts || {};
    var minWords = opts.minWords || 0;
    var onWordCount = opts.onWordCount || function () {};
    var lastValue = textarea.value || '';
    var composing = false;

    function updateWordCount() {
      var w = countWords(textarea.value);
      onWordCount(w, minWords);
      return w;
    }

    function showBurstWarning() {
      createWarningOverlay(document.body, function () {
        textarea.focus();
      });
    }

    function revertAndWarn() {
      textarea.value = lastValue;
      textarea.setSelectionRange(lastValue.length, lastValue.length);
      showBurstWarning();
      updateWordCount();
    }

    function onInput(e) {
      if (composing) return;
      var val = textarea.value;
      var prevLen = lastValue.length;
      var currLen = val.length;
      var added = currLen - prevLen;
      if (added >= BURST_THRESHOLD) {
        revertAndWarn();
        return;
      }
      lastValue = val;
      updateWordCount();
    }

    function onPaste(e) {
      e.preventDefault();
      showBurstWarning();
    }

    function onDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer && e.dataTransfer.getData) {
        var text = e.dataTransfer.getData('text/plain');
        if (text && text.length > 0) {
          showBurstWarning();
          return;
        }
      }
      showBurstWarning();
    }

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    }

    function onContextMenu(e) {
      e.preventDefault();
    }

    textarea.addEventListener('paste', onPaste);
    textarea.addEventListener('drop', onDrop);
    textarea.addEventListener('dragover', onDragOver);
    textarea.addEventListener('dragenter', onDragOver);
    textarea.addEventListener('contextmenu', onContextMenu);
    textarea.addEventListener('input', onInput);
    textarea.addEventListener('compositionstart', function () { composing = true; });
    textarea.addEventListener('compositionend', function () {
      composing = false;
      lastValue = textarea.value;
      updateWordCount();
    });

    updateWordCount();

    return {
      getWordCount: function () { return countWords(textarea.value); },
      destroy: function () {
        textarea.removeEventListener('paste', onPaste);
        textarea.removeEventListener('drop', onDrop);
        textarea.removeEventListener('dragover', onDragOver);
        textarea.removeEventListener('dragenter', onDragOver);
        textarea.removeEventListener('contextmenu', onContextMenu);
        textarea.removeEventListener('input', onInput);
      },
    };
  }

  global.WRITING_GUARD = {
    attach: attach,
    countWords: countWords,
    BURST_THRESHOLD: BURST_THRESHOLD,
    EXPECTATIONS_MSG: EXPECTATIONS_MSG,
  };
})(typeof window !== 'undefined' ? window : self);
