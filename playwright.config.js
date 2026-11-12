import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3199", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:3199/healthz",
    reuseExistingServer: false,
    env: {
      PORT: "3199",
      HOST: "127.0.0.1",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      OPENAI_API_KEY: "",
      RESEND_API_KEY: "",
    },
  },
});
