// Real-browser tests: Chromium, Firefox and WebKit against the repository root, served by scripts/test-server.js.
//   npm run test:browser                          every engine
//   npx playwright test --project=chromium        one engine
import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'test/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: { command: `node scripts/test-server.js ${PORT}`, url: `http://127.0.0.1:${PORT}/package.json`, reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
