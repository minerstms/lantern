/**
 * Prompt #177 — one-off encoder for live Games-page card artwork.
 * Not imported by the Worker. Run from repo root when re-encoding:
 *   node worker/scripts/optimize-game-card-assets-177.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const LIVE_GAME_CARDS = Object.freeze([
  { id: 'avatar-match', name: 'Avatar Match', file: 'avatar-match-card.png' },
  { id: 'lantern-live-trivia', name: 'Lantern Live Trivia', file: 'lantern-trivia-card.png' },
  { id: 'handbook-trivia', name: 'Handbook Trivia', file: 'handbook-triva-card.png' },
  { id: 'local-history-trivia', name: 'Local History Trivia', file: 'history-trivia-card.png' },
  { id: 'srp-safety-trivia', name: 'SRP Safety Challenge', file: 'srp-safety-trivia-card.png' },
  { id: 'reaction', name: 'Reaction Tap', file: 'reaction-tap-card.png' },
  { id: 'clickrush', name: 'Nugget Click Rush', file: 'nugget-click-rush-card.png' },
  { id: 'memory', name: 'Memory Match', file: 'memory-match-card.png' },
  { id: 'nuggetHunt', name: 'Nugget Hunt', file: 'nugget-hunt-card.png' },
]);

export const WEBP_QUALITY = 88;
export const MAX_CARD_BYTES = 400 * 1024;

function destName(pngName) {
  return pngName.replace(/\.png$/i, '.webp');
}

async function encodeCard(srcPng) {
  const meta = await sharp(srcPng).metadata();
  const buf = await sharp(srcPng)
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toBuffer();
  const outMeta = await sharp(buf).metadata();
  return { buf, meta, outMeta };
}

async function writeComparisonCrop(srcPng, webpBuf, outJpg) {
  const crop = { left: 80, top: 80, width: 360, height: 200 };
  const before = await sharp(srcPng).extract(crop).jpeg({ quality: 90 }).toBuffer();
  const after = await sharp(webpBuf).extract(crop).jpeg({ quality: 90 }).toBuffer();
  const { width: bw, height: bh } = await sharp(before).metadata();
  const strip = await sharp({
    create: { width: bw * 2 + 8, height: bh, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .composite([
      { input: before, left: 0, top: 0 },
      { input: after, left: bw + 8, top: 0 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
  fs.writeFileSync(outJpg, strip);
}

export async function optimizeAll({ write = true } = {}) {
  const previewDir = path.join(root, 'docs', 'game-card-opt-177-previews');
  if (write) fs.mkdirSync(previewDir, { recursive: true });
  const rows = [];
  for (const card of LIVE_GAME_CARDS) {
    const src = path.join(root, 'app', 'assets', card.file);
    const oldBytes = fs.statSync(src).size;
    const { buf, meta, outMeta } = await encodeCard(src);
    const newFile = destName(card.file);
    if (write) {
      fs.writeFileSync(path.join(root, 'app', 'assets', newFile), buf);
      fs.writeFileSync(path.join(root, 'assets', newFile), buf);
      await writeComparisonCrop(src, buf, path.join(previewDir, card.id + '-crop.jpg'));
      fs.unlinkSync(src);
      const rootPng = path.join(root, 'assets', card.file);
      if (fs.existsSync(rootPng)) fs.unlinkSync(rootPng);
    }
    rows.push({
      id: card.id,
      name: card.name,
      oldFile: 'assets/' + card.file,
      newFile: 'assets/' + newFile,
      oldW: meta.width,
      oldH: meta.height,
      newW: outMeta.width,
      newH: outMeta.height,
      oldBytes,
      newBytes: buf.length,
      savingsPct: ((oldBytes - buf.length) / oldBytes) * 100,
    });
  }
  return rows;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  optimizeAll({ write: true }).then((rows) => {
    for (const r of rows) {
      console.log(
        r.id,
        r.oldW + 'x' + r.oldH,
        r.oldBytes,
        '->',
        r.newBytes,
        r.savingsPct.toFixed(1) + '%'
      );
    }
  });
}
