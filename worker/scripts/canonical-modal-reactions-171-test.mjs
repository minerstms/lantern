/**
 * Prompt #171 — reactions/responses at the BOTTOM of canonical content modals.
 * Inspects ACTUAL rendered DOM order (not only source strings) plus Chromium geometry.
 * Usage: node worker/scripts/canonical-modal-reactions-171-test.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'app');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const overlayHtml = (cardUi.match(/overlay\.innerHTML\s*=\s*'[\s\S]*?';/) || [''])[0];
const rxIdx = overlayHtml.indexOf('lanternCardDetailReactions');
const bodyIdx = overlayHtml.indexOf('lanternCardDetailBody');
const overlayRxCss = (cardsCss.match(/\.lanternCardDetailOverlay \.lanternCardDetailReactions\{[\s\S]*?\n\}/) || [''])[0];
const overlayBodyCss = (cardsCss.match(/\.lanternCardDetailOverlay \.lanternCardDetailBody\{[\s\S]*?\n\}/) || [''])[0];
const overlayStageCss = (cardsCss.match(/#lanternCardDetailOverlay \.lanternCardDetailStage\{[\s\S]*?\n\}/) || [''])[0];
const overlayShellCss = (cardsCss.match(/#lanternCardDetailOverlay\.lanternSurfaceShell\{[\s\S]*?\n\}/) || [''])[0];

assert(bodyIdx > 0 && rxIdx > bodyIdx, 'source: overlay HTML places body before reactions');
assert(/stageOrder[\s\S]{0,320}lanternCardDetailBody[\s\S]{0,80}lanternCardDetailReactions/.test(cardUi), 'source: shared stageOrder body then reactions');
assert(!/stageOrder[\s\S]{0,280}lanternCardDetailReactions[\s\S]{0,80}lanternCardDetailBody/.test(cardUi), 'source: reactions are not ordered before body');
assert(!/position:\s*(sticky|fixed)/.test(overlayRxCss), 'source: overlay reactions are not sticky/fixed');
assert(!/(?:^|[^\w-])order:\s*-?\d+/.test(overlayRxCss + overlayStageCss), 'source: no CSS order override on stage/reactions');
assert(/overflow:\s*visible/.test(overlayBodyCss), 'source: body remains overflow:visible (#168)');
assert(/overflow-y:\s*auto/.test(overlayShellCss), 'source: overlay remains the scroller (#168)');
assert(/object-fit:\s*contain/.test(cardsCss), 'source: detail media contain');
assert(/Prompt #215/.test(cardUi) && /do not mount generic reactions/.test(cardUi), 'source: Poll still does not force generic reactions');
assert(/Lock In/.test(cardUi) && /pollLockInBtn/.test(cardUi), 'source: Poll Lock In unchanged');
assert(/LANTERN_REACTIONS|renderReactionBar/.test(cardUi), 'source: reaction mount unchanged');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const LONG_BODY = Array(1500).fill('lantern').join(' ');

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/lantern-cards.css">
  <style>html,body{margin:0;background:#0a1424;height:100%;}</style>
</head>
<body>
<script>
window.LANTERN_AVATAR_API = '';
window.LanternCards = {
  SHOUT_OUT_DISPLAY_NAME: 'Shout-Out!',
  buildExploreAuthorAvatarHtml: function (item) {
    var key = (item && (item.authorAvatarKey || item.character_name)) || '';
    return '<span class="exploreAvatar" data-account-key="' + key + '"></span>';
  }
};
window.LanternMedia = {
  renderMedia: function (n) {
    var src = (n && (n.image_url || n.imageUrl)) || '';
    if (!src) return { mediaBlock: '' };
    return {
      mediaBlock: '<div class="lanternDetailMedia lanternDetailMedia--img"><div class="newsCardImageWrap lanternDetailMediaImageInner"><img class="newsCardImage" src="' + src + '" alt=""></div></div>'
    };
  }
};
window.LANTERN_REACTIONS = {
  getApiBase: function () { return 'http://127.0.0.1'; },
  getCounts: function () { return Promise.resolve({ ok: true, counts: {} }); },
  getMine: function () { return Promise.resolve({ ok: true, mine: {} }); },
  renderReactionBar: function (opts) {
    var el = opts && opts.container;
    if (!el) return;
    el.innerHTML = '<p class="lanternReactionStatus">Leave a reaction!</p><div class="lanternReactionBar"><button type="button" class="lanternRxBtn">👍</button></div>';
  },
  playCelebration: function () {},
  addReaction: function () { return Promise.resolve({ ok: true }); }
};
</script>
<script src="/js/lantern-card-ui.js"></script>
</body>
</html>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

function startServer() {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      const urlPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
      if (urlPath === '/' || urlPath === '/171.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(FIXTURE_HTML);
        return;
      }
      if (urlPath.startsWith('/css/') || urlPath.startsWith('/js/')) {
        const file = path.join(appRoot, urlPath.replace(/^\//, '').replace(/\//g, path.sep));
        if (!file.startsWith(appRoot)) {
          res.writeHead(403);
          res.end();
          return;
        }
        fs.readFile(file, function (err, data) {
          if (err) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
          res.end(data);
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port });
    });
    server.on('error', reject);
  });
}

async function chromiumChecks() {
  const { server, port } = await startServer();
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
    await page.route('**/api/polls/vote', function (route) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          voted_choice_index: 0,
          results: [
            { choice: 'Alpha', percentage: 100 },
            { choice: 'Bravo', percentage: 0 },
            { choice: 'Charlie', percentage: 0 },
            { choice: 'Delta', percentage: 0 },
            { choice: 'Echo', percentage: 0 },
            { choice: 'Foxtrot', percentage: 0 },
            { choice: 'Golf', percentage: 0 },
            { choice: 'Hotel', percentage: 0 },
            { choice: 'India', percentage: 0 },
            { choice: 'Juliet', percentage: 0 },
            { choice: 'Kilo', percentage: 0 },
            { choice: 'Lima', percentage: 0 },
          ],
        }),
      });
    });
    await page.goto(base + '/171.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(function () {
      return !!(window.LanternCardUI && window.LanternCardUI.openNews && window.LanternCardUI.fillPollDetailModal);
    }, { timeout: 15000 });

    await page.evaluate(function (payload) {
      window.LanternCardUI.openNews({
        id: 'news-171-shout',
        title: 'Shout Out to Coach Colorado!!',
        body: payload.longBody,
        category: 'Shout-Out',
        type: 'shout_out',
        author_name: 'Mr. Begano',
        authorDisplayName: 'Mr. Begano',
        author_type: 'teacher',
        authorAvatarKey: 'frank.begano',
        approved_at: '2026-08-12T12:00:00.000Z',
        image_url: payload.png,
      }, { characterName: 'testpilot' });
    }, { longBody: LONG_BODY, png: PNG_1PX });
    await page.waitForFunction(function () {
      var rx = document.querySelector('#lanternCardDetailReactions');
      return !!(rx && /Leave a reaction/.test(rx.textContent || ''));
    }, { timeout: 8000 });

    const shout = await page.evaluate(function () {
      var FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
      function precedes(a, b) {
        return !!(a && b && (a.compareDocumentPosition(b) & FOLLOWING));
      }
      var overlay = document.getElementById('lanternCardDetailOverlay');
      var visual = overlay.querySelector('.lanternCardDetailVisual');
      var title = overlay.querySelector('.lanternCardDetailTitle');
      var identity = overlay.querySelector('.lanternCardDetailIdentityWrap');
      var meta = overlay.querySelector('.lanternCardDetailMeta');
      var body = overlay.querySelector('.lanternCardDetailBody');
      var rx = overlay.querySelector('.lanternCardDetailReactions');
      var img = overlay.querySelector('.lanternCardDetailVisual img');
      var ovCs = getComputedStyle(overlay);
      var bodyCs = getComputedStyle(body);
      var rxCs = getComputedStyle(rx);
      var stage = overlay.querySelector('.lanternCardDetailStage');
      var stageCs = getComputedStyle(stage);
      var imgCs = img ? getComputedStyle(img) : null;
      return {
        overlayShow: overlay.classList.contains('show'),
        overlayScrollTop: overlay.scrollTop,
        overlayScrollHeight: overlay.scrollHeight,
        overlayClientHeight: overlay.clientHeight,
        overlayOverflowY: ovCs.overflowY,
        overlayScrollbarWidth: ovCs.scrollbarWidth,
        bodyOverflowY: bodyCs.overflowY,
        stageOverflowY: stageCs.overflowY,
        rxPosition: rxCs.position,
        rxTop: rx.getBoundingClientRect().top,
        bodyBottom: body.getBoundingClientRect().bottom,
        bodyHeight: body.getBoundingClientRect().height,
        viewport: window.innerHeight,
        imgObjectFit: imgCs ? imgCs.objectFit : '',
        titleText: title.textContent,
        metaText: meta.textContent,
        identityText: identity.textContent,
        rxText: rx.textContent,
        bodyHasLong: /lantern lantern/.test(body.textContent),
        lastCaption: (body.querySelector('.lanternCardDetailCaption') || body).textContent.slice(-40),
        order: {
          mediaBeforeHeadline: precedes(visual, title),
          headlineBeforeIdentity: precedes(title, identity),
          identityBeforeMeta: precedes(identity, meta),
          metaBeforeBody: precedes(meta, body),
          bodyBeforeRx: precedes(body, rx),
        },
        bodyCompareRx: body.compareDocumentPosition(rx),
      };
    });

    assert(shout.overlayShow, 'chromium: Shout-Out overlay is open');
    assert(shout.titleText === 'Shout Out to Coach Colorado!!', 'chromium: Shout-Out headline');
    assert(/Mr\. Begano/.test(shout.identityText), 'chromium: canonical name present');
    assert(/Shout-Out!/.test(shout.metaText) && /8\/12\/2026|8\/12\/26|12/.test(shout.metaText), 'chromium: Shout-Out! · Date meta', shout.metaText);
    assert(shout.bodyHasLong, 'chromium: full long message rendered');
    assert(/Leave a reaction/.test(shout.rxText), 'chromium: reaction block present');
    assert(shout.order.mediaBeforeHeadline, 'DOM: media before headline');
    assert(shout.order.headlineBeforeIdentity, 'DOM: headline before identity');
    assert(shout.order.identityBeforeMeta, 'DOM: identity before meta');
    assert(shout.order.metaBeforeBody, 'DOM: meta before body');
    assert(shout.order.bodyBeforeRx, 'DOM: body.compareDocumentPosition(reactions) follows');
    assert((shout.bodyCompareRx & 4) === 4, 'DOM: DOCUMENT_POSITION_FOLLOWING on reactions after body', shout.bodyCompareRx);
    assert(shout.bodyHeight > shout.viewport, 'long: body taller than viewport');
    assert(shout.overlayScrollHeight > shout.overlayClientHeight * 2, 'long: overlay > 2× viewport');
    assert(shout.overlayScrollTop === 0, 'long: opened modal starts at top');
    assert(shout.rxTop > shout.viewport, 'long: reactions not visible at top (not sticky/fixed)');
    assert(shout.rxPosition !== 'sticky' && shout.rxPosition !== 'fixed', 'long: reactions position is in flow (' + shout.rxPosition + ')');
    assert(shout.overlayOverflowY === 'auto' || shout.overlayOverflowY === 'scroll', 'geometry: overlay is the scroller');
    assert(shout.bodyOverflowY === 'visible', 'geometry: no nested body scroller');
    assert(shout.stageOverflowY === 'visible', 'geometry: no nested stage scroller');
    assert(shout.overlayScrollbarWidth === 'none', 'geometry: overlay scrollbar chrome hidden');
    assert(shout.imgObjectFit === 'contain' || shout.imgObjectFit === '', 'geometry: media object-fit contain (or inherited)', shout.imgObjectFit);

    const scrolled = await page.evaluate(function () {
      var overlay = document.getElementById('lanternCardDetailOverlay');
      var body = overlay.querySelector('.lanternCardDetailBody');
      var rx = overlay.querySelector('.lanternCardDetailReactions');
      var caption = body.querySelector('.lanternCardDetailCaption') || body;
      overlay.scrollTop = overlay.scrollHeight - overlay.clientHeight;
      var rxBox = rx.getBoundingClientRect();
      var capBox = caption.getBoundingClientRect();
      return {
        scrollTop: overlay.scrollTop,
        rxVisible: rxBox.bottom > 0 && rxBox.top < window.innerHeight,
        rxAfterCaption: rxBox.top >= capBox.bottom - 2,
        rxPosition: getComputedStyle(rx).position,
      };
    });
    assert(scrolled.scrollTop > 0, 'long: overlay scrollTop changes');
    assert(scrolled.rxVisible, 'long: reactions reachable after scrolling overlay');
    assert(scrolled.rxAfterCaption, 'long: reactions appear after final message paragraph');
    assert(scrolled.rxPosition !== 'sticky' && scrolled.rxPosition !== 'fixed', 'long: still not sticky/fixed after scroll');

    const closed = await page.evaluate(function (payload) {
      window.LanternCardUI.closeDetail();
      var overlay = document.getElementById('lanternCardDetailOverlay');
      var hidden = overlay.getAttribute('aria-hidden') === 'true' && !overlay.classList.contains('show');
      window.LanternCardUI.openNews({
        id: 'news-171-shout',
        title: 'Shout Out to Coach Colorado!!',
        body: payload.longBody,
        category: 'Shout-Out',
        type: 'shout_out',
        author_name: 'Mr. Begano',
        authorDisplayName: 'Mr. Begano',
        author_type: 'teacher',
        authorAvatarKey: 'frank.begano',
        approved_at: '2026-08-12T12:00:00.000Z',
        image_url: payload.png,
      }, { characterName: 'testpilot' });
      return {
        closedOk: hidden,
        reopenTop: overlay.scrollTop === 0,
        stillFollowing: !!(overlay.querySelector('.lanternCardDetailBody').compareDocumentPosition(overlay.querySelector('.lanternCardDetailReactions')) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    }, { longBody: LONG_BODY, png: PNG_1PX });
    assert(closed.closedOk, 'close still works');
    assert(closed.reopenTop, 'reopening resets overlay to top');
    assert(closed.stillFollowing, 'reopen keeps body before reactions');

    const news = await page.evaluate(function () {
      window.LanternCardUI.closeDetail();
      window.LanternCardUI.openNews({
        id: 'news-171-article',
        title: 'Friday Assembly',
        body: 'Short news body.',
        category: 'School News',
        type: 'news',
        author_name: 'Ms. Carter',
        authorDisplayName: 'Ms. Carter',
        author_type: 'teacher',
        authorAvatarKey: 'teacher1',
        approved_at: '2026-08-12T12:00:00.000Z',
      }, { characterName: 'testpilot' });
      var overlay = document.getElementById('lanternCardDetailOverlay');
      var body = overlay.querySelector('.lanternCardDetailBody');
      var rx = overlay.querySelector('.lanternCardDetailReactions');
      return {
        title: overlay.querySelector('.lanternCardDetailTitle').textContent,
        bodyBeforeRx: !!(body.compareDocumentPosition(rx) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });
    assert(news.title === 'Friday Assembly', 'news: title filled');
    assert(news.bodyBeforeRx, 'news: body precedes reactions');

    const poll = await page.evaluate(function (payload) {
      window.LanternCardUI.closeDetail();
      var el = window.LanternCardUI.ensureOverlay();
      var modal = el.querySelector('.lanternCardDetailModal');
      var choices = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];
      window.LanternCardUI.fillPollDetailModal(modal, {
        pollId: 'poll-171',
        apiBase: '',
        characterName: 'testpilot',
        fetchRes: {
          ok: true,
          has_voted: false,
          poll: {
            question: 'Which Miner moment was the best?',
            choices: choices,
            created_at: '2026-08-12T12:00:00.000Z',
            character_name: 'testpilot',
            author_name: 'Ms. Carter',
            image_url: payload.png,
          },
        },
      });
      window.LanternCardUI.showDetailOverlay(el);
      var rx = modal.querySelector('.lanternCardDetailReactions');
      rx.innerHTML = '<p class="lanternReactionStatus">Leave a reaction!</p><div class="lanternReactionBar"><button type="button">👍</button></div>';
      var overlay = document.getElementById('lanternCardDetailOverlay');
      var visual = overlay.querySelector('.lanternCardDetailVisual');
      var title = overlay.querySelector('.lanternCardDetailTitle');
      var identity = overlay.querySelector('.lanternCardDetailIdentityWrap');
      var meta = overlay.querySelector('.lanternCardDetailMeta');
      var body = overlay.querySelector('.lanternCardDetailBody');
      var lock = overlay.querySelector('.pollLockInBtn');
      var choiceBtns = overlay.querySelectorAll('.pollChoiceBtn');
      var pollBody = overlay.querySelector('.lanternCardDetailModal--poll .lanternCardDetailBodyRead') || overlay.querySelector('#lanternPollDetailChoices');
      var FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
      return {
        titleText: title.textContent,
        choiceCount: choiceBtns.length,
        lockPresent: !!lock,
        lockDisabled: !!(lock && lock.disabled),
        bodyBeforeRx: !!(body.compareDocumentPosition(rx) & FOLLOWING),
        lockBeforeRx: !!(lock && (lock.compareDocumentPosition(rx) & FOLLOWING)),
        visualBeforeTitle: !!(visual.compareDocumentPosition(title) & FOLLOWING),
        titleBeforeIdentity: !!(title.compareDocumentPosition(identity) & FOLLOWING),
        identityBeforeMeta: !!(identity.compareDocumentPosition(meta) & FOLLOWING),
        metaBeforeBody: !!(meta.compareDocumentPosition(body) & FOLLOWING),
        overlayOverflowY: getComputedStyle(overlay).overflowY,
        bodyOverflowY: getComputedStyle(body).overflowY,
        pollInnerOverflowY: pollBody ? getComputedStyle(pollBody).overflowY : '',
        overlayScrollHeight: overlay.scrollHeight,
        overlayClientHeight: overlay.clientHeight,
        rxPosition: getComputedStyle(rx).position,
      };
    }, { png: PNG_1PX });

    assert(poll.titleText === 'Which Miner moment was the best?', 'poll: question is title');
    assert(poll.choiceCount === 12, 'poll: answer choices rendered');
    assert(poll.lockPresent, 'poll: Lock In present');
    assert(poll.lockDisabled, 'poll: Lock In disabled until a choice is selected');
    assert(poll.bodyBeforeRx, 'poll DOM: body/interactions precede reactions');
    assert(poll.lockBeforeRx, 'poll DOM: Lock In precedes reactions');
    assert(poll.visualBeforeTitle && poll.titleBeforeIdentity && poll.identityBeforeMeta && poll.metaBeforeBody, 'poll DOM: media → title → identity → meta → body');
    assert(poll.bodyOverflowY === 'visible', 'poll: no inner body scroller');
    assert(poll.pollInnerOverflowY === 'visible' || poll.pollInnerOverflowY === '', 'poll: no inner Poll scroller', poll.pollInnerOverflowY);
    assert(poll.overlayOverflowY === 'auto' || poll.overlayOverflowY === 'scroll', 'poll: whole overlay scrolls');
    assert(poll.overlayScrollHeight > poll.overlayClientHeight, 'poll: long Poll extends below viewport');
    assert(poll.rxPosition !== 'sticky' && poll.rxPosition !== 'fixed', 'poll: reactions not sticky/fixed');

    const voted = await page.evaluate(function () {
      var overlay = document.getElementById('lanternCardDetailOverlay');
      var first = overlay.querySelector('.pollChoiceBtn');
      if (first) first.click();
      var lock = overlay.querySelector('.pollLockInBtn');
      var enabled = !!(lock && !lock.disabled);
      if (lock) lock.click();
      return { enabled: enabled };
    });
    assert(voted.enabled, 'poll: selecting a choice enables Lock In');
    await page.waitForFunction(function () {
      var el = document.querySelector('#lanternPollDetailResults');
      return el && el.style.display !== 'none' && /100%/.test(el.textContent || '');
    }, { timeout: 8000 });
    const afterVote = await page.evaluate(function () {
      var overlay = document.getElementById('lanternCardDetailOverlay');
      var results = overlay.querySelector('#lanternPollDetailResults');
      var rx = overlay.querySelector('.lanternCardDetailReactions');
      var body = overlay.querySelector('.lanternCardDetailBody');
      var lockGone = !overlay.querySelector('.pollLockInBtn');
      return {
        resultsVisible: !!(results && results.style.display !== 'none'),
        hasPercent: /100%/.test(results ? results.textContent : ''),
        lockGone: lockGone,
        bodyBeforeRx: !!(body.compareDocumentPosition(rx) & Node.DOCUMENT_POSITION_FOLLOWING),
        resultsBeforeRx: !!(results && (results.compareDocumentPosition(rx) & Node.DOCUMENT_POSITION_FOLLOWING)),
      };
    });
    assert(afterVote.resultsVisible && afterVote.hasPercent, 'poll: results/percentages after Lock In');
    assert(afterVote.lockGone, 'poll: Lock In consumed after save (immutable vote)');
    assert(afterVote.bodyBeforeRx && afterVote.resultsBeforeRx, 'poll: results still precede reactions');
  } finally {
    await browser.close();
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

try {
  await chromiumChecks();
} catch (err) {
  bad('chromium suite', err && err.stack ? err.stack : err);
}

console.log('\ncanonical-modal-reactions-171-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
