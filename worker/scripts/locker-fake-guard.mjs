/**
 * Locker-scoped guard — delegates to global lantern-fake-user-guard for Locker production files.
 * Usage: node worker/scripts/locker-fake-guard.mjs
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'lantern-fake-user-guard.mjs');
const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
process.exit(result.status ?? 1);
