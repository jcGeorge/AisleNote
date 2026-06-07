import { describe, expect, it, vi } from 'vitest'
import {
  configureEditorSpellcheckerForWindow,
  createEditorContextMenuIpc,
  getPreferredSpellCheckerLanguages,
  normalizeEditorSpellcheckContext,
} from './editor-context-menu.mjs'

function createIpcMain() {
  const handlers = new Map()
  return {
    handle: vi.fn((name, handler) => {
      handlers.set(name, handler)
    }),
    handlers,
  }
}

function createWebContents(id = 1) {
  const listeners = new Map()
  const onceListeners = new Map()
  return {
    id,
    session: {
      addWordToSpellCheckerDictionary: vi.fn(),
    },
    replaceMisspelling: vi.fn(),
    showDefinitionForSelection: vi.fn(),
    on: vi.fn((name, listener) => {
      listeners.set(name, listener)
    }),
    once: vi.fn((name, listener) => {
      onceListeners.set(name, listener)
    }),
    listeners,
    onceListeners,
  }
}

describe('editor context menu spellcheck bridge', () => {
  it('normalizes spellcheck and lookup context from Electron params', () => {
    expect(
      normalizeEditorSpellcheckContext(
        {
          x: 10,
          y: 20,
          dictionarySuggestions: ['receive', '', 42, 'recipe'],
          misspelledWord: ' recieve ',
          selectionText: ' selected ',
          isEditable: true,
          spellcheckEnabled: true,
        },
        'darwin',
        123,
      ),
    ).toMatchObject({
      x: 10,
      y: 20,
      createdAt: 123,
      suggestions: ['receive', 'recipe'],
      misspelledWord: 'recieve',
      selectionText: 'selected',
      canLookUpSelection: true,
      hasItems: true,
    })
  })

  it('returns stored spellcheck context for matching coordinates only when request coordinates are present', async () => {
    let now = 1000
    const ipcMain = createIpcMain()
    const webContents = createWebContents(7)
    const bridge = createEditorContextMenuIpc({
      ipcMain,
      BrowserWindow: { fromWebContents: vi.fn() },
      platform: 'win32',
      now: () => now,
    })
    bridge.attachToWindow({ webContents })
    webContents.listeners.get('context-menu')({}, {
      x: 50,
      y: 60,
      dictionarySuggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      isEditable: true,
      spellcheckEnabled: true,
    })

    await expect(
      ipcMain.handlers.get('get-editor-spellcheck-context')({ sender: webContents }, { x: 55, y: 56 }),
    ).resolves.toEqual({
      suggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      canLookUpSelection: false,
    })
    await expect(
      ipcMain.handlers.get('get-editor-spellcheck-context')({ sender: webContents }, { x: 100, y: 60 }),
    ).resolves.toBeNull()
    await expect(
      ipcMain.handlers.get('get-editor-spellcheck-context')({ sender: webContents }, {}),
    ).resolves.toEqual({
      suggestions: ['receive'],
      misspelledWord: 'recieve',
      selectionText: 'recieve',
      canLookUpSelection: false,
    })
    now = 1601
    await expect(
      ipcMain.handlers.get('get-editor-spellcheck-context')({ sender: webContents }, { x: 100, y: 60 }),
    ).resolves.toBeNull()
    now = 2601
    await expect(
      ipcMain.handlers.get('get-editor-spellcheck-context')({ sender: webContents }, { x: 50, y: 60 }),
    ).resolves.toBeNull()
  })

  it('runs native spellcheck commands through Electron webContents and session APIs', async () => {
    const ipcMain = createIpcMain()
    const webContents = createWebContents(9)
    const window = { webContents }
    const BrowserWindow = { fromWebContents: vi.fn(() => window) }
    createEditorContextMenuIpc({ ipcMain, BrowserWindow, platform: 'darwin' })

    await expect(
      ipcMain.handlers.get('replace-misspelling')({ sender: webContents }, { word: 'receive' }),
    ).resolves.toEqual({ ok: true })
    expect(webContents.replaceMisspelling).toHaveBeenCalledWith('receive')

    await expect(
      ipcMain.handlers.get('add-word-to-spellchecker-dictionary')({ sender: webContents }, { word: 'tabsword' }),
    ).resolves.toEqual({ ok: true })
    expect(webContents.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('tabsword')

    await expect(ipcMain.handlers.get('show-definition-for-selection')({ sender: webContents })).resolves.toEqual({
      ok: true,
    })
    expect(webContents.showDefinitionForSelection).toHaveBeenCalledTimes(1)
  })

  it('uses OS-preferred Electron spellchecker languages on every desktop platform with session support', () => {
    const session = {
      availableSpellCheckerLanguages: ['en-US', 'fr', 'de-DE'],
      setSpellCheckerLanguages: vi.fn(),
    }
    const app = {
      getPreferredSystemLanguages: vi.fn(() => ['fr-CA', 'en-US', 'fr']),
      getLocale: vi.fn(() => 'de-DE'),
    }

    expect(getPreferredSpellCheckerLanguages({ app, session, platform: 'win32' })).toEqual(['en-US', 'fr', 'de-DE'])
    expect(configureEditorSpellcheckerForWindow({ webContents: { session } }, { app, platform: 'win32' })).toEqual([
      'en-US',
      'fr',
      'de-DE',
    ])
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith(['en-US', 'fr', 'de-DE'])
  })

  it('does not skip Electron spellchecker language setup on macOS', () => {
    const session = {
      availableSpellCheckerLanguages: ['en-US', 'fr'],
      setSpellCheckerLanguages: vi.fn(),
    }
    const app = {
      getPreferredSystemLanguages: vi.fn(() => ['fr', 'en-US']),
      getLocale: vi.fn(() => 'en-US'),
    }

    expect(getPreferredSpellCheckerLanguages({ app, session, platform: 'darwin' })).toEqual(['fr', 'en-US'])
    expect(configureEditorSpellcheckerForWindow({ webContents: { session } }, { app, platform: 'darwin' })).toEqual([
      'fr',
      'en-US',
    ])
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith(['fr', 'en-US'])
  })
})
