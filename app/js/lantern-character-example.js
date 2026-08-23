/**
 * Prompt #257C — reusable character-length example (Alice's Adventures in Wonderland, public domain).
 */
(function (global) {
  'use strict';

  var ALICE_EXCERPT =
    "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice 'without pictures or conversations?' So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her. There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, 'Oh dear! Oh dear! I shall be late!' (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge. In another moment down went Alice after it, never once considering how in the world she was to get out again. The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down a very deep well. Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next. First, she tried to look down and make out what she was coming to, but it was too dark to see anything; then she looked at the sides of the well, and noticed that they were filled with cupboards and book-shelves; here and there she saw maps and pictures hung upon pegs. She took down a jar from one of the shelves as she passed; it was labelled 'ORANGE MARMALADE', but to her great disappointment it was empty: she did not like to drop the jar for fear of killing somebody underneath, so managed to put it into one of the cupboards as she fell past it.";

  function truncateToLength(text, n, useEllipsis) {
    var target = Math.max(0, Math.floor(Number(n)) || 0);
    if (target <= 0) return '';
    var src = String(text || '');
    if (!useEllipsis || src.length <= target) return src.slice(0, target);
    if (target <= 1) return '…';
    return src.slice(0, target - 1) + '…';
  }

  function counterState(currentLen, minRequired) {
    var cur = Math.max(0, Math.floor(Number(currentLen)) || 0);
    var min = Math.max(0, Math.floor(Number(minRequired)) || 0);
    var remaining = Math.max(0, min - cur);
    return {
      current: cur,
      minimum: min,
      remaining: remaining,
      reached: min > 0 ? cur >= min : true,
      label: min > 0 ? cur + ' / ' + min + ' characters' : cur + ' characters',
      needLabel: remaining > 0 ? remaining + ' more needed' : 'Minimum reached',
    };
  }

  function ensureModal() {
    var existing = document.getElementById('lanternCharacterExampleModal');
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = 'lanternCharacterExampleModal';
    wrap.className = 'lanternCharacterExampleModal';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="lanternCharacterExampleBackdrop" data-close="1"></div>' +
      '<div class="lanternCharacterExampleDialog" role="dialog" aria-modal="true" aria-labelledby="lanternCharacterExampleTitle">' +
      '<h2 id="lanternCharacterExampleTitle" class="lanternCharacterExampleTitle"></h2>' +
      '<p class="lanternCharacterExampleLead"></p>' +
      '<div class="lanternCharacterExampleBody"></div>' +
      '<p class="lanternCharacterExampleFoot">That\'s about this much writing. Characters include letters, spaces, and punctuation.</p>' +
      '<button type="button" class="btn good lanternCharacterExampleClose">Got it</button>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('[data-close="1"]').addEventListener('click', function () {
      wrap.hidden = true;
    });
    wrap.querySelector('.lanternCharacterExampleClose').addEventListener('click', function () {
      wrap.hidden = true;
    });
    return wrap;
  }

  function openExample(minCharacters) {
    var n = Math.max(1, Math.floor(Number(minCharacters)) || 100);
    var modal = ensureModal();
    modal.querySelector('.lanternCharacterExampleTitle').textContent = n + ' characters looks about like this';
    modal.querySelector('.lanternCharacterExampleLead').textContent =
      'Example from Alice\'s Adventures in Wonderland (public domain):';
    modal.querySelector('.lanternCharacterExampleBody').textContent = truncateToLength(ALICE_EXCERPT, n, true);
    modal.hidden = false;
  }

  function wireExampleLink(container, minGetter) {
    if (!container || container._lanternCharExampleWired) return;
    container._lanternCharExampleWired = true;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn lanternCharacterExampleLink';
    btn.textContent = 'See what ' + (minGetter() || 100) + ' characters looks like';
    btn.addEventListener('click', function () {
      openExample(minGetter());
    });
    container.appendChild(btn);
  }

  global.LanternCharacterExample = {
    ALICE_EXCERPT: ALICE_EXCERPT,
    truncateToLength: truncateToLength,
    counterState: counterState,
    openExample: openExample,
    wireExampleLink: wireExampleLink,
  };
})(typeof window !== 'undefined' ? window : globalThis);
