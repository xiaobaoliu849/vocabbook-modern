import { platform, arch, report } from 'node:process';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

function isMusl() {
  try {
    return !report.getReport().header.glibcVersionRuntime;
  } catch {
    return false;
  }
}

function resolveRollupNativePackage() {
  if (platform === 'linux' && arch === 'x64') {
    return isMusl() ? '@rollup/rollup-linux-x64-musl' : '@rollup/rollup-linux-x64-gnu';
  }
  if (platform === 'linux' && arch === 'arm64') {
    return isMusl() ? '@rollup/rollup-linux-arm64-musl' : '@rollup/rollup-linux-arm64-gnu';
  }
  if (platform === 'darwin' && arch === 'x64') return '@rollup/rollup-darwin-x64';
  if (platform === 'darwin' && arch === 'arm64') return '@rollup/rollup-darwin-arm64';
  if (platform === 'win32' && arch === 'x64') return '@rollup/rollup-win32-x64-msvc';
  if (platform === 'win32' && arch === 'arm64') return '@rollup/rollup-win32-arm64-msvc';
  if (platform === 'win32' && arch === 'ia32') return '@rollup/rollup-win32-ia32-msvc';
  return null;
}

function hasRollupNative() {
  try {
    require('rollup');
    return true;
  } catch {
    return false;
  }
}

if (hasRollupNative()) {
  console.log('[deps:repair] rollup native dependency is already available.');
  process.exit(0);
}

const pkg = resolveRollupNativePackage();
if (!pkg) {
  console.error(`[deps:repair] unsupported platform/arch: ${platform}/${arch}`);
  process.exit(1);
}

console.log(`[deps:repair] installing ${pkg} for ${platform}/${arch} ...`);
const result = spawnSync('npm', ['install', '--no-save', pkg], { stdio: 'inherit', shell: true });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!hasRollupNative()) {
  console.error('[deps:repair] rollup is still unavailable. Try `npm run deps:reset`.');
  process.exit(1);
}

console.log('[deps:repair] repair completed.');
