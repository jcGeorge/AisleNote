const SPELLCHECK_CONTEXT_MAX_AGE_MS = 1500
const SPELLCHECK_CONTEXT_COORDINATE_TOLERANCE_PX = 24

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeSuggestions(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim()) : []
}

function normalizeContextMenuPoint(payload) {
  const x = Number(payload?.x)
  const y = Number(payload?.y)
  return {
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null,
  }
}

function pointsAreNear(left, right) {
  if (left.x === null || left.y === null || right.x === null || right.y === null) return false
  return (
    Math.abs(left.x - right.x) <= SPELLCHECK_CONTEXT_COORDINATE_TOLERANCE_PX &&
    Math.abs(left.y - right.y) <= SPELLCHECK_CONTEXT_COORDINATE_TOLERANCE_PX
  )
}

function getWebContentsId(webContents) {
  return Number.isInteger(webContents?.id) ? webContents.id : null
}

export function normalizeEditorSpellcheckContext(params, platform = process.platform, createdAt = Date.now()) {
  const point = normalizeContextMenuPoint(params)
  const selectionText = normalizeString(params?.selectionText).trim()
  const misspelledWord = normalizeString(params?.misspelledWord).trim()
  const suggestions = normalizeSuggestions(params?.dictionarySuggestions)
  const isEditable = Boolean(params?.isEditable)
  const spellcheckEnabled = params?.spellcheckEnabled !== false
  const canLookUpSelection = platform === 'darwin' && selectionText.length > 0
  const hasDictionaryItems = isEditable && spellcheckEnabled && (suggestions.length > 0 || misspelledWord.length > 0)

  return {
    x: point.x,
    y: point.y,
    createdAt,
    suggestions,
    misspelledWord,
    selectionText,
    isEditable,
    spellcheckEnabled,
    canLookUpSelection,
    hasItems: hasDictionaryItems || canLookUpSelection,
  }
}

export function createEditorContextMenuIpc({
  ipcMain,
  BrowserWindow,
  platform = process.platform,
  now = () => Date.now(),
} = {}) {
  const contextsByWebContentsId = new Map()

  function getWindowFromEvent(event) {
    if (!BrowserWindow || typeof BrowserWindow.fromWebContents !== 'function') return null
    return BrowserWindow.fromWebContents(event?.sender) ?? null
  }

  function attachToWindow(window) {
    const webContents = window?.webContents
    if (!webContents || typeof webContents.on !== 'function') return
    webContents.on('context-menu', (_event, params = {}) => {
      const webContentsId = getWebContentsId(webContents)
      if (webContentsId === null) return
      contextsByWebContentsId.set(
        webContentsId,
        normalizeEditorSpellcheckContext(params, platform, now()),
      )
    })
    if (typeof webContents.once === 'function') {
      webContents.once('destroyed', () => {
        const webContentsId = getWebContentsId(webContents)
        if (webContentsId !== null) contextsByWebContentsId.delete(webContentsId)
      })
    }
  }

  ipcMain?.handle?.('get-editor-spellcheck-context', async (event, payload = {}) => {
    const webContentsId = getWebContentsId(event?.sender)
    const context = webContentsId === null ? null : contextsByWebContentsId.get(webContentsId) ?? null
    if (!context || now() - context.createdAt > SPELLCHECK_CONTEXT_MAX_AGE_MS) return null
    if (!pointsAreNear(context, normalizeContextMenuPoint(payload))) return null
    if (!context.hasItems) return null
    return {
      suggestions: context.isEditable && context.spellcheckEnabled ? context.suggestions : [],
      misspelledWord: context.isEditable && context.spellcheckEnabled ? context.misspelledWord : '',
      selectionText: context.selectionText,
      canLookUpSelection: context.canLookUpSelection,
    }
  })

  ipcMain?.handle?.('replace-misspelling', async (event, payload = {}) => {
    const word = normalizeString(payload?.word)
    if (!word) return { ok: false, error: 'Replacement word is missing.' }
    const window = getWindowFromEvent(event)
    if (!window?.webContents || typeof window.webContents.replaceMisspelling !== 'function') {
      return { ok: false, error: 'Spellcheck replacement is unavailable.' }
    }
    window.webContents.replaceMisspelling(word)
    return { ok: true }
  })

  ipcMain?.handle?.('add-word-to-spellchecker-dictionary', async (event, payload = {}) => {
    const word = normalizeString(payload?.word)
    if (!word) return { ok: false, error: 'Dictionary word is missing.' }
    const session = event?.sender?.session
    if (!session || typeof session.addWordToSpellCheckerDictionary !== 'function') {
      return { ok: false, error: 'Spellchecker dictionary is unavailable.' }
    }
    session.addWordToSpellCheckerDictionary(word)
    return { ok: true }
  })

  ipcMain?.handle?.('show-definition-for-selection', async (event) => {
    const window = getWindowFromEvent(event)
    if (
      platform !== 'darwin' ||
      !window?.webContents ||
      typeof window.webContents.showDefinitionForSelection !== 'function'
    ) {
      return { ok: false, error: 'Dictionary lookup is unavailable.' }
    }
    window.webContents.showDefinitionForSelection()
    return { ok: true }
  })

  return {
    attachToWindow,
    getStoredContext(webContentsId) {
      return contextsByWebContentsId.get(webContentsId) ?? null
    },
  }
}
