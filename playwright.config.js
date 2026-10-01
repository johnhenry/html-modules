// Real-browser tests: Chromium, Firefox and WebKit against the repository root, served by scripts/test-server.js.
//   npm run test:browser                          every engine
//   npx playwright test --project=chromium        one engine
import { defineConfig } from '@playwright/test';

const PORT = 4173;
const OTHER_ORIGIN_PORT = 4174; // the same files on a second origin: a "less-trusted" module host (test/browser/sanitize.spec.js)

export default defineConfig({
  testDir: 'test/browser',
  // Bundles the pinned @johnhenry/safe-fragment commit for the pages that use it (scripts/vendor-safe-fragment.js).
  globalSetup: './test/browser/global-setup.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['./test/browser/annotations-reporter.js'], ...(process.env.CI ? [['github']] : [])],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: [PORT, OTHER_ORIGIN_PORT].map((port) => ({ command: `node scripts/test-server.js ${port}`, url: `http://127.0.0.1:${port}/package.json`, reuseExistingServer: !process.env.CI })),
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
