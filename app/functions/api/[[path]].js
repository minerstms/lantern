/**
 * Same-origin proxy: Pages /api/* -> Worker so lantern_pilot is first-party on the Pages host.
 * Upstream: lantern-api Worker (JWT auth unchanged).
 */
const UPSTREAM_API = 'https://lantern-api.mrradle.workers.dev';

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
  if (!/;\s*Secure\s*(;|$)/i.test(s)) s += '; Secure';
  if (!/;\s*HttpOnly\s*(;|$)/i.test(s)) s += '; HttpOnly';
  if (!/;\s*Path=/i.test(s)) s += '; Path=/';
  return s;
}

function buildProxiedResponse(upstream) {
  const headers = new Headers();
  for (const [key, value] of upstream.headers) {
    if (key.toLowerCase() === 'set-cookie') continue;
    headers.append(key, value);
  }
  let cookies = [];
  if (typeof upstream.headers.getSetCookie === 'function') {
    cookies = upstream.headers.getSetCookie();
  } else {
    const single = upstream.headers.get('Set-Cookie');
    if (single) cookies = [single];
  }
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
