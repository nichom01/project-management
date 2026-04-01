/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
  },
  webServer: {
    command: "npm run start",
    port: 3000,
    timeout: 30_000,
    reuseExistingServer: true,
  },
};

module.exports = config;
