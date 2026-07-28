/**
 * Feed API smoke test against deployed Worker.
 * Usage: node scripts/feed-api-smoke.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'https://lantern-api.mrradle.workers.dev').replace(/\/$/, '');

async function j(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, headers: res.headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('BASE', BASE);

  const feed = await j(`${BASE}/api/feed?limit=5`);
  assert(feed.data.ok === true, 'feed ok');
  assert(Array.isArray(feed.data.items), 'feed items array');
  console.log('GET /api/feed', feed.data.meta?.count ?? feed.data.items.length, 'items');

  const slide = await j(`${BASE}/api/feed/slideshow?limit=5`);
  assert(slide.data.ok === true, 'slideshow ok');
  console.log('GET /api/feed/slideshow', slide.data.items?.length ?? 0, 'items');

  const trivia = await j(`${BASE}/api/trivia/live`);
  assert(trivia.data.ok === true, 'trivia ok');
  console.log('GET /api/trivia/live', trivia.data.questions?.length ?? 0, 'questions');

  const approve = await j(`${BASE}/api/feed/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'feed-nonexistent' }),
  });
  assert(approve.data.error === 'not_authenticated', 'unauth approve blocked');
  console.log('POST /api/feed/approve unauth ->', approve.data.error);

  const comment = await j(`${BASE}/api/feed/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feed_item_id: 'x', body: 'test' }),
  });
  assert(comment.data.error === 'not_authenticated', 'unauth comment blocked');
  console.log('POST /api/feed/comments unauth ->', comment.data.error);

  // Draft items must not appear in public feed
  const allIds = (feed.data.items || []).map((it) => it.id);
  assert(!allIds.some((id) => id.startsWith('feed-') && id.includes('draft')), 'no draft ids in feed');

  console.log('SMOKE OK');
}

main().catch((e) => {
  console.error('SMOKE FAIL', e.message);
  process.exit(1);
});
