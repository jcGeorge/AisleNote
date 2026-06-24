export const DEFAULT_AUTO_REMOVE_DAYS = 7

const THEMES = new Set(['dark', 'light', 'cheese', 'custom1', 'custom2', 'custom3'])

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

export function createStorageContentHash(value) {
  const text = String(value ?? '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getNoteBodiesFromAppState(appState) {
  return ensureArray(appState?.noteBodies).filter(isRecord)
}

function addNoteBodyId(ids, value) {
  if (typeof value === 'string' && value) ids.add(value)
}

function collectNotebookItemBodyIds(item, ids) {
  if (!isRecord(item)) return
  if (item.type === 'note') {
    addNoteBodyId(ids, item.noteBodyId)
    return
  }
  if (item.type === 'folder') {
    ensureArray(item.children).forEach((child) => collectNotebookItemBodyIds(child, ids))
  }
}

export function collectReferencedNoteBodyIdsFromAppState(appState) {
  const ids = new Set()
  if (isRecord(appState?.scratchpad)) addNoteBodyId(ids, appState.scratchpad.noteBodyId)
  const notebook = isRecord(appState?.notebook) ? appState.notebook : {}
  ensureArray(notebook.items).forEach((item) => collectNotebookItemBodyIds(item, ids))
  ensureArray(notebook.deletedItems).forEach((entry) => {
    if (isRecord(entry)) collectNotebookItemBodyIds(entry.item, ids)
  })
  return ids
}

export function reconcileNotebookStorageState(appState) {
  if (!isRecord(appState)) return appState
  return {
    ...appState,
    noteBodies: getNoteBodiesFromAppState(appState),
    noteAisleBodies: ensureArray(appState.noteAisleBodies).filter(isRecord),
  }
}

export function normalizeStorageTheme(value) {
  return THEMES.has(value) ? value : 'dark'
}

export function getThemeForStorage(appState) {
  return normalizeStorageTheme(appState?.theme)
}

export function normalizeAssetExtension(raw) {
  const normalized = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'svgxml') return 'svg'
  return normalized || 'bin'
}

export function getExtensionFromMimeType(mimeType) {
  const normalized = String(mimeType ?? '').toLowerCase()
  const subtype = normalized.split('/')[1] ?? ''
  if (subtype === 'jpeg') return 'jpg'
  if (subtype === 'svg+xml') return 'svg'
  if (subtype === 'mpeg') return 'mp3'
  if (subtype === 'quicktime') return 'mov'
  return normalizeAssetExtension(subtype)
}

export function getMimeTypeFromExtension(extension) {
  const normalized = normalizeAssetExtension(extension)
  switch (normalized) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    case 'pdf':
      return 'application/pdf'
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
      return 'audio/mp4'
    case 'wav':
      return 'audio/wav'
    case 'mp4':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    default:
      return 'application/octet-stream'
  }
}
