import type {
  AppState,
  FrontmatterData,
  NoteAisleBody,
  NoteBody,
  NoteNavigationTarget,
  NotebookFolder,
  NotebookTreeItem,
} from '../types/app'
import { splitMarkdownFrontmatter } from '../frontmatter/frontmatter'
import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'
import { buildAssetUrl, MARKDOWN_LINK_PATTERN } from '../markdown/image-asset-refs.js'
import { importBlobAsAssetUrl } from '../markdown/image-asset-registry'
import {
  buildInternalNoteLinkToken,
  buildPreviewToken,
  parseWikiReferenceToken,
  WIKI_NOTE_REFERENCE_RE,
} from '../notes/note-references'
import { parseSavedState } from '../state/app-state'
import { collectNotebookIds, insertNotebookItem, openNotebookTemporaryTab } from '../state/notebook'
import { createRandomId, createReservedIdAllocator, type IdGenerator } from '../state/navigation-ids'
import { migrateAisleTags } from '../tags/tags.js'

export type MarkdownImportFile = {
  relativePath: string
  markdown: string
  size?: number
}

export type MarkdownImportAssetRoot = {
  id: string
  name?: string
  sourceBasePath?: string
}

export type MarkdownImportAssetPayload = {
  assetRootId?: string
  relativePath: string
  bytes: ArrayBuffer
  fileName?: string
  name?: string
  mimeType?: string
  extension?: string
}

export type MarkdownImportReadAssetRequest = {
  assetRootId?: string
  relativePath: string
}

export type MarkdownImportReadAssetResult =
  | {
      ok: true
      bytes: ArrayBuffer
      fileName?: string
      name?: string
      mimeType?: string
      extension?: string
      relativePath?: string
    }
  | {
      ok: false
      error: string
    }

export type MarkdownImportSummary = {
  folders: number
  notes: number
  noteBodies: number
  importedAssets: number
  unresolvedReferences: number
  missingAssets: number
  warnings: string[]
}

export type BuildMarkdownImportStateOptions = {
  idGenerator?: IdGenerator
  now?: () => string
}

export type ImportMarkdownNotebookOptions = BuildMarkdownImportStateOptions & {
  rootName?: string
  assetRoots?: MarkdownImportAssetRoot[]
  assets?: MarkdownImportAssetPayload[]
  readAsset?: (request: MarkdownImportReadAssetRequest) => Promise<MarkdownImportReadAssetResult>
  importAsset?: (asset: MarkdownImportAssetPayload) => Promise<string | null>
}

export type MarkdownImportResult = {
  state: AppState
  summary: MarkdownImportSummary
}

export type MarkdownImportMergeResult = MarkdownImportResult & {
  rootFolderId: string
  activeNoteId: string
}

type MutableNotebookFolder = NotebookFolder

type ImportedNoteSource = {
  noteId: string
  title: string
  relativePath: string
  pathWithoutExtension: string
  aisleId: string
  aisleBodyId: string
  markdown: string
}

type BuildStateResult = MarkdownImportResult & {
  sources: ImportedNoteSource[]
}

type BuildBundleResult = {
  rootItems: NotebookTreeItem[]
  noteBodies: NoteBody[]
  noteAisleBodies: NoteAisleBody[]
  sources: ImportedNoteSource[]
  summary: MarkdownImportSummary
  activeNoteId: string
}

type NoteLookup = Map<string, ImportedNoteSource | null>

const MARKDOWN_EXTENSION_RE = /\.(?:md|markdown)$/i
const WIKI_TARGET_RE = /(!?)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g
const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp'])
const ASSET_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  'aac',
  'flac',
  'm4a',
  'm4v',
  'mov',
  'mp3',
  'mp4',
  'oga',
  'ogg',
  'opus',
  'pdf',
  'wav',
  'webm',
])
const ASSET_SEARCH_FOLDERS = ['assets', 'Z-Assets', 'Z-Note-Assets']
const DEFAULT_ASSET_ROOT_ID = 'source'
const WARNING_LIMIT = 20

function normalizeImportPath(value: string): string {
  const source = String(value ?? '').replace(/\\/g, '/').trim()
  const parts: string[] = []
  source.split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') {
      parts.pop()
      return
    }
    parts.push(part)
  })
  return parts.join('/')
}

function normalizeLookupKey(value: string): string {
  return normalizeImportPath(value)
    .replace(MARKDOWN_EXTENSION_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(MARKDOWN_EXTENSION_RE, '')
}

function getPathParts(relativePath: string): string[] {
  return normalizeImportPath(relativePath).split('/').filter(Boolean)
}

function getDirectoryPath(relativePath: string): string {
  const parts = getPathParts(relativePath)
  parts.pop()
  return parts.join('/')
}

function getBaseName(relativePath: string): string {
  return getPathParts(relativePath).at(-1) ?? ''
}

function joinPath(...parts: Array<string | undefined>): string {
  return normalizeImportPath(parts.filter(Boolean).join('/'))
}

function resolvePath(basePath: string, targetPath: string): string {
  const normalizedTarget = String(targetPath ?? '').replace(/\\/g, '/').trim()
  if (normalizedTarget.startsWith('/')) return normalizeImportPath(normalizedTarget)
  return joinPath(basePath, normalizedTarget)
}

function getExtension(value: string): string {
  const clean = stripUrlFragment(String(value ?? '').split('?')[0] ?? '')
  const match = clean.match(/\.([A-Za-z0-9]+)$/)
  return match?.[1]?.toLocaleLowerCase() ?? ''
}

function stripUrlFragment(value: string): string {
  const hashIndex = value.indexOf('#')
  return hashIndex >= 0 ? value.slice(0, hashIndex) : value
}

function isExternalDestination(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(String(value ?? '').trim())
}

function normalizeMarkdownDestination(value: string): string {
  let destination = String(value ?? '').trim()
  if (destination.startsWith('<') && destination.endsWith('>')) {
    destination = destination.slice(1, -1).replace(/\\>/g, '>').trim()
  }
  try {
    return decodeURIComponent(destination)
  } catch {
    return destination
  }
}

function cloneFrontmatter(frontmatter: FrontmatterData | null): FrontmatterData | null {
  return frontmatter && typeof frontmatter === 'object' ? { ...frontmatter } : frontmatter
}

function createImportedAisleBody({
  id,
  markdown,
  timestamp,
}: {
  id: string
  markdown: string
  timestamp: string
}): NoteAisleBody {
  const split = splitMarkdownFrontmatter(markdown)
  if (split.status === 'invalid') {
    return {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown: split.markdown,
      tags: [],
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterRaw: split.rawFrontmatter ?? undefined,
      frontmatterParseError: split.error,
    }
  }

  const migrated = migrateAisleTags({
    markdown: split.markdown,
    frontmatter: cloneFrontmatter(split.frontmatter),
    frontmatterMeta: undefined,
  })
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: migrated.markdown,
    tags: migrated.tags,
    frontmatter: migrated.frontmatter,
    frontmatterStatus: split.status,
    frontmatterMeta: migrated.frontmatterMeta,
  }
}

function addWarning(summary: MarkdownImportSummary, warning: string) {
  if (summary.warnings.length >= WARNING_LIMIT || summary.warnings.includes(warning)) return
  summary.warnings.push(warning)
}

function addLookupKey(lookup: NoteLookup, key: string, source: ImportedNoteSource) {
  const normalized = normalizeLookupKey(key)
  if (!normalized) return
  if (!lookup.has(normalized)) {
    lookup.set(normalized, source)
    return
  }
  if (lookup.get(normalized) !== source) lookup.set(normalized, null)
}

function buildNoteLookup(sources: ImportedNoteSource[]): NoteLookup {
  const lookup: NoteLookup = new Map()
  sources.forEach((source) => {
    addLookupKey(lookup, source.title, source)
    addLookupKey(lookup, source.relativePath, source)
    addLookupKey(lookup, source.pathWithoutExtension, source)
    addLookupKey(lookup, getBaseName(source.relativePath), source)
  })
  return lookup
}

function resolveImportedNote(
  lookup: NoteLookup,
  noteHandle: string,
  source: ImportedNoteSource,
): ImportedNoteSource | null | undefined {
  const normalizedHandle = normalizeImportPath(stripMarkdownExtension(noteHandle))
  const sourceDirectory = getDirectoryPath(source.relativePath)
  const candidates = [
    normalizedHandle,
    stripMarkdownExtension(resolvePath(sourceDirectory, noteHandle)),
    stripMarkdownExtension(getBaseName(noteHandle)),
  ]
  for (const candidate of candidates) {
    const found = lookup.get(normalizeLookupKey(candidate))
    if (found !== undefined) return found
  }
  return undefined
}

function getHeadingTarget(source: ImportedNoteSource, suffixHandle: string): NoteNavigationTarget {
  const suffix = suffixHandle.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  if (!suffix) return { noteId: source.noteId }
  const heading = getHeadingOutlineFromMarkdown(source.aisleId, source.markdown).find(
    (candidate) => candidate.text.replace(/\s+/g, ' ').trim().toLocaleLowerCase() === suffix,
  )
  return heading
    ? { noteId: source.noteId, heading: { aisleId: heading.aisleId, headingKey: heading.key } }
    : { noteId: source.noteId }
}

function rewriteWikiNoteReferences(
  markdown: string,
  state: AppState,
  source: ImportedNoteSource,
  lookup: NoteLookup,
  summary: MarkdownImportSummary,
): string {
  return String(markdown ?? '').replace(WIKI_NOTE_REFERENCE_RE, (token) => {
    const parsed = parseWikiReferenceToken(token)
    if (!parsed) return token
    if (ASSET_EXTENSIONS.has(getExtension(parsed.noteHandle))) return token
    const target = resolveImportedNote(lookup, parsed.noteHandle, source)
    if (target === undefined) {
      summary.unresolvedReferences += 1
      return token
    }
    if (target === null) {
      summary.unresolvedReferences += 1
      addWarning(summary, `Ambiguous note reference: ${parsed.noteHandle}`)
      return token
    }

    const navigationTarget = getHeadingTarget(target, parsed.suffixHandle)
    if (parsed.embed) {
      return buildPreviewToken(state, {
        id: `markdown-import:${source.noteId}:${target.noteId}:${parsed.suffixHandle || 'note'}`,
        target: { noteId: target.noteId },
        ...(navigationTarget.heading ? { heading: navigationTarget.heading } : {}),
      }) || token
    }
    return buildInternalNoteLinkToken(state, navigationTarget, parsed.alias) || token
  })
}

function getAssetRoots(options: ImportMarkdownNotebookOptions): MarkdownImportAssetRoot[] {
  const roots = options.assetRoots?.filter((root) => root.id.trim()) ?? []
  return roots.length > 0 ? roots : [{ id: DEFAULT_ASSET_ROOT_ID, name: 'source', sourceBasePath: '' }]
}

function getAssetMap(assets: MarkdownImportAssetPayload[] | undefined): Map<string, MarkdownImportAssetPayload> {
  const map = new Map<string, MarkdownImportAssetPayload>()
  assets?.forEach((asset) => {
    const rootId = asset.assetRootId || DEFAULT_ASSET_ROOT_ID
    const relativePath = normalizeImportPath(asset.relativePath)
    if (relativePath) map.set(`${rootId}\0${relativePath.toLocaleLowerCase()}`, asset)
  })
  return map
}

function getAssetLabel(relativePath: string): string {
  return getBaseName(stripUrlFragment(relativePath)) || 'asset'
}

function getAssetMarkdown(label: string, assetUrl: string, image: boolean): string {
  const escapedLabel = label.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
  return image ? `![${escapedLabel}](${assetUrl})` : `[${escapedLabel}](${assetUrl})`
}

function getAssetCandidatePaths(target: string, source: ImportedNoteSource, root: MarkdownImportAssetRoot): string[] {
  const rawTarget = String(stripUrlFragment(target) ?? '').replace(/\\/g, '/').trim()
  const cleanTarget = normalizeImportPath(rawTarget)
  if (!cleanTarget) return []
  const sourceDirectory = getDirectoryPath(source.relativePath)
  const sourceBasePath = normalizeImportPath(root.sourceBasePath ?? '')
  const sourceBaseDirectory = joinPath(sourceBasePath, sourceDirectory)
  const basename = getBaseName(cleanTarget)
  const candidates = new Set<string>()
  const hasExplicitPath = rawTarget.includes('/') || rawTarget.startsWith('.')

  candidates.add(resolvePath(sourceBaseDirectory, rawTarget))
  candidates.add(cleanTarget)
  if (!hasExplicitPath && basename) {
    ASSET_SEARCH_FOLDERS.forEach((folder) => candidates.add(joinPath(folder, basename)))
    if (sourceBasePath) ASSET_SEARCH_FOLDERS.forEach((folder) => candidates.add(joinPath(sourceBasePath, folder, basename)))
  }
  return Array.from(candidates).filter(Boolean)
}

async function defaultImportAsset(asset: MarkdownImportAssetPayload): Promise<string | null> {
  const fileName = asset.fileName || asset.name || getAssetLabel(asset.relativePath)
  const blob = new Blob([asset.bytes], { type: asset.mimeType || 'application/octet-stream' })
  return importBlobAsAssetUrl(blob, fileName)
}

async function resolveAssetUrl(
  target: string,
  source: ImportedNoteSource,
  context: {
    roots: MarkdownImportAssetRoot[]
    assets: Map<string, MarkdownImportAssetPayload>
    readAsset?: ImportMarkdownNotebookOptions['readAsset']
    importAsset: (asset: MarkdownImportAssetPayload) => Promise<string | null>
    importedAssetUrls: Map<string, string>
    summary: MarkdownImportSummary
  },
): Promise<string | null> {
  for (const root of context.roots) {
    for (const relativePath of getAssetCandidatePaths(target, source, root)) {
      const cacheKey = `${root.id}\0${relativePath.toLocaleLowerCase()}`
      const cached = context.importedAssetUrls.get(cacheKey)
      if (cached) return cached

      const memoryAsset = context.assets.get(cacheKey)
      if (memoryAsset) {
        const imported = await context.importAsset({ ...memoryAsset, assetRootId: root.id, relativePath })
        if (imported) {
          context.importedAssetUrls.set(cacheKey, imported)
          context.summary.importedAssets += 1
          return imported
        }
      }

      if (context.readAsset) {
        const read = await context.readAsset({ assetRootId: root.id, relativePath })
        if (read.ok) {
          const imported = await context.importAsset({
            ...read,
            assetRootId: root.id,
            relativePath: read.relativePath || relativePath,
          })
          if (imported) {
            context.importedAssetUrls.set(cacheKey, imported)
            context.summary.importedAssets += 1
            return imported
          }
        }
      }
    }
  }
  context.summary.missingAssets += 1
  addWarning(context.summary, `Missing asset: ${target}`)
  return null
}

async function rewriteMarkdownLinks(
  markdown: string,
  state: AppState,
  source: ImportedNoteSource,
  lookup: NoteLookup,
  context: {
    roots: MarkdownImportAssetRoot[]
    assets: Map<string, MarkdownImportAssetPayload>
    readAsset?: ImportMarkdownNotebookOptions['readAsset']
    importAsset: (asset: MarkdownImportAssetPayload) => Promise<string | null>
    importedAssetUrls: Map<string, string>
    summary: MarkdownImportSummary
  },
): Promise<string> {
  const pieces: string[] = []
  let cursor = 0
  for (const match of String(markdown ?? '').matchAll(MARKDOWN_LINK_PATTERN)) {
    const index = match.index ?? 0
    const token = match[0]
    const image = match[1] === '!'
    const label = match[2] ?? ''
    const destination = normalizeMarkdownDestination(match[3] ?? '')
    pieces.push(markdown.slice(cursor, index))
    cursor = index + token.length

    if (isExternalDestination(destination)) {
      pieces.push(token)
      continue
    }

    if (MARKDOWN_EXTENSION_RE.test(stripUrlFragment(destination))) {
      const target = resolveImportedNote(lookup, destination, source)
      if (target) {
        pieces.push(buildInternalNoteLinkToken(state, { noteId: target.noteId }, label) || token)
        continue
      }
      if (target === null) addWarning(context.summary, `Ambiguous note reference: ${destination}`)
    }

    const extension = getExtension(destination)
    if (!ASSET_EXTENSIONS.has(extension)) {
      pieces.push(token)
      continue
    }

    const assetUrl = await resolveAssetUrl(destination, source, context)
    pieces.push(assetUrl ? getAssetMarkdown(label || getAssetLabel(destination), assetUrl, image || IMAGE_EXTENSIONS.has(extension)) : token)
  }
  pieces.push(markdown.slice(cursor))
  return pieces.join('')
}

async function rewriteWikiAssets(
  markdown: string,
  source: ImportedNoteSource,
  context: {
    roots: MarkdownImportAssetRoot[]
    assets: Map<string, MarkdownImportAssetPayload>
    readAsset?: ImportMarkdownNotebookOptions['readAsset']
    importAsset: (asset: MarkdownImportAssetPayload) => Promise<string | null>
    importedAssetUrls: Map<string, string>
    summary: MarkdownImportSummary
  },
): Promise<string> {
  const pieces: string[] = []
  let cursor = 0
  for (const match of String(markdown ?? '').matchAll(WIKI_TARGET_RE)) {
    const index = match.index ?? 0
    const token = match[0]
    const embed = match[1] === '!'
    const target = match[2] ?? ''
    const alias = match[3] ?? ''
    const extension = getExtension(target)
    pieces.push(markdown.slice(cursor, index))
    cursor = index + token.length
    if (!ASSET_EXTENSIONS.has(extension)) {
      pieces.push(token)
      continue
    }
    const assetUrl = await resolveAssetUrl(target, source, context)
    const label = alias || getAssetLabel(target)
    pieces.push(assetUrl ? getAssetMarkdown(label, assetUrl, embed && IMAGE_EXTENSIONS.has(extension)) : token)
  }
  pieces.push(markdown.slice(cursor))
  return pieces.join('')
}

function replaceAisleBodyMarkdown(state: AppState, aisleBodyId: string, markdown: string): AppState {
  return {
    ...state,
    noteAisleBodies: (state.noteAisleBodies ?? []).map((body) =>
      body.id === aisleBodyId ? { ...body, markdown } : body,
    ),
  }
}

function createMarkdownImportSummary(): MarkdownImportSummary {
  return {
    folders: 0,
    notes: 0,
    noteBodies: 0,
    importedAssets: 0,
    unresolvedReferences: 0,
    missingAssets: 0,
    warnings: [],
  }
}

function buildMarkdownImportBundle(
  files: MarkdownImportFile[],
  options: BuildMarkdownImportStateOptions = {},
): BuildBundleResult {
  const idGenerator = options.idGenerator ?? createRandomId
  const now = options.now ?? (() => new Date().toISOString())
  const rootItems: NotebookTreeItem[] = []
  const foldersByPath = new Map<string, MutableNotebookFolder>()
  const noteBodies: NoteBody[] = []
  const noteAisleBodies: NoteAisleBody[] = []
  const sources: ImportedNoteSource[] = []
  const summary = createMarkdownImportSummary()
  let activeNoteId = ''

  const getFolder = (parts: string[]): MutableNotebookFolder | null => {
    if (parts.length === 0) return null
    let parentItems = rootItems
    let folderPath = ''
    let folder: MutableNotebookFolder | null = null
    for (const part of parts) {
      folderPath = folderPath ? `${folderPath}/${part}` : part
      folder = foldersByPath.get(folderPath) ?? null
      if (!folder) {
        folder = {
          type: 'folder',
          id: idGenerator(),
          title: part,
          children: [],
        }
        foldersByPath.set(folderPath, folder)
        parentItems.push(folder)
        summary.folders += 1
      }
      parentItems = folder.children
    }
    return folder
  }

  files
    .map((file) => ({
      ...file,
      relativePath: normalizeImportPath(file.relativePath),
      parts: getPathParts(file.relativePath),
    }))
    .filter((file) => file.parts.length > 0 && MARKDOWN_EXTENSION_RE.test(file.parts.at(-1) ?? ''))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .forEach((file) => {
      const fileName = file.parts[file.parts.length - 1] ?? 'Untitled.md'
      const folder = getFolder(file.parts.slice(0, -1))
      const parentItems = folder ? folder.children : rootItems
      const timestamp = now()
      const noteId = idGenerator()
      const noteBodyId = idGenerator()
      const aisleId = idGenerator()
      const aisleBodyId = idGenerator()
      const aisleBody = createImportedAisleBody({ id: aisleBodyId, markdown: file.markdown, timestamp })
      const noteBody: NoteBody = {
        id: noteBodyId,
        createdAt: timestamp,
        updatedAt: timestamp,
        aisles: [{ id: aisleId, aisleBodyId }],
      }
      const title = stripMarkdownExtension(fileName)
      parentItems.push({
        type: 'note',
        id: noteId,
        title,
        noteBodyId,
      })
      activeNoteId ||= noteId
      noteBodies.push(noteBody)
      noteAisleBodies.push(aisleBody)
      sources.push({
        noteId,
        title,
        relativePath: file.relativePath,
        pathWithoutExtension: stripMarkdownExtension(file.relativePath),
        aisleId,
        aisleBodyId,
        markdown: aisleBody.markdown,
      })
      summary.notes += 1
      summary.noteBodies += 1
    })

  return {
    rootItems,
    noteBodies,
    noteAisleBodies,
    sources,
    summary,
    activeNoteId,
  }
}

export function buildMarkdownImportState(
  files: MarkdownImportFile[],
  options: BuildMarkdownImportStateOptions = {},
): BuildStateResult {
  const built = buildMarkdownImportBundle(files, options)
  const baseState = parseSavedState(null)
  const scratchpadBodyId = baseState.scratchpad?.noteBodyId
  const scratchpadBodies = scratchpadBodyId ? baseState.noteBodies.filter((body) => body.id === scratchpadBodyId) : []
  const scratchpadAisleBodyIds = new Set(
    scratchpadBodies.flatMap((body) => body.aisles.map((aisle) => aisle.aisleBodyId)),
  )
  const scratchpadAisleBodies = (baseState.noteAisleBodies ?? []).filter((body) => scratchpadAisleBodyIds.has(body.id))

  return {
    state: {
      ...baseState,
      notebook: {
        ...baseState.notebook,
        activeNoteId: built.activeNoteId,
        openTabs: built.activeNoteId ? [{ noteId: built.activeNoteId, status: 'temporary' }] : [],
        items: built.rootItems,
        deletedItems: [],
      },
      noteBodies: [...built.noteBodies, ...scratchpadBodies],
      noteAisleBodies: [...built.noteAisleBodies, ...scratchpadAisleBodies],
    },
    summary: built.summary,
    sources: built.sources,
  }
}

async function rewriteImportedMarkdownInState(
  state: AppState,
  sources: ImportedNoteSource[],
  summary: MarkdownImportSummary,
  options: ImportMarkdownNotebookOptions,
): Promise<AppState> {
  const lookup = buildNoteLookup(sources)
  const roots = getAssetRoots(options)
  const assets = getAssetMap(options.assets)
  const importAsset = options.importAsset ?? defaultImportAsset
  const importedAssetUrls = new Map<string, string>()
  let rewrittenState = state

  for (const source of sources) {
    const aisleBody = rewrittenState.noteAisleBodies?.find((body) => body.id === source.aisleBodyId)
    let markdown = aisleBody?.markdown ?? ''
    markdown = rewriteWikiNoteReferences(markdown, rewrittenState, source, lookup, summary)
    markdown = await rewriteWikiAssets(markdown, source, {
      roots,
      assets,
      readAsset: options.readAsset,
      importAsset,
      importedAssetUrls,
      summary,
    })
    markdown = await rewriteMarkdownLinks(markdown, rewrittenState, source, lookup, {
      roots,
      assets,
      readAsset: options.readAsset,
      importAsset,
      importedAssetUrls,
      summary,
    })
    rewrittenState = replaceAisleBodyMarkdown(rewrittenState, source.aisleBodyId, markdown)
  }

  return rewrittenState
}

function getMarkdownImportRootTitle(options: ImportMarkdownNotebookOptions): string {
  const sourceRoot = options.assetRoots?.find((root) => root.id === DEFAULT_ASSET_ROOT_ID) ?? options.assetRoots?.[0]
  const title = String(options.rootName ?? sourceRoot?.name ?? 'Markdown import').trim()
  return title || 'Markdown import'
}

export async function importMarkdownNotebook(
  files: MarkdownImportFile[],
  options: ImportMarkdownNotebookOptions = {},
): Promise<MarkdownImportResult> {
  const built = buildMarkdownImportState(files, options)
  const state = await rewriteImportedMarkdownInState(built.state, built.sources, built.summary, options)

  return {
    state,
    summary: built.summary,
  }
}

export async function importMarkdownIntoExistingNotebook(
  state: AppState,
  files: MarkdownImportFile[],
  options: ImportMarkdownNotebookOptions = {},
): Promise<MarkdownImportMergeResult> {
  const idGenerator = createReservedIdAllocator(collectNotebookIds(state), options.idGenerator ?? createRandomId)
  const rootFolderId = idGenerator()
  const built = buildMarkdownImportBundle(files, { ...options, idGenerator })
  const rootFolder: NotebookFolder = {
    type: 'folder',
    id: rootFolderId,
    title: getMarkdownImportRootTitle(options),
    children: built.rootItems,
  }
  built.summary.folders += 1

  let mergedState: AppState = {
    ...state,
    notebook: insertNotebookItem(state.notebook, rootFolder, null),
    noteBodies: [...state.noteBodies, ...built.noteBodies],
    noteAisleBodies: [...(state.noteAisleBodies ?? []), ...built.noteAisleBodies],
  }
  mergedState = await rewriteImportedMarkdownInState(mergedState, built.sources, built.summary, options)

  if (built.activeNoteId) {
    mergedState = {
      ...mergedState,
      notebook: openNotebookTemporaryTab(mergedState.notebook, built.activeNoteId),
    }
  }

  return {
    state: mergedState,
    summary: built.summary,
    rootFolderId,
    activeNoteId: built.activeNoteId,
  }
}

export function getMarkdownImportSummaryMessage(summary: MarkdownImportSummary): string {
  const warningCount = summary.warnings.length
  const warningText = warningCount > 0 ? ` ${warningCount} warning(s).` : ''
  const unresolvedText = summary.unresolvedReferences > 0
    ? ` ${summary.unresolvedReferences} unresolved reference(s).`
    : ''
  const missingAssetText = summary.missingAssets > 0 ? ` ${summary.missingAssets} missing asset(s).` : ''
  return `Imported ${summary.notes} note(s), ${summary.folders} folder(s), and ${summary.importedAssets} asset(s).${unresolvedText}${missingAssetText}${warningText}`
}

export function buildAssetUrlForImportedPath(relativePath: string): string {
  return buildAssetUrl(relativePath)
}
