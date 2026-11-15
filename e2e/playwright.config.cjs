const { createRequire } = require('node:module')
const { join } = require('node:path')

const requireFromFrontEnd = createRequire(join(__dirname, '../../Audiom-Front-End/package.json'))
const { defineConfig } = requireFromFrontEnd('@playwright/test')

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'widget.spec.cjs',
  timeout: 120000,
  expect: { timeout: 60000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: join(__dirname, '../tmp/e2e-results'),
  globalSetup: join(__dirname, 'global-setup.cjs'),
  globalTeardown: join(__dirname, 'global-teardown.cjs'),
  use: {
    ignoreHTTPSErrors: true,
    baseURL: process.env.AUDIOM_EXB_ORIGIN || 'https://localhost:3001',
    trace: 'off',
    screenshot: 'only-on-failure'
  }
})