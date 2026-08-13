#!/usr/bin/env node
/**
 * Copy Lantern replacements (and, where still required, temporary donor
 * placeholders) into app/games/tower/assets/.
 *
 * The donor snapshot under donor/assets/ is never rewritten.
 * BMQB logos and omitted slots are never copied into the runtime directory.
 *
 * Usage: node app/games/tower/apply-asset-overlay.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-slots.json'), 'utf8'));
const runtimeDir = path.join(root, manifest.runtimeDir);
const donorDir = path.join(root, manifest.donorDir);
const lanternDir = path.join(root, manifest.lanternDir);

fs.mkdirSync(runtimeDir, { recursive: true });

const readme = `# Runtime overlay (generated)

This directory is what the hosted game loads via \`./assets/…\`.

Do not edit these files by hand. Drop Lantern-owned replacements into
\`lantern-assets/\` using the same filename, then run:

    node app/games/tower/apply-asset-overlay.mjs

Files copied from \`donor/assets/\` are **temporary placeholders** and are
not product-cleared. See \`asset-slots.json\` and \`COMMERCIAL_MERGE_GATE.md\`.
`;
fs.writeFileSync(path.join(runtimeDir, 'README.md'), readme);

let copiedLantern = 0;
let copiedPlaceholder = 0;
let copiedSilent = 0;
let omitted = 0;

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

for (const slot of manifest.slots) {
  const dest = path.join(runtimeDir, slot.file);
  const lanternSrc = path.join(lanternDir, slot.file);
  const donorSrc = path.join(donorDir, slot.file);
  const lanternExists = fs.existsSync(lanternSrc) && fs.statSync(lanternSrc).isFile();

  if (slot.runtime === 'keep-donor-path' || slot.runtime === 'omit' || slot.action === 'keep-omitted' || slot.action === 'never-ship') {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    omitted++;
    continue;
  }

  if (lanternExists && slot.file !== 'README.md') {
    copyFile(lanternSrc, dest);
    copiedLantern++;
    continue;
  }

  if (slot.runtime === 'silent-audio') {
    const ext = path.extname(slot.file).toLowerCase();
    const silence = path.join(lanternDir, ext === '.ogg' ? 'silence.ogg' : 'silence.mp3');
    if (!fs.existsSync(silence)) {
      console.error('Missing silent audio source', silence);
      process.exit(1);
    }
    copyFile(silence, dest);
    copiedSilent++;
    continue;
  }

  if (slot.runtime === 'donor-placeholder') {
    if (!fs.existsSync(donorSrc)) {
      console.error('Missing donor placeholder', donorSrc);
      process.exit(1);
    }
    copyFile(donorSrc, dest);
    copiedPlaceholder++;
    continue;
  }

  if (slot.runtime === 'lantern') {
    console.error('Lantern replacement missing for required slot', slot.file);
    process.exit(1);
  }

  console.error('Unknown runtime mode', slot.file, slot.runtime);
  process.exit(1);
}

const forbidden = ['main-index-logo.png', 'main-loading-logo.png', 'wenxue.eot', 'wenxue.woff', 'wenxue.ttf', 'wenxue.svg'];
for (const name of forbidden) {
  const p = path.join(runtimeDir, name);
  if (fs.existsSync(p)) {
    console.error('Forbidden file present in runtime overlay', name);
    process.exit(1);
  }
}

console.log('Tower asset overlay:', {
  lantern: copiedLantern,
  silent: copiedSilent,
  donorPlaceholder: copiedPlaceholder,
  omitted: omitted,
  runtimeDir,
});
