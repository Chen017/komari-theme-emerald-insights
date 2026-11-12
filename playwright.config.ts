import { defineConfig } from '@playwright/test'

const previewUrl = 'http://127.0.0.1:4178'

export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL: previewUrl,
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4178 --strictPort',
    url: previewUrl,
    reuseExistingServer: false,
  },
})
