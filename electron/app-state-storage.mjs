import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import YAML from 'yaml'
import { buildAssetUrl, normalizeImageAssetPath } from '../src/markdown/image-asset-refs.js'

export const SCHEMA_VERSION = 2
export const TABS_METADATA_DIR = '.tabs'
export const USER_SETTINGS_FILE_PATH = path.join('settings', 'app-settings.json')

const NOTEBOOK_INDEX_FILE = '.tabs/notebook-index.json'
const NAVIGATION_STATE_FILE = '.tabs/navigation-state.json'
const NOTE_REGISTRY_FILE = '.tabs/note-registry.json'
const TRASH_INDEX_FILE = '.tabs/trash-index.json'
const FRONTMATTER_SETTINGS_FILE = '.tabs/frontmatter-settings.json'
const EDITOR_STATE_FILE = '.tabs/editor-state.json'
const MESSAGES_FILE = '.tabs/messages.json'
const SYNC_STATE_FILE = '.tabs/sync-state.json'
const ASSETS_DIR = 'assets'
const MANIFEST_FILE = 'manifest.json'
const MARKDOWN_EXTENSION_RE = /\.md$/i
const VISIBLE_NAME_HASH_LENGTH = 8
const VISIBLE_NAME_HASH_MAX_LENGTH = 16
const VISIBLE_PATH_SEGMENT_MAX_LENGTH = 96
const VISIBLE_PATH_SEGMENT_MAX_BYTES = 180

const revisionByRoot = new Map()

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeTitle(value, fallback = 'Untitled') {
  const title = typeof value === 'string' ? value.trim() : ''
  return title || fallback
}

function normalizeId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizePosixPath(value) {
  const source = String(value ?? '').replace(/\\/g, '/').trim()
  if (!source || source.startsWith('/') || source.includes('\0')) return ''
  const parts = source.split('/').filter((part) => part && part !== '.')
  if (parts.some((part) => part === '..')) return ''
  return parts.join('/')
}

function storageIssue(code, severity, message, extra = {}) {
  return { code, severity, message, ...extra }
}

function ensureDir(directoryPath) {
  mkdirSync(directoryPath, { recursive: true })
}

function writeJson(rootPath, relativePath, value) {
  const absolutePath = path.join(rootPath, ...relativePath.split('/'))
  ensureDir(path.dirname(absolutePath))
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeText(rootPath, relativePath, value) {
  const absolutePath = path.join(rootPath, ...relativePath.split('/'))
  ensureDir(path.dirname(absolutePath))
  writeFileSync(absolutePath, String(value ?? ''), 'utf8')
}

function readJson(rootPath, relativePath) {
  const absolutePath = path.join(rootPath, ...relativePath.split('/'))
  return JSON.parse(readFileSync(absolutePath, 'utf8'))
}

function readText(rootPath, relativePath) {
  return readFileSync(path.join(rootPath, ...relativePath.split('/')), 'utf8')
}

function fileExists(rootPath, relativePath) {
  return existsSync(path.join(rootPath, ...relativePath.split('/')))
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function contentHash(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return createHash('sha256').update(value).digest('hex')
  }
  return createHash('sha256').update(String(value ?? '')).digest('hex')
}

function normalizeAssetExtension(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'svgxml') return 'svg'
  if (normalized === 'quicktime') return 'mov'
  if (normalized === 'mpeg' || normalized === 'xmpeg') return 'mp3'
  return normalized || 'bin'
}

function utf8ByteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8')
}

function splitGraphemes(value) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(value), (entry) => entry.segment)
  }
  return Array.from(value)
}

function trimPathSegmentEdges(value) {
  return String(value ?? '').replace(/^\.+|\.+$/g, '').trim()
}

function sanitizePathTitle(value, fallback) {
  const title = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
  const cleaned = trimPathSegmentEdges(title)
  return cleaned || trimPathSegmentEdges(fallback) || 'Untitled'
}

function truncateVisibleTitle(value, terminalSuffix) {
  const maxLength = Math.max(1, VISIBLE_PATH_SEGMENT_MAX_LENGTH - splitGraphemes(terminalSuffix).length)
  const maxBytes = Math.max(1, VISIBLE_PATH_SEGMENT_MAX_BYTES - utf8ByteLength(terminalSuffix))
  let nextValue = ''
  let nextLength = 0
  for (const grapheme of splitGraphemes(value)) {
    const candidate = `${nextValue}${grapheme}`
    if (nextLength + 1 > maxLength) break
    if (utf8ByteLength(candidate) > maxBytes) break
    nextValue = candidate
    nextLength += 1
  }
  return trimPathSegmentEdges(nextValue)
}

function getVisibleNameHash(id, length = VISIBLE_NAME_HASH_LENGTH) {
  const source = normalizeId(id) || String(id ?? '')
  return contentHash(source).slice(0, length)
}

function makeVisibleName(title, id, extension = '', options = {}) {
  const hashLength = Number.isInteger(options.hashLength)
    ? Math.max(VISIBLE_NAME_HASH_LENGTH, Math.min(options.hashLength, VISIBLE_NAME_HASH_MAX_LENGTH))
    : VISIBLE_NAME_HASH_LENGTH
  const collisionSuffix = typeof options.collisionSuffix === 'string' ? options.collisionSuffix : ''
  const terminalSuffix = `--${getVisibleNameHash(id, hashLength)}${collisionSuffix}${extension}`
  const cleanTitle = sanitizePathTitle(title, 'Untitled')
  const readableTitle = truncateVisibleTitle(cleanTitle, terminalSuffix) || truncateVisibleTitle('Untitled', terminalSuffix)
  return `${readableTitle}${terminalSuffix}`
}

function createVisibleNameAllocator() {
  const usedNames = new Set()
  return (title, id, extension = '') => {
    let hashLength = VISIBLE_NAME_HASH_LENGTH
    let collisionIndex = 0
    while (true) {
      const candidate = makeVisibleName(title, id, extension, {
        hashLength,
        collisionSuffix: collisionIndex > 0 ? `-${collisionIndex + 1}` : '',
      })
      const collisionKey = candidate.toLowerCase()
      if (!usedNames.has(collisionKey)) {
        usedNames.add(collisionKey)
        return candidate
      }
      if (hashLength < VISIBLE_NAME_HASH_MAX_LENGTH) {
        hashLength = Math.min(VISIBLE_NAME_HASH_MAX_LENGTH, hashLength + 2)
      } else {
        collisionIndex += 1
      }
    }
  }
}

function parseVisibleId(fileName) {
  const base = fileName.replace(MARKDOWN_EXTENSION_RE, '')
  const match = base.match(/--([A-Za-z0-9_-]+)$/)
  return match?.[1] ?? ''
}

function getHybridStorageRevision(rootPath) {
  return revisionByRoot.get(path.resolve(rootPath)) ?? 0
}

function bumpHybridStorageRevision(rootPath) {
  const resolved = path.resolve(rootPath)
  const revision = (revisionByRoot.get(resolved) ?? 0) + 1
  revisionByRoot.set(resolved, revision)
  return revision
}

export function measureSlowMainOperation(_name, operation) {
  return operation()
}

export function getHybridStorageRoot(profileRootPath) {
  return path.resolve(profileRootPath)
}

export function getUserSettingsFilePath(profileRootPath) {
  return path.join(profileRootPath, USER_SETTINGS_FILE_PATH)
}

export function createStorageFilesSnapshot(entries, metrics = null) {
  const normalized = [...entries].map(([relativePath, contents]) => {
    const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents ?? '')
    return {
      relativePath: String(relativePath).replace(/\\/g, '/'),
      size: buffer.byteLength,
      hash: contentHash(buffer),
    }
  })
  normalized.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  const fingerprint = contentHash(JSON.stringify(normalized))
  if (metrics?.counts) {
    metrics.counts.hashesComputed = (metrics.counts.hashesComputed ?? 0) + normalized.length
  }
  return {
    entries: normalized,
    fingerprint,
  }
}

export function createStorageFilesFingerprint(entries) {
  return createStorageFilesSnapshot(entries).fingerprint
}

function listStorageFileContents(rootPath, currentPath = rootPath, entries = []) {
  if (!existsSync(currentPath)) return entries
  for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== TABS_METADATA_DIR) continue
    const absolutePath = path.join(currentPath, entry.name)
    const relativePath = path.relative(rootPath, absolutePath)
    if (entry.isDirectory()) {
      listStorageFileContents(rootPath, absolutePath, entries)
      continue
    }
    if (!entry.isFile()) continue
    entries.push([relativePath, readFileSync(absolutePath)])
  }
  return entries
}

function buildManifest(notebookId = null, syncMetadata = null) {
  return {
    schemaVersion: SCHEMA_VERSION,
    notebookId,
    createdBy: 'tabs',
    files: {
      notebookIndex: NOTEBOOK_INDEX_FILE,
      navigationState: NAVIGATION_STATE_FILE,
      noteRegistry: NOTE_REGISTRY_FILE,
      trashIndex: TRASH_INDEX_FILE,
      frontmatterSettings: FRONTMATTER_SETTINGS_FILE,
      editorState: EDITOR_STATE_FILE,
      messages: MESSAGES_FILE,
      syncState: SYNC_STATE_FILE,
    },
    syncMetadata: syncMetadata ?? null,
  }
}

function getAisleBodyMap(appState) {
  return new Map(ensureArray(appState?.noteAisleBodies).map((body) => [body.id, body]))
}

function getNoteBodyMap(appState) {
  return new Map(ensureArray(appState?.noteBodies).map((body) => [body.id, body]))
}

function composeMarkdownFile(aisleBody) {
  const markdown = String(aisleBody?.markdown ?? '')
  if (!isRecord(aisleBody?.frontmatter) || Object.keys(aisleBody.frontmatter).length === 0) return markdown
  const yaml = YAML.stringify(aisleBody.frontmatter).trimEnd()
  return `---\n${yaml}\n---\n\n${markdown}`
}

function splitMarkdownFile(contents) {
  const markdown = String(contents ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!markdown.startsWith('---\n')) {
    return {
      markdown,
      frontmatter: null,
      frontmatterStatus: 'none',
      frontmatterRaw: undefined,
      frontmatterParseError: undefined,
    }
  }
  const closeMatch = markdown.slice(4).match(/\n---\s*(?:\n|$)/)
  if (!closeMatch || typeof closeMatch.index !== 'number') {
    return {
      markdown,
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterRaw: markdown,
      frontmatterParseError: 'Frontmatter block was not closed.',
    }
  }
  const frontmatterRaw = markdown.slice(4, closeMatch.index + 4)
  const bodyStart = 4 + closeMatch.index + closeMatch[0].length
  try {
    const parsed = YAML.parse(frontmatterRaw)
    return {
      markdown: markdown.slice(bodyStart),
      frontmatter: isRecord(parsed) ? parsed : {},
      frontmatterStatus: 'valid',
      frontmatterRaw,
      frontmatterParseError: undefined,
    }
  } catch (error) {
    return {
      markdown: markdown.slice(bodyStart),
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterRaw,
      frontmatterParseError: error instanceof Error ? error.message : 'Frontmatter could not be parsed.',
    }
  }
}

function buildNotebookIndexItems(items, appState, parentPath = '', noteFileRecords = []) {
  const noteBodies = getNoteBodyMap(appState)
  const allocateVisibleName = createVisibleNameAllocator()
  return ensureArray(items).flatMap((item) => {
    if (!isRecord(item)) return []
    const id = normalizeId(item.id)
    const title = normalizeTitle(item.title, item.type === 'folder' ? 'Untitled folder' : 'Untitled')
    if (!id) return []
    if (item.type === 'folder') {
      const folderName = allocateVisibleName(title, id)
      const folderPath = parentPath ? path.posix.join(parentPath, folderName) : folderName
      const children = buildNotebookIndexItems(item.children, appState, folderPath, noteFileRecords)
      return [{
        type: 'folder',
        id,
        title,
        path: folderPath,
        children,
      }]
    }
    if (item.type !== 'note') return []
    const noteBodyId = normalizeId(item.noteBodyId)
    if (!noteBodyId) return []
    const noteBody = noteBodies.get(noteBodyId)
    const aisles = ensureArray(noteBody?.aisles)
    if (aisles.length > 1) {
      const folderName = allocateVisibleName(title, id)
      const notePath = parentPath ? path.posix.join(parentPath, folderName) : folderName
      const allocateAisleFileName = createVisibleNameAllocator()
      const aisleFiles = aisles.map((aisle, index) => ({
        aisleId: aisle.id,
        aisleBodyId: aisle.aisleBodyId,
        file: path.posix.join(notePath, allocateAisleFileName(`aisle ${index + 1}`, aisle.id, '.md')),
      }))
      noteFileRecords.push({ noteId: id, noteBodyId, type: 'folder', path: notePath, aisleFiles })
      return [{
        type: 'note',
        id,
        title,
        noteBodyId,
        path: notePath,
        aisleFiles,
      }]
    }
    const fileName = allocateVisibleName(title, id, '.md')
    const file = parentPath ? path.posix.join(parentPath, fileName) : fileName
    const aisle = aisles[0] ?? { id: `${id}-aisle`, aisleBodyId: `${noteBodyId}-body` }
    noteFileRecords.push({
      noteId: id,
      noteBodyId,
      type: 'file',
      file,
      aisleFiles: [{
        aisleId: aisle.id,
        aisleBodyId: aisle.aisleBodyId,
        file,
      }],
    })
    return [{
      type: 'note',
      id,
      title,
      noteBodyId,
      file,
    }]
  })
}

function collectNotebookIndexNoteFiles(indexItems, entries = []) {
  for (const item of ensureArray(indexItems)) {
    if (!isRecord(item)) continue
    if (item.type === 'folder') {
      collectNotebookIndexNoteFiles(item.children, entries)
      continue
    }
    if (item.type !== 'note') continue
    const noteId = normalizeId(item.id)
    const noteBodyId = normalizeId(item.noteBodyId)
    if (!noteId || !noteBodyId) continue
    if (Array.isArray(item.aisleFiles)) {
      entries.push({
        noteId,
        noteBodyId,
        type: 'folder',
        path: normalizePosixPath(item.path),
        aisleFiles: item.aisleFiles.flatMap((aisle) => {
          if (!isRecord(aisle)) return []
          const aisleId = normalizeId(aisle.aisleId)
          const aisleBodyId = normalizeId(aisle.aisleBodyId)
          const file = normalizePosixPath(aisle.file)
          return aisleId && aisleBodyId && file ? [{ aisleId, aisleBodyId, file }] : []
        }),
      })
      continue
    }
    const file = normalizePosixPath(item.file)
    if (file) {
      entries.push({
        noteId,
        noteBodyId,
        type: 'file',
        file,
        aisleFiles: [{ aisleId: '', aisleBodyId: '', file }],
      })
    }
  }
  return entries
}

function buildNoteRegistry(appState, noteFileRecords) {
  const aisleBodyMap = getAisleBodyMap(appState)
  const filesByAisleBodyId = new Map()
  for (const noteRecord of noteFileRecords) {
    for (const aisleFile of noteRecord.aisleFiles) {
      const files = filesByAisleBodyId.get(aisleFile.aisleBodyId) ?? []
      files.push(aisleFile.file)
      filesByAisleBodyId.set(aisleFile.aisleBodyId, files)
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    noteBodies: ensureArray(appState?.noteBodies).map((body) => ({
      id: body.id,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      aisles: ensureArray(body.aisles).map((aisle) => ({
        id: aisle.id,
        aisleBodyId: aisle.aisleBodyId,
      })),
    })),
    noteAisleBodies: ensureArray(appState?.noteAisleBodies).map((aisleBody) => {
      const markdownFile = composeMarkdownFile(aisleBody)
      const files = filesByAisleBodyId.get(aisleBody.id) ?? []
      return {
        id: aisleBody.id,
        createdAt: aisleBody.createdAt,
        updatedAt: aisleBody.updatedAt,
        contentHash: contentHash(markdownFile),
        markdownHash: contentHash(aisleBody.markdown ?? ''),
        markdown: files.length === 0 ? String(aisleBody.markdown ?? '') : undefined,
        tags: ensureArray(aisleBody.tags),
        frontmatter: isRecord(aisleBody.frontmatter) ? aisleBody.frontmatter : null,
        frontmatterStatus: aisleBody.frontmatterStatus ?? 'none',
        frontmatterMeta: aisleBody.frontmatterMeta ?? undefined,
        file: files[0] ?? null,
        mirrors: files,
      }
    }),
  }
}

function writeVisibleNotebookFiles(rootPath, appState, noteFileRecords) {
  const aisleBodyMap = getAisleBodyMap(appState)
  const written = new Set()
  for (const noteRecord of noteFileRecords) {
    for (const aisleFile of noteRecord.aisleFiles) {
      const markdownFile = composeMarkdownFile(aisleBodyMap.get(aisleFile.aisleBodyId))
      writeText(rootPath, aisleFile.file, markdownFile)
      written.add(aisleFile.file)
    }
  }
  return written
}

function pruneGeneratedNotebookFiles(rootPath, expectedFiles) {
  const expected = new Set(expectedFiles)
  expected.add(MANIFEST_FILE)
  if (!existsSync(rootPath)) return { filesPruned: 0, directoriesPruned: 0 }
  let filesPruned = 0
  let directoriesPruned = 0

  function visit(directoryPath) {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      if (entry.name === TABS_METADATA_DIR || entry.name === ASSETS_DIR || entry.name === 'settings') continue
      const absolutePath = path.join(directoryPath, entry.name)
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/')
      if (entry.isDirectory()) {
        visit(absolutePath)
        try {
          if (readdirSync(absolutePath).length === 0) {
            rmSync(absolutePath, { recursive: true, force: true })
            directoriesPruned += 1
          }
        } catch {
          // Ignore pruning races.
        }
        continue
      }
      if (!entry.isFile() || !MARKDOWN_EXTENSION_RE.test(entry.name)) continue
      if (expected.has(relativePath)) continue
      rmSync(absolutePath, { force: true })
      filesPruned += 1
    }
  }

  visit(rootPath)
  return { filesPruned, directoriesPruned }
}

function buildEditorState(appState) {
  return {
    schemaVersion: SCHEMA_VERSION,
    theme: appState?.theme ?? 'dawn',
    scratchpad: appState?.scratchpad ?? null,
    hotkeys: appState?.hotkeys ?? null,
    ui: appState?.ui ?? null,
    toastHistory: appState?.toastHistory ?? [],
  }
}

function buildAppStateFromParts({ notebookIndex, navigationState, noteRegistry, trashIndex, frontmatterSettings, editorState, messages }) {
  const items = hydrateNotebookIndexItems(notebookIndex?.items)
  const noteFileRecords = collectNotebookIndexNoteFiles(notebookIndex?.items)
  const activeNoteId = normalizeId(navigationState?.activeNoteId) || getFirstNoteId(items)
  const registryBodies = hydrateRegistryNoteBodies(noteRegistry)
  const registryAisleBodies = hydrateRegistryAisleBodies(noteRegistry)
  const { items: resolvedItems, noteBodies, noteAisleBodies, messages: conflictMessages } = resolveLinkedMirrorContents({
    items,
    noteBodies: registryBodies,
    noteAisleBodies: registryAisleBodies,
    noteFileRecords,
  })
  const ui = isRecord(editorState?.ui) ? editorState.ui : {}
  return {
    theme: typeof editorState?.theme === 'string' ? editorState.theme : 'dawn',
    notebook: {
      activeNoteId,
      items: resolvedItems,
      deletedItems: ensureArray(trashIndex?.deletedItems),
      settings: {
        autoRemoveDeletedDays: Number.isFinite(notebookIndex?.settings?.autoRemoveDeletedDays)
          ? notebookIndex.settings.autoRemoveDeletedDays
          : 30,
      },
    },
    scratchpad: isRecord(editorState?.scratchpad) ? editorState.scratchpad : undefined,
    messages: [...ensureArray(messages?.messages), ...conflictMessages],
    toastHistory: ensureArray(editorState?.toastHistory),
    noteBodies,
    noteAisleBodies,
    hotkeys: isRecord(editorState?.hotkeys)
      ? editorState.hotkeys
      : {
          shortcuts: {
            toggleNotesTrash: 'mod+shift+backspace',
            toggleNotesScratchpad: 'mod+shift+s',
            toggleNotesFilter: 'mod+shift+f',
            newNote: 'mod+n',
            newFolder: 'mod+shift+n',
            formatStrikethrough: 'mod+shift+x',
            cycleAislePrev: 'mod+alt+arrowleft',
            cycleAisleNext: 'mod+alt+arrowright',
          },
          newlineShortcuts: {
            shortcuts: {
              controlEnter: 'normalNewLine',
              shiftEnter: 'normalNewLine',
              commandEnter: 'operationsMenu',
            },
            menuOperations: [],
          },
        },
    frontmatter: isRecord(frontmatterSettings?.frontmatter)
      ? frontmatterSettings.frontmatter
      : {
          templates: [],
          settingsTemplateId: '',
          lastAppliedTemplateId: '',
        },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
      ...ui,
    },
  }
}

function hydrateNotebookIndexItems(rawItems) {
  return ensureArray(rawItems).flatMap((item) => {
    if (!isRecord(item)) return []
    const id = normalizeId(item.id)
    const title = normalizeTitle(item.title, item.type === 'folder' ? 'Untitled folder' : 'Untitled')
    if (!id) return []
    if (item.type === 'folder') {
      return [{
        type: 'folder',
        id,
        title,
        children: hydrateNotebookIndexItems(item.children),
      }]
    }
    if (item.type === 'note') {
      const noteBodyId = normalizeId(item.noteBodyId)
      return noteBodyId ? [{ type: 'note', id, title, noteBodyId }] : []
    }
    return []
  })
}

function hydrateRegistryNoteBodies(noteRegistry) {
  return ensureArray(noteRegistry?.noteBodies).flatMap((body) => {
    if (!isRecord(body)) return []
    const id = normalizeId(body.id)
    if (!id) return []
    const aisles = ensureArray(body.aisles).flatMap((aisle) => {
      if (!isRecord(aisle)) return []
      const aisleId = normalizeId(aisle.id)
      const aisleBodyId = normalizeId(aisle.aisleBodyId)
      return aisleId && aisleBodyId ? [{ id: aisleId, aisleBodyId }] : []
    })
    if (aisles.length === 0) return []
    return [{
      id,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      aisles,
    }]
  })
}

function hydrateRegistryAisleBodies(noteRegistry) {
  return ensureArray(noteRegistry?.noteAisleBodies).flatMap((body) => {
    if (!isRecord(body)) return []
    const id = normalizeId(body.id)
    if (!id) return []
    return [{
      id,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      markdown: '',
      tags: ensureArray(body.tags),
      frontmatter: isRecord(body.frontmatter) ? body.frontmatter : null,
      frontmatterStatus: body.frontmatterStatus ?? 'none',
      frontmatterMeta: body.frontmatterMeta,
      storage: {
        contentHash: body.contentHash,
        markdownHash: body.markdownHash,
        markdown: typeof body.markdown === 'string' ? body.markdown : '',
        mirrors: ensureArray(body.mirrors).map(normalizePosixPath).filter(Boolean),
        file: normalizePosixPath(body.file),
      },
    }]
  })
}

function getFirstNoteId(items) {
  for (const item of ensureArray(items)) {
    if (item?.type === 'note') return item.id
    if (item?.type === 'folder') {
      const child = getFirstNoteId(item.children)
      if (child) return child
    }
  }
  return ''
}

function readAisleFile(rootPath, file) {
  const normalizedFile = normalizePosixPath(file)
  if (!normalizedFile || !fileExists(rootPath, normalizedFile)) return null
  const parsed = splitMarkdownFile(readText(rootPath, normalizedFile))
  return {
    file: normalizedFile,
    mtimeMs: statSync(path.join(rootPath, ...normalizedFile.split('/'))).mtimeMs,
    ...parsed,
    fullHash: contentHash(readText(rootPath, normalizedFile)),
  }
}

function compareAisleMirrorSnapshotWinners(left, right) {
  const leftMtime = Number.isFinite(left.content?.mtimeMs) ? left.content.mtimeMs : Number.NEGATIVE_INFINITY
  const rightMtime = Number.isFinite(right.content?.mtimeMs) ? right.content.mtimeMs : Number.NEGATIVE_INFINITY
  if (leftMtime !== rightMtime) return rightMtime - leftMtime
  return String(left.content?.file ?? left.file ?? '').localeCompare(String(right.content?.file ?? right.file ?? ''))
}

function selectAisleMirrorSnapshot(snapshots, registryBody) {
  const expectedHash = registryBody?.storage?.contentHash ?? ''
  const readableSnapshots = snapshots.filter((snapshot) => snapshot.content)
  const changedSnapshots = readableSnapshots.filter((snapshot) => snapshot.content.fullHash !== expectedHash)
  if (changedSnapshots.length > 0) {
    return [...changedSnapshots].sort(compareAisleMirrorSnapshotWinners)[0]
  }
  return [...readableSnapshots].sort(compareAisleMirrorSnapshotWinners)[0] ?? null
}

function buildLoadedAisleBodyFromMirror(aisleBodyId, registryBody, mirrorSnapshot, timestamp) {
  const content = mirrorSnapshot?.content ?? null
  const changed = Boolean(content && content.fullHash !== (registryBody?.storage?.contentHash ?? ''))
  return {
    id: aisleBodyId,
    createdAt: registryBody?.createdAt,
    updatedAt: changed ? timestamp : registryBody?.updatedAt,
    markdown: content?.markdown ?? registryBody?.storage?.markdown ?? '',
    tags: registryBody?.tags ?? [],
    frontmatter: content ? content.frontmatter : registryBody?.frontmatter ?? null,
    frontmatterStatus: content ? content.frontmatterStatus : registryBody?.frontmatterStatus ?? 'none',
    frontmatterRaw: content?.frontmatterRaw,
    frontmatterParseError: content?.frontmatterParseError,
    frontmatterMeta: registryBody?.frontmatterMeta,
  }
}

function resolveLinkedMirrorContents({ items, noteBodies, noteAisleBodies, noteFileRecords }) {
  const noteBodyMap = new Map(noteBodies.map((body) => [body.id, body]))
  const registryAisleBodyMap = new Map(noteAisleBodies.map((body) => [body.id, body]))
  const snapshotsByAisleBodyId = new Map()

  for (const record of noteFileRecords) {
    const noteBody = noteBodyMap.get(record.noteBodyId)
    if (!noteBody) continue
    noteBody.aisles.forEach((aisle, index) => {
      const aisleFile = record.aisleFiles.find((candidate) => candidate.aisleBodyId === aisle.aisleBodyId) ?? record.aisleFiles[index]
      const fileContent = readAisleFile(resolveLinkedMirrorContents.rootPath, aisleFile?.file)
      const snapshots = snapshotsByAisleBodyId.get(aisle.aisleBodyId) ?? []
      snapshots.push({
        aisle,
        record,
        file: aisleFile?.file,
        content: fileContent,
      })
      snapshotsByAisleBodyId.set(aisle.aisleBodyId, snapshots)
    })
  }

  const timestamp = new Date().toISOString()
  const nextAisleBodyMap = new Map()
  for (const body of noteAisleBodies) {
    nextAisleBodyMap.set(body.id, buildLoadedAisleBodyFromMirror(body.id, body, null, timestamp))
  }
  for (const [aisleBodyId, snapshots] of snapshotsByAisleBodyId) {
    const registryBody = registryAisleBodyMap.get(aisleBodyId)
    nextAisleBodyMap.set(
      aisleBodyId,
      buildLoadedAisleBodyFromMirror(
        aisleBodyId,
        registryBody,
        selectAisleMirrorSnapshot(snapshots, registryBody),
        timestamp,
      ),
    )
  }

  return {
    items,
    noteBodies,
    noteAisleBodies: Array.from(nextAisleBodyMap.values()),
    messages: [],
  }
}

resolveLinkedMirrorContents.rootPath = ''

function createBlankLoadResult(rootPath) {
  return {
    ok: true,
    serializedState: null,
    source: 'empty',
    schemaVersion: null,
    revision: getHybridStorageRevision(rootPath),
    health: 'healthy',
    issues: [],
    storageFiles: createStorageFilesSnapshot([]),
    storageFingerprint: createStorageFilesFingerprint([]),
  }
}

export function loadAppState(profileRootPath, options = {}) {
  const result = loadAppStateResult(profileRootPath, options)
  return result.ok ? result.serializedState : null
}

export function loadAppStateResult(profileRootPath, options = {}) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  const manifestPath = path.join(rootPath, MANIFEST_FILE)
  if (!existsSync(manifestPath)) return createBlankLoadResult(rootPath)

  const issues = []
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest?.schemaVersion !== SCHEMA_VERSION) {
      return {
        ok: false,
        serializedState: null,
        source: 'hybrid',
        schemaVersion: manifest?.schemaVersion ?? null,
        revision: getHybridStorageRevision(rootPath),
        health: 'error',
        error: `Unsupported notebook schema version: ${manifest?.schemaVersion ?? 'unknown'}.`,
        issues: [storageIssue('unsupported-schema', 'error', 'This notebook uses an unsupported storage schema.')],
      }
    }
    const files = isRecord(manifest.files) ? manifest.files : {}
    const notebookIndex = readJson(rootPath, normalizePosixPath(files.notebookIndex) || NOTEBOOK_INDEX_FILE)
    const navigationState = readJson(rootPath, normalizePosixPath(files.navigationState) || NAVIGATION_STATE_FILE)
    const noteRegistry = readJson(rootPath, normalizePosixPath(files.noteRegistry) || NOTE_REGISTRY_FILE)
    const trashIndex = fileExists(rootPath, normalizePosixPath(files.trashIndex) || TRASH_INDEX_FILE)
      ? readJson(rootPath, normalizePosixPath(files.trashIndex) || TRASH_INDEX_FILE)
      : { deletedItems: [] }
    const frontmatterSettings = fileExists(rootPath, normalizePosixPath(files.frontmatterSettings) || FRONTMATTER_SETTINGS_FILE)
      ? readJson(rootPath, normalizePosixPath(files.frontmatterSettings) || FRONTMATTER_SETTINGS_FILE)
      : { frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' } }
    const editorState = fileExists(rootPath, normalizePosixPath(files.editorState) || EDITOR_STATE_FILE)
      ? readJson(rootPath, normalizePosixPath(files.editorState) || EDITOR_STATE_FILE)
      : {}
    const messages = fileExists(rootPath, normalizePosixPath(files.messages) || MESSAGES_FILE)
      ? readJson(rootPath, normalizePosixPath(files.messages) || MESSAGES_FILE)
      : { messages: [] }
    resolveLinkedMirrorContents.rootPath = rootPath
    const appState = buildAppStateFromParts({
      notebookIndex,
      navigationState,
      noteRegistry,
      trashIndex,
      frontmatterSettings,
      editorState,
      messages,
    })
    const serializedState = JSON.stringify(appState)
    const storageFiles = createStorageFilesSnapshot(listStorageFileContents(rootPath))
    return {
      ok: true,
      serializedState,
      source: 'hybrid',
      schemaVersion: SCHEMA_VERSION,
      revision: getHybridStorageRevision(rootPath),
      health: issues.length > 0 ? 'warning' : 'healthy',
      issues,
      storageFiles,
      storageFingerprint: storageFiles.fingerprint,
    }
  } catch (error) {
    return {
      ok: false,
      serializedState: null,
      source: 'hybrid',
      schemaVersion: null,
      revision: getHybridStorageRevision(rootPath),
      health: 'error',
      error: error instanceof Error ? error.message : 'Notebook data could not be loaded.',
      issues: [storageIssue('schema2-load-failed', 'error', 'Notebook data could not be loaded.')],
    }
  }
}

export function saveAppState(profileRootPath, serializedState, options = {}) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  const startedAt = Date.now()
  try {
    const appState = JSON.parse(serializedState)
    ensureDir(rootPath)
    const noteFileRecords = []
    const notebookItems = buildNotebookIndexItems(appState?.notebook?.items, appState, '', noteFileRecords)
    const notebookIndex = {
      schemaVersion: SCHEMA_VERSION,
      activeNoteId: appState?.notebook?.activeNoteId ?? '',
      items: notebookItems,
      settings: appState?.notebook?.settings ?? { autoRemoveDeletedDays: 30 },
    }
    const registry = buildNoteRegistry(appState, noteFileRecords)
    const writtenMarkdownFiles = writeVisibleNotebookFiles(rootPath, appState, noteFileRecords)
    const expectedFiles = new Set([
      MANIFEST_FILE,
      NOTEBOOK_INDEX_FILE,
      NAVIGATION_STATE_FILE,
      NOTE_REGISTRY_FILE,
      TRASH_INDEX_FILE,
      FRONTMATTER_SETTINGS_FILE,
      EDITOR_STATE_FILE,
      MESSAGES_FILE,
      SYNC_STATE_FILE,
      ...writtenMarkdownFiles,
    ])
    const pruneResult = pruneGeneratedNotebookFiles(rootPath, expectedFiles)
    writeJson(rootPath, MANIFEST_FILE, buildManifest(options.notebookId ?? appState?.notebookId ?? null, options.syncMetadata ?? null))
    writeJson(rootPath, NOTEBOOK_INDEX_FILE, notebookIndex)
    writeJson(rootPath, NAVIGATION_STATE_FILE, {
      schemaVersion: SCHEMA_VERSION,
      activeNoteId: appState?.notebook?.activeNoteId ?? '',
      viewMode: 'main',
    })
    writeJson(rootPath, NOTE_REGISTRY_FILE, registry)
    writeJson(rootPath, TRASH_INDEX_FILE, {
      schemaVersion: SCHEMA_VERSION,
      deletedItems: ensureArray(appState?.notebook?.deletedItems),
    })
    writeJson(rootPath, FRONTMATTER_SETTINGS_FILE, {
      schemaVersion: SCHEMA_VERSION,
      frontmatter: appState?.frontmatter ?? { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    })
    writeJson(rootPath, EDITOR_STATE_FILE, buildEditorState(appState))
    writeJson(rootPath, MESSAGES_FILE, {
      schemaVersion: SCHEMA_VERSION,
      messages: ensureArray(appState?.messages),
    })
    writeJson(rootPath, SYNC_STATE_FILE, {
      schemaVersion: SCHEMA_VERSION,
      syncMetadata: options.syncMetadata ?? null,
    })
    if (options.assetSourceRoot) {
      copyAssets(options.assetSourceRoot, rootPath)
    }
    if (options.userSettingsRoot) {
      writeAppSettingsForState(options.userSettingsRoot, serializedState)
    }
    const storageFiles = createStorageFilesSnapshot(listStorageFileContents(rootPath))
    const revision = bumpHybridStorageRevision(rootPath)
    return {
      ok: true,
      serializedState,
      revision,
      storageFiles,
      storageFingerprint: storageFiles.fingerprint,
      saveMetrics: {
        totalDurationMs: Date.now() - startedAt,
        phases: {
          parseState: 0,
          buildFileMap: 0,
          noteBodyTraversal: 0,
          noteContentGeneration: 0,
          assetReferenceExtraction: 0,
          manifestAssembly: 0,
          assetResolve: 0,
          fingerprint: 0,
          textWrites: 0,
          binaryWrites: 0,
          prune: 0,
          appSettingsWrite: 0,
        },
        counts: {
          generatedFiles: expectedFiles.size,
          generatedBytes: 0,
          textFiles: expectedFiles.size,
          jsonFiles: 8,
          mdFiles: writtenMarkdownFiles.size,
          binaryFiles: 0,
          existingAssetFiles: 0,
          assetsReferenced: 0,
          assetsReadFromDisk: 0,
          assetsReused: 0,
          assetBytesReferenced: 0,
          assetBytesReadFromDisk: 0,
          filesChanged: expectedFiles.size,
          filesSkipped: 0,
          filesPruned: pruneResult.filesPruned,
          directoriesPruned: pruneResult.directoriesPruned,
          aisleStorageCacheHits: 0,
          aisleStorageCacheMisses: writtenMarkdownFiles.size,
        },
      },
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'save-failed',
      error: error instanceof Error ? error.message : 'Notebook data could not be saved.',
      currentRevision: getHybridStorageRevision(rootPath),
      serializedState: null,
    }
  }
}

function copyAssets(sourceRoot, destinationRoot) {
  const sourceAssets = path.join(sourceRoot, ASSETS_DIR)
  if (!existsSync(sourceAssets)) return
  const destinationAssets = path.join(destinationRoot, ASSETS_DIR)
  copyAssetDirectory(sourceAssets, destinationAssets)
}

function copyAssetDirectory(sourceDirectory, destinationDirectory) {
  ensureDir(destinationDirectory)
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name)
    const destinationPath = path.join(destinationDirectory, entry.name)
    if (entry.isDirectory()) {
      copyAssetDirectory(sourcePath, destinationPath)
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath)
    }
  }
}

export function writeNotebookFolderExport(destinationRootPath, serializedState, options = {}) {
  const rootPath = getHybridStorageRoot(destinationRootPath)
  try {
    ensureDir(rootPath)
    const result = saveAppState(rootPath, serializedState, options)
    if (!result.ok) {
      return { canceled: false, ok: false, error: result.error ?? 'Notebook export failed.' }
    }
    return {
      canceled: false,
      ok: true,
      profileRootPath: rootPath,
      notebookPath: rootPath,
      notebookName: path.basename(rootPath),
    }
  } catch (error) {
    return {
      canceled: false,
      ok: false,
      error: error instanceof Error ? error.message : 'Notebook export failed.',
    }
  }
}

export async function importNotebookZipArchive(archivePath) {
  const tempRoot = path.join(os.tmpdir(), `tabs-import-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    const zip = await JSZip.loadAsync(readFileSync(archivePath))
    const files = Object.values(zip.files)
    for (const file of files) {
      if (file.dir) continue
      const relativePath = normalizePosixPath(file.name)
      if (!relativePath) {
        return {
          ok: false,
          error: 'Notebook ZIP contains an invalid path.',
          issues: [storageIssue('unexpected-archive-entry', 'error', 'Notebook ZIP contains an invalid path.')],
        }
      }
      const bytes = await file.async('nodebuffer')
      const absolutePath = path.join(tempRoot, ...relativePath.split('/'))
      ensureDir(path.dirname(absolutePath))
      writeFileSync(absolutePath, bytes)
    }
    if (!existsSync(path.join(tempRoot, MANIFEST_FILE))) {
      return {
        ok: false,
        error: 'Notebook ZIP does not contain manifest.json.',
        issues: [storageIssue('missing-root-manifest', 'error', 'Notebook ZIP does not contain manifest.json.')],
      }
    }
    const result = loadAppStateResult(tempRoot, { includeUserSettings: false })
    if (!result.ok) return result
    return {
      ok: true,
      serializedState: result.serializedState,
      schemaVersion: result.schemaVersion,
      health: result.health,
      issues: result.issues,
      assets: listNotebookImportAssetPayloads(tempRoot),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Notebook ZIP could not be imported.',
      issues: [storageIssue('zip-import-failed', 'error', 'Notebook ZIP could not be imported.')],
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

function listNotebookImportAssetPayloads(rootPath) {
  const assetsRoot = path.join(rootPath, ASSETS_DIR)
  if (!existsSync(assetsRoot)) return []
  const assets = []
  function visit(directoryPath) {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const absolutePath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/')
      assets.push({
        relativePath,
        bytes: toArrayBuffer(readFileSync(absolutePath)),
        fileName: entry.name,
        name: entry.name,
        mimeType: 'application/octet-stream',
        extension: path.extname(entry.name).slice(1),
      })
    }
  }
  visit(assetsRoot)
  return assets
}

export function writeImageAssetToProfile(profileRootPath, bytes, extension) {
  return writeAssetToProfile(profileRootPath, bytes, extension)
}

export function writeAssetToProfile(profileRootPath, bytes, extension) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  const ext = normalizeAssetExtension(extension)
  const buffer = Buffer.from(bytes)
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 16)
  const assetPath = normalizeImageAssetPath(path.posix.join(ASSETS_DIR, `asset-${hash}.${ext}`))
  const absolutePath = path.join(rootPath, ...assetPath.split('/'))
  ensureDir(path.dirname(absolutePath))
  writeFileSync(absolutePath, buffer)
  return {
    assetPath,
    url: buildAssetUrl(assetPath),
  }
}

export function writeAppSettingsForState(userSettingsRoot, serializedState) {
  const settingsPath = getUserSettingsFilePath(userSettingsRoot)
  ensureDir(path.dirname(settingsPath))
  let appState = {}
  try {
    appState = JSON.parse(serializedState)
  } catch {
    appState = {}
  }
  writeFileSync(
    settingsPath,
    `${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      theme: appState?.theme ?? 'dawn',
      hotkeys: appState?.hotkeys ?? null,
      frontmatter: appState?.frontmatter ?? null,
      ui: appState?.ui ?? null,
    }, null, 2)}\n`,
    'utf8',
  )
}

export function resolveNoteLocationRevealPath(profileRootPath, payload = {}) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  try {
    const manifest = readJson(rootPath, MANIFEST_FILE)
    if (manifest.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: 'Unsupported notebook schema.' }
    const notebookIndex = readJson(rootPath, NOTEBOOK_INDEX_FILE)
    if (payload?.type === 'scratchpad') {
      return { ok: true, absolutePath: rootPath, rootRelativePath: '' }
    }
    const noteId = normalizeId(payload?.location?.noteId)
    const note = findNotebookIndexNote(notebookIndex.items, noteId)
    if (!note) return { ok: false, error: 'Note file could not be resolved.' }
    const aisleId = normalizeId(payload?.aisleId)
    const aisleFile = aisleId && Array.isArray(note.aisleFiles)
      ? note.aisleFiles.find((candidate) => normalizeId(candidate?.aisleId) === aisleId)
      : null
    const relativePath = normalizePosixPath(aisleFile?.file || note.path || note.file)
    if (!relativePath) return { ok: false, error: 'Note file could not be resolved.' }
    const absolutePath = path.join(rootPath, ...relativePath.split('/'))
    return { ok: true, absolutePath, rootRelativePath: relativePath }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Note file could not be resolved.',
    }
  }
}

export function resolveNotebookItemLocationRevealPath(profileRootPath, payload = {}) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  try {
    const manifest = readJson(rootPath, MANIFEST_FILE)
    if (manifest.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: 'Unsupported notebook schema.' }
    const notebookIndex = readJson(rootPath, NOTEBOOK_INDEX_FILE)
    const itemId = normalizeId(payload?.itemId)
    const itemType = payload?.itemType === 'folder' ? 'folder' : payload?.itemType === 'note' ? 'note' : ''
    if (!itemId || !itemType) return { ok: false, error: 'Notebook item could not be resolved.' }
    const item = findNotebookIndexItem(notebookIndex.items, itemId)
    if (!item || item.type !== itemType) return { ok: false, error: 'Notebook item could not be resolved.' }
    const relativePath = normalizePosixPath(item.path || item.file)
    if (!relativePath) return { ok: false, error: 'Notebook item could not be resolved.' }
    const absolutePath = path.join(rootPath, ...relativePath.split('/'))
    return { ok: true, absolutePath, rootRelativePath: relativePath }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Notebook item could not be resolved.',
    }
  }
}

function findNotebookIndexNote(items, noteId) {
  const item = findNotebookIndexItem(items, noteId)
  return item?.type === 'note' ? item : null
}

function findNotebookIndexItem(items, itemId) {
  for (const item of ensureArray(items)) {
    if ((item?.type === 'note' || item?.type === 'folder') && item.id === itemId) return item
    if (item?.type === 'folder') {
      const child = findNotebookIndexItem(item.children, itemId)
      if (child) return child
    }
  }
  return null
}
