/**
 * Inspect the Playwright-core dependency table and print the list of
 * Ubuntu packages that `playwright install --with-deps chromium` would
 * install on ubuntu24.04-x64.
 *
 * This mirrors the logic in playwright-core's registry/dependencies.ts
 * without requiring sudo / elevated privileges at runtime.
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const bundle = require(resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/playwright-core/lib/coreBundle.js'));

const deps = (bundle && bundle.registry && bundle.registry.dependencies) || null;

if (!deps) {
  console.error('Could not find dependencies table in playwright-core bundle.');
  console.error('Falling back to hardcoded ubuntu24.04-x64 chromium packages.');
  console.log('Playwright chrome dependencies (ubuntu24.04-x64) for chromium (hardcoded fallback):');
  console.log('  - libasound2t64');
  console.log('  - libatk-bridge2.0-0t64');
  console.log('  - libatk1.0-0t64');
  console.log('  - libatspi2.0-0t64');
  console.log('  - libcairo2');
  console.log('  - libcups2t64');
  console.log('  - libdbus-1-3');
  console.log('  - libdrm2');
  console.log('  - libgbm1');
  console.log('  - libglib2.0-0t64');
  console.log('  - libnspr4');
  console.log('  - libnss3');
  console.log('  - libpango-1.0-0');
  console.log('  - libx11-6');
  console.log('  - libxcb1');
  console.log('  - libxcomposite1');
  console.log('  - libxdamage1');
  console.log('  - libxext6');
  console.log('  - libxfixes3');
  console.log('  - libxkbcommon0');
  console.log('  - libxrandr2');
  console.log('\nPlaywright tools (ubuntu24.04-x64) (hardcoded fallback):');
  console.log('  - xvfb');
  console.log('  - fonts-noto-color-emoji');
  console.log('  - fonts-unifont');
  console.log('  - libfontconfig1');
  console.log('  - libfreetype6');
  console.log('  - xfonts-cyrillic');
  console.log('  - xfonts-scalable');
  console.log('  - fonts-liberation');
  console.log('  - fonts-ipafont-gothic');
  console.log('  - fonts-wqy-zenhei');
  console.log('  - fonts-tlwg-loma-otf');
  console.log('  - fonts-freefont-ttf');
  process.exit(0);
}

const ubuntuDeps = deps['ubuntu24.04-x64'];

if (!ubuntuDeps) {
  console.error('Could not find ubuntu24.04-x64 dependency table in playwright-core bundle.');
  process.exit(1);
}

const chromiumPackages = ubuntuDeps.chromium || [];
const tools = ubuntuDeps.tools || [];

console.log('Playwright chrome dependencies (ubuntu24.04-x64) for chromium:');
chromiumPackages.forEach((pkg) => console.log('  -', pkg));
console.log('\nPlaywright tools (ubuntu24.04-x64):');
tools.forEach((pkg) => console.log('  -', pkg));
