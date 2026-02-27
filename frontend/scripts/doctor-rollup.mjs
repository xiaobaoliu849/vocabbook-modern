import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require('rollup');
  console.log('[doctor:rollup] OK: rollup native optional dependency is available.');
} catch (error) {
  console.error('[doctor:rollup] FAIL: rollup optional dependency is missing.');
  console.error('Run `npm run deps:repair` first. If it still fails, run `npm run deps:reset`.');
  process.exit(1);
}
