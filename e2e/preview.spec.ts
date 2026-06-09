import { expect, test, type Page } from '@playwright/test'

const undefinedError = /Cannot read properties of undefined/

test('popup preview makes the target language clear and avoids fake detection', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto(`/popup.html?e2e=${Date.now()}`)

  await expect(page).toHaveTitle('LingoFlow')
  await expect(page.getByRole('heading', { name: 'LingoFlow' })).toBeVisible()
  await expect(page.getByText('Auto-detect page language')).toBeVisible()
  await expect(page.getByLabel('Target language')).toHaveValue('zh-Hans')
  await expect(page.getByRole('button', { name: 'Translate to Simplified Chinese' })).toBeVisible()
  await expect(page.getByText('English detected')).toHaveCount(0)
  await expect(page.getByText('Configured provider')).toHaveCount(0)
  await expect(page.getByText('Render mode')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Clear translation' })).toHaveCount(0)
  await expect(page.getByText(undefinedError)).toHaveCount(0)

  await page.getByLabel('Target language').selectOption('ja')
  await expect(page.getByRole('button', { name: 'Translate to Japanese' })).toBeVisible()
  await page.getByRole('button', { name: 'Translate to Japanese' }).click()

  await expect(page.getByText(undefinedError)).toHaveCount(0)
  expect(errors()).toEqual([])
})

test('popup preview opens options without chrome.runtime.openOptionsPage', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto(`/popup.html?settings=${Date.now()}`)
  await page.getByRole('button', { name: 'Settings' }).click()

  await expect(page).toHaveURL(/\/options\.html$/)
  await expect(page).toHaveTitle('LingoFlow Settings')
  await expect(page.getByRole('heading', { name: 'General Settings' })).toBeVisible()
  await expect(page.getByText(undefinedError)).toHaveCount(0)
  expect(errors()).toEqual([])
})

test('options preview renders settings and cache controls without extension API errors', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto(`/options.html?e2e=${Date.now()}`)

  await expect(page).toHaveTitle('LingoFlow Settings')
  await expect(page.getByRole('heading', { name: 'LingoFlow Settings' })).toBeVisible()
  await expect(page.getByLabel('Target language')).toHaveValue('zh-Hans')
  await expect(page.getByLabel('Source language')).toHaveValue('auto')
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api.openai.com/v1')
  await expect(page.getByText(undefinedError)).toHaveCount(0)

  await page.getByRole('button', { name: 'Save Settings' }).click()
  await page.getByRole('button', { name: 'Clear Site Cache' }).click()

  await expect(page.getByText(undefinedError)).toHaveCount(0)
  expect(errors()).toEqual([])
})

test('popup preview stays usable on a mobile-sized viewport', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/popup.html?mobile=${Date.now()}`)

  await expect(page.getByRole('heading', { name: 'LingoFlow' })).toBeVisible()
  await expect(page.getByLabel('Target language')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Translate to Simplified Chinese' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText(undefinedError)).toHaveCount(0)
  expect(errors()).toEqual([])
})

function collectRuntimeErrors(page: Page) {
  const errors: string[] = []

  page.on('pageerror', error => {
    errors.push(error.message)
  })

  page.on('console', message => {
    if (message.type() === 'error' && undefinedError.test(message.text())) {
      errors.push(message.text())
    }
  })

  return () => errors
}
