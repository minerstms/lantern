/**
 * Mirror local assets/media (default/ and library/) into R2 bucket lantern-media.
 * Keys: default/<filename>, library/<category>/<filename>.
 * Run from repo root: node scripts/upload-media-to-r2.js
 * Requires: npx wrangler (Cloudflare); run from repo root.
 *
 * Command format: npx wrangler r2 object put <BUCKET>/<KEY> --file=<PATH> --remote
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUCKET = 'lantern-media';
const root = path.resolve(__dirname, '..');
const mediaDir = path.join(root, 'assets', 'media');

if (!fs.existsSync(mediaDir)) {
  console.error('assets/media/ not found. Run from repo root.');
  process.exit(1);
}

function putObject(key, filePath) {
  const normalized = path.resolve(root, filePath);
  if (!fs.existsSync(normalized)) {
    console.error('Missing file:', filePath);
    process.exit(1);
  }
  const bucketKey = BUCKET + '/' + key;
  const cmd = `npx wrangler r2 object put ${bucketKey} --file=${normalized} --remote`;
  console.log(cmd);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
    console.log('OK:', key);
  } catch (e) {
    console.error('Upload failed for', key, ':', e.message || e);
    process.exit(1);
  }
}

// default/<filename>
const defaultDir = path.join(mediaDir, 'default');
if (fs.existsSync(defaultDir)) {
  fs.readdirSync(defaultDir).forEach((name) => {
    if (!fs.statSync(path.join(defaultDir, name)).isFile()) return;
    putObject('default/' + name, path.relative(root, path.join(defaultDir, name)));
  });
}

// library/<category>/<filename>
const libraryDir = path.join(mediaDir, 'library');
if (fs.existsSync(libraryDir)) {
  fs.readdirSync(libraryDir).forEach((cat) => {
    const catDir = path.join(libraryDir, cat);
    if (!fs.statSync(catDir).isDirectory()) return;
    fs.readdirSync(catDir).forEach((name) => {
      if (!fs.statSync(path.join(catDir, name)).isFile()) return;
      putObject('library/' + cat + '/' + name, path.relative(root, path.join(catDir, name)));
    });
  });
}

console.log('Done. Keys in R2: default/<filename>, library/<category>/<filename>');
