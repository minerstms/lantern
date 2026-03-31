/**
 * Lantern Brand Killer — runtime contract for canonical cards, rails, and thumbscrolls.
 * CARD CANCER SCANNER: every .exploreCard is inspected; failures get .lanternCardCancer + __lanternCancerReport.
 * Depends: DOM after lantern-cards.js (factory-branded outputs).
 */
(function (global) {
  'use strict';

  global.__lanternCanonicalEnforcementLoaded = true;
  if (!global.__lanternCancerReport) global.__lanternCancerReport = [];

  var ZONE_SELECTORS = ['.wrap.lanternContent', '#lanternCardDetailOverlay'];
  var BANNED_CLASS_NAMES = ['contentScrollerTrack', 'contentScroller', 'scrollerCard'];
  var FATAL_ID = 'lanternBrandKillerFatal';
  var ERR_PREFIX = '[LanternBrandKiller]';
  var CANCER_LOG = '[LANTERN CARD CANCER]';

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

  function inferSourceAndKill(el) {
    var cls = String(el.className || '');
    if (/\bmissionSpotlightCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.buildMissionSpotlightRailElement → createStudentCard(specMissionSpotlightRail)', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bpollCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specPollRailCard / materializePollRailCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bgamesHubPlayCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specGameHubRailCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bgameHighlightCard\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specLinkCard / specGameHighlightLinkCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--cosmeticRail\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specCosmeticRailCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--leaderboardChip\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specLeaderboardChipRailCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--displayNewsTile\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specDisplayNewsSpotlightCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--activityPulse\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specActivityPulseCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCardProfileRail\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specIconRailCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\bexploreCard--previewRail\b/.test(cls)) {
      return { sourceHint: 'LanternCards.specNewsRailCard / specOpenedNews', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (String(el.tagName || '').toLowerCase() === 'a' && el.classList.contains('exploreCard')) {
      return { sourceHint: 'LanternCards.specLinkCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (/\btype-[a-z0-9_-]+\b/i.test(cls)) {
      return { sourceHint: 'LanternCards.materializeFeedPostCard', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
    }
    if (el.getAttribute('data-lantern-card-factory') === FACTORY_EXPECTED) {
      return { sourceHint: 'LanternCards factory (createStudentCard)', killTarget: 'apps/lantern-app/js/lantern-cards.js — createStudentCard' };
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

  function inspectRailContract(el, reasons) {
    var stack = el.querySelector('.exploreCardRailStack');
    if (!stack) {
      reasons.push('MISSING_RAIL_STACK');
      return;
    }
    var kids = stack.children;
    var i;
    for (i = 0; i < kids.length; i++) {
      if (!kids[i].classList || !kids[i].classList.contains('lcRailRow')) {
        reasons.push('NON_CANONICAL_STACK_CHILD');
        break;
      }
    }
    if (stack.querySelector('.lcRailRow--footer')) {
      reasons.push('FORBIDDEN_FOOTER_ROW');
    }
    var topRows = stack.querySelectorAll(':scope > .lcRailRow');
    var rowCount = topRows.length;
    if (rowCount === 4) {
      var order4 = ['media', 'title', 'identity', 'meta'];
      for (var r4 = 0; r4 < 4; r4++) {
        if (!topRows[r4].classList || !topRows[r4].classList.contains('lcRailRow--' + order4[r4])) {
          reasons.push('RAIL_ROW_ORDER_MISMATCH');
          break;
        }
      }
    } else if (rowCount === 5) {
      var order5 = ['media', 'title', 'identity', 'body', 'meta'];
      for (var r5 = 0; r5 < 5; r5++) {
        if (!topRows[r5].classList || !topRows[r5].classList.contains('lcRailRow--' + order5[r5])) {
          reasons.push('RAIL_ROW_ORDER_MISMATCH');
          break;
        }
      }
      var bodyRow = stack.querySelector('.lcRailRow--body');
      if (bodyRow && !bodyRow.querySelector('.exploreCaption')) {
        reasons.push('BODY_ROW_MISSING_EXPLORE_CAPTION');
      }
    } else {
      reasons.push('RAIL_STACK_ROW_COUNT_INVALID');
    }
    if (!stack.querySelector('.lcRailRow--identity .exploreCardIdentity--rail')) {
      reasons.push('MISSING_CANONICAL_IDENTITY_ROW');
    }
    var idList = stack.querySelectorAll('.exploreCardIdentity--rail');
    for (i = 0; i < idList.length; i++) {
      if (!idList[i].closest('.lcRailRow--identity')) {
        reasons.push('IDENTITY_OUTSIDE_ROW_3');
        break;
      }
    }
    var titleZone = stack.querySelector('.lcRailRow--title');
    if (titleZone) {
      var hd = titleZone.querySelector('.exploreCardHd--preview');
      if (hd) {
        var ch = hd.children;
        var j;
        for (j = 0; j < ch.length; j++) {
          if (!ch[j].classList || !ch[j].classList.contains('exploreTitle')) {
            reasons.push('TITLE_ROWS_NON_TITLE_CONTENT');
            break;
          }
        }
        var titles = hd.querySelectorAll(':scope > .exploreTitle');
        if (titles.length !== 1) reasons.push('TITLE_NOT_SINGLE_EXPLORE_TITLE');
        if (titles.length === 1) {
          var tEl = titles[0];
          var lh = parseFloat(global.getComputedStyle(tEl).lineHeight);
          if (isNaN(lh) || lh <= 0) lh = parseFloat(global.getComputedStyle(tEl).fontSize) * 1.2;
          if (tEl.scrollHeight > lh * 2 + 3) reasons.push('TITLE_EXCEEDS_TWO_LINES');
        }
      }
    }
    var metaEls = stack.querySelectorAll('.lcRailRow--meta .exploreCardMetaOneLine');
    for (i = 0; i < metaEls.length; i++) {
      if (metaEls[i].scrollHeight > metaEls[i].clientHeight + 3) reasons.push('META_WRAPS_OR_STACKS');
    }
    var idEls = stack.querySelectorAll('.lcRailRow--identity .exploreAuthor--identity, .lcRailRow--identity .exploreAuthor');
    for (i = 0; i < idEls.length; i++) {
      if (idEls[i].scrollHeight > idEls[i].clientHeight + 3) reasons.push('IDENTITY_MULTILINE');
    }
    var ew = readCssVarPx(el, '--lantern-rail-card-outer-width', 280);
    var eh = readCssVarPx(el, '--lantern-rail-card-height', 420);
    if (Math.abs(el.offsetWidth - ew) > 6) reasons.push('SHELL_WIDTH_DRIFT');
    if (Math.abs(el.offsetHeight - eh) > 6) reasons.push('SHELL_HEIGHT_DRIFT');
    var vis = stack.querySelector('.lcRailRow--media > .exploreCardVisual');
    if (vis) {
      var mh = readCssVarPx(el, '--lantern-rail-card-media-height', 128);
      if (Math.abs(vis.offsetHeight - mh) > 6) reasons.push('MEDIA_HEIGHT_DRIFT');
    } else {
      reasons.push('MISSING_MEDIA_IN_ROW_0');
    }
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

    if (el.classList.contains('exploreCard--rail')) {
      inspectRailContract(el, reasons);
    } else if (passesLinkCardContract(el)) {
      inspectRailContract(el, reasons);
    } else if (el.querySelector('.exploreCardRailStack')) {
      reasons.push('RAIL_STACK_WITHOUT_RAIL_CLASS');
    } else {
      reasons.push('UNCLASSIFIED_CARD_NOT_RAIL_OR_LINK');
    }

    var ok = reasons.length === 0;
    return { ok: ok, reasons: reasons, sourceHint: sk.sourceHint, killTarget: sk.killTarget };
  }

  function unmarkCancer(el) {
    if (!el || !el.classList) return;
    el.classList.remove('lanternCardCancer');
    el.removeAttribute('data-lantern-invalid');
    var ban = el.querySelector(':scope > .lanternCardCancerBanner');
    if (ban && ban.parentNode) ban.parentNode.removeChild(ban);
  }

  function markCancer(el, result) {
    if (!el || !el.classList) return;
    el.classList.add('lanternCardCancer');
    el.setAttribute('data-lantern-invalid', 'true');
    var lines = ['LANTERN CARD CANCER'];
    var rs = result.reasons || [];
    for (var i = 0; i < rs.length && i < 6; i++) lines.push(String(rs[i]).replace(/_/g, ' '));
    if (rs.length > 6) lines.push('+' + (rs.length - 6) + ' more');
    lines.push('→ ' + (result.killTarget || result.sourceHint || ''));
    var txt = lines.join('\n');
    var ban = el.querySelector(':scope > .lanternCardCancerBanner');
    if (!ban) {
      ban = (el.ownerDocument || global.document).createElement('div');
      ban.className = 'lanternCardCancerBanner';
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
    var cards = doc.querySelectorAll('.exploreCard');
    var report = [];
    var i;
    for (i = 0; i < cards.length; i++) {
      var el = cards[i];
      var r = inspectExploreCard(el);
      if (!r.ok) {
        markCancer(el, r);
        report.push(buildReportEntry(el, r));
        if (global.console && global.console.error) {
          global.console.error(CANCER_LOG, r.reasons.join('; '), r.sourceHint, r.killTarget, describeNode(el));
        }
      } else {
        unmarkCancer(el);
      }
    }
    global.__lanternCancerReport = report;
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
    install: install,
    FACTORY_EXPECTED: FACTORY_EXPECTED
  };

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', install);
  } else if (global.document) {
    install();
  }
})(typeof window !== 'undefined' ? window : this);
