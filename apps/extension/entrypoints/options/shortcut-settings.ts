export const EXTENSION_SHORTCUTS_URL = 'chrome://extensions/shortcuts'

export type ExtensionCommand = {
  name?: string
  shortcut?: string
}

type CommandsReader = {
  getAll: () => Promise<ExtensionCommand[]>
}

type TabsWriter = {
  create: (properties: { url: string }) => Promise<unknown>
}

export async function readCommandShortcut(
  commandName: string,
  commands?: CommandsReader,
): Promise<string | null> {
  if (!commands) return null
  const registered = await commands.getAll()
  return registered.find(command => command.name === commandName)?.shortcut ?? ''
}

export function formatCommandShortcut(shortcut: string): string {
  const glyphLabels: Record<string, string> = {
    '⌘': 'Command',
    '⌥': 'Option',
    '⇧': 'Shift',
    '⌃': 'Control',
  }
  if (Object.keys(glyphLabels).some(glyph => shortcut.includes(glyph))) {
    const labels: string[] = []
    let key = ''
    for (const character of shortcut) {
      const label = glyphLabels[character]
      if (label) labels.push(label)
      else key += character
    }
    if (key) labels.push(key)
    return labels.join(' + ')
  }
  return shortcut.split('+').join(' + ')
}

export async function openExtensionShortcutSettings(tabs?: TabsWriter): Promise<boolean> {
  if (!tabs) return false
  await tabs.create({ url: EXTENSION_SHORTCUTS_URL })
  return true
}
