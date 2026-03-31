/**
 * One-shot builder: assembles native locker.html from index.html + store.html fragments.
 * Run: node build-locker.cjs
 *
 * index.full.html fragments are extracted by explicit HTML comment markers (LOCKER_BUILD:*),
 * not line numbers — CSS/head growth above the Locker block cannot shift extraction into <style>.
 * Markers live in locker-sources/index.full.html; keep START/END pairs in sync.
 * storeMain: titleRow … through leaderboard (see store slice logic below).
 * After any edit to locker-sources/index.full.html or locker-sources/store.full.html: rerun this script.
 */
const fs = require('fs');
const path = require('path');
const root = __dirname;

const indexFullPath = path.join(root, 'locker-sources', 'index.full.html');
const indexFullRaw = fs.readFileSync(indexFullPath, 'utf8');

/** Comment prefix; line may continue with em dash and description before `-->`. */
const MARK_OVERVIEW_START = '<!-- LOCKER_BUILD:OVERVIEW_START';
const MARK_OVERVIEW_END = '<!-- LOCKER_BUILD:OVERVIEW_END -->';
const MARK_MODALS_START = '<!-- LOCKER_BUILD:MODALS_START';
const MARK_MODALS_END = '<!-- LOCKER_BUILD:MODALS_END -->';

/**
 * Extracts text after the closing `-->` of a START marker comment, up to (but not including) endMarker line.
 */
function extractBetweenMarkerComments(full, startPrefix, endMarkerFull, label) {
  const si = full.indexOf(startPrefix);
  if (si < 0) {
    throw new Error('build-locker.cjs: missing ' + startPrefix + ' in locker-sources/index.full.html (' + label + ')');
  }
  const startCommentClose = full.indexOf('-->', si);
  if (startCommentClose < 0) {
    throw new Error('build-locker.cjs: unclosed START marker comment for ' + label + ' in index.full.html');
  }
  const contentStart = startCommentClose + 3;
  const ei = full.indexOf(endMarkerFull, contentStart);
  if (ei < 0) {
    throw new Error('build-locker.cjs: missing ' + endMarkerFull.trim() + ' after ' + label + ' START in index.full.html');
  }
  if (ei <= contentStart) {
    throw new Error('build-locker.cjs: END marker for ' + label + ' is not after START');
  }
  return full.slice(contentStart, ei).replace(/^\r?\n/, '').replace(/\r?\n$/, '').trimEnd();
}

function assertFragmentSafeForLocker(html, label) {
  if (!html || !String(html).trim()) {
    throw new Error('build-locker.cjs: empty fragment for ' + label);
  }
  if (/<\s*html[\s>]/i.test(html)) throw new Error('build-locker.cjs: ' + label + ' contains <html> (slice leak)');
  if (/<\s*head[\s>]/i.test(html)) throw new Error('build-locker.cjs: ' + label + ' contains <head> (slice leak)');
  if (/<\s*body[\s>]/i.test(html)) throw new Error('build-locker.cjs: ' + label + ' contains <body> (slice leak)');
  if (/<\/\s*head\s*>/i.test(html)) throw new Error('build-locker.cjs: ' + label + ' contains </head> (slice leak)');
  if (/<\/\s*style\s*>/i.test(html)) throw new Error('build-locker.cjs: ' + label + ' contains </style> (stylesheet spill — check LOCKER_BUILD markers in index.full.html)');
  if (/<\s*style[\s>]/i.test(html)) throw new Error('build-locker.cjs: ' + label + ' contains <style> (unexpected)');
}

function assertOverviewFragment(html) {
  assertFragmentSafeForLocker(html, 'overviewMain');
  if (!/id="pickerCard"/.test(html)) throw new Error('build-locker.cjs: overviewMain missing id="pickerCard"');
  if (!/id="profileView"/.test(html)) throw new Error('build-locker.cjs: overviewMain missing id="profileView"');
}

function assertModalsFragment(html) {
  assertFragmentSafeForLocker(html, 'modals');
  if (!/id="betaReportOverlay"/.test(html)) throw new Error('build-locker.cjs: modals missing id="betaReportOverlay"');
  if (!/id="avatarCropOverlay"/.test(html)) throw new Error('build-locker.cjs: modals missing id="avatarCropOverlay"');
  if (!/id="editProfileOverlay"/.test(html)) throw new Error('build-locker.cjs: modals missing id="editProfileOverlay"');
}

/* Template already emits classAccessBannerEl / gate / contentWrap — do not splice verifyBlock (was duplicating those nodes). */
const verifyBlock = '';

const overviewMain = extractBetweenMarkerComments(indexFullRaw, MARK_OVERVIEW_START, MARK_OVERVIEW_END, 'OVERVIEW');
assertOverviewFragment(overviewMain);

const modals = extractBetweenMarkerComments(indexFullRaw, MARK_MODALS_START, MARK_MODALS_END, 'MODALS')
  .replace(/<option value="Profile">Profile<\/option>/, '<option value="Locker">Locker</option>');
assertModalsFragment(modals);

const st = fs.readFileSync(path.join(root, 'locker-sources', 'store.full.html'), 'utf8').split(/\r?\n/);

/* Store body: HTML `<div class="titleRow">` … through leaderboard `grid2` close. Omit standalone `</div></div>` (contentWrap + wrap) before `storePurchaseOverlay`. Hardcoded line indices drift when `store.full.html` changes — derive from markers. */
const storeStartIdx = st.findIndex((l) => /^\s*<div class="titleRow">/.test(l));
const storeOverlayLineIdx = st.findIndex((l) => l.includes('id="storePurchaseOverlay"'));
if (storeStartIdx < 0 || storeOverlayLineIdx < 0) {
  throw new Error('build-locker.cjs: could not locate store fragment (titleRow or storePurchaseOverlay) in locker-sources/store.full.html');
}
let storeMainEnd = storeOverlayLineIdx;
while (storeMainEnd > storeStartIdx && st[storeMainEnd - 1].trim() === '') storeMainEnd--;
if (!/^\s*<\/div>\s*$/.test(st[storeMainEnd - 1])) {
  throw new Error('build-locker.cjs: expected </div> (wrap close) immediately before store overlay in store.full.html');
}
storeMainEnd--;
while (storeMainEnd > storeStartIdx && st[storeMainEnd - 1].trim() === '') storeMainEnd--;
if (!/^\s*<\/div>\s*$/.test(st[storeMainEnd - 1])) {
  throw new Error('build-locker.cjs: expected </div> (contentWrap close) before wrap close in store.full.html');
}
storeMainEnd--;
let storeMain = st.slice(storeStartIdx, storeMainEnd).join('\n').replace(/id="dailyHuntNuggetEl"/g, 'id="storeDailyHuntNuggetEl"');

const storeOverlay = `
  <div class="overlay" id="storePurchaseOverlay" style="display:none;">
    <div class="modal">
      <div class="modalHd">
        <div class="t" id="storeModalTitle">…</div>
        <button class="x" id="storeModalCloseBtn">✕</button>
      </div>
      <div class="modalBd" id="storeModalBody"></div>
    </div>
  </div>
  <audio id="mtssChaChing" src="assets/cha_ching.mp3" preload="auto"></audio>
`;

const lockerTabCss = `
    .lockerSection{ margin-bottom: 28px; }
    .lockerSectionHd{ font-weight: 900; font-size: 26px; color: var(--accent); margin-bottom: 12px; }
    .lockerEmpty{ color: var(--muted); font-size: 22px; font-weight: 800; padding: 16px 0; }
    .lockerTabsMount{ width: 100%; box-sizing: border-box; }
    .lockerTabsMount--sticky .lockerTabs{ margin: 0 0 16px; }
    #lockerTabsMountPicker .lockerTabs,
    #pickerCard .lockerTabs{ margin: 0 0 14px; }
    .profileHero .lockerTabsMount,
    #lockerTabsMountHero{ align-self: stretch; width: 100%; }
    .profileHero .lockerTabs,
    #lockerTabsMountHero .lockerTabs{ margin: 0 0 12px; }
    .lockerTabs{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin:0;
      align-items:center;
      justify-content:center;
    }
    .lockerTabBtn{
      min-height:48px;
      padding:10px 18px;
      border-radius:14px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.08);
      color:var(--ink);
      font-weight:800;
      font-size:22px;
      cursor:pointer;
      font-family:inherit;
    }
    .lockerTabBtn[aria-selected="true"]{
      border-color: rgba(90,167,255,.5);
      background: linear-gradient(180deg, rgba(90,167,255,.25), rgba(90,167,255,.12));
      cursor: default;
    }
    .lockerPanel{ margin: 0 0 24px; }
    /* SP6: visible surface cue on the active tabpanel only (uses data-locker-surface from Phase-SP5). */
    .wrap.lanternContent [data-locker-surface]:not([hidden]){
      box-shadow: inset 0 3px 0 0 var(--accent);
    }
    /* L-Rail-4: Items tab cosmetics rails — .lanternScroller replaces contentScroller + contentScrollerTrack.
       Matches former lantern-rails .contentScroller margin/padding + .contentScrollerTrack gap (14px); no scroll-snap. */
    #lockerPanelItems .lanternScroller{
      gap: 14px;
      align-items: stretch;
      margin: 0 calc(-1 * var(--lantern-pad-x, 12px));
      padding: 8px var(--lantern-pad-x, 12px) 16px;
      min-width: 0;
    }
`;

const lockerItemsScript = `
  <script>
    (function(){
    var createRun = (typeof LANTERN_API !== 'undefined' && LANTERN_API.createRun) ? LANTERN_API.createRun : null;
    var LS_ADOPTED = 'LANTERN_ADOPTED_CHARACTER';
    function lockerEl(id){ return document.getElementById(id); }

    function parseLockerRoute(){
      var raw = (typeof location !== 'undefined' && location.hash) ? String(location.hash) : '';
      if (raw === '#' || raw === '') raw = '#overview';
      if (raw === '#items') return { tab: 'items' };
      if (raw === '#store') return { tab: 'store' };
      if (raw === '#profileNeedsAttention') return { tab: 'overview' };
      return { tab: 'overview' };
    }

    function setTabButtonsActive(tab){
      document.querySelectorAll('.lockerTabBtn').forEach(function(btn){
        var t = btn.getAttribute('data-locker-tab');
        btn.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
    }

    function syncLockerTabsPlacement(){
      var tabs = lockerEl('lockerTabs');
      if (!tabs) return;
      var mountSticky = lockerEl('lockerTabsMountSticky');
      var mountPicker = lockerEl('lockerTabsMountPicker');
      var mountHero = lockerEl('lockerTabsMountHero');
      var pOverview = lockerEl('lockerPanelOverview');
      var pv = lockerEl('profileView');
      var picker = lockerEl('pickerCard');
      if (!mountSticky || !pOverview) return;

      var tab = 'overview';
      try {
        var raw = (typeof location !== 'undefined' && location.hash) ? String(location.hash) : '';
        if (raw === '' || raw === '#') raw = '#overview';
        if (raw === '#items') tab = 'items';
        else if (raw === '#store') tab = 'store';
        else if (raw === '#profileNeedsAttention') tab = 'overview';
      } catch(e){}

      if (tab !== 'overview') {
        mountSticky.appendChild(tabs);
        return;
      }
      var profVisible = pv && window.getComputedStyle(pv).display !== 'none';
      if (profVisible && mountHero) {
        mountHero.appendChild(tabs);
      } else if (picker && mountPicker && window.getComputedStyle(picker).display !== 'none') {
        mountPicker.appendChild(tabs);
      } else {
        mountSticky.appendChild(tabs);
      }
    }

    function wireLockerTabsPlacementObserver(){
      function bump(){ syncLockerTabsPlacement(); }
      var pv = lockerEl('profileView');
      var picker = lockerEl('pickerCard');
      if (pv) {
        var o1 = new MutationObserver(bump);
        o1.observe(pv, { attributes: true, attributeFilter: ['style', 'class'] });
      }
      if (picker) {
        var o2 = new MutationObserver(bump);
        o2.observe(picker, { attributes: true, attributeFilter: ['style', 'class'] });
      }
      window.addEventListener('resize', bump);
    }

    function showLockerTab(tab){
      var pOverview = lockerEl('lockerPanelOverview');
      var pItems = lockerEl('lockerPanelItems');
      var pStore = lockerEl('lockerPanelStore');
      if (!pOverview || !pItems || !pStore) return;
      setTabButtonsActive(tab);
      pOverview.hidden = tab !== 'overview';
      pItems.hidden = tab !== 'items';
      pStore.hidden = tab !== 'store';
      if (tab === 'items') initItemsTab();
      syncLockerTabsPlacement();
    }

    function applyLockerHash(){
      var r = parseLockerRoute();
      showLockerTab(r.tab);
    }

    function wireLockerTabs(){
      document.querySelectorAll('.lockerTabBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var t = btn.getAttribute('data-locker-tab');
          if (!t) return;
          var current = parseLockerRoute().tab;
          if (current === t) return;
          var h = '#overview';
          if (t === 'items') h = '#items';
          else if (t === 'store') h = '#store';
          try {
            location.hash = h;
          } catch (e) {
            applyLockerHash();
          }
        });
      });
      window.addEventListener('hashchange', function(){ applyLockerHash(); });
    }

    var cosmetics = [];
    var CATEGORY_LABELS = {
      background: 'Backgrounds', frame: 'Frames', effect: 'Effects', decoration: 'Effects',
      accent: 'Titles', badge: 'Avatars', accessory: 'Avatars'
    };
    var CATEGORY_ORDER = ['background', 'frame', 'effect', 'decoration', 'accent', 'badge', 'accessory'];
    var RARITY_LABELS_ITEMS = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
    function normalizeRarityKeyItems(r){
      var x = String(r || 'common').toLowerCase();
      if (['common','uncommon','rare','epic','legendary'].indexOf(x) < 0) x = 'common';
      return x;
    }

    function loadAdopted(){
      try {
        if (typeof localStorage === 'undefined' || !localStorage.getItem) return null;
        var raw = localStorage.getItem(LS_ADOPTED);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        return (obj && obj.name) ? obj : null;
      } catch(e){ return null; }
    }

    function escapeHtml(s){
      if (s == null) return '';
      var t = document.createElement('div');
      t.textContent = s;
      return t.innerHTML;
    }

    function callStoreBootstrap(){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false, error: 'API not loaded' });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(err){ resolve({ ok: false, error: String(err && err.message || err) }); }).storeBootstrap();
      });
    }

    function callGetCosmeticOwnership(characterName){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ owned: [], equipped: {} });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(res){ resolve(res); }).withFailureHandler(function(){ resolve({ owned: [], equipped: {} }); }).getCosmeticOwnership({ character_name: characterName });
      });
    }

    function callEquipCosmetic(characterName, cosmeticId, category){
      var run = createRun ? createRun() : null;
      if (!run) return Promise.resolve({ ok: false });
      return new Promise(function(resolve){
        run.withSuccessHandler(function(r){ resolve(r || { ok: true }); }).withFailureHandler(function(){ resolve({ ok: false }); }).equipCosmetic({ character_name: characterName, cosmetic_id: cosmeticId || '', category: category });
      });
    }

    function renderLocker(characterName, ownership){
      var container = lockerEl('lockerSectionsEl');
      if (!container) return;
      var owned = (ownership && ownership.owned) || [];
      var equipped = (ownership && ownership.equipped) || {};
      var byCategory = {};
      (cosmetics || []).forEach(function(c){
        var cat = c.category || 'other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(c);
      });
      container.innerHTML = '';
      var seenLabels = {};
      CATEGORY_ORDER.forEach(function(catKey){
        if (catKey === 'decoration') return;
        var items = byCategory[catKey];
        if (catKey === 'effect') items = (byCategory.effect || []).concat(byCategory.decoration || []);
        if (!items || items.length === 0) return;
        var label = CATEGORY_LABELS[catKey] || catKey;
        if (label === 'Avatars' && seenLabels['Avatars']) return;
        seenLabels[label] = true;
        if (label === 'Avatars') items = (byCategory.badge || []).concat(byCategory.accessory || []);
        var section = document.createElement('div');
        section.className = 'lockerSection';
        section.innerHTML = '<div class="lockerSectionHd">' + escapeHtml(label) + '</div>';
        /* L-Rail-4: LanternScroller.mountStudentScroller — sole dynamic student-facing scroller path. */
        if (!window.LanternScroller || typeof window.LanternScroller.mountStudentScroller !== 'function') {
          if (window.LanternCanonicalFailClosed) window.LanternCanonicalFailClosed('LanternScroller.mountStudentScroller required for Locker Items rails');
          return;
        }
        var scroller = document.createElement('div');
        window.LanternScroller.mountStudentScroller(scroller, { ariaLabel: String(label || '') });
        if (!window.LanternCards || !window.LanternCards.specCosmeticRailCard || !window.LanternCards.createStudentCard){
          if (window.LanternCanonicalFailClosed) window.LanternCanonicalFailClosed('LanternCards.specCosmeticRailCard + createStudentCard required for Locker Items');
          return;
        }
        var LC = window.LanternCards;
        items.forEach(function(c){
          var ownedFlag = owned.indexOf(c.id) >= 0;
          var equippedFlag = equipped[c.category] === c.id;
          var stateText = equippedFlag ? 'Equipped' : (ownedFlag ? 'Owned' : 'Locked');
          var rar = normalizeRarityKeyItems(c.rarity);
          var subUse = (ownedFlag && !equippedFlag) ? 'Owned · Tap card to equip' : stateText;
          var card = LC.createStudentCard(LC.specCosmeticRailCard({
            title: c.name || c.id,
            icon: c.icon || '✨',
            rarityKey: rar,
            rarityLabel: RARITY_LABELS_ITEMS[c.rarity || 'common'] || 'Common',
            subline: subUse,
            stateEquipped: equippedFlag,
            stateOwned: ownedFlag && !equippedFlag,
            stateLocked: !ownedFlag,
            reportId: c.id,
            dataAttrs: { 'cosmetic-id': String(c.id) }
          }));
          if (!card) return;
          scroller.appendChild(card);
          if (ownedFlag && !equippedFlag && characterName){
            card.classList.add('exploreCard--activatable');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.addEventListener('click', function(ev){
              if (ev.target.closest('.exploreCardReportBtn')) return;
              if (card.getAttribute('data-lc-equip-busy') === '1') return;
              card.setAttribute('data-lc-equip-busy', '1');
              callEquipCosmetic(characterName, c.id, c.category || '').then(function(r){
                card.removeAttribute('data-lc-equip-busy');
                if (r && r.ok){
                  callGetCosmeticOwnership(characterName).then(function(o){ renderLocker(characterName, o); });
                }
              });
            });
          }
        });
        section.appendChild(scroller);
        container.appendChild(section);
      });
      if (container.children.length === 0){
        container.innerHTML = '<div class="lockerEmpty">No cosmetics in your locker yet. Open the Store tab to buy items.</div>';
      }
    }

    async function initItemsTab(){
      var adopted = loadAdopted();
      if (!adopted || !adopted.name){
        lockerEl('lockerSectionsEl').innerHTML = '<p class="note">Pick a student on the <strong>Overview</strong> tab first, then return here.</p>';
        return;
      }
      var res = await callStoreBootstrap();
      if (!res.ok){
        lockerEl('lockerSectionsEl').innerHTML = '<p class="note">Could not load locker. Try again later.</p>';
        return;
      }
      cosmetics = res.cosmetics || [];
      var ownership = await callGetCosmeticOwnership(adopted.name);
      var eq = (ownership && ownership.equipped) || {};
      if (eq.background) {
        var bgVal = String(eq.background).replace('bg_', '');
        document.body.setAttribute('data-background', bgVal);
      } else {
        document.body.removeAttribute('data-background');
      }
      if (eq.effect) {
        var effectVal = String(eq.effect).replace('effect_', '');
        document.body.setAttribute('data-effect', effectVal);
      } else {
        document.body.removeAttribute('data-effect');
      }
      renderLocker(adopted.name, ownership);
    }

    function bootLockerPage(){
      wireLockerTabs();
      wireLockerTabsPlacementObserver();
      applyLockerHash();
      syncLockerTabsPlacement();
      setTimeout(syncLockerTabsPlacement, 0);
      setTimeout(syncLockerTabsPlacement, 300);
      setTimeout(syncLockerTabsPlacement, 900);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLockerPage);
    else bootLockerPage();
    })();
  </script>
`;

const html = `<!DOCTYPE html>
<!-- ===== TMS Lantern — Locker (native: Overview + Items + Store) ===== -->
<html>
<head>
  <base target="_top">
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script>window.LANTERN_AVATAR_API = 'https://lantern-api.mrradle.workers.dev';</script>
  <title>TMS Lantern — Locker</title>
  <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.5.13/dist/cropper.min.css">
  <link rel="stylesheet" href="css/lantern-ticker.css">
  <link rel="stylesheet" href="css/lantern-header.css">
  <link rel="stylesheet" href="css/lantern-cards.css">
  <link rel="stylesheet" href="css/lantern-profile-page.css">
  <link rel="stylesheet" href="css/lantern-store-panel.css">
  <link rel="stylesheet" href="css/lantern-rails.css">
  <link rel="prefetch" href="games.html">
  <link rel="prefetch" href="explore.html">
  <style>
${lockerTabCss}
  </style>
</head>
<body class="page-has-ticker">
  <script src="js/lantern-canonical-route-boot.js"></script>
  <div id="cosmeticEffectLayer" class="cosmeticEffectLayer" aria-hidden="true"></div>
  <div id="lanternHeader">
    <div id="lanternTicker"></div>
    <div id="lanternAppBarRoot"></div>
  </div>
  <div class="wrap lanternContent">
    <div id="classAccessBannerEl"></div>
    <div id="classAccessGateWrap" style="display:none;position:fixed;inset:0;z-index:9999;background:#0b1220;overflow:auto;padding:24px;"></div>
    <div id="classAccessContentWrap" style="visibility:hidden;opacity:0;">
${verifyBlock}
    <div id="lockerTabsMountSticky" class="lockerTabsMount lockerTabsMount--sticky">
    <div id="lockerTabs" class="lockerTabs" role="tablist" aria-label="Locker sections">
      <button type="button" class="lockerTabBtn" role="tab" id="lockerTabOverview" data-locker-tab="overview" aria-selected="true">Overview</button>
      <button type="button" class="lockerTabBtn" role="tab" id="lockerTabItems" data-locker-tab="items" aria-selected="false">Items</button>
      <button type="button" class="lockerTabBtn" role="tab" id="lockerTabStore" data-locker-tab="store" aria-selected="false">Store</button>
    </div>
    </div>
    <!-- Locker tabpanel: Overview (#lockerPanelOverview) — profile .section / .sectionHd / .sectionBd + profile CSS; body = overviewMain slice. Map: docs/ui/LOCKER_SURFACE_MAP.md -->
    <div id="lockerPanelOverview" class="lockerPanel" role="tabpanel" aria-labelledby="lockerTabOverview" data-locker-surface="overview">
${overviewMain}
    </div>
    <!-- Locker tabpanel: Items (#lockerPanelItems) — #lockerSectionsEl + JS-built .lockerSection* + .lanternScroller + Lantern cosmetic cards. Map: docs/ui/LOCKER_SURFACE_MAP.md -->
    <div id="lockerPanelItems" class="lockerPanel" role="tabpanel" aria-labelledby="lockerTabItems" hidden data-locker-surface="items">
      <div id="lockerSectionsEl"></div>
      <p class="note" style="padding:0;">Equip cosmetics here. For name, bio, avatar, and featured work, use <strong>Edit Profile</strong> on Overview. Buy more on the Store tab.</p>
    </div>
    <!-- Locker tabpanel: Store (#lockerPanelStore) — .storePanelRoot; static .lockerSection* + .card rows. Map: docs/ui/LOCKER_SURFACE_MAP.md -->
    <div id="lockerPanelStore" class="lockerPanel" role="tabpanel" aria-labelledby="lockerTabStore" hidden data-locker-surface="store">
      <div class="storePanelRoot">
${storeMain}
      </div>
    </div>
    </div>
${modals}
${storeOverlay}
  </div>

  <div class="toast" id="toast"></div>

  <script src="sfx.js"></script>
  <script src="js/class-access.js"></script>
  <script src="js/lantern-data.js"></script>
  <script src="js/lantern-avatar.js"></script>
  <script src="js/lantern-api.js"></script>
  <script src="js/lantern-media.js"></script>
  <script src="js/lantern-scroller.js"></script>
  <script src="js/lantern-cards.js"></script>
  <script src="js/lantern-card-ui.js"></script>
  <script src="js/lantern-feature-flags.js"></script>
  <script src="js/lantern-reactions.js"></script>
  <script src="js/lantern-nav.js"></script>
  <script src="js/lantern-ticker.js"></script>
  <script src="js/lantern-route-help.js"></script>
  <script src="js/lantern-help.js"></script>
  <script src="https://unpkg.com/cropperjs@1.5.13/dist/cropper.min.js"></script>
  <script src="js/lantern-profile-app.js"></script>
  <script src="js/lantern-store-app.js"></script>
${lockerItemsScript}
  <script src="js/lantern-canonical-enforce.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'locker.html'), html, 'utf8');
console.log('Wrote locker.html');
