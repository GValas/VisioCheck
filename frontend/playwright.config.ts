import { defineConfig, devices } from '@playwright/test';

/**
 * Tests E2E du frontend en **mode démo** : aucune dépendance backend/GPU.
 * Sans backend joignable, l'application bascule automatiquement en démo
 * (données simulées), ce qui rend l'UI testable en headless.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    launchOptions: {
      // Webcam virtuelle pour getUserMedia en headless.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
      // Permet de pointer un binaire Chromium pré-installé (CI/conteneur) via
      // PW_CHROMIUM_PATH ; sinon Playwright utilise son navigateur géré.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm start -- --port 4200',
    port: 4200,
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
