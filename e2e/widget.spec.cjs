const { createRequire } = require('node:module')
const { join } = require('node:path')
const { test, expect } = createRequire(join(__dirname, '../../Audiom-Front-End/package.json'))('@playwright/test')
const { ORIGIN, APP_ID } = require('./experience.cjs')

const liveUrl = `${ORIGIN}/experience/${APP_ID}/`

async function compassLeft (compass) {
  const value = await compass.evaluate((node) => Number.parseFloat(node.style.left))
  if (!Number.isFinite(value)) throw new Error('compass has no style.left')
  return value
}

test.describe.serial('bundled widget live window', () => {
  let page

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    page = await context.newPage()
    await page.goto(liveUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#audiom-esri-map')).toBeVisible()
    await expect(page.locator('iframe[name="audiom"]')).toHaveCount(0)
    await expect(page.getByText('This item is not published.')).toHaveCount(0)
  })

  test.afterAll(async () => {
    await page.context().close()
  })

  test('mounts the bundled map, not an embed iframe', async () => {
    await expect(page.getByRole('button', { name: 'Audiom navigation indicator' })).toBeVisible()
    await expect(page.getByRole('status').first()).toContainText(/Position -117\.195, 34\.057/)
  })

  test('one arrow moves the compass once', async () => {
    const compass = page.getByRole('button', { name: 'Audiom navigation indicator' })
    await compass.focus()
    const before = await compassLeft(compass)
    await compass.press('ArrowRight')
    await expect.poll(async () => Math.abs((await compassLeft(compass)) - before), {
      timeout: 10000
    }).toBeGreaterThan(1)
    const delta = Math.abs((await compassLeft(compass)) - before)
    expect(delta).toBeLessThan(4)
  })

  test('the layer eye hides Units', async () => {
    const sources = page.locator('#legend-toggle-sources')
    await expect(sources).toBeVisible()
    if ((await sources.getAttribute('aria-expanded')) !== 'true') await sources.click()
    const units = page.locator('[data-source-name="19c06d1cbaf-layer-6"]')
    await expect(units).toBeVisible()
    const checked = await units.getAttribute('aria-checked')
    await units.click()
    await expect(units).toHaveAttribute('aria-checked', checked === 'true' ? 'false' : 'true')
  })

  test('selecting another floor checks that floor', async () => {
    const levels = page.locator('#legend-toggle-levels')
    await expect(levels).toBeVisible()
    if ((await levels.getAttribute('aria-expanded')) !== 'true') await levels.click()
    const radios = page.locator('input[name="level"]')
    await expect.poll(async () => radios.count()).toBeGreaterThan(1)
    const next = radios.nth(1)
    const id = await next.getAttribute('id')
    // The visible floor row covers the radio. Click the label, which is the control a user hits.
    await page.locator(`label[for="${id}"]`).click()
    await expect(next).toBeChecked()
  })
})