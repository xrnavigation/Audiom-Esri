const { createRequire } = require('node:module')
const { join } = require('node:path')
const { test, expect } = createRequire(join(__dirname, '../../Audiom-Front-End/package.json'))('@playwright/test')
const { ORIGIN, APP_ID } = require('./experience.cjs')

const liveUrl = `${ORIGIN}/experience/${APP_ID}/`
const LEVELS_SOURCE = '19c06d1cbaf-layer-5'
const UNITS_SOURCE = '19c06d1cbaf-layer-6'

async function compassAxis (compass, axis) {
  const value = await compass.evaluate((node, name) => Number.parseFloat(node.style[name]), axis)
  if (!Number.isFinite(value)) throw new Error(`compass has no style.${axis}`)
  return value
}

async function expectOneStep (compass, key, axis) {
  await compass.focus()
  const before = await compassAxis(compass, axis)
  await compass.press(key)
  await expect.poll(async () => Math.abs((await compassAxis(compass, axis)) - before), {
    timeout: 10000
  }).toBeGreaterThan(1)
  const delta = Math.abs((await compassAxis(compass, axis)) - before)
  expect(delta).toBeLessThan(4)
}

async function expandMenus (page) {
  const toggle = page.getByRole('button', { name: /^(Show|Hide) Menus$/ })
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

async function collapseMenus (page) {
  const toggle = page.getByRole('button', { name: /^(Show|Hide) Menus$/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
}

function speechLog (page) {
  return page.locator('ol[id$="speech-log"]')
}

async function openSpeechLog (page) {
  await expandMenus(page)
  const toggle = page.getByRole('button', { name: /Speech Log/ })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await expect(speechLog(page)).toBeVisible()
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
    expect(page.url()).not.toContain('draft=true')
  })

  test.afterAll(async () => {
    await page.context().close()
  })

  test('mounts the bundled map and its header, not an embed iframe', async () => {
    await expect(page.getByRole('button', { name: 'Audiom navigation indicator' })).toBeVisible()
    await expect(page.getByRole('status').first()).toContainText(/Position -117\.195, 34\.057\. Heading \d+ degrees/)
    await expect(page.getByRole('button', { name: 'Enable sounds and skip to map' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Global Sounds/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Speech Log/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Switch to (light|dark) mode/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Show|Hide) Menus$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Powered by/ })).toHaveAttribute('href', 'https://audiom.net')
    await expect(page.getByRole('link', { name: 'Audiom', exact: true })).toHaveAttribute('href', 'https://xrnavigation.io')
  })

  test('the theme toggle switches the embed theme and can switch back', async () => {
    const toLight = page.getByRole('button', { name: 'Switch to light mode' })
    await toLight.click()
    await expect(page.locator('#audiom-embed')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(page.locator('#audiom-embed')).toHaveAttribute('data-theme', 'dark')
  })

  test('enable sounds focuses the compass and the mute button toggles', async () => {
    await page.getByRole('button', { name: 'Enable sounds and skip to map' }).click()
    await expect(page.getByRole('button', { name: 'Audiom navigation indicator' })).toBeFocused()
    const mute = page.getByRole('button', { name: 'Mute Global Sounds' })
    await expect(mute).toHaveAttribute('aria-pressed', 'true')
    await mute.click()
    await expect(page.getByRole('button', { name: 'Enable Global Sounds' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('each arrow moves the compass once', async () => {
    const compass = page.getByRole('button', { name: 'Audiom navigation indicator' })
    await expectOneStep(compass, 'ArrowRight', 'left')
    await expectOneStep(compass, 'ArrowLeft', 'left')
    await expectOneStep(compass, 'ArrowUp', 'top')
    await expectOneStep(compass, 'ArrowDown', 'top')
  })

  test('the main menu lists the commands the embed host implements', async () => {
    await expect(page.locator('#legend-toggle-levels')).toBeVisible()
    await expandMenus(page)
    const names = ['Layers', 'Levels', 'Language', 'Settings', 'Scan', 'Grid View', 'Export map']
    for (const name of names) {
      await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(1)
    }
    await expect(page.getByRole('menuitem', { name: /Configure Audiom/ })).toHaveCount(1)
    await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeVisible()
  })

  test('language, learn sounds, and settings open and go back', async () => {
    await expandMenus(page)
    await page.getByRole('menuitem', { name: 'Language', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'English' })).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()

    await page.getByRole('menuitem', { name: 'Learn Sounds' }).click()
    await expect(page.getByRole('menuitem', { name: /UI Sounds/ })).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()

    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Audio Settings')).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
  })

  test('wired keys speak or open the controls they own', async () => {
    await openSpeechLog(page)
    await page.locator('#audiom-esri-map').focus()
    await page.keyboard.press('t')
    await expect(speechLog(page)).toContainText('No data to display')
    await page.keyboard.press('g')
    await expect(speechLog(page)).toContainText('Grid mode')
    await page.keyboard.press('p')
    await expect(speechLog(page)).toContainText(/Playing ambient sounds|Stopping Ambient sounds/)
    await page.keyboard.press('Shift+R')
    await expect(speechLog(page)).toContainText('You are not on a route.')

    await page.keyboard.press('h')
    const help = page.locator('dialog').filter({ hasText: 'Tutorial and Keyboard Help' })
    await expect(help).toBeVisible()
    await help.getByRole('button', { name: 'Close' }).click()
    await expect(help).toBeHidden()

    await page.keyboard.press('m')
    await expect.poll(async () => page.getByRole('menuitem').count()).toBeGreaterThan(0)
    await page.locator('#sidebar').press('Escape')
  })

  test('y opens Data Sources after the section is collapsed', async () => {
    await collapseMenus(page)
    const sources = page.locator('#legend-toggle-sources')
    await expect(sources).toBeVisible()
    if ((await sources.getAttribute('aria-expanded')) === 'true') await sources.click()
    await expect(sources).toHaveAttribute('aria-expanded', 'false')
    await page.locator('#audiom-esri-map').focus()
    await page.keyboard.press('y')
    await expect(sources).toHaveAttribute('aria-expanded', 'true')
  })

  test('the layer eye hides Units and can show them again', async () => {
    const sources = page.locator('#legend-toggle-sources')
    if ((await sources.getAttribute('aria-expanded')) !== 'true') await sources.click()
    const units = page.locator(`[data-source-name="${UNITS_SOURCE}"]`)
    await expect(units).toBeVisible()
    if ((await units.getAttribute('aria-checked')) !== 'true') await units.click()
    await units.click()
    await expect(units).toHaveAttribute('aria-checked', 'false')
    await units.click()
    await expect(units).toHaveAttribute('aria-checked', 'true')
  })

  test('hiding Levels does not remove the floor list', async () => {
    const levelsToggle = page.locator('#legend-toggle-levels')
    if ((await levelsToggle.getAttribute('aria-expanded')) !== 'true') await levelsToggle.click()
    const radios = page.locator('input[name="level"]')
    await expect.poll(async () => radios.count()).toBeGreaterThan(1)
    const levels = page.locator(`[data-source-name="${LEVELS_SOURCE}"]`)
    const wasChecked = await levels.getAttribute('aria-checked')
    if (wasChecked === 'true') await levels.click()
    await expect.poll(async () => radios.count()).toBeGreaterThan(1)
    if ((await levels.getAttribute('aria-checked')) !== 'true') await levels.click()
    await expect(levels).toHaveAttribute('aria-checked', 'true')
  })

  test('selecting another floor checks that floor and clears the previous one', async () => {
    const levels = page.locator('#legend-toggle-levels')
    if ((await levels.getAttribute('aria-expanded')) !== 'true') await levels.click()
    const radios = page.locator('input[name="level"]')
    await expect.poll(async () => radios.count()).toBeGreaterThan(1)
    const checked = page.locator('input[name="level"]:checked')
    const previousId = await checked.getAttribute('id')
    const next = radios.nth(1)
    const nextId = await next.getAttribute('id')
    const target = nextId === previousId ? radios.nth(0) : next
    const targetId = await target.getAttribute('id')
    await page.locator(`label[for="${targetId}"]`).click()
    await expect(target).toBeChecked()
    if (previousId && previousId !== targetId) {
      await expect(page.locator(`#${previousId}`)).not.toBeChecked()
    }
  })
})