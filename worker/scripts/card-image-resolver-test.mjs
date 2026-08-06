/**
 * Programmatic image resolver tests — contract v2 thumbnail precedence.
 * Usage: node worker/scripts/card-image-resolver-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsPath = path.join(root, 'app/js/lantern-cards.js');
const code = fs.readFileSync(cardsPath, 'utf8');

const sandbox = {
  console,
  document: undefined,
  window: undefined,
  LANTERN_AVATAR_API: undefined,
  LanternMedia: undefined,
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const LC = sandbox.LanternCards;
if (!LC || !LC.resolveCardFaceImageUrl) {
  console.error('Failed to load LanternCards.resolveCardFaceImageUrl');
  process.exit(1);
}

const resolve = LC.resolveCardFaceImageUrl.bind(LC);

const CASES = [
  {
    name: '1 thumbnailUrl plus imageUrl',
    input: { thumbnailUrl: 'https://cdn/thumb.jpg', imageUrl: 'https://cdn/full.jpg' },
    expected: 'https://cdn/thumb.jpg',
  },
  {
    name: '2 thumbnail_url plus full_image_url',
    input: { thumbnail_url: 'https://cdn/t2.jpg', full_image_url: 'https://cdn/f2.jpg' },
    expected: 'https://cdn/t2.jpg',
  },
  {
    name: '3 preview_src plus image',
    input: { preview_src: 'https://cdn/prev.jpg', image: 'https://cdn/img.jpg' },
    expected: 'https://cdn/prev.jpg',
  },
  {
    name: '4 imageUrl only',
    input: { imageUrl: 'https://cdn/only.jpg' },
    expected: 'https://cdn/only.jpg',
  },
  {
    name: '5 full_image_url only',
    input: { full_image_url: 'https://cdn/full-only.jpg' },
    expected: 'https://cdn/full-only.jpg',
  },
  {
    name: '6 no image fields',
    input: { title: 'No image' },
    expected: '',
  },
  {
    name: '7 type link with url=https://example.com/page',
    input: { type: 'link', url: 'https://example.com/page' },
    expected: '',
  },
  {
    name: '8 type image with url ending in .jpg',
    input: { type: 'image', url: 'https://example.com/photo.jpg' },
    expected: 'https://example.com/photo.jpg',
  },
  {
    name: '9 broken thumbnail plus valid image — resolver returns thumbnail first',
    input: { thumbnailUrl: 'https://cdn/broken.jpg', imageUrl: 'https://cdn/good.jpg' },
    expected: 'https://cdn/broken.jpg',
  },
  {
    name: '10 broken image and no fallback URL — withFallbacks uses API default when base set',
    input: { type: 'news' },
    expected: '/api/media/image?key=',
    withFallbacks: true,
    apiBase: 'http://127.0.0.1:8765',
  },
];

const results = [];
let failed = 0;

for (const c of CASES) {
  if (c.apiBase) sandbox.LANTERN_AVATAR_API = c.apiBase;
  const actual = c.withFallbacks
    ? LC.resolveCardFaceImageUrlWithFallbacks(c.input)
    : resolve(c.input);
  const pass = c.withFallbacks && c.expected.includes('/api/media/image')
    ? typeof actual === 'string' && actual.includes(c.expected)
    : c.withFallbacks
      ? typeof actual === 'string' && actual.length > 0
      : actual === c.expected;
  if (!pass) failed++;
  results.push({
    case: c.name,
    expected: c.withFallbacks ? '(non-empty default fallback)' : c.expected,
    actual,
    pass,
  });
}

console.log(JSON.stringify({ summary: { total: CASES.length, failed }, results }, null, 2));
process.exit(failed ? 1 : 0);
