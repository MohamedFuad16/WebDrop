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
  webServer: {
    command: "python3 -m http.server 4180 --bind 127.0.0.1",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe"
  },
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
    }
  ]
});
