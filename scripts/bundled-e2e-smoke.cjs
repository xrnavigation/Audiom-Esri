/**
 * Throwaway boot check for the bundled Audiom widget.
 *
 * Opens the local Experience Builder app and records whether the runtime view
 * is reachable, whether the bundled map mounted, and whether one arrow key
 * changes the widget status line once. It does not import Front-End specs.
 *
 *   node Audiom-Esri/scripts/bundled-e2e-smoke.cjs
 */
const { createRequire } = require('node:module')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const requireFromFrontEnd = createRequire(
  join(__dirname, '../../Audiom-Front-End/package.json')
)
const { chromium } = requireFromFrontEnd('playwright')

const previewUrl = process.env.AUDIOM_EXB_URL || 'https://localhost:3001/experience/10/?draft=true'
const outDir = join(__dirname, '../tmp/bundled-e2e-smoke')
mkdirSync(outDir, { recursive: true })

function isLoginUrl (url) {
  return /arcgis\.com\/.*(oauth|signin|sign-in)|accounts\.arcgis\.com/i.test(url)
}

async function main () {
  const started = Date.now()
  const consoleErrors = []
  const report = {
    previewUrl,
    loginWall: false,
    finalUrl: '',
    mapPresent: false,
    unpublished: false,
    iframePresent: false,
    firstConsoleError: '',
    loadMs: 0,
    statusBefore: '',
    statusAfter: '',
    compassBefore: '',
    compassAfter: '',
    statusChanges: 0,
    oneStep: false,
    steps: [],
    notes: []
  }
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error))
  })

  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
    const map = page.locator('#audiom-esri-map')
    const login = page.getByText(/sign in to|sign in$/i).first()
    const unpublished = page.getByText(/not published/i).first()
    const mapReady = map.waitFor({ state: 'visible', timeout: 180000 }).then(() => 'map')
    const loginReady = login.waitFor({ state: 'visible', timeout: 180000 }).then(() => 'login')
    const unpublishedReady = unpublished.waitFor({ state: 'visible', timeout: 180000 }).then(() => 'unpublished')
    mapReady.catch(() => undefined)
    loginReady.catch(() => undefined)
    unpublishedReady.catch(() => undefined)
    const winner = await Promise.race([
      mapReady,
      loginReady,
      unpublishedReady,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 180000))
    ])
    report.loadMs = Date.now() - started
    report.finalUrl = page.url()
    report.unpublished = winner === 'unpublished'
    report.loginWall = winner === 'login' || isLoginUrl(report.finalUrl)
    report.mapPresent = await map.isVisible().catch(() => false)
    report.iframePresent = await page.locator('iframe[name="audiom"]').count() > 0
    report.firstConsoleError = consoleErrors.find((line) =>
      /Audiom embed failed to mount|Audiom program failed to load|webpackMissingModule/i.test(line)
    ) || consoleErrors[0] || ''

    if (report.loginWall || report.unpublished || !report.mapPresent) {
      report.notes.push(report.loginWall
        ? 'Stopped on the sign-in wall. No arrow-key check.'
        : report.unpublished
          ? 'The experience is unpublished. Open it with draft=true.'
          : 'The Audiom map did not appear.')
      await page.screenshot({ path: join(outDir, 'boot.png'), fullPage: true })
      return report
    }

    const status = page.getByRole('status').first()
    const compass = page.getByRole('button', { name: 'Audiom navigation indicator' })
    await status.waitFor({ state: 'attached', timeout: 30000 })
    await compass.waitFor({ state: 'visible', timeout: 30000 })
    report.statusBefore = (await status.textContent()) || ''
    report.compassBefore = await compass.evaluate((node) => `${node.style.left},${node.style.top}`)
    await compass.focus()
    report.focused = await page.evaluate(() => {
      const node = document.activeElement
      return node ? `${node.tagName} ${node.getAttribute('aria-label') || ''}` : ''
    })
    for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
      const before = await compass.evaluate((node) => `${node.style.left},${node.style.top}`)
      await page.keyboard.press(key)
      await page.waitForFunction(
        (start) => {
          const node = document.querySelector('.audiom-cursor')
          return node && `${node.style.left},${node.style.top}` !== start
        },
        before,
        { timeout: 2000 }
      ).catch(() => undefined)
      const after = await compass.evaluate((node) => `${node.style.left},${node.style.top}`)
      report.steps.push({ key, before, after, moved: before !== after })
    }
    report.statusAfter = (await status.textContent()) || ''
    report.compassAfter = report.steps.length ? report.steps[report.steps.length - 1].after : ''
    const moved = report.steps.filter((step) => step.moved)
    report.oneStep = moved.length > 0 && report.steps[0].moved
    report.statusChanges = moved.length
    if (!report.steps[0].moved && moved.length === 0) {
      report.notes.push('No arrow moved the indicator. Focus was ' + report.focused)
    } else if (!report.steps[0].moved) {
      report.notes.push('ArrowRight did not move the indicator. Another direction did.')
    } else {
      report.notes.push('ArrowRight moved the indicator once. The status line rounds to 3 decimals, so a 1 meter step may not show there.')
    }
    await page.screenshot({ path: join(outDir, 'after-step.png'), fullPage: true })
    return report
  } finally {
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
    await browser.close()
  }
}

main().then((report) => {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.loginWall || report.unpublished || !report.mapPresent || !report.oneStep) process.exitCode = 2
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
