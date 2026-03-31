/**
 * Copy shared packages into apps/sandbox-app/shared/ for deployment.
 * Run: node scripts/copy-shared-to-sandbox.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packages = ['bootstrap', 'shared-config', 'shared-workflows', 'shared-roles', 'shared-ui', 'sandbox-data'];
const dest = path.join(root, 'apps', 'sandbox-app', 'shared');

if (!fs.existsSync(path.join(root, 'packages'))) {
  console.error('packages/ not found');
  process.exit(1);
}

const destDir = path.join(dest, 'packages');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

packages.forEach(function (pkg) {
  const src = path.join(root, 'packages', pkg, 'index.js');
  const out = path.join(destDir, pkg + '.js');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, out);
    console.log('Copied:', pkg);
  }
});

console.log('Done. Sandbox can load from shared/packages/*.js');
