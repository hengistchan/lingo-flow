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
  await expect(page.getByRole('heading', { name: 'Languages' })).toBeVisible()
  await expect(page.getByText(undefinedError)).toHaveCount(0)
  expect(errors()).toEqual([])
})

test('options preview uses readable language selectors and functional navigation', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto(`/options.html?e2e=${Date.now()}`)

  await expect(page).toHaveTitle('LingoFlow Settings')
  await expect(page.getByRole('heading', { name: 'LingoFlow Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Languages' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('Target language')).toHaveValue('zh-Hans')
  await expect(page.getByLabel('Source language')).toHaveValue('auto')
  await expect(page.getByLabel('Interface language')).toHaveValue('auto')
  await expect(page.getByLabel('Endpoint')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  await expect(page.getByText(undefinedError)).toHaveCount(0)

  await page.getByLabel('Target language').selectOption('ja')
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeEnabled()

  await page.getByRole('button', { name: 'Translation service' }).click()
  await expect(page.getByRole('button', { name: 'Translation service' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Translation service' })).toBeVisible()
  await expect(page.getByLabel('Target language')).toHaveCount(0)

  await page.getByRole('button', { name: 'Storage' }).click()
  await expect(page.getByRole('button', { name: 'Clear all cache' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear site cache' })).toHaveCount(0)

  await expect(page.getByText(undefinedError)).toHaveCount(0)
  expect(errors()).toEqual([])
})

test('options preview exposes LLM translation speed controls', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto(`/options.html?speed=${Date.now()}`)

  await page.getByRole('button', { name: 'Advanced' }).click()
  await expect(page.getByLabel('Concurrent translation batches')).toHaveValue('3')
  await page.getByLabel('Concurrent translation batches').fill('4')
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeEnabled()

  await page.getByRole('button', { name: 'Translation service' }).click()
  await page.getByLabel('Default provider').selectOption('openai-compatible')
  await expect(page.getByLabel('Reasoning effort')).toHaveValue('auto')
  await page.getByLabel('Reasoning effort').selectOption('minimal')
  await page.getByLabel('Disable thinking').check()
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeEnabled()

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
