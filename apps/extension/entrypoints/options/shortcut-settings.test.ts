import {
  EXTENSION_SHORTCUTS_URL,
  formatCommandShortcut,
  openExtensionShortcutSettings,
  readCommandShortcut,
} from './shortcut-settings'

describe('extension shortcut settings', () => {
  it('reads assigned and explicitly unassigned command shortcuts', async () => {
    const assigned = await readCommandShortcut('translate-hovered-text', {
      getAll: async () => [{ name: 'translate-hovered-text', shortcut: 'Alt+Shift+L' }],
    })
    const unassigned = await readCommandShortcut('translate-hovered-text', {
      getAll: async () => [{ name: 'translate-hovered-text', shortcut: '' }],
    })

    expect(assigned).toBe('Alt+Shift+L')
    expect(unassigned).toBe('')
  })

  it('distinguishes an unavailable commands API from an unassigned command', async () => {
    await expect(readCommandShortcut('translate-hovered-text')).resolves.toBeNull()
  })

  it('formats browser shortcuts for display', () => {
    expect(formatCommandShortcut('Command+Shift+L')).toBe('Command + Shift + L')
    expect(formatCommandShortcut('⌥⇧L')).toBe('Option + Shift + L')
  })

  it('opens the browser-owned shortcut manager', async () => {
    const create = vi.fn(async () => undefined)

    await expect(openExtensionShortcutSettings({ create })).resolves.toBe(true)
    expect(create).toHaveBeenCalledWith({ url: EXTENSION_SHORTCUTS_URL })
    await expect(openExtensionShortcutSettings()).resolves.toBe(false)
  })
})
