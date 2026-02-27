import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '..');
const nodeModulesDir = resolve(frontendRoot, 'node_modules');
const lockFile = resolve(frontendRoot, 'package-lock.json');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: frontendRoot, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (existsSync(nodeModulesDir)) {
  try {
    rmSync(nodeModulesDir, { recursive: true, force: true });
  } catch (error) {
    console.error('[deps:reset] failed to remove node_modules.');
    console.error('Close running dev/electron processes and retry.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (existsSync(lockFile)) {
  run('npm', ['ci', '--include=optional']);
} else {
  run('npm', ['install', '--include=optional']);
}
