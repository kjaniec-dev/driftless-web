import { defineConfig, devices } from "@playwright/test";

const port = 4173;
// The development sandbox ships its own Chromium; CI installs one with `playwright install`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const use = {
  locale: "en-GB",
  ...(executablePath ? { launchOptions: { executablePath, args: ["--no-sandbox"] } } : {}),
};

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", ...use },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    // Pixel 7 is a Chromium-based emulation: touch, small viewport, mobile UA.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/serve-dist.mjs",
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
