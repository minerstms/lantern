/**
 * Client Avatar Activity helpers — same display-name + four-choice rules as the Worker bank.
 * Powers Avatar Match now; Avatar Quiz Mission will reuse this without a second formatter.
 */
(function (global) {
  'use strict';

  var HONORIFIC_RE = /^(Mr\.|Miss|Ms\.|Mrs\.|SRO|Dr\.|Coach)\s+/i;

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function firstToken(name) {
    var cleaned = trimStr(name).replace(HONORIFIC_RE, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.split(' ')[0] || '';
  }

  function restTokens(name) {
    var cleaned = trimStr(name).replace(HONORIFIC_RE, '').replace(/\s+/g, ' ').trim();
    var parts = cleaned.split(' ').filter(Boolean);
    return parts.slice(1).join(' ');
  }

  function normalizeGivenName(raw) {
    var token = firstToken(raw);
    if (!token) return '';
    var letters = token.replace(/[^A-Za-z'’-]/g, '');
    if (!letters) return token;
    return letters.charAt(0).toUpperCase() + letters.slice(1);
  }

  function lastInitialFromSurname(raw) {
    var last = trimStr(raw);
    if (!last) return '';
    var compact = last.replace(/^['’`]+/, '');
    var ch = compact.charAt(0);
    if (!ch || !/[A-Za-z]/.test(ch)) return '';
    return ch.toUpperCase();
  }

  function formatAvatarActivityDisplayName(row) {
    if (!row) return '';
    var first = trimStr(row.first_name);
    var last = trimStr(row.last_name);
    if (!first && !last) {
      var full = trimStr(row.student_name || row.display_name || '');
      first = firstToken(full);
      last = restTokens(full);
    }
    var given = normalizeGivenName(first);
    if (!given) return '';
    var initial = lastInitialFromSurname(last);
    if (!initial) return given;
    return given + ' ' + initial + '.';
  }

  function nameKey(label) {
    return trimStr(label).toLowerCase();
  }

  function shuffleInPlace(arr, rand) {
    var rnd = typeof rand === 'function' ? rand : Math.random;
    var i;
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function buildAvatarMultipleChoiceQuestion(bank, opts) {
    var rand = opts && typeof opts.random === 'function' ? opts.random : Math.random;
    var usable = (bank || []).filter(function (e) {
      return e && e.display_name && (e.avatar_url || e.avatar_key);
    });
    var byLabel = Object.create(null);
    usable.forEach(function (e) {
      var k = nameKey(e.display_name);
      if (!k) return;
      if (!byLabel[k]) byLabel[k] = [];
      byLabel[k].push(e);
    });
    var distinctLabels = Object.keys(byLabel);
    if (distinctLabels.length < 4) {
      return {
        ok: false,
        error: 'insufficient_identities',
        bank_count: usable.length,
        distinct_identity_count: distinctLabels.length,
      };
    }
    var target = opts && opts.target && usable.indexOf(opts.target) !== -1 ? opts.target : null;
    if (!target && opts && opts.target && opts.target.display_name) {
      var forced = nameKey(opts.target.display_name);
      if (byLabel[forced] && byLabel[forced].length) {
        target = opts.target.avatar_url || opts.target.avatar_key ? opts.target : byLabel[forced][0];
      }
    }
    if (!target) {
      var targetLabel = distinctLabels[Math.floor(rand() * distinctLabels.length)];
      var targetPool = byLabel[targetLabel];
      target = targetPool[Math.floor(rand() * targetPool.length)];
    }
    var distractorLabels = distinctLabels.filter(function (k) { return k !== nameKey(target.display_name); });
    shuffleInPlace(distractorLabels, rand);
    var chosen = distractorLabels.slice(0, 3);
    var choices = [target.display_name].concat(chosen.map(function (k) { return byLabel[k][0].display_name; }));
    shuffleInPlace(choices, rand);
    var unique = {};
    choices.forEach(function (c) { unique[nameKey(c)] = true; });
    if (Object.keys(unique).length !== 4) {
      return { ok: false, error: 'duplicate_choice_labels', bank_count: usable.length };
    }
    return {
      ok: true,
      targetAvatar: target,
      correctIdentity: target.display_name,
      choices: choices,
    };
  }

  global.LANTERN_AVATAR_ACTIVITY = {
    formatDisplayName: formatAvatarActivityDisplayName,
    buildMultipleChoiceQuestion: buildAvatarMultipleChoiceQuestion,
    MIN_DISTINCT_IDENTITIES: 4,
  };
})(typeof window !== 'undefined' ? window : this);
