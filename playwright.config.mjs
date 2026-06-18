import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 5_000
  },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4180",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  webServer: [
    {
      command: "node scripts/static-server.mjs . 4180 127.0.0.1",
      url: "http://127.0.0.1:4180",
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe"
    },
    {
      command: "npm --prefix \"azure cloud server\" run start:local",
      url: "http://127.0.0.1:8080/healthz",
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe"
    }
  ],
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "chromium-iphone-15-pro",
      use: { ...devices["iPhone 15 Pro"], browserName: "chromium" }
    },
    {
      name: "chromium-pixel-8",
      use: { ...devices["Pixel 7"], browserName: "chromium" }
    },
    {
      name: "webkit-iphone-15-pro",
      use: { ...devices["iPhone 15 Pro"] }
    }
  ]
});
