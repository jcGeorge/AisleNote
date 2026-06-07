import JSZip from 'jszip'
import { splitMarkdownFrontmatter } from '../frontmatter/frontmatter'
import { MARKDOWN_LINK_PATTERN } from '../markdown/image-asset-refs.js'
import { splitImageResizeMetadataFromUrl, normalizeImageResizeMetadataFragment } from '../markdown/image-metadata'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { getAisleBodyId } from '../notes/note-markdown'
import { buildInternalNoteLinkToken, buildPreviewToken, parseMarkdownNoteReferenceDestination } from '../notes/note-references'
import { createDomainFromSpaces, projectActiveDomainState } from '../state/domains'
import { createId, createNoteBodyContent, createSpace, createSubTab, createTab, createTimestamp } from '../state/workspace'
import type { IdGenerator } from '../state/navigation-ids'
import type { AppState, Domain, NoteAisleBody, NoteLocation, Space, Tab } from '../types/app'

export type MarkdownFolderImportFile = {
  relativePath: string
  markdown: string
  size?: number
}

export type MarkdownFolderImportPayload = {
  sourceId: string
  rootName?: string
  files: MarkdownFolderImportFile[]
}

export type MarkdownFolderImportAsset = {
  bytes: ArrayBuffer
  name?: string
  mimeType?: string
  extension?: string
}

export type MarkdownFolderImportSummary = {
  domainsCreated: number
  spacesCreated: number
  parentsCreated: number
  subtabsCreated: number
  notesImported: number
  assetsImported: number
  unresolvedReferences: number
  warnings: string[]
}

export type MarkdownFolderImportResult = {
  state: AppState
  summary: MarkdownFolderImportSummary
}

export type ParseMarkdownFolderZipResult =
  | {
      ok: true
      payload: MarkdownFolderImportPayload
      assets: Map<string, MarkdownFolderImportAsset>
      warnings: string[]
    }
  | {
      ok: false
      error: string
      warnings: string[]
    }

export type MarkdownFolderImportOptions = {
  createId?: IdGenerator
  readAsset?: (relativePath: string) => Promise<MarkdownFolderImportAsset | null> | MarkdownFolderImportAsset | null
  importAsset?: (asset: MarkdownFolderImportAsset) => Promise<string | null> | string | null
}

type MutableImportState = AppState & { domains: Domain[]; noteAisleBodies: NoteAisleBody[] }

type ParsedMarkdownImportFile = {
  sourceRelativePath: string
  markdown: string
  domainName: string
  spaceName: string
  parentName: string
  noteTitle: string
  isHome: boolean
  reliableDomain: boolean
}

type ImportedNoteRecord = {
  sourceRelativePath: string
  title: string
  aisleBodyId: string
  location: NoteLocation
}

const DEFAULT_IMPORTED_DOMAIN_PREFIX = 'imported domain'
const DEFAULT_IMPORTED_SPACE = 'imported space'
const DEFAULT_IMPORTED_PARENT = 'imported parent'
const IMPORTED_HOME_TITLE = 'imported home'
const MAX_WARNINGS = 50
const MAX_MARKDOWN_ZIP_BYTES = 250 * 1024 * 1024
const MAX_MARKDOWN_ZIP_FILES = 5000
const MAX_MARKDOWN_FILE_BYTES = 10 * 1024 * 1024
const MAX_ASSET_FILE_BYTES = 100 * 1024 * 1024
const MAX_MARKDOWN_ZIP_TOTAL_BYTES = 250 * 1024 * 1024
const STORAGE_SUFFIX_RE = /\s*--[0-9a-f]{6}(?:-\d+)?$/i
const NUMERIC_PREFIX_RE = /^\d+[-_.\s]+/
const MARKDOWN_EXTENSION_RE = /\.(?:md|markdown)$/i
const WRAPPER_NAMES = new Set(['import', 'imports', 'myimports', 'markdown', 'markdownimport', 'markdownimports', 'notes'])
const DOMAIN_WRAPPER_NAMES = new Set(['domains'])
const SPACE_WRAPPER_NAMES = new Set(['spaces'])

type ZipObjectWithData = JSZip.JSZipObject & {
  _data?: {
    uncompressedSize?: number
  }
}

function appendWarning(summary: MarkdownFolderImportSummary, warning: string) {
  if (summary.warnings.length >= MAX_WARNINGS) return
  summary.warnings.push(warning)
}

function normalizeRelativePath(value: string): string {
  return String(value ?? '').replace(/\\/g, '/').split('/').filter(Boolean).join('/')
}

function getPathCollisionKey(pathValue: string): string {
  return pathValue.normalize('NFC').toLocaleLowerCase('en-US')
}

function validateZipPath(pathValue: string): string | null {
  if (!pathValue || pathValue.includes('\\')) return 'Markdown ZIP path is invalid.'
  if (pathValue.startsWith('/') || /^[a-zA-Z]:/.test(pathValue)) return 'Markdown ZIP paths must be relative.'
  if (pathValue.split('/').some((segment) => segment === '..' || segment === '.')) {
    return 'Markdown ZIP paths must not contain traversal segments.'
  }
  return null
}

function detectDuplicateZipEntryNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  let eocdOffset = -1
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 66000); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) return []
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)
  const entryCount = view.getUint16(eocdOffset + 10, true)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount && offset + 46 <= bytes.byteLength; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameStart = offset + 46
    const nameEnd = nameStart + fileNameLength
    if (nameEnd > bytes.byteLength) break
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd))
    const key = getPathCollisionKey(name)
    if (seen.has(key)) duplicates.add(name)
    seen.add(key)
    offset = nameEnd + extraLength + commentLength
  }
  return Array.from(duplicates)
}

function getZipEntryName(entry: JSZip.JSZipObject): string {
  const unsafeName = (entry as { unsafeOriginalName?: unknown }).unsafeOriginalName
  return typeof unsafeName === 'string' ? unsafeName : entry.name
}

function getZipObjectSize(entry: JSZip.JSZipObject): number {
  const withData = entry as ZipObjectWithData
  return typeof withData._data?.uncompressedSize === 'number' ? withData._data.uncompressedSize : 0
}

function isZipSymlink(entry: JSZip.JSZipObject): boolean {
  const permissions = typeof entry.unixPermissions === 'number' ? entry.unixPermissions : 0
  return (permissions & 0o170000) === 0o120000
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function getMimeTypeFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
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
    default:
      return 'application/octet-stream'
  }
}

function normalizeName(value: string): string {
  return stripPathDecorations(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function stripExtension(value: string): string {
  return String(value ?? '').replace(MARKDOWN_EXTENSION_RE, '')
}

function stripPathDecorations(value: string): string {
  const source = stripExtension(String(value ?? ''))
  return source.replace(NUMERIC_PREFIX_RE, '').replace(STORAGE_SUFFIX_RE, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function readableName(value: string, fallback: string): string {
  return stripPathDecorations(value) || fallback
}

function makeImportedDomainName(index: number): string {
  return `${DEFAULT_IMPORTED_DOMAIN_PREFIX} ${index}`
}

function isWrapperName(value: string) {
  return WRAPPER_NAMES.has(normalizeName(value).replace(/\s+/g, ''))
}

function stripWrapperParts(parts: string[]): string[] {
  let nextParts = [...parts]
  while (nextParts.length > 0 && (isWrapperName(nextParts[0]) || DOMAIN_WRAPPER_NAMES.has(normalizeName(nextParts[0])))) {
    nextParts = nextParts.slice(1)
  }
  return nextParts
}

function parseImportFile(file: MarkdownFolderImportFile, fallbackIndex: number): ParsedMarkdownImportFile {
  const sourceRelativePath = normalizeRelativePath(file.relativePath)
  const stripped = stripWrapperParts(sourceRelativePath.split('/'))
  const parts = stripped.length > 0 ? stripped : sourceRelativePath.split('/').filter(Boolean)
  const fileName = parts.at(-1) ?? `note-${fallbackIndex}.md`
  const baseTitle = readableName(fileName, `note ${fallbackIndex}`)
  let cursor = 0
  let reliableDomain = parts.length >= 4
  let domainName = reliableDomain ? readableName(parts[cursor++], '') : ''
  if (SPACE_WRAPPER_NAMES.has(normalizeName(parts[cursor] ?? ''))) cursor += 1
  let spaceName = parts.length - cursor >= 3 ? readableName(parts[cursor++], DEFAULT_IMPORTED_SPACE) : DEFAULT_IMPORTED_SPACE
  let parentName = parts.length - cursor >= 2 ? readableName(parts[cursor++], baseTitle || DEFAULT_IMPORTED_PARENT) : baseTitle || DEFAULT_IMPORTED_PARENT

  if (!domainName) {
    reliableDomain = false
    domainName = DEFAULT_IMPORTED_DOMAIN_PREFIX
  }
  if (!spaceName) spaceName = DEFAULT_IMPORTED_SPACE
  if (!parentName) parentName = DEFAULT_IMPORTED_PARENT

  const remaining = parts.slice(cursor)
  const isHome = remaining.length === 1 && normalizeName(fileName) === 'home'
  const nestedTitleParts = remaining.slice(0, -1).map((part) => readableName(part, '')).filter(Boolean)
  const noteTitle = isHome ? parentName : [...nestedTitleParts, baseTitle].filter(Boolean).join(' / ') || baseTitle

  return {
    sourceRelativePath,
    markdown: file.markdown,
    domainName,
    spaceName,
    parentName,
    noteTitle,
    isHome,
    reliableDomain,
  }
}

function createSummary(): MarkdownFolderImportSummary {
  return {
    domainsCreated: 0,
    spacesCreated: 0,
    parentsCreated: 0,
    subtabsCreated: 0,
    notesImported: 0,
    assetsImported: 0,
    unresolvedReferences: 0,
    warnings: [],
  }
}

function cloneImportState(current: AppState): MutableImportState {
  const projected = projectActiveDomainState(current)
  const domains = projected.domains.map((domain) => ({
    ...domain,
    spaces: domain.spaces.map((space) => ({
      ...space,
      data: {
        ...space.data,
        tabs: space.data.tabs.map((tab) => ({
          ...tab,
          subTabs: tab.subTabs.map((subTab) => ({ ...subTab })),
        })),
        deletedTabs: [...space.data.deletedTabs],
        deletedSubTabs: [...space.data.deletedSubTabs],
      },
    })),
  }))
  const activeDomain = domains.find((domain) => domain.id === projected.activeDomainId) ?? domains[0]
  return {
    ...projected,
    domains,
    spaces: activeDomain?.spaces ?? [],
    noteBodies: projected.noteBodies.map((body) => ({
      ...body,
      aisles: body.aisles.map((aisle) => ({ ...aisle })),
    })),
    noteAisleBodies: (projected.noteAisleBodies ?? []).map((body) => ({ ...body })),
  }
}

function syncActiveSpaces(state: MutableImportState): MutableImportState {
  const activeDomain = state.domains.find((domain) => domain.id === state.activeDomainId) ?? state.domains[0]
  return projectActiveDomainState({
    ...state,
    activeDomainId: activeDomain?.id ?? state.activeDomainId,
    activeSpaceId: activeDomain?.spaces.some((space) => space.id === state.activeSpaceId)
      ? state.activeSpaceId
      : activeDomain?.activeSpaceId ?? activeDomain?.spaces[0]?.id ?? state.activeSpaceId,
    spaces: activeDomain?.spaces ?? state.spaces,
  }) as MutableImportState
}

function findUniqueByName<T>(items: T[], getName: (item: T) => string, name: string): T | null {
  const normalized = normalizeName(name)
  if (!normalized) return null
  const matches = items.filter((item) => normalizeName(getName(item)) === normalized)
  return matches.length === 1 ? matches[0] : null
}

function createImportedSpace(name: string, generateId: IdGenerator): Space {
  return {
    ...createSpace(name || DEFAULT_IMPORTED_SPACE, generateId),
    data: {
      activeTabId: '',
      tabs: [],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function resolveTargetDomain(
  state: MutableImportState,
  parsed: ParsedMarkdownImportFile,
  sourceDomainMap: Map<string, Domain>,
  summary: MarkdownFolderImportSummary,
  generateId: IdGenerator,
): Domain {
  if (parsed.reliableDomain) {
    const existing = findUniqueByName(state.domains, (domain) => domain.name, parsed.domainName)
    if (existing) return existing
  }

  if (!parsed.reliableDomain) {
    const spaceMatches = state.domains.filter((domain) =>
      domain.spaces.some((space) => normalizeName(space.name) === normalizeName(parsed.spaceName)),
    )
    if (spaceMatches.length === 1) return spaceMatches[0]
  }

  const sourceKey = normalizeName(parsed.domainName) || DEFAULT_IMPORTED_DOMAIN_PREFIX
  const mapped = sourceDomainMap.get(sourceKey)
  if (mapped) return mapped

  const domain = createDomainFromSpaces(makeImportedDomainName(summary.domainsCreated + 1), [createImportedSpace(parsed.spaceName, generateId)], {
    id: generateId(),
    createId: generateId,
  })
  state.domains.push(domain)
  sourceDomainMap.set(sourceKey, domain)
  summary.domainsCreated += 1
  summary.spacesCreated += 1
  return domain
}

function resolveTargetSpace(domain: Domain, parsed: ParsedMarkdownImportFile, summary: MarkdownFolderImportSummary, generateId: IdGenerator): Space {
  const existing = findUniqueByName(domain.spaces, (space) => space.name, parsed.spaceName)
  if (existing) return existing
  const space = createImportedSpace(parsed.spaceName, generateId)
  domain.spaces.push(space)
  domain.activeSpaceId = domain.activeSpaceId || space.id
  summary.spacesCreated += 1
  return space
}

function resolveTargetParent(state: MutableImportState, space: Space, parsed: ParsedMarkdownImportFile, summary: MarkdownFolderImportSummary, generateId: IdGenerator): { tab: Tab; created: boolean; ambiguous: boolean } {
  const normalized = normalizeName(parsed.parentName)
  const matches = space.data.tabs.filter((tab) => normalizeName(tab.title) === normalized)
  if (matches.length === 1) return { tab: matches[0], created: false, ambiguous: false }

  const noteContent = createNoteBodyContent('', generateId)
  const tab = {
    ...createTab(parsed.parentName || DEFAULT_IMPORTED_PARENT, generateId),
    noteBodyId: noteContent.noteBody.id,
  }
  state.noteBodies.push(noteContent.noteBody)
  state.noteAisleBodies.push(noteContent.aisleBody)
  space.data.tabs.push(tab)
  if (!space.data.activeTabId) space.data.activeTabId = tab.id
  summary.parentsCreated += 1
  return { tab, created: true, ambiguous: matches.length > 1 }
}

function getAisleBody(state: MutableImportState, aisleBodyId: string): NoteAisleBody | null {
  return state.noteAisleBodies.find((body) => body.id === aisleBodyId) ?? null
}

function isNoteBodyWhitespaceEmpty(state: MutableImportState, noteBodyId: string): boolean {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId)
  if (!noteBody) return true
  return noteBody.aisles.every((aisle) => {
    const body = getAisleBody(state, getAisleBodyId(aisle))
    return !body || (!body.markdown.trim() && !body.frontmatter)
  })
}

function buildAisleBody(markdown: string, id: string, now: string): NoteAisleBody {
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  const split = splitMarkdownFrontmatter(normalizedMarkdown)
  const base = {
    id,
    createdAt: now,
    updatedAt: now,
  }
  if (split.status === 'valid') {
    return {
      ...base,
      markdown: normalizeMarkdownForPersistence(split.markdown),
      frontmatter: split.frontmatter,
      frontmatterStatus: 'valid',
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  if (split.status === 'invalid') {
    return {
      ...base,
      markdown: normalizedMarkdown,
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterParseError: split.error,
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  return {
    ...base,
    markdown: normalizedMarkdown,
    frontmatter: null,
    frontmatterStatus: 'none',
  }
}

function setNoteBodyMarkdown(state: MutableImportState, noteBodyId: string, markdown: string, generateId: IdGenerator): string {
  const now = createTimestamp()
  let noteBody = state.noteBodies.find((body) => body.id === noteBodyId)
  if (!noteBody) {
    const noteContent = createNoteBodyContent('', generateId)
    noteBody = { ...noteContent.noteBody, id: noteBodyId }
    state.noteBodies.push(noteBody)
  }
  const firstAisle = noteBody.aisles[0] ?? { id: generateId(), aisleBodyId: generateId() }
  if (noteBody.aisles.length === 0) noteBody.aisles = [firstAisle]
  const body = buildAisleBody(markdown, getAisleBodyId(firstAisle), now)
  const existingIndex = state.noteAisleBodies.findIndex((candidate) => candidate.id === body.id)
  if (existingIndex >= 0) state.noteAisleBodies[existingIndex] = body
  else state.noteAisleBodies.push(body)
  return body.id
}

function addNoteBody(state: MutableImportState, markdown: string, generateId: IdGenerator) {
  const noteContent = createNoteBodyContent('', generateId)
  const aisleBodyId = setNoteBodyMarkdown(state, noteContent.noteBody.id, markdown, generateId)
  if (!state.noteBodies.some((body) => body.id === noteContent.noteBody.id)) {
    state.noteBodies.push(noteContent.noteBody)
  }
  return { noteBodyId: noteContent.noteBody.id, aisleBodyId }
}

function addSubTabNote(
  state: MutableImportState,
  parent: Tab,
  title: string,
  markdown: string,
  summary: MarkdownFolderImportSummary,
  generateId: IdGenerator,
) {
  const note = addNoteBody(state, markdown, generateId)
  const subTab = {
    ...createSubTab(title || 'tab', generateId),
    noteBodyId: note.noteBodyId,
  }
  parent.subTabs.push(subTab)
  if (!parent.activeSubTabId) parent.activeSubTabId = subTab.id
  summary.subtabsCreated += 1
  return { subTab, aisleBodyId: note.aisleBodyId }
}

function isProtocolUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
}

function splitUrlSuffix(source: string) {
  const hashIndex = source.indexOf('#')
  if (hashIndex < 0) return { pathPart: source, suffix: '' }
  return { pathPart: source.slice(0, hashIndex), suffix: source.slice(hashIndex) }
}

function resolveRelativeImportPath(fromFile: string, source: string): string {
  const { pathPart } = splitUrlSuffix(source)
  const decoded = (() => {
    try {
      return decodeURI(pathPart)
    } catch {
      return pathPart
    }
  })()
  const baseParts = normalizeRelativePath(fromFile).split('/').slice(0, -1)
  const sourceParts = decoded.replace(/\\/g, '/').split('/')
  const stack = [...baseParts]
  sourceParts.forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') stack.pop()
    else stack.push(part)
  })
  return stack.join('/')
}

function isMarkdownSource(source: string): boolean {
  return MARKDOWN_EXTENSION_RE.test(splitUrlSuffix(source).pathPart)
}

async function rewriteMarkdownAssets(
  markdown: string,
  sourceRelativePath: string,
  options: MarkdownFolderImportOptions,
  summary: MarkdownFolderImportSummary,
): Promise<string> {
  if (!options.readAsset || !options.importAsset) return markdown

  let output = ''
  let lastIndex = 0
  for (const match of String(markdown ?? '').matchAll(MARKDOWN_LINK_PATTERN)) {
    const index = match.index ?? 0
    output += markdown.slice(lastIndex, index)
    lastIndex = index + match[0].length

    const imageBang = match[1] ?? ''
    const label = match[2] ?? ''
    const source = String(match[3] ?? '').trim()
    const { imageUrl, metadataFragment } = splitImageResizeMetadataFromUrl(source)
    const normalizedMetadataFragment = normalizeImageResizeMetadataFragment(metadataFragment)
    if (!source || source.startsWith('#') || source.startsWith('data:') || source.startsWith('tabs-asset:') || isProtocolUrl(imageUrl) || isMarkdownSource(source)) {
      output += match[0]
      continue
    }

    const relativeAssetPath = resolveRelativeImportPath(sourceRelativePath, imageUrl)
    const asset = await options.readAsset(relativeAssetPath)
    if (!asset) {
      appendWarning(summary, `asset reference could not be resolved: ${source}`)
      output += match[0]
      continue
    }

    const importedUrl = await options.importAsset(asset)
    if (!importedUrl) {
      appendWarning(summary, `asset reference could not be imported: ${source}`)
      output += match[0]
      continue
    }

    summary.assetsImported += 1
    output += `${imageBang}[${label}](${importedUrl}${normalizedMetadataFragment})`
  }
  output += markdown.slice(lastIndex)
  return output
}

function normalizePathKey(relativePath: string): string {
  return normalizeRelativePath(relativePath).replace(MARKDOWN_EXTENSION_RE, '').toLowerCase()
}

function addToIndex<T>(index: Map<string, T[]>, key: string, value: T) {
  const normalized = normalizeName(key)
  if (!normalized) return
  index.set(normalized, [...(index.get(normalized) ?? []), value])
}

function buildInternalLink(appState: AppState, record: ImportedNoteRecord, alias: string, embed: boolean): string {
  if (embed) {
    return buildPreviewToken(appState, { id: '', target: record.location })
  }
  return buildInternalNoteLinkToken(appState, record.location, alias)
}

function rewriteImportedLinks(
  state: MutableImportState,
  importedNotes: ImportedNoteRecord[],
  summary: MarkdownFolderImportSummary,
): MutableImportState {
  const byTitle = new Map<string, ImportedNoteRecord[]>()
  const byPath = new Map<string, ImportedNoteRecord>()
  importedNotes.forEach((record) => {
    addToIndex(byTitle, record.title, record)
    byPath.set(normalizePathKey(record.sourceRelativePath), record)
  })

  state.noteAisleBodies = state.noteAisleBodies.map((body) => {
    const source = importedNotes.find((record) => record.aisleBodyId === body.id)
    if (!source) return body

    let markdown = String(body.markdown ?? '')

    markdown = markdown.replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang, label, sourceRaw) => {
      const sourcePath = parseMarkdownNoteReferenceDestination(String(sourceRaw ?? '').trim())
      if (!isMarkdownSource(sourcePath) || isProtocolUrl(sourcePath)) return fullMatch
      const resolvedPath = resolveRelativeImportPath(source.sourceRelativePath, sourcePath)
      const target = byPath.get(normalizePathKey(resolvedPath))
      if (!target) {
        summary.unresolvedReferences += 1
        return fullMatch
      }
      return buildInternalLink(state, target, String(label ?? '').trim(), imageBang === '!') || fullMatch
    })

    return { ...body, markdown }
  })
  if (summary.unresolvedReferences > 0) {
    appendWarning(summary, `${summary.unresolvedReferences} imported note reference(s) could not be remapped.`)
  }
  return state
}

export async function parseMarkdownFolderZip(bytes: Uint8Array | ArrayBuffer): Promise<ParseMarkdownFolderZipResult> {
  const archiveBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const warnings: string[] = []
  if (archiveBytes.byteLength > MAX_MARKDOWN_ZIP_BYTES) {
    return { ok: false, error: 'Markdown ZIP is too large.', warnings }
  }

  const duplicateEntries = detectDuplicateZipEntryNames(archiveBytes)
  if (duplicateEntries.length > 0) {
    return { ok: false, error: 'Markdown ZIP contains duplicate entries.', warnings }
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(archiveBytes)
  } catch {
    return { ok: false, error: 'Markdown ZIP is not readable.', warnings }
  }

  const entries = Object.values(zip.files)
  if (entries.length > MAX_MARKDOWN_ZIP_FILES) {
    return { ok: false, error: 'Markdown ZIP contains too many files.', warnings }
  }

  const files: MarkdownFolderImportFile[] = []
  const assets = new Map<string, MarkdownFolderImportAsset>()
  let totalBytes = 0
  for (const entry of entries) {
    const rawPath = getZipEntryName(entry)
    const pathError = validateZipPath(rawPath)
    if (pathError) return { ok: false, error: pathError, warnings }
    if (isZipSymlink(entry)) return { ok: false, error: 'Markdown ZIP must not contain symlinks.', warnings }
    if (entry.dir) continue

    const relativePath = normalizeRelativePath(rawPath)
    if (!relativePath) return { ok: false, error: 'Markdown ZIP path is invalid.', warnings }
    const declaredSize = getZipObjectSize(entry)
    if (MARKDOWN_EXTENSION_RE.test(relativePath)) {
      if (declaredSize > MAX_MARKDOWN_FILE_BYTES) {
        return { ok: false, error: `Markdown file is too large: ${relativePath}`, warnings }
      }
      const markdown = await entry.async('string')
      const size = new TextEncoder().encode(markdown).byteLength
      if (size > MAX_MARKDOWN_FILE_BYTES) {
        return { ok: false, error: `Markdown file is too large: ${relativePath}`, warnings }
      }
      totalBytes += size
      files.push({ relativePath, markdown, size })
    } else {
      if (declaredSize > MAX_ASSET_FILE_BYTES) {
        return { ok: false, error: `Asset file is too large: ${relativePath}`, warnings }
      }
      const assetBytes = await entry.async('uint8array')
      if (assetBytes.byteLength > MAX_ASSET_FILE_BYTES) {
        return { ok: false, error: `Asset file is too large: ${relativePath}`, warnings }
      }
      totalBytes += assetBytes.byteLength
      assets.set(relativePath, {
        bytes: toArrayBuffer(assetBytes),
        name: relativePath.split('/').pop() ?? 'asset',
        mimeType: getMimeTypeFromFileName(relativePath),
        extension: relativePath.split('.').pop()?.toLowerCase() ?? '',
      })
    }

    if (totalBytes > MAX_MARKDOWN_ZIP_TOTAL_BYTES) {
      return { ok: false, error: 'Markdown ZIP is too large to import.', warnings }
    }
  }

  if (files.length === 0) {
    return { ok: false, error: 'Markdown ZIP does not contain Markdown files.', warnings }
  }

  return {
    ok: true,
    payload: {
      sourceId: 'markdown-zip',
      rootName: 'Markdown ZIP',
      files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    },
    assets,
    warnings,
  }
}

export async function mergeMarkdownFolderImport(
  current: AppState,
  payload: MarkdownFolderImportPayload,
  options: MarkdownFolderImportOptions = {},
): Promise<MarkdownFolderImportResult> {
  const generateId = options.createId ?? createId
  const summary = createSummary()
  const files = payload.files
    .filter((file) => MARKDOWN_EXTENSION_RE.test(file.relativePath))
    .sort((left, right) => normalizeRelativePath(left.relativePath).localeCompare(normalizeRelativePath(right.relativePath)))
    .map((file, index) => parseImportFile(file, index + 1))
  let state = cloneImportState(current)
  const sourceDomainMap = new Map<string, Domain>()
  const importedNotes: ImportedNoteRecord[] = []
  const homeAppliedByParent = new Set<string>()

  for (const parsed of files) {
    const markdown = await rewriteMarkdownAssets(parsed.markdown, parsed.sourceRelativePath, options, summary)
    const domain = resolveTargetDomain(state, parsed, sourceDomainMap, summary, generateId)
    const space = resolveTargetSpace(domain, parsed, summary, generateId)
    const parentResult = resolveTargetParent(state, space, parsed, summary, generateId)
    const parent = parentResult.tab
    if (parentResult.ambiguous) {
      appendWarning(summary, `parent "${parsed.parentName}" matched more than once, so a new parent was created.`)
    }

    const existingHomeCanReceiveImport =
      parsed.isHome &&
      !homeAppliedByParent.has(parent.id) &&
      (parentResult.created || isNoteBodyWhitespaceEmpty(state, parent.noteBodyId))

    if (existingHomeCanReceiveImport) {
      const aisleBodyId = setNoteBodyMarkdown(state, parent.noteBodyId, markdown, generateId)
      homeAppliedByParent.add(parent.id)
      importedNotes.push({
        sourceRelativePath: parsed.sourceRelativePath,
        title: parent.title,
        aisleBodyId,
        location: { domainId: domain.id, spaceId: space.id, tabId: parent.id, subTabId: null },
      })
    } else {
      const title = parsed.isHome ? IMPORTED_HOME_TITLE : parsed.noteTitle
      const { subTab, aisleBodyId } = addSubTabNote(state, parent, title, markdown, summary, generateId)
      importedNotes.push({
        sourceRelativePath: parsed.sourceRelativePath,
        title: subTab.title,
        aisleBodyId,
        location: { domainId: domain.id, spaceId: space.id, tabId: parent.id, subTabId: subTab.id },
      })
    }
    summary.notesImported += 1
  }

  if (files.length === 0) {
    appendWarning(summary, 'selected folder did not contain Markdown files.')
  }

  state = syncActiveSpaces(state)
  state = rewriteImportedLinks(state, importedNotes, summary)
  return {
    state: syncActiveSpaces(state),
    summary,
  }
}

export function formatMarkdownFolderImportSummary(summary: MarkdownFolderImportSummary): string {
  const warningText = summary.warnings.length > 0 ? ` ${summary.warnings.length} warning(s).` : ''
  const unresolvedText = summary.unresolvedReferences > 0 ? ` ${summary.unresolvedReferences} reference(s) stayed unresolved.` : ''
  return `imported Markdown folder: ${summary.notesImported} note(s), ${summary.parentsCreated} parent(s), ${summary.subtabsCreated} tab(s), ${summary.assetsImported} asset(s).${unresolvedText}${warningText}`
}
