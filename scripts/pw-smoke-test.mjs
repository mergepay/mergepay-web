/**
 * Playwright launch smoke test: verifies Playwright can be imported and
 * Chromium can launch with a working socket/stdio transport.
 *
 * This is intentionally a standalone script so it can be run without
 * installing additional test dependencies.
 */
import { chromium } from '../node_modules/playwright-core/index.mjs';

const launchOptions = {
  executablePath: undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
};

console.log('Playwright launch smoke test');
console.log('Playwright-core browsers.json resolved chromium executable path:');
try {
  // Ask Playwright for the path it would use for a default chromium launch.
  const path = typeof chromium.executablePath === 'function' ? chromium.executablePath() : 'unavailable';
  console.log('  ', path);
} catch (e) {
  console.log('  (could not resolve executable path:', (e).message, ')');
}

let browser;
try {
  console.log('Launching Chromium…');
  browser = await chromium.launch(launchOptions);
  console.log('Chromium launched OK');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('about:blank');
  const title = await page.title();
  console.log('about:blank title:', JSON.stringify(title));
  await browser.close();
  console.log('Smoke test PASSED');
} catch (error) {
  console.error('Smoke test FAILED:', error.message);
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  process.exit(1);
}
