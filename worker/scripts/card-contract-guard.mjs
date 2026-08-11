/**
 * Source guard — fail if compact production code reintroduces forbidden v1/.feedCard patterns.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const JS_FORBIDDEN = [
  { re: /className\s*=\s*['"]feedCard['"]/, label: 'className = "feedCard"' },
  { re: /class=['"]feedCard['"]/, label: 'class="feedCard" on production root' },
  { re: /article\.feedCard|<article[^>]*class=['"][^'"]*feedCard/, label: 'article.feedCard' },
  { re: /\blcRailRow\s*\(/, label: 'lcRailRow(' },
  { re: /\blcRailIdentityRow\s*\(/, label: 'lcRailIdentityRow(' },
  { re: /data-lantern-card-contract-version=['"]1['"]/, label: 'contract version 1 stamp' },
  { re: /CARD_CONTRACT_VERSION\s*=\s*['"]1['"]/, label: 'CARD_CONTRACT_VERSION = "1"' },
];

const CSS_FORBIDDEN = [
  { re: /--lantern-rail-card-height\s*:\s*420px/, label: '--lantern-rail-card-height: 420px' },
  { re: /--lantern-rail-card-media-height\s*:\s*128px/, label: '--lantern-rail-card-media-height: 128px' },
  { re: /--lantern-rail-card-height,\s*420px/, label: '--lantern-rail-card-height fallback 420px' },
  { re: /--lantern-rail-card-media-height,\s*128px/, label: '--lantern-rail-card-media-height fallback 128px' },
  { re: /\.exploreCardRailStack\b/, label: '.exploreCardRailStack production CSS' },
  { re: /\.lcRailRow--/, label: '.lcRailRow-- production CSS' },
  { re: /\.feedCard\b/, label: '.feedCard production CSS root' },
  { re: /\.feedCardInner\b/, label: '.feedCardInner production CSS' },
  { re: /\.feedCardMedia\b/, label: '.feedCardMedia production CSS' },
  { re: /\.feedCardTitle\b/, label: '.feedCardTitle production CSS' },
];

const EXCLUDE_PATH_PARTS = ['trinidad-history-donor-only-extract', 'node_modules', 'docs/archive'];

const ALLOWLIST = new Set([
  'app/js/lantern-canonical-enforce.js',
  'worker/scripts/card-contract-guard.mjs',
  'worker/scripts/explore-canonical-check.mjs',
  'e2e/studio-contribute/card-counterfeit-audit.mjs',
  'worker/scripts/card-browser-matrix.mjs',
]);

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function shouldScan(file) {
  const r = rel(file);
  if (EXCLUDE_PATH_PARTS.some((p) => r.includes(p))) return false;
  if (ALLOWLIST.has(r)) return false;
  if (r.endsWith('.md')) return false;
  return true;
}

function walk(dir, out, extRe) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out, extRe);
    else if (extRe.test(ent.name) && shouldScan(p)) out.push(p);
  }
}

const jsFiles = [];
walk(path.join(root, 'app/js'), jsFiles, /\.js$/);
walk(path.join(root, 'app'), jsFiles, /\.html$/);

const cssFiles = [];
walk(path.join(root, 'app/css'), cssFiles, /\.css$/);

const hits = [];
let scanned = 0;

for (const file of jsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  scanned++;
  for (const rule of JS_FORBIDDEN) {
    if (rule.re.test(text)) hits.push({ file: rel(file), rule: rule.label });
  }
}
for (const file of cssFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  scanned++;
  for (const rule of CSS_FORBIDDEN) {
    if (rule.re.test(text)) hits.push({ file: rel(file), rule: rule.label });
  }
}

if (hits.length) {
  console.error('CARD CONTRACT GUARD FAILED:');
  for (const h of hits) console.error(' -', h.file, ':', h.rule);
  process.exit(1);
}
console.log(
  'CARD CONTRACT GUARD PASS (' +
    scanned +
    ' files scanned; donor excluded via ' +
    EXCLUDE_PATH_PARTS.join(', ') +
    ')'
);
