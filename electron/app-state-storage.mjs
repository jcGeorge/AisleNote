import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const LEGACY_APP_STATE_RELATIVE_PATH = path.join('data', 'notes', 'index.json')
const HYBRID_ROOT_DIR = 'notes-data'
const DEFAULT_TOPIC_ID = 'default-topic'
const DEFAULT_TOPIC_TITLE = 'Default'
const SCHEMA_VERSION = 1
const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const INTERNAL_INDENT_TOKEN = '\u2060\u2003\u2003'
const EXPORT_TAB_SPACES = '    '

function normalizeImageExtension(extRaw) {
  const normalized = String(extRaw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  return normalized || 'png'
}

function getExtensionFromMimeType(mimeType) {
  const raw = String(mimeType ?? '').toLowerCase()
  if (!raw.startsWith('image/')) return 'png'
  return normalizeImageExtension(raw.slice('image/'.length))
}

function getMimeTypeFromExtension(extension) {
  const ext = normalizeImageExtension(extension)
  if (ext === 'jpg') return 'image/jpeg'
  if (ext === 'svg') return 'image/svg+xml'
  return `image/${ext}`
}

function getMimeTypeFromFilePath(filePath) {
  const ext = path.extname(filePath).slice(1)
  return getMimeTypeFromExtension(ext)
}

function decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return null

  try {
    return {
      bytes: Buffer.from(match[2], 'base64'),
      extension: getExtensionFromMimeType(match[1]),
    }
  } catch {
    return null
  }
}

function buildImageDataUrl(bytes, sourceFilePath) {
  const mimeType = getMimeTypeFromFilePath(sourceFilePath)
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

function convertInternalTabsForExport(markdown) {
  return String(markdown ?? '')
    .replaceAll(INTERNAL_INDENT_TOKEN, EXPORT_TAB_SPACES)
    .replaceAll('\u2003\u2003', EXPORT_TAB_SPACES)
    .replaceAll('\u00A0', ' ')
}

function normalizeAppStateForExport(appState) {
  return {
    ...appState,
    spaces: ensureArray(appState?.spaces).map((space) => ({
      ...space,
      data: {
        ...space?.data,
        tabs: ensureArray(space?.data?.tabs).map((tab) => ({
          ...tab,
          homeContent: convertInternalTabsForExport(tab?.homeContent),
          subTabs: ensureArray(tab?.subTabs).map((subTab) => ({
            ...subTab,
            content: convertInternalTabsForExport(subTab?.content),
          })),
        })),
        deletedTabs: ensureArray(space?.data?.deletedTabs).map((entry) => ({
          ...entry,
          tab: {
            ...entry?.tab,
            homeContent: convertInternalTabsForExport(entry?.tab?.homeContent),
            subTabs: ensureArray(entry?.tab?.subTabs).map((subTab) => ({
              ...subTab,
              content: convertInternalTabsForExport(subTab?.content),
            })),
          },
        })),
        deletedSubTabs: ensureArray(space?.data?.deletedSubTabs).map((entry) => ({
          ...entry,
          subTab: {
            ...entry?.subTab,
            content: convertInternalTabsForExport(entry?.subTab?.content),
          },
        })),
      },
    })),
  }
}

function createAssetBank(assetRootRelative = 'assets') {
  return {
    assetRootRelative,
    files: new Map(),
    keys: new Map(),
  }
}

function listDirectoryEntries(directoryPath) {
  try {
    if (!existsSync(directoryPath)) return []
    return readdirSync(directoryPath, { withFileTypes: true })
  } catch {
    return []
  }
}

function listChildDirectories(directoryPath) {
  return listDirectoryEntries(directoryPath)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

function listMarkdownFiles(directoryPath) {
  return listDirectoryEntries(directoryPath)
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

function buildRecoveredTabsFromFilesystem(spaceRoot) {
  const notesRoot = path.join(spaceRoot, 'notes')
  return listChildDirectories(notesRoot).map((tabId) => {
    const homeNoteFile = path.posix.join('notes', tabId, 'home.md')
    const subTabsRoot = path.join(notesRoot, tabId, 'subtabs')
    const subTabs = listMarkdownFiles(subTabsRoot).map((fileName) => {
      const subTabId = path.basename(fileName, '.md')
      const file = path.posix.join('notes', tabId, 'subtabs', fileName)
      return {
        id: subTabId,
        title: subTabId,
        content: readMarkdownFile(spaceRoot, file),
      }
    })

    return {
      id: tabId,
      title: tabId,
      homeContent: readMarkdownFile(spaceRoot, homeNoteFile),
      activeSubTabId: null,
      subTabs,
    }
  })
}

function buildTrashDataFromManifestItems(trashItems, trashRoot) {
  const deletedTabs = ensureArray(trashItems)
    .filter((item) => item?.type === 'parent-tab')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
      tab: {
        id:
          typeof item?.original?.parentTabId === 'string'
            ? item.original.parentTabId
            : typeof item.id === 'string'
              ? item.id
              : '',
        title: typeof item.title === 'string' ? item.title : 'deleted tab',
        homeContent: typeof item.file === 'string' ? readMarkdownFile(trashRoot, item.file) : '',
        activeSubTabId: typeof item.activeSubTabId === 'string' ? item.activeSubTabId : null,
        subTabs: ensureArray(item.subTabs).map((subTabRecord) => ({
          id: typeof subTabRecord?.id === 'string' ? subTabRecord.id : '',
          title: typeof subTabRecord?.title === 'string' ? subTabRecord.title : 'tab',
          content: typeof subTabRecord?.file === 'string' ? readMarkdownFile(trashRoot, subTabRecord.file) : '',
        })),
      },
    }))
    .filter((entry) => entry.id && entry.tab.id)

  const deletedSubTabs = ensureArray(trashItems)
    .filter((item) => item?.type === 'subtab')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      parentTabId: typeof item?.original?.parentTabId === 'string' ? item.original.parentTabId : '',
      parentTabTitle: typeof item.parentTabTitle === 'string' ? item.parentTabTitle : 'Unknown Tab',
      deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
      subTab: {
        id: typeof item?.original?.subTabId === 'string' ? item.original.subTabId : typeof item.id === 'string' ? item.id : '',
        title: typeof item.title === 'string' ? item.title : 'deleted note',
        content: typeof item.file === 'string' ? readMarkdownFile(trashRoot, item.file) : '',
      },
    }))
    .filter((entry) => entry.id && entry.parentTabId && entry.subTab.id)

  return { deletedTabs, deletedSubTabs }
}

function readTrashData(spaceRoot, trashManifestFile) {
  const trashRoot = path.join(spaceRoot, 'trash')
  const trashManifestPath = trashManifestFile
    ? path.join(spaceRoot, trashManifestFile)
    : path.join(trashRoot, 'manifest.json')
  const trashManifest = readJsonFileIfExists(trashManifestPath)
  if (!trashManifest || typeof trashManifest !== 'object') {
    return { deletedTabs: [], deletedSubTabs: [] }
  }
  return buildTrashDataFromManifestItems(trashManifest.items, trashRoot)
}

function recoverSpaceFromFilesystem(spaceRoot, spaceId, spaceTitle) {
  const tabs = buildRecoveredTabsFromFilesystem(spaceRoot)
  if (tabs.length === 0) return null

  return {
    id: spaceId,
    name: spaceTitle,
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function addAssetToBank(assetBank, bytes, extension) {
  const ext = normalizeImageExtension(extension)
  const buffer = Buffer.from(bytes)
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 16)
  const key = `${hash}.${ext}`
  const existing = assetBank.keys.get(key)
  if (existing) return existing

  const relativeAssetPath = path.posix.join(assetBank.assetRootRelative, `asset-${hash}.${ext}`)
  assetBank.keys.set(key, relativeAssetPath)
  assetBank.files.set(relativeAssetPath, buffer)
  return relativeAssetPath
}

function writeAssetBank(baseDirectory, assetBank) {
  for (const [relativePath, bytes] of assetBank.files.entries()) {
    const absolutePath = path.join(baseDirectory, relativePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, bytes)
  }
}

function externalizeMarkdownImages(markdown, noteFileRelative, assetBank) {
  return String(markdown ?? '').replace(IMAGE_MARKDOWN_PATTERN, (fullMatch, altText, srcRaw) => {
    const src = String(srcRaw ?? '').trim()
    if (!src) return fullMatch

    let decoded = null

    if (src.startsWith('data:image/')) {
      decoded = decodeImageDataUrl(src)
    } else if (src.startsWith('file://')) {
      try {
        const absolutePath = fileURLToPath(src)
        if (existsSync(absolutePath)) {
          decoded = {
            bytes: readFileSync(absolutePath),
            extension: normalizeImageExtension(path.extname(absolutePath).slice(1)),
          }
        }
      } catch {
        decoded = null
      }
    }

    if (!decoded) return fullMatch

    const assetRelativePath = addAssetToBank(assetBank, decoded.bytes, decoded.extension)
    const noteDirectory = path.posix.dirname(noteFileRelative)
    const nextSrc = path.posix.relative(noteDirectory, assetRelativePath) || path.posix.basename(assetRelativePath)
    return `![${altText}](${nextSrc})`
  })
}

function inlineMarkdownImages(markdown, noteFilePath) {
  return String(markdown ?? '').replace(IMAGE_MARKDOWN_PATTERN, (fullMatch, altText, srcRaw) => {
    const src = String(srcRaw ?? '').trim()
    if (!src || src.startsWith('data:')) return fullMatch
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) && !src.startsWith('file://')) return fullMatch

    let absolutePath = null
    if (src.startsWith('file://')) {
      try {
        absolutePath = fileURLToPath(src)
      } catch {
        absolutePath = null
      }
    } else {
      absolutePath = path.resolve(path.dirname(noteFilePath), src)
    }

    if (!absolutePath || !existsSync(absolutePath)) return fullMatch

    try {
      const bytes = readFileSync(absolutePath)
      return `![${altText}](${buildImageDataUrl(bytes, absolutePath)})`
    } catch {
      return fullMatch
    }
  })
}

function getLegacyAppStatePath(userDataPath) {
  return path.join(userDataPath, LEGACY_APP_STATE_RELATIVE_PATH)
}

function getHybridStorageRoot(userDataPath) {
  return path.join(userDataPath, HYBRID_ROOT_DIR)
}

function readTextFileIfExists(filePath) {
  try {
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function readJsonFileIfExists(filePath) {
  const raw = readTextFileIfExists(filePath)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeTextFile(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents, 'utf8')
}

function writeJsonFile(filePath, value) {
  writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readMarkdownFile(baseDirectory, relativeFile) {
  const absolutePath = path.join(baseDirectory, relativeFile)
  const markdown = readTextFileIfExists(absolutePath) ?? ''
  return inlineMarkdownImages(markdown, absolutePath)
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function buildRootManifest(appState) {
  const activeSpace = ensureArray(appState.spaces).find((space) => space?.id === appState.activeSpaceId) ?? appState.spaces?.[0] ?? null
  const activeTab = activeSpace?.data?.tabs?.find((tab) => tab?.id === activeSpace?.data?.activeTabId) ?? activeSpace?.data?.tabs?.[0] ?? null

  return {
    schemaVersion: SCHEMA_VERSION,
    globalSettings: {
      theme: appState.theme === 'light' ? 'light' : 'dark',
      hotkeys: appState.hotkeys ?? {
        shortcuts: {},
        enableMouseBackForward: true,
        enableGenericHistoryHotkeys: true,
      },
    },
    topics: [{ id: DEFAULT_TOPIC_ID, title: DEFAULT_TOPIC_TITLE }],
    activeTopicId: DEFAULT_TOPIC_ID,
    lastOpened: activeSpace
      ? {
          topicId: DEFAULT_TOPIC_ID,
          spaceId: activeSpace.id,
          parentTabId: activeTab?.id ?? null,
          subTabId: activeTab?.activeSubTabId ?? null,
          viewMode: 'main',
        }
      : undefined,
  }
}

function buildTopicManifest(appState) {
  const spaces = ensureArray(appState.spaces)
  return {
    id: DEFAULT_TOPIC_ID,
    title: DEFAULT_TOPIC_TITLE,
    spaces: spaces.map((space) => ({
      id: typeof space?.id === 'string' ? space.id : '',
      title: typeof space?.name === 'string' ? space.name : 'Untitled Space',
    })),
    activeSpaceId:
      typeof appState.activeSpaceId === 'string' && spaces.some((space) => space?.id === appState.activeSpaceId)
        ? appState.activeSpaceId
        : spaces[0]?.id ?? '',
  }
}

function buildAndWriteSpace(tempRoot, space) {
  const posixPath = path.posix
  const spaceRoot = path.join(tempRoot, 'topics', DEFAULT_TOPIC_ID, 'spaces', space.id)
  const trashRoot = path.join(spaceRoot, 'trash')
  const tabs = ensureArray(space?.data?.tabs)
  const activeAssetBank = createAssetBank('assets')
  const trashAssetBank = createAssetBank('assets')

  mkdirSync(path.join(spaceRoot, 'assets'), { recursive: true })
  mkdirSync(path.join(trashRoot, 'assets'), { recursive: true })

  const spaceManifest = {
    id: space.id,
    title: typeof space.name === 'string' ? space.name : 'Untitled Space',
    settings: space.settings ?? { autoRemoveDeletedDays: 7 },
    tabs: tabs.map((tab) => {
      const homeNoteFile = posixPath.join('notes', tab.id, 'home.md')
      const homeMarkdown = externalizeMarkdownImages(tab.homeContent, homeNoteFile, activeAssetBank)
      writeTextFile(path.join(spaceRoot, homeNoteFile), homeMarkdown)

      const subTabs = ensureArray(tab.subTabs).map((subTab) => {
        const file = posixPath.join('notes', tab.id, 'subtabs', `${subTab.id}.md`)
        const markdown = externalizeMarkdownImages(subTab.content, file, activeAssetBank)
        writeTextFile(path.join(spaceRoot, file), markdown)
        return {
          id: subTab.id,
          title: typeof subTab.title === 'string' ? subTab.title : 'tab',
          file,
        }
      })

      return {
        id: tab.id,
        title: typeof tab.title === 'string' ? tab.title : 'tab',
        homeNoteFile,
        subTabs,
        activeSubTabId: typeof tab.activeSubTabId === 'string' ? tab.activeSubTabId : null,
      }
    }),
    activeTabId:
      typeof space?.data?.activeTabId === 'string' && tabs.some((tab) => tab?.id === space.data.activeTabId)
        ? space.data.activeTabId
        : tabs[0]?.id ?? '',
    trashManifestFile: 'trash/manifest.json',
  }

  const deletedTabs = ensureArray(space?.data?.deletedTabs)
  const deletedSubTabs = ensureArray(space?.data?.deletedSubTabs)
  const trashItems = []

  for (const entry of deletedTabs) {
    const deletedTab = entry?.tab ?? {}
    const homeNoteFile = posixPath.join('notes', entry.id, 'home.md')
    const deletedHomeMarkdown = externalizeMarkdownImages(deletedTab.homeContent, homeNoteFile, trashAssetBank)
    writeTextFile(path.join(trashRoot, homeNoteFile), deletedHomeMarkdown)

    const subTabs = ensureArray(deletedTab.subTabs).map((subTab) => {
      const file = posixPath.join('notes', entry.id, 'subtabs', `${subTab.id}.md`)
      const markdown = externalizeMarkdownImages(subTab.content, file, trashAssetBank)
      writeTextFile(path.join(trashRoot, file), markdown)
      return {
        id: subTab.id,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        file,
      }
    })

    trashItems.push({
      id: entry.id,
      type: 'parent-tab',
      title: typeof deletedTab.title === 'string' ? deletedTab.title : 'deleted tab',
      file: homeNoteFile,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      original: {
        topicId: DEFAULT_TOPIC_ID,
        spaceId: space.id,
        parentTabId: typeof deletedTab.id === 'string' ? deletedTab.id : entry.id,
        subTabId: null,
      },
      activeSubTabId: typeof deletedTab.activeSubTabId === 'string' ? deletedTab.activeSubTabId : null,
      subTabs,
    })
  }

  for (const entry of deletedSubTabs) {
    const file = posixPath.join('notes', `${entry.id}.md`)
    const markdown = externalizeMarkdownImages(entry?.subTab?.content, file, trashAssetBank)
    writeTextFile(path.join(trashRoot, file), markdown)
    trashItems.push({
      id: entry.id,
      type: 'subtab',
      title: typeof entry?.subTab?.title === 'string' ? entry.subTab.title : 'deleted note',
      file,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      parentTabTitle: typeof entry.parentTabTitle === 'string' ? entry.parentTabTitle : 'Unknown Tab',
      original: {
        topicId: DEFAULT_TOPIC_ID,
        spaceId: space.id,
        parentTabId: typeof entry.parentTabId === 'string' ? entry.parentTabId : '',
        subTabId: typeof entry?.subTab?.id === 'string' ? entry.subTab.id : null,
      },
    })
  }

  writeAssetBank(spaceRoot, activeAssetBank)
  writeAssetBank(trashRoot, trashAssetBank)
  writeJsonFile(path.join(spaceRoot, 'manifest.json'), spaceManifest)
  writeJsonFile(path.join(trashRoot, 'manifest.json'), { items: trashItems })
}

function writeHybridStorage(tempRoot, serializedState) {
  const parsedState = JSON.parse(serializedState)
  const rootManifest = buildRootManifest(parsedState)
  const topicManifest = buildTopicManifest(parsedState)

  mkdirSync(tempRoot, { recursive: true })
  writeJsonFile(path.join(tempRoot, 'manifest.json'), rootManifest)
  writeJsonFile(path.join(tempRoot, 'topics', DEFAULT_TOPIC_ID, 'manifest.json'), topicManifest)

  for (const space of ensureArray(parsedState.spaces)) {
    if (!space || typeof space.id !== 'string' || space.id.length === 0) continue
    buildAndWriteSpace(tempRoot, space)
  }
}

function addDirectoryToZip(zip, directoryPath, zipPrefix) {
  const entries = readdirSync(directoryPath, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name)
    const relativePath = zipPrefix ? path.posix.join(zipPrefix, entry.name) : entry.name
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, absolutePath, relativePath)
      continue
    }
    zip.file(relativePath, readFileSync(absolutePath))
  }
}

function readHybridSpace(spaceRoot, spaceId, spaceTitle) {
  const spaceManifest = readJsonFileIfExists(path.join(spaceRoot, 'manifest.json'))
  if (!spaceManifest || typeof spaceManifest !== 'object') {
    return recoverSpaceFromFilesystem(spaceRoot, spaceId, spaceTitle)
  }

  const manifestTabs = ensureArray(spaceManifest.tabs)
    .map((tabRecord) => ({
      id: typeof tabRecord?.id === 'string' ? tabRecord.id : '',
      title: typeof tabRecord?.title === 'string' ? tabRecord.title : 'tab',
      homeContent:
        typeof tabRecord?.homeNoteFile === 'string' ? readMarkdownFile(spaceRoot, tabRecord.homeNoteFile) : '',
      activeSubTabId: typeof tabRecord?.activeSubTabId === 'string' ? tabRecord.activeSubTabId : null,
      subTabs: ensureArray(tabRecord?.subTabs).map((subTabRecord) => ({
        id: typeof subTabRecord?.id === 'string' ? subTabRecord.id : '',
        title: typeof subTabRecord?.title === 'string' ? subTabRecord.title : 'tab',
        content: typeof subTabRecord?.file === 'string' ? readMarkdownFile(spaceRoot, subTabRecord.file) : '',
      })),
    }))
    .filter((tab) => tab.id)

  const recoveredTabs = buildRecoveredTabsFromFilesystem(spaceRoot)
  const tabs = manifestTabs.length > 0 ? manifestTabs : recoveredTabs
  const { deletedTabs, deletedSubTabs } = readTrashData(
    spaceRoot,
    typeof spaceManifest.trashManifestFile === 'string' ? spaceManifest.trashManifestFile : null,
  )

  return {
    id: typeof spaceManifest.id === 'string' ? spaceManifest.id : spaceId,
    name: typeof spaceManifest.title === 'string' ? spaceManifest.title : spaceTitle,
    settings:
      spaceManifest.settings && typeof spaceManifest.settings === 'object'
        ? spaceManifest.settings
        : { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId:
        typeof spaceManifest.activeTabId === 'string' && tabs.some((tab) => tab.id === spaceManifest.activeTabId)
          ? spaceManifest.activeTabId
          : tabs[0]?.id ?? '',
      tabs,
      deletedTabs,
      deletedSubTabs,
    },
  }
}

function isSupportedRootManifest(rootManifest) {
  return Boolean(
    rootManifest &&
      typeof rootManifest === 'object' &&
      typeof rootManifest.schemaVersion === 'number' &&
      rootManifest.schemaVersion === SCHEMA_VERSION,
  )
}

function readHybridAppStateFromRoot(rootPath) {
  const rootManifest = readJsonFileIfExists(path.join(rootPath, 'manifest.json'))
  if (!isSupportedRootManifest(rootManifest)) return null

  const topicsRoot = path.join(rootPath, 'topics')
  const topicIds = Array.from(
    new Set([
      typeof rootManifest.activeTopicId === 'string' ? rootManifest.activeTopicId : DEFAULT_TOPIC_ID,
      ...ensureArray(rootManifest.topics)
        .map((topic) => (typeof topic?.id === 'string' ? topic.id : ''))
        .filter(Boolean),
      ...listChildDirectories(topicsRoot),
    ]),
  )

  for (const topicId of topicIds) {
    const topicRoot = path.join(topicsRoot, topicId)
    const topicManifest = readJsonFileIfExists(path.join(topicRoot, 'manifest.json'))
    const manifestSpaceEntries =
      topicManifest && typeof topicManifest === 'object' ? ensureArray(topicManifest.spaces) : []
    const spaceIds = Array.from(
      new Set([
        ...manifestSpaceEntries
          .map((spaceEntry) => (typeof spaceEntry?.id === 'string' ? spaceEntry.id : ''))
          .filter(Boolean),
        ...listChildDirectories(path.join(topicRoot, 'spaces')),
      ]),
    )

    const spaces = spaceIds
      .map((spaceId) => {
        const spaceEntry = manifestSpaceEntries.find((entry) => entry?.id === spaceId)
        const fallbackTitle = typeof spaceEntry?.title === 'string' ? spaceEntry.title : 'Recovered Space'
        return readHybridSpace(path.join(topicRoot, 'spaces', spaceId), spaceId, fallbackTitle)
      })
      .filter(Boolean)

    if (spaces.length === 0) continue

    const activeSpaceIdFromRoot =
      typeof rootManifest?.lastOpened?.spaceId === 'string' ? rootManifest.lastOpened.spaceId : null
    const activeSpaceIdFromTopic =
      topicManifest && typeof topicManifest === 'object' && typeof topicManifest.activeSpaceId === 'string'
        ? topicManifest.activeSpaceId
        : null
    const activeSpaceId =
      (activeSpaceIdFromRoot && spaces.some((space) => space.id === activeSpaceIdFromRoot) && activeSpaceIdFromRoot) ||
      (activeSpaceIdFromTopic && spaces.some((space) => space.id === activeSpaceIdFromTopic) && activeSpaceIdFromTopic) ||
      spaces[0].id

    return JSON.stringify({
      theme: rootManifest?.globalSettings?.theme === 'light' ? 'light' : 'dark',
      activeSpaceId,
      spaces,
      hotkeys: rootManifest?.globalSettings?.hotkeys,
    })
  }

  return null
}

export function loadAppState(userDataPath) {
  const finalRoot = getHybridStorageRoot(userDataPath)
  const backupRoot = `${finalRoot}.bak`
  const hybridState = readHybridAppStateFromRoot(finalRoot)
  if (hybridState !== null) return hybridState
  const backupState = readHybridAppStateFromRoot(backupRoot)
  if (backupState !== null) return backupState
  return readTextFileIfExists(getLegacyAppStatePath(userDataPath))
}

export function saveAppState(userDataPath, serializedState) {
  const finalRoot = getHybridStorageRoot(userDataPath)
  const tempRoot = `${finalRoot}.tmp`
  const backupRoot = `${finalRoot}.bak`

  rmSync(tempRoot, { recursive: true, force: true })

  writeHybridStorage(tempRoot, serializedState)

  try {
    if (existsSync(finalRoot)) {
      rmSync(backupRoot, { recursive: true, force: true })
      renameSync(finalRoot, backupRoot)
    }
    renameSync(tempRoot, finalRoot)
  } catch (error) {
    if (!existsSync(finalRoot) && existsSync(backupRoot)) {
      renameSync(backupRoot, finalRoot)
    }
    throw error
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

export async function buildAppStateExportArchive(serializedState) {
  const tempParent = mkdtempSync(path.join(os.tmpdir(), 'tabs-export-'))
  const exportRoot = path.join(tempParent, HYBRID_ROOT_DIR)

  try {
    const parsedState = JSON.parse(serializedState)
    const exportState = normalizeAppStateForExport(parsedState)
    writeHybridStorage(exportRoot, JSON.stringify(exportState))
    const zip = new JSZip()
    addDirectoryToZip(zip, exportRoot, HYBRID_ROOT_DIR)
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  } finally {
    rmSync(tempParent, { recursive: true, force: true })
  }
}
