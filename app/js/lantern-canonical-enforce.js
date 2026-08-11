/**
 * Lantern Brand Killer — runtime contract for canonical cards, rails, and thumbscrolls.
 * CARD COUNTERFEIT SCANNER: every .exploreCard is inspected; genuine counterfeits are
 * recorded on __lanternCounterfeitReport. Visual red overlays are developer-only
 * (localhost / ?lanternDebugCards=1 / __LANTERN_CARD_DEBUG_VISUAL__), never production UI.
 * Prompt #160: optional metadata row must NOT classify a card as counterfeit.
 * Depends: DOM after lantern-cards.js (factory-branded outputs).
 */
(function (global) {
  'use strict';

  global.__lanternCanonicalEnforcementLoaded = true;
  if (!global.__lanternCounterfeitReport) global.__lanternCounterfeitReport = [];

  var ZONE_SELECTORS = ['.wrap.lanternContent', '#lanternCardDetailOverlay'];
  var BANNED_CLASS_NAMES = ['contentScrollerTrack', 'contentScroller', 'scrollerCard'];
  var FATAL_ID = 'lanternBrandKillerFatal';
  var ERR_PREFIX = '[LanternBrandKiller]';
  var COUNTERFEIT_LOG = '[LANTERN CARD COUNTERFEIT]';

  var FACTORY_EXPECTED = 'LanternCards';

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function describeNode(el) {
    if (!el || !el.tagName) return String(el);
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = (el.className && typeof el.className === 'string')
      ? el.className.split(/\s+/).filter(Boolean).slice(0, 12).join('.')
      : '';
    var path = '';
    try {
      var cur = el;
      var parts = [];
      for (var i = 0; i < 12 && cur && cur.nodeType === 1; i++) {
        var bit = cur.tagName ? cur.tagName.toLowerCase() : '?';
        if (cur.id) { bit += '#' + cur.id; parts.push(bit); break; }
        if (cur.className && typeof cur.className === 'string') {
          var fc = cur.className.split(/\s+/).filter(Boolean)[0];
          if (fc) bit += '.' + fc;
        }
        parts.push(bit);
        cur = cur.parentNode;
      }
      path = parts.reverse().join(' > ');
    } catch (e) {
      path = '';
    }
    return tag + id + (cls ? ' .' + cls : '') + (path ? ' | ' + path : '');
  }

  function fail(msg) {
    var e = new Error(ERR_PREFIX + ' Non-Lantern card/rail/thumbscroll detected — render aborted. ' + msg);
    e.name = 'LanternBrandKillerError';
    throw e;
  }

  function showFatalOverlay(err) {
    var doc = global.document;
    if (!doc || !doc.body || doc.getElementById(FATAL_ID)) return;
    var ov = doc.createElement('div');
    ov.id = FATAL_ID;
    ov.setAttribute('role', 'alert');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#1a0a0a;color:#f8f4f0;padding:28px;font-size:22px;line-height:1.45;overflow:auto;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-sizing:border-box;';
    ov.innerHTML =
      '<h1 style="margin:0 0 18px;font-size:30px;font-weight:900;color:#ff6b6b;">Lantern Canonical Failure</h1>' +
      '<p style="margin:0 0 16px;opacity:.95;">Non-canonical card, rail, or thumbscroll. Rendering has been aborted.</p>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.45);padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,.12);margin:0;">' +
      escHtml(err && err.message ? err.message : String(err)) + '</pre>';
    doc.body.appendChild(ov);
    doc.body.style.overflow = 'hidden';
    try {
      doc.documentElement.style.overflow = 'hidden';
    } catch (e) {}
  }

  function readCssVarPx(el, propName, fallback) {
    if (!el || !global.getComputedStyle) return fallback;
    var raw = global.getComputedStyle(el).getPropertyValue(propName);
    var v = parseFloat(String(raw || '').trim());
    if (!isNaN(v)) return v;
    var doc = el.ownerDocument;
    var root = doc && doc.documentElement;
    if (root) {
      v = parseFloat(String(global.getComputedStyle(root).getPropertyValue(propName) || '').trim());
      if (!isNaN(v)) return v;
    }
    return fallback;
  }

  /** Visual red overlays are developer-only — never student-facing production UI (Prompt #160). */
  function allowVisualCounterfeitMark() {
    try {
      if (global.__LANTERN_CARD_DEBUG_VISUAL__ === true) return true;
      var h = String((global.location && global.location.hostname) || '').toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
      var q = String((global.location && global.location.search) || '');
      if (/[?&]lanternDebugCards=1(?:&|$)/.test(q)) return true;
    } catch (e) {}
    return false;
  }

  function inferSourceAndKill(el) {
    var cls = String(el.className || '');
    if (/\bmissionSpotlightCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.buildMissionSpotlightRailElement → createStudentCard(specMissionSpotlightRail)', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bpollCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specPollRailCard / materializePollRailCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bgamesHubPlayCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specGameHubRailCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bgameHighlightCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specLinkCard / specGameHighlightLinkCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--cosmeticRail\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specCosmeticRailCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--leaderboardChip\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specLeaderboardChipRailCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--displayNewsTile\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specDisplayNewsSpotlightCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--activityPulse\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specActivityPulseCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCardProfileRail\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specIconRailCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--previewRail\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specNewsRailCard / specOpenedNews', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (String(el.tagName || '').toLowerCase() === 'a' && el.classList.contains('exploreCard')) {
      return { sourceHint: 'LanternCards.specLinkCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\btype-[a-z0-9_-]+\b/i.test(cls)) {
      return { sourceHint: 'LanternCards.materializeFeedPostCard', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    if (el.getAttribute('data-lantern-card-factory') === FACTORY_EXPECTED) {
      return { sourceHint: 'LanternCards factory (createStudentCard)', killTarget: 'app/js/lantern-cards.js — createStudentCard' };
    }
    return { sourceHint: 'page-local markup, legacy HTML, or post-render DOM mutation', killTarget: 'Search repo for .exploreCard without LanternCards factory stamp; remove non-canonical injectors' };
  }

  function passesLinkCardContract(el) {
    if (String(el.tagName || '').toLowerCase() !== 'a' || !el.classList.contains('exploreCard')) return false;
    var wrap = el.closest('.exploreCardOuterWrap');
    if (!wrap || wrap.getAttribute('data-lantern-card-wrap') !== 'true') return false;
    return !!(el.querySelector('.exploreCardHd') || el.querySelector('.exploreCardVisual'));
  }

  function inspectBranding(el, reasons) {
    if (el.getAttribute('data-lantern-card') !== 'true') reasons.push('MISSING_DATA_LANTERN_CARD');
    if (el.getAttribute('data-lantern-brand') !== 'lantern') reasons.push('BAD_OR_MISSING_LANTERN_BRAND');
    if (el.getAttribute('data-lantern-card-factory') !== FACTORY_EXPECTED) reasons.push('MISSING_OR_BAD_FACTORY_STAMP');
    if (!String(el.getAttribute('data-lantern-card-type') || '').trim()) reasons.push('MISSING_DATA_LANTERN_CARD_TYPE');
  }

  function isVisibleCompactFace(el) {
    if (!el || !el.getBoundingClientRect) return true;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (global.getComputedStyle) {
      var st = global.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    }
    return true;
  }

  /**
   * Compact face contract (Prompt #160):
   * ROW 1 headline/title — REQUIRED
   * ROW 2 metadata — OPTIONAL (missing author/date/description/meta is NOT counterfeit)
   */
  function inspectCanonicalCardFace(el, reasons) {
    var surface = el.getAttribute('data-lantern-card-surface');
    if (surface === 'detail') return;
    if (el.getAttribute('data-lantern-card-contract-version') !== '2') {
      reasons.push('CONTRACT_VERSION_NOT_2');
    }
    if (el.querySelector('.exploreCardRailStack')) reasons.push('LEGACY_RAIL_STACK');
    if (el.querySelector('.lcRailRow')) reasons.push('LEGACY_LC_RAIL_ROW');
    if (el.classList.contains('feedCard')) reasons.push('PARALLEL_FEED_CARD_ROOT');
    var frame = el.querySelector(':scope > .lanternCanonicalCardFrame, :scope > a > .lanternCanonicalCardFrame');
    if (!frame) {
      frame = el.querySelector('.lanternCanonicalCardFrame');
    }
    if (!frame) {
      reasons.push('MISSING_CANONICAL_FRAME');
      return;
    }
    var img = frame.querySelector('.lanternCanonicalCardImage');
    var fb = frame.querySelector('.lanternCanonicalCardFallback');
    if (!img && !fb) reasons.push('MISSING_IMAGE_OR_FALLBACK');
    if (img && global.getComputedStyle) {
      var fit = global.getComputedStyle(img).objectFit;
      var cosmeticContain = el.classList.contains('exploreCard--cosmeticRail') && fit === 'contain';
      if (fit && fit !== 'cover' && !cosmeticContain) reasons.push('IMAGE_NOT_OBJECT_FIT_COVER');
    }
    if (!frame.querySelector('.lanternCanonicalCardOverlay')) reasons.push('MISSING_OVERLAY');
    if (!frame.querySelector('.lanternCanonicalCardGradient')) reasons.push('MISSING_GRADIENT');
    if (!frame.querySelector('.lanternCanonicalCardCaption')) reasons.push('MISSING_CAPTION');
    var titles = frame.querySelectorAll('.lanternCanonicalCardTitle');
    if (titles.length !== 1) reasons.push('TITLE_COUNT_INVALID');
    if (titles.length === 1 && global.getComputedStyle) {
      var tEl = titles[0];
      var st = global.getComputedStyle(tEl);
      var clampRaw = st.webkitLineClamp || st.getPropertyValue('-webkit-line-clamp');
      var clampN = parseInt(String(clampRaw || ''), 10);
      /* Prompt #158/#160: one-line (or legacy two-line) clamp satisfies the title contract. */
      if (clampN === 1 || clampN === 2) {
        /* ok — CSS clamp is authoritative; do not false-positive on scrollHeight */
      } else {
        var lh = parseFloat(st.lineHeight);
        if (isNaN(lh) || lh <= 0) lh = parseFloat(st.fontSize) * 1.2;
        if (tEl.scrollHeight > lh * 2 + 6) reasons.push('TITLE_EXCEEDS_TWO_LINES');
      }
    }
    /* Prompt #160: meta row is optional. Only inspect wrapping when a meta row is present. */
    var meta = frame.querySelector('.lanternCanonicalCardMeta');
    if (meta && meta.scrollHeight > meta.clientHeight + 3) reasons.push('META_WRAPS_OR_STACKS');
    var ew = readCssVarPx(el, '--lantern-card-width', 280);
    if (isVisibleCompactFace(el)) {
      if (Math.abs(el.offsetWidth - ew) > 8) reasons.push('SHELL_WIDTH_DRIFT');
      if (el.offsetWidth > 0 && el.offsetHeight > 0) {
        var ratio = el.offsetWidth / el.offsetHeight;
        if (Math.abs(ratio - (16 / 9)) > 0.08) reasons.push('ASPECT_RATIO_NOT_16_9');
      }
    }
    var below = el.querySelector(':scope > .lcRailRow, :scope > .feedCardInner, :scope > .exploreCardRailStack');
    if (below) reasons.push('CONTENT_PANEL_BELOW_FRAME');
  }

  /** @deprecated v1 — delegates to inspectCanonicalCardFace */
  function inspectRailContract(el, reasons) {
    inspectCanonicalCardFace(el, reasons);
  }

  /**
   * Returns { ok: boolean, reasons: string[], sourceHint: string, killTarget: string }
   */
  function inspectExploreCard(el) {
    var reasons = [];
    if (!el || !el.classList || !el.classList.contains('exploreCard')) {
      return { ok: false, reasons: ['NOT_EXPLORE_CARD'], sourceHint: 'unknown', killTarget: 'N/A' };
    }
    var sk = inferSourceAndKill(el);
    inspectBranding(el, reasons);

    if (el.getAttribute('data-lantern-card-surface') === 'face' || el.classList.contains('lanternCanonicalCard') || el.classList.contains('exploreCard--rail')) {
      inspectCanonicalCardFace(el, reasons);
    } else if (el.querySelector('.exploreCardRailStack')) {
      reasons.push('RAIL_STACK_WITHOUT_FACE_SURFACE');
    } else if (!el.classList.contains('lanternCanonicalCard')) {
      reasons.push('UNCLASSIFIED_CARD_NOT_CANONICAL_FACE');
    }

    var ok = reasons.length === 0;
    return { ok: ok, reasons: reasons, sourceHint: sk.sourceHint, killTarget: sk.killTarget };
  }

  function unmarkCounterfeit(el) {
    if (!el || !el.classList) return;
    el.classList.remove('lanternCardCounterfeit');
    el.removeAttribute('data-lantern-invalid');
    el.removeAttribute('data-lantern-counterfeit');
    var ban = el.querySelector(':scope > .lanternCardCounterfeitBanner');
    if (ban && ban.parentNode) ban.parentNode.removeChild(ban);
  }

  /**
   * Developer-only visual mark. Production never paints red overlays or exposes
   * source filenames / function names on student-facing cards (Prompt #160).
   */
  function markCounterfeitVisual(el, result) {
    if (!el || !el.classList || !allowVisualCounterfeitMark()) return;
    el.classList.add('lanternCardCounterfeit');
    el.setAttribute('data-lantern-invalid', 'true');
    el.setAttribute('data-lantern-counterfeit', 'true');
    var lines = ['LANTERN CARD COUNTERFEIT'];
    var rs = result.reasons || [];
    for (var i = 0; i < rs.length && i < 6; i++) lines.push(String(rs[i]).replace(/_/g, ' '));
    if (rs.length > 6) lines.push('+' + (rs.length - 6) + ' more');
    lines.push('→ ' + (result.killTarget || result.sourceHint || ''));
    var txt = lines.join('\n');
    var ban = el.querySelector(':scope > .lanternCardCounterfeitBanner');
    if (!ban) {
      ban = (el.ownerDocument || global.document).createElement('div');
      ban.className = 'lanternCardCounterfeitBanner';
      ban.setAttribute('aria-hidden', 'true');
      el.appendChild(ban);
    }
    ban.textContent = txt;
  }

  function currentRoute() {
    try {
      var loc = global.location;
      return (loc && loc.pathname ? loc.pathname : '') + (loc && loc.hash ? loc.hash : '');
    } catch (e) {
      return '';
    }
  }

  function buildReportEntry(el, result) {
    return {
      reasons: (result.reasons || []).slice(),
      route: currentRoute(),
      cardType: String(el.getAttribute('data-lantern-card-type') || ''),
      domPath: describeNode(el),
      sourceHint: result.sourceHint || '',
      killTarget: result.killTarget || ''
    };
  }

  function scanAllExploreCards(doc) {
    if (!doc || !doc.querySelectorAll) return;
    var cards = doc.querySelectorAll('.exploreCard[data-lantern-card-surface="face"], .exploreCard.lanternCanonicalCard');
    var report = [];
    var i;
    for (i = 0; i < cards.length; i++) {
      var el = cards[i];
      if (!isVisibleCompactFace(el)) {
        unmarkCounterfeit(el);
        continue;
      }
      var r = inspectExploreCard(el);
      if (!r.ok) {
        markCounterfeitVisual(el, r);
        report.push(buildReportEntry(el, r));
        if (global.console && global.console.warn) {
          global.console.warn(COUNTERFEIT_LOG, r.reasons.join('; '), r.sourceHint, r.killTarget, describeNode(el));
        }
      } else {
        unmarkCounterfeit(el);
      }
    }
    var feedRoots = doc.querySelectorAll('.feedCard');
    for (i = 0; i < feedRoots.length; i++) {
      var fr = feedRoots[i];
      var fake = { ok: false, reasons: ['PARALLEL_FEED_CARD_ROOT'], sourceHint: 'lantern-feed-card.js legacy', killTarget: 'app/js/lantern-feed-card.js' };
      markCounterfeitVisual(fr, fake);
      report.push(buildReportEntry(fr, fake));
    }
    global.__lanternCounterfeitReport = report;
  }

  function validateLanternScroller(el) {
    if (!el.classList.contains('lanternScroller')) fail('Expected .lanternScroller: ' + describeNode(el));
    if (el.getAttribute('data-lantern-rail') !== 'true' ||
      el.getAttribute('data-lantern-thumbscroll') !== 'true' ||
      el.getAttribute('data-lantern-brand') !== 'lantern') {
      fail('Missing rail/thumbscroll markers (data-lantern-rail, data-lantern-thumbscroll, data-lantern-brand="lantern") on: ' + describeNode(el));
    }
    if (el.classList.contains('contentScroller') || el.classList.contains('contentScrollerTrack')) {
      fail('Deprecated scroller class on .lanternScroller: ' + describeNode(el));
    }
    try {
      if (el.querySelector(':scope > .contentScrollerTrack')) {
        fail('Deprecated inner .contentScrollerTrack child under: ' + describeNode(el));
      }
    } catch (e) {
      var ch = el.children;
      for (var i = 0; i < ch.length; i++) {
        if (ch[i].classList && ch[i].classList.contains('contentScrollerTrack')) {
          fail('Deprecated inner .contentScrollerTrack child under: ' + describeNode(el));
        }
      }
    }
  }

  function validateSpoofedBrand(zone) {
    var branded = zone.querySelectorAll('[data-lantern-brand="lantern"]');
    for (var i = 0; i < branded.length; i++) {
      var el = branded[i];
      var isCard = el.classList.contains('exploreCard');
      var isScroll = el.classList.contains('lanternScroller');
      if (!isCard && !isScroll) {
        fail('Spoof: data-lantern-brand="lantern" on node that is not .exploreCard or .lanternScroller: ' + describeNode(el));
      }
    }
  }

  function getZoneRoots(doc) {
    var roots = [];
    var seen = {};
    ZONE_SELECTORS.forEach(function (sel) {
      try {
        doc.querySelectorAll(sel).forEach(function (n) {
          if (!n || seen[n]) return;
          seen[n] = true;
          roots.push(n);
        });
      } catch (e) {}
    });
    return roots;
  }

  /** Fail-closed: banned classes + scrollers + spoof only (no per-card throw). */
  function validateZones(doc) {
    var roots = getZoneRoots(doc);
    for (var z = 0; z < roots.length; z++) {
      var zone = roots[z];
      var b, j, badList, bad;
      for (b = 0; b < BANNED_CLASS_NAMES.length; b++) {
        badList = zone.getElementsByClassName(BANNED_CLASS_NAMES[b]);
        for (j = 0; j < badList.length; j++) {
          bad = badList[j];
          fail('Banned legacy class .' + BANNED_CLASS_NAMES[b] + ' in production zone: ' + describeNode(bad));
        }
      }
      var rails = zone.querySelectorAll('.lanternScroller');
      for (var r = 0; r < rails.length; r++) {
        validateLanternScroller(rails[r]);
      }
      validateSpoofedBrand(zone);
    }
  }

  function install() {
    var doc = global.document;
    if (!doc || !doc.body) return;
    if (global.__lanternCanonicalEnforceInstalled) return;
    global.__lanternCanonicalEnforceInstalled = true;

    var debounceMs = 80;
    var timer = null;
    var obs = null;
    var fatal = false;

    function run() {
      if (fatal) return;
      try {
        if (global.LanternScroller && typeof global.LanternScroller.__upgradeRailHostsBeforeEnforce === 'function') {
          global.LanternScroller.__upgradeRailHostsBeforeEnforce(doc);
        }
        scanAllExploreCards(doc);
        validateZones(doc);
      } catch (e) {
        fatal = true;
        showFatalOverlay(e);
        if (obs && obs.disconnect) obs.disconnect();
        throw e;
      }
    }

    function schedule() {
      if (fatal) return;
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(function () {
        timer = null;
        run();
      }, debounceMs);
    }

    run();

    if (global.MutationObserver) {
      obs = new MutationObserver(function () { schedule(); });
      obs.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-lantern-card', 'data-lantern-brand', 'data-lantern-card-type', 'data-lantern-card-factory', 'data-lantern-rail', 'data-lantern-thumbscroll']
      });
    }
  }

  global.LanternCanonicalEnforce = {
    validateZones: validateZones,
    scanAllExploreCards: scanAllExploreCards,
    inspectExploreCard: inspectExploreCard,
    allowVisualCounterfeitMark: allowVisualCounterfeitMark,
    install: install,
    FACTORY_EXPECTED: FACTORY_EXPECTED
  };

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', install);
  } else if (global.document) {
    install();
  }
})(typeof window !== 'undefined' ? window : this);
