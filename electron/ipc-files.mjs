import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import {
  getHybridStorageRoot,
  importNotebookZipArchive,
  loadAppStateResult,
  writeNotebookFolderExport,
} from './app-state-storage.mjs'
import { parseStrictPortableAppSettingsJson } from '../src/storage/settings-partition.js'

const USER_SETTINGS_MAX_BYTES = 1024 * 1024
const MARKDOWN_IMPORT_MAX_FILES = 5000
const MARKDOWN_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024
const MARKDOWN_IMPORT_MAX_TOTAL_BYTES = 250 * 1024 * 1024
const FOLDER_IMPORT_MAX_ASSET_BYTES = 100 * 1024 * 1024
const MARKDOWN_EXTENSION_RE = /\.(?:md|markdown)$/i
const DEFAULT_MARKDOWN_ASSET_ROOT_ID = 'source'

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function isInsidePath(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function normalizeFolderImportRelativePath(value) {
  const source = String(value ?? '').trim().replace(/\\/g, '/')
  if (!source || source.startsWith('/') || source.includes('\0')) return null
  const parts = source.split('/').filter((part) => part && part !== '.')
  if (parts.some((part) => part === '..')) return null
  return parts.join('/')
}

function getMimeTypeFromFileName(fileName) {
  const extension = path.extname(String(fileName ?? '')).slice(1).toLowerCase()
  switch (extension) {
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
    case 'aac':
      return 'audio/aac'
    case 'flac':
      return 'audio/flac'
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
      return 'audio/mp4'
    case 'oga':
    case 'ogg':
    case 'opus':
      return 'audio/ogg'
    case 'wav':
      return 'audio/wav'
    case 'm4v':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mp4':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'md':
    case 'markdown':
      return 'text/markdown'
    default:
      return 'application/octet-stream'
  }
}

function importPathContainsSymlink(rootPath, relativePath) {
  const parts = relativePath.split('/').filter(Boolean)
  let cursor = rootPath
  for (const part of parts) {
    cursor = path.join(cursor, part)
    if (lstatSync(cursor).isSymbolicLink()) return true
  }
  return false
}

function rememberFolderImportSource(sourceMap, source) {
  const sourceId = randomUUID()
  sourceMap.set(sourceId, source)
  if (sourceMap.size > 20) {
    const firstKey = sourceMap.keys().next().value
    if (firstKey) sourceMap.delete(firstKey)
  }
  return sourceId
}

function walkMarkdownImportFolder(rootPath) {
  const root = path.resolve(rootPath)
  const files = []
  let totalBytes = 0

  function visit(directoryPath) {
    const entries = readdirSync(directoryPath, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(directoryPath, entry.name)
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        throw new Error(`Markdown folder import does not allow symlinks: ${relativePath}`)
      }
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!entry.isFile() || !MARKDOWN_EXTENSION_RE.test(entry.name)) continue
      const stats = statSync(absolutePath)
      if (stats.size > MARKDOWN_IMPORT_MAX_FILE_BYTES) {
        throw new Error(`Markdown file is too large: ${relativePath}`)
      }
      if (files.length >= MARKDOWN_IMPORT_MAX_FILES) {
        throw new Error(`Markdown folder contains more than ${MARKDOWN_IMPORT_MAX_FILES} Markdown files.`)
      }
      totalBytes += stats.size
      if (totalBytes > MARKDOWN_IMPORT_MAX_TOTAL_BYTES) {
        throw new Error('Markdown folder is too large to import.')
      }
      files.push({
        relativePath,
        markdown: readFileSync(absolutePath, 'utf8'),
        size: stats.size,
      })
    }
  }

  visit(root)
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function findObsidianVaultRoot(folderPath) {
  let cursor = path.resolve(folderPath)
  while (true) {
    const obsidianPath = path.join(cursor, '.obsidian')
    try {
      if (lstatSync(obsidianPath).isDirectory()) return cursor
    } catch {
      // Keep walking toward the filesystem root.
    }
    const parent = path.dirname(cursor)
    if (!parent || parent === cursor) return null
    cursor = parent
  }
}

function buildPublicAssetRoot(root) {
  return {
    id: root.id,
    name: root.name,
    sourceBasePath: root.sourceBasePath,
  }
}

function buildMarkdownFolderAssetRoots(folderPath) {
  const roots = [{
    id: DEFAULT_MARKDOWN_ASSET_ROOT_ID,
    name: path.basename(folderPath),
    rootPath: folderPath,
    sourceBasePath: '',
  }]
  const vaultRoot = findObsidianVaultRoot(folderPath)
  if (vaultRoot && path.resolve(vaultRoot) !== path.resolve(folderPath)) {
    roots.push({
      id: 'vault',
      name: path.basename(vaultRoot),
      rootPath: vaultRoot,
      sourceBasePath: path.relative(vaultRoot, folderPath).split(path.sep).join('/'),
    })
  }
  return roots
}

function getMarkdownZipRootName(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath))
  return baseName || 'Markdown import'
}

async function openMarkdownZipImportFile(filePath, fallbackError = null) {
  try {
    const zip = await JSZip.loadAsync(readFileSync(filePath))
    const files = []
    const assets = []
    let totalBytes = 0

    for (const file of Object.values(zip.files)) {
      if (file.dir) continue
      const relativePath = normalizeFolderImportRelativePath(file.name)
      if (!relativePath) {
        return { canceled: false, ok: false, error: 'Markdown ZIP contains an invalid path.' }
      }
      const bytes = await file.async('nodebuffer')
      if (MARKDOWN_EXTENSION_RE.test(relativePath)) {
        if (bytes.byteLength > MARKDOWN_IMPORT_MAX_FILE_BYTES) {
          return { canceled: false, ok: false, error: `Markdown file is too large: ${relativePath}` }
        }
        if (files.length >= MARKDOWN_IMPORT_MAX_FILES) {
          return {
            canceled: false,
            ok: false,
            error: `Markdown ZIP contains more than ${MARKDOWN_IMPORT_MAX_FILES} Markdown files.`,
          }
        }
        totalBytes += bytes.byteLength
        if (totalBytes > MARKDOWN_IMPORT_MAX_TOTAL_BYTES) {
          return { canceled: false, ok: false, error: 'Markdown ZIP is too large to import.' }
        }
        files.push({
          relativePath,
          markdown: bytes.toString('utf8'),
          size: bytes.byteLength,
        })
        continue
      }
      if (bytes.byteLength > FOLDER_IMPORT_MAX_ASSET_BYTES) continue
      assets.push({
        assetRootId: DEFAULT_MARKDOWN_ASSET_ROOT_ID,
        relativePath,
        bytes: toArrayBuffer(bytes),
        fileName: path.basename(relativePath),
        name: path.basename(relativePath),
        mimeType: getMimeTypeFromFileName(relativePath),
        extension: path.extname(relativePath).slice(1).toLowerCase(),
      })
    }

    if (files.length === 0) {
      return {
        canceled: false,
        ok: false,
        error: fallbackError ?? 'Markdown ZIP does not contain Markdown files.',
      }
    }
    const rootName = getMarkdownZipRootName(filePath)
    return {
      canceled: false,
      ok: true,
      kind: 'markdown-zip',
      filePath,
      rootName,
      files: files.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      assets,
      assetRoots: [{ id: DEFAULT_MARKDOWN_ASSET_ROOT_ID, name: rootName, sourceBasePath: '' }],
      ...(fallbackError ? { nativeNotebookError: fallbackError } : {}),
    }
  } catch (error) {
    return {
      canceled: false,
      ok: false,
      error: error instanceof Error ? error.message : 'Markdown ZIP could not be imported.',
    }
  }
}

export function registerFileIpc({ ipcMain, dialog, storageSession = null }) {
  const folderImportSources = new Map()

  async function openNotebookZipImportFile(filePath) {
    const result = await importNotebookZipArchive(filePath)
    if (result.ok) {
      return {
        canceled: false,
        ok: true,
        kind: 'notebook-zip',
        filePath,
        serializedState: result.serializedState,
        schemaVersion: result.schemaVersion,
        health: result.health,
        issues: result.issues,
        assets: result.assets,
      }
    }
    const canTryMarkdownZip = result.issues?.some((issue) =>
      issue.code === 'missing-root-manifest' || issue.code === 'unexpected-archive-entry'
    )
    if (canTryMarkdownZip) return openMarkdownZipImportFile(filePath, result.error)
    return {
      canceled: false,
      ok: false,
      error: result.error ?? 'Notebook ZIP could not be imported.',
      health: result.health,
      issues: result.issues,
    }
  }

  function openNotebookFolderImportPath(folderPathRaw) {
    const folderPath = path.resolve(folderPathRaw)
    const notebookRootPath = getHybridStorageRoot(folderPath)
    const manifestPath = path.join(notebookRootPath, 'manifest.json')
    try {
      const folderStats = lstatSync(folderPath)
      if (folderStats.isSymbolicLink()) {
        return { canceled: false, ok: false, error: 'Notebook folder import does not allow symlinks.' }
      }
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be opened.',
      }
    }
    if (!existsSync(manifestPath)) {
      return {
        canceled: false,
        ok: false,
        error: 'Folder does not contain manifest.json.',
      }
    }

    const result = loadAppStateResult(folderPath, { includeUserSettings: false })
    if (!result.ok || typeof result.serializedState !== 'string') {
      return {
        canceled: false,
        ok: false,
        error: result.ok ? 'Notebook folder did not contain readable notebook data.' : result.error ?? 'Notebook folder could not be loaded.',
        health: result.health,
        issues: result.issues,
      }
    }

    const sourceId = rememberFolderImportSource(folderImportSources, {
      kind: 'notebook',
      rootPath: notebookRootPath,
      folderPath,
    })
    return {
      canceled: false,
      ok: true,
      kind: 'notebook-folder',
      sourceId,
      folderPath,
      serializedState: result.serializedState,
      schemaVersion: result.schemaVersion,
      health: result.health,
      issues: result.issues,
    }
  }

  function openMarkdownFolderImportPath(folderPathRaw) {
    const folderPath = path.resolve(folderPathRaw)
    try {
      const rootStats = lstatSync(folderPath)
      if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
        return { canceled: false, ok: false, error: 'Selected path must be a normal folder.' }
      }
      const files = walkMarkdownImportFolder(folderPath)
      if (files.length === 0) {
        return { canceled: false, ok: false, error: 'Folder does not contain Markdown files.' }
      }
      const assetRoots = buildMarkdownFolderAssetRoots(folderPath)
      const sourceId = rememberFolderImportSource(folderImportSources, {
        kind: 'markdown',
        rootPath: folderPath,
        folderPath,
        assetRoots,
      })
      return {
        canceled: false,
        ok: true,
        kind: 'markdown-folder',
        sourceId,
        folderPath,
        rootName: path.basename(folderPath),
        files,
        assetRoots: assetRoots.map(buildPublicAssetRoot),
      }
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'Markdown folder could not be opened.',
      }
    }
  }

  function openNotebookImportSourcePath(selectedPathRaw) {
    const selectedPath = path.resolve(selectedPathRaw)
    let stats
    try {
      stats = lstatSync(selectedPath)
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook import source could not be opened.',
      }
    }
    if (stats.isSymbolicLink()) return { canceled: false, ok: false, error: 'Notebook import does not allow symlinks.' }
    if (stats.isDirectory()) {
      const notebookResult = existsSync(path.join(selectedPath, 'manifest.json'))
        ? openNotebookFolderImportPath(selectedPath)
        : openMarkdownFolderImportPath(selectedPath)
      return notebookResult
    }
    if (!stats.isFile()) return { canceled: false, ok: false, error: 'Notebook import source must be a ZIP file or folder.' }
    if (path.extname(selectedPath).toLowerCase() !== '.zip') {
      return { canceled: false, ok: false, error: 'Notebook import file must be a .zip archive.' }
    }
    return openNotebookZipImportFile(selectedPath)
  }

  async function chooseNotebookImportSourcePath() {
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { canceled: false, ok: false, error: 'Notebook import is unavailable.' }
    }

    let properties = ['openFile', 'openDirectory']
    let filters = [{ name: 'Notebook Import Source', extensions: ['zip'] }]
    if (process.platform !== 'darwin' && typeof dialog.showMessageBox === 'function') {
      const choice = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Choose ZIP archive', 'Choose folder', 'Cancel'],
        cancelId: 2,
        defaultId: 0,
        message: 'Import notebook',
        detail: 'Choose an AisleNote notebook ZIP, Markdown ZIP, AisleNote notebook folder, or Markdown folder.',
      })
      if (choice.response === 2) return { canceled: true }
      if (choice.response === 0) {
        properties = ['openFile']
        filters = [{ name: 'Zip Archive', extensions: ['zip'] }]
      } else {
        properties = ['openDirectory']
        filters = []
      }
    }

    const openResult = await dialog.showOpenDialog({
      title: 'Import notebook',
      filters,
      properties,
    })
    if (openResult.canceled || !openResult.filePaths?.[0]) return { canceled: true }
    return openNotebookImportSourcePath(openResult.filePaths[0])
  }

  ipcMain.handle('export-notebook-folder', async (_event, payload = {}) => {
    const serializedState = typeof payload?.serializedState === 'string' ? payload.serializedState : ''
    if (!serializedState.trim()) {
      return { canceled: false, ok: false, error: 'Notebook export payload is invalid.' }
    }
    if (!dialog || typeof dialog.showOpenDialog !== 'function') {
      return { canceled: false, ok: false, error: 'Notebook folder export is unavailable.' }
    }

    const selection = await dialog.showOpenDialog({
      title: 'Export notebook folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths?.[0]) return { canceled: true }

    const destinationRootPath = path.resolve(selection.filePaths[0])
    const activeProfileRootPath = storageSession?.getProfileRootPath?.()
    if (typeof activeProfileRootPath === 'string' && isInsidePath(activeProfileRootPath, destinationRootPath)) {
      return { canceled: false, ok: false, error: 'Choose a folder outside the active notebook folder.' }
    }
    if (existsSync(getHybridStorageRoot(destinationRootPath))) {
      if (existsSync(path.join(getHybridStorageRoot(destinationRootPath), 'manifest.json'))) {
        return { canceled: false, ok: false, error: 'Destination folder already contains a notebook.' }
      }
      if (readdirSync(getHybridStorageRoot(destinationRootPath)).length > 0) {
        return { canceled: false, ok: false, error: 'Destination notebook folder must be empty.' }
      }
    }

    try {
      const result = writeNotebookFolderExport(destinationRootPath, serializedState, {
        assetSourceRoot: activeProfileRootPath ? getHybridStorageRoot(activeProfileRootPath) : null,
      })
      return { canceled: false, ok: true, ...result }
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook folder could not be exported.',
      }
    }
  })

  ipcMain.handle('save-file', async (_event, payload) => {
    const { defaultPath, data } = payload ?? {}
    if (!(data instanceof ArrayBuffer)) return { canceled: true, error: 'Invalid payload' }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: typeof defaultPath === 'string' ? defaultPath : 'notes-export.zip',
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

    const bytes = Buffer.from(new Uint8Array(data))
    writeFileSync(saveResult.filePath, bytes)
    return { canceled: false, filePath: saveResult.filePath }
  })

  ipcMain.handle('save-user-settings-file', async (_event, payload) => {
    const { defaultPath, contents } = payload ?? {}
    if (typeof contents !== 'string') return { canceled: true, error: 'Invalid payload' }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: typeof defaultPath === 'string' ? defaultPath : 'app-settings.json',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

    try {
      writeFileSync(saveResult.filePath, contents, 'utf8')
      return { canceled: false, filePath: saveResult.filePath }
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : 'User settings could not be saved.',
      }
    }
  })

  ipcMain.handle('open-notebook-import-source', async () => chooseNotebookImportSourcePath())

  ipcMain.handle('read-folder-import-asset', async (_event, payload = {}) => {
    try {
      const sourceId = typeof payload?.sourceId === 'string' ? payload.sourceId : ''
      const source = folderImportSources.get(sourceId)
      if (!source) return { ok: false, error: 'Import source is no longer available.' }

      const requestedAssetRootId = typeof payload?.assetRootId === 'string' && payload.assetRootId.trim()
        ? payload.assetRootId.trim()
        : DEFAULT_MARKDOWN_ASSET_ROOT_ID
      const assetRoot =
        source.assetRoots?.find((candidate) => candidate.id === requestedAssetRootId) ??
        source.assetRoots?.[0] ??
        { rootPath: source.rootPath, id: DEFAULT_MARKDOWN_ASSET_ROOT_ID }
      const rootPath = path.resolve(assetRoot.rootPath)
      const relativePath = normalizeFolderImportRelativePath(payload?.relativePath)
      if (!relativePath) return { ok: false, error: 'Invalid import asset path.' }

      const absolutePath = path.resolve(rootPath, ...relativePath.split('/'))
      if (!isInsidePath(rootPath, absolutePath)) {
        return { ok: false, error: 'Invalid import asset path.' }
      }

      const stats = lstatSync(absolutePath)
      if (stats.isSymbolicLink() || importPathContainsSymlink(rootPath, relativePath) || !stats.isFile()) {
        return { ok: false, error: 'Import asset is not a readable file.' }
      }
      if (stats.size > FOLDER_IMPORT_MAX_ASSET_BYTES) {
        return { ok: false, error: 'Import asset is too large.' }
      }
      const bytes = readFileSync(absolutePath)
      const fileName = path.basename(absolutePath)
      const extension = path.extname(fileName).slice(1).toLowerCase()
      return {
        ok: true,
        bytes: toArrayBuffer(bytes),
        fileName,
        name: fileName,
        mimeType: getMimeTypeFromFileName(fileName),
        extension,
        relativePath,
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Import asset could not be read.' }
    }
  })

  ipcMain.handle('open-user-settings-file', async () => {
    const openResult = await dialog.showOpenDialog({
      filters: [{ name: 'JSON File', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (openResult.canceled || !openResult.filePaths?.[0]) return { canceled: true }

    const filePath = openResult.filePaths[0]
    if (path.extname(filePath).toLowerCase() !== '.json') {
      return { canceled: false, ok: false, error: 'User settings file must be a .json file.' }
    }

    try {
      const stats = statSync(filePath)
      if (stats.size > USER_SETTINGS_MAX_BYTES) {
        return { canceled: false, ok: false, error: 'User settings file is too large.' }
      }
      return {
        canceled: false,
        ok: true,
        contents: readFileSync(filePath, 'utf8'),
        filePath,
      }
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'User settings file could not be opened.',
      }
    }
  })

  ipcMain.handle('open-user-settings-from-notebook-folder', async () => {
    const openResult = await dialog.showOpenDialog({
      title: 'Import user settings from notebook folder',
      properties: ['openDirectory'],
    })

    if (openResult.canceled || !openResult.filePaths?.[0]) return { canceled: true }

    const folderPath = openResult.filePaths[0]
    const filePath = path.join(folderPath, 'settings', 'app-settings.json')
    if (!existsSync(filePath)) {
      return { canceled: false, ok: false, error: 'Notebook folder does not contain settings/app-settings.json.' }
    }

    try {
      const stats = statSync(filePath)
      if (stats.size > USER_SETTINGS_MAX_BYTES) {
        return { canceled: false, ok: false, error: 'User settings file is too large.' }
      }
      const contents = readFileSync(filePath, 'utf8')
      if (!parseStrictPortableAppSettingsJson(contents).ok) {
        return { canceled: false, ok: false, error: 'User settings file does not match app-settings.json structure.' }
      }
      return {
        canceled: false,
        ok: true,
        contents,
        filePath,
      }
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'User settings file could not be opened.',
      }
    }
  })
}
