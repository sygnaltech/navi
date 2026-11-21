/**
 * Export the Sanity production dataset to backups/<YYYY-MM-DD>.tar.gz.
 *
 * Every backup is date-named so no export ever collides with or overwrites an
 * earlier one — the previous fixed path (migration/backup/production.tar.gz)
 * failed on the second-ever run for exactly that reason. A same-day re-export
 * gets a -HHMM suffix rather than replacing the restore copy already taken.
 *
 * Runs the Sanity CLI with cwd=studio/ so it picks up the studio's project
 * config; the dataset is still named explicitly.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

const backups = join(ROOT, 'backups');
mkdirSync(backups, { recursive: true });

const now = new Date();
const date = now.toISOString().slice(0, 10);
let target = join(backups, `${date}.tar.gz`);
if (existsSync(target)) {
  const hhmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  target = join(backups, `${date}-${hhmm}.tar.gz`);
}

const result = spawnSync('npx', ['sanity', 'dataset', 'export', 'production', target], {
  cwd: join(ROOT, 'studio'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status === 0) console.log(`\nBackup written: ${target}`);
process.exit(result.status ?? 1);
