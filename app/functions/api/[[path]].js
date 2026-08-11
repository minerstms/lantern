/**
 * Same-origin proxy: Pages /api/* -> Worker so lantern_pilot is first-party on the Pages host.
 * Upstream: lantern-api Worker (JWT auth unchanged).
 */
const UPSTREAM_API = 'https://lantern-api.mrradle.workers.dev';
const LANTERN_PUBLIC_HOSTS = ['tmslantern.org', 'www.tmslantern.org'];

/**
 * @param {string} cookie One Set-Cookie header value
 * @returns {string} Rewritten for first-party Pages origin (no Domain; SameSite=Lax)
 */
function rewriteSetCookieForFirstParty(cookie) {
  if (!cookie || typeof cookie !== 'string') return cookie;
  let s = cookie
    .replace(/;\s*Domain=[^;]+/gi, '')
    .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
    .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax');
  if (!/;\s*SameSite=/i.test(s)) s += '; SameSite=Lax';
  if (!/;\s*Secure(?:\s*;|\s*$)/i.test(s)) s += '; Secure';
  if (!/;\s*HttpOnly(?:\s*;|\s*$)/i.test(s)) s += '; HttpOnly';
  if (!/;\s*Path=/i.test(s)) s += '; Path=/';
  return s;
}

/**
 * Prompt #196 — keep SSO redirects on the public Pages host.
 * Upstream fetch may absolutize Location to the workers.dev API host; rewrite those (and
 * canonical tmslantern.org absolutes) to same-origin relative paths so the browser never
 * leaves tmslantern.org mid-handoff (which can surface the root Locker-titled interstitial).
 * @param {string} locationHeader
 * @returns {string}
 */
function rewriteLocationForFirstParty(locationHeader) {
  if (!locationHeader || typeof locationHeader !== 'string') return locationHeader;
  const raw = locationHeader.trim();
  if (!raw || raw.charAt(0) === '/') return raw;
  try {
    const upstreamOrigin = new URL(UPSTREAM_API).origin;
    const loc = new URL(raw, upstreamOrigin);
    const host = String(loc.hostname || '').toLowerCase();
    if (loc.origin === upstreamOrigin || LANTERN_PUBLIC_HOSTS.indexOf(host) !== -1) {
      return loc.pathname + loc.search + loc.hash;
    }
  } catch (_) {}
  return raw;
}

/**
 * Collect every Set-Cookie from an upstream fetch Response without merging them.
 * @param {Response} upstream
 * @returns {string[]}
 */
function collectSetCookies(upstream) {
  if (typeof upstream.headers.getSetCookie === 'function') {
    const list = upstream.headers.getSetCookie();
    if (Array.isArray(list) && list.length) return list;
  }
  const raw = upstream.headers.get('Set-Cookie');
  if (!raw) return [];
  // Do not split on commas — Expires=Wed, 21 Oct ... breaks naive parsing.
  return [raw];
}

function buildProxiedResponse(upstream) {
  const headers = new Headers();
  for (const [key, value] of upstream.headers) {
    const k = key.toLowerCase();
    if (k === 'set-cookie') continue;
    if (k === 'location') {
      headers.append(key, rewriteLocationForFirstParty(value));
      continue;
    }
    headers.append(key, value);
  }
  const cookies = collectSetCookies(upstream);
  for (let i = 0; i < cookies.length; i++) {
    headers.append('Set-Cookie', rewriteSetCookieForFirstParty(cookies[i]));
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, UPSTREAM_API);

  const headers = new Headers(request.headers);
  headers.delete('Host');
  headers.delete('Connection');

  /** @type {RequestInit} */
  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  const upstream = await fetch(target.toString(), init);
  return buildProxiedResponse(upstream);
}
