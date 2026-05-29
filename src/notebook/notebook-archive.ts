import JSZip from 'jszip'
import { composeMarkdownFrontmatter, splitMarkdownFrontmatter } from '../frontmatter/frontmatter'
import { resolveFrontmatterReferencesForState } from '../frontmatter/frontmatter-state'
import { MARKDOWN_LINK_PATTERN, buildAssetUrl, parseAssetUrl } from '../markdown/image-asset-refs.js'
import { splitImageResizeMetadataFromUrl, normalizeImageResizeMetadataFragment } from '../markdown/image-metadata'
import {
  getRegisteredAssetBytes,
  getRegisteredAssetMimeType,
  registerAssetBytes,
} from '../markdown/image-asset-registry'
import { normalizePreviewReferenceTokensForMarkdown } from '../markdown/note-context-tokens.js'
import { convertInternalTabsForExport } from '../markdown/markdown-utils'
import { getAisleBodyId } from '../notes/note-markdown'
import { mergeImportedBackupState, type ImportBackupSummary } from '../import/backup-import'
import { parseSavedState } from '../state/app-state'
import { projectActiveDomainState } from '../state/domains'
import { createId } from '../state/workspace'
import type { IdGenerator } from '../state/navigation-ids'
import type {
  AppState,
  DeletedDomainEntry,
  DeletedSpaceEntry,
  DeletedSubTabEntry,
  DeletedTabEntry,
  Domain,
  FrontmatterSettings,
  NoteAisleBody,
  NoteBody,
  ScratchpadState,
  Space,
  SubTab,
  Tab,
  WorkspaceData,
} from '../types/app'

export const NOTEBOOK_ARCHIVE_MANIFEST = 'tabs-notebook.json'
export const NOTEBOOK_ARCHIVE_FORMAT = 'tabs-notebook'
export const NOTEBOOK_ARCHIVE_VERSION = 1

const README_PATH = 'README.txt'
const ASSET_ROOT = 'assets'
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024
const MAX_ARCHIVE_FILES = 5000
const MAX_MARKDOWN_FILE_BYTES = 10 * 1024 * 1024
const MAX_ASSET_FILE_BYTES = 100 * 1024 * 1024
const MAX_SEGMENT_LENGTH = 80
const MAX_IMPORT_ASSET_WARNINGS = 20
const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])

export type NotebookArchiveIssue = {
  code: string
  severity: 'warning' | 'error'
  path?: string
  message: string
}

export type NotebookArchiveSummary = {
  domains: number
  spaces: number
  tabs: number
  notes: number
  noteBodies: number
  aisles: number
  assets: number
  trashEntries: number
  frontmatterTemplates: number
  hasScratchpad: boolean
  repairedIds?: number
  unresolvedReferences?: number
  warnings?: string[]
}

export type BuildNotebookArchiveOptions = {
  state: AppState
  exportedAt?: string
  appVersion?: string
  readAssetBytes?: (assetPath: string) => Promise<Uint8Array | null> | Uint8Array | null
}

export type BuildNotebookArchiveResult = {
  bytes: Uint8Array
  manifest: NotebookArchiveManifest
  summary: NotebookArchiveSummary
  issues: NotebookArchiveIssue[]
}

export type ParsedNotebookArchive = {
  manifest: NotebookArchiveManifest
  state: AppState
  scratchpad: ScratchpadState | null
  assetFiles: Map<string, NotebookImportedAsset>
  aisleBodyFiles: Map<string, string>
  summary: NotebookArchiveSummary
  issues: NotebookArchiveIssue[]
}

export type ParseNotebookArchiveResult =
  | {
      ok: true
      archive: ParsedNotebookArchive
    }
  | {
      ok: false
      error: string
      issues: NotebookArchiveIssue[]
    }

export type NotebookImportedAsset = {
  file: string
  bytes: Uint8Array
  mimeType: string
  extension: string
}

export type MaterializeNotebookImportAssetsOptions = {
  createId?: IdGenerator
  includeScratchpad?: boolean
  importAsset?: (asset: NotebookImportedAsset) => Promise<string | null> | string | null
}

export type NotebookImportMergeOptions = {
  includeScratchpad?: boolean
  createId?: IdGenerator
}

export type NotebookImportMergeResult = {
  state: AppState
  summary: ImportBackupSummary & {
    appliedScratchpad: boolean
  }
}

type NotebookArchiveManifest = {
  format: typeof NOTEBOOK_ARCHIVE_FORMAT
  version: typeof NOTEBOOK_ARCHIVE_VERSION
  exportedAt: string
  metadata: {
    app: 'Tabs'
    appVersion?: string
  } & NotebookArchiveSummary
  domains: NotebookDomain[]
  deletedSpaces: NotebookDeletedSpaceEntry[]
  deletedDomains: NotebookDeletedDomainEntry[]
  noteBodies: NotebookNoteBody[]
  noteAisleBodies: NotebookAisleBody[]
  frontmatter: FrontmatterSettings
  scratchpad: (ScratchpadState & { files: string[] }) | null
  assets: NotebookAssetManifest[]
}

type NotebookAssetManifest = {
  file: string
  source?: string
  mimeType: string
  size: number
}

type NotebookNoteBody = Omit<NoteBody, 'aisles'> & {
  aisles: Array<NoteBody['aisles'][number] & { file: string }>
}

type NotebookAisleBody = Omit<NoteAisleBody, 'markdown'> & {
  file: string
}

type NotebookSubTab = SubTab & {
  file: string
}

type NotebookTab = Omit<Tab, 'subTabs'> & {
  homeFile: string
  subTabs: NotebookSubTab[]
}

type NotebookDeletedSubTabEntry = Omit<DeletedSubTabEntry, 'subTab'> & {
  subTab: NotebookSubTab
}

type NotebookDeletedTabEntry = Omit<DeletedTabEntry, 'tab'> & {
  tab: NotebookTab
}

type NotebookWorkspaceData = Omit<WorkspaceData, 'tabs' | 'deletedTabs' | 'deletedSubTabs'> & {
  tabs: NotebookTab[]
  deletedTabs: NotebookDeletedTabEntry[]
  deletedSubTabs: NotebookDeletedSubTabEntry[]
}

type NotebookSpace = Omit<Space, 'data'> & {
  data: NotebookWorkspaceData
}

type NotebookDomain = Omit<Domain, 'spaces'> & {
  spaces: NotebookSpace[]
}

type NotebookDeletedSpaceEntry = Omit<DeletedSpaceEntry, 'space'> & {
  space: NotebookSpace
}

type NotebookDeletedDomainEntry = Omit<DeletedDomainEntry, 'domain' | 'deletedSpaces'> & {
  domain: NotebookDomain
  deletedSpaces: NotebookDeletedSpaceEntry[]
}

type ZipObjectWithData = JSZip.JSZipObject & {
  _data?: {
    uncompressedSize?: number
    compressedSize?: number
  }
}

type AssignedNoteFiles = {
  byAisleId: Map<string, string>
  files: string[]
}

function createIssue(code: string, severity: NotebookArchiveIssue['severity'], message: string, path?: string): NotebookArchiveIssue {
  return {
    code,
    severity,
    ...(path ? { path } : {}),
    message,
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string; extension: string } | null {
  const match = String(dataUrl ?? '').match(/^data:([a-zA-Z0-9+.-]+\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return null
  const bytes = base64ToBytes(match[2])
  if (!bytes) return null
  return {
    bytes,
    mimeType: match[1],
    extension: getExtensionFromMimeType(match[1]),
  }
}

function encodeDataUrl(asset: NotebookImportedAsset): string {
  return `data:${asset.mimeType};base64,${bytesToBase64(asset.bytes)}`
}

function getMimeTypeFromExtension(extension: string): string {
  const normalized = normalizeExtension(extension)
  switch (normalized) {
    case 'jpg':
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
    case 'wav':
      return 'audio/wav'
    case 'm4a':
      return 'audio/mp4'
    case 'ogg':
      return 'audio/ogg'
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

function getExtensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized === 'image/jpeg') return 'jpg'
  if (normalized === 'image/svg+xml') return 'svg'
  const match = normalized.match(/^[a-z0-9+.-]+\/([a-z0-9+.-]+)$/)
  return normalizeExtension(match?.[1] ?? 'bin')
}

function normalizeExtension(value: string): string {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'svgxml') return 'svg'
  if (normalized === 'quicktime') return 'mov'
  if (normalized === 'mpeg' || normalized === 'xmpeg') return 'mp3'
  return normalized || 'bin'
}

function dirname(pathValue: string): string {
  const index = pathValue.lastIndexOf('/')
  return index < 0 ? '' : pathValue.slice(0, index)
}

function basename(pathValue: string): string {
  const index = pathValue.lastIndexOf('/')
  return index < 0 ? pathValue : pathValue.slice(index + 1)
}

function extname(pathValue: string): string {
  const base = basename(pathValue)
  const index = base.lastIndexOf('.')
  return index <= 0 ? '' : base.slice(index + 1)
}

function stripExtension(pathValue: string): string {
  const extension = extname(pathValue)
  return extension ? pathValue.slice(0, -extension.length - 1) : pathValue
}

function joinPath(...parts: string[]): string {
  const segments: string[] = []
  parts.forEach((part) => {
    String(part ?? '')
      .split('/')
      .forEach((segment) => {
        if (!segment || segment === '.') return
        if (segment === '..') {
          segments.pop()
          return
        }
        segments.push(segment)
      })
  })
  return segments.join('/')
}

function relativePath(fromFile: string, toFile: string): string {
  const fromSegments = dirname(fromFile).split('/').filter(Boolean)
  const toSegments = toFile.split('/').filter(Boolean)
  while (fromSegments.length > 0 && toSegments.length > 0 && fromSegments[0] === toSegments[0]) {
    fromSegments.shift()
    toSegments.shift()
  }
  const relativeSegments = [...fromSegments.map(() => '..'), ...toSegments]
  return relativeSegments.length > 0 ? relativeSegments.join('/') : basename(toFile)
}

function decodePathComponent(value: string): string {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

function normalizeArchivePath(value: string): string {
  const source = decodePathComponent(String(value ?? '').replace(/\\/g, '/').trim())
  if (!source || source.startsWith('/') || /^[a-zA-Z]:/.test(source)) return ''
  const segments: string[] = []
  for (const segment of source.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function getPathCollisionKey(pathValue: string): string {
  return pathValue.normalize('NFC').toLocaleLowerCase('en-US')
}

function sanitizePathSegment(value: string, fallback: string): string {
  const withoutControlCharacters = Array.from(String(value ?? '').normalize('NFKC'))
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
  const normalized = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  const dashed = (normalized || fallback).replace(/\s+/g, '-')
  const truncated = Array.from(dashed).slice(0, MAX_SEGMENT_LENGTH).join('').replace(/-+$/g, '')
  const safe = truncated || fallback
  return WINDOWS_RESERVED_NAMES.has(safe.toLocaleLowerCase('en-US')) ? `${safe}-item` : safe
}

function makeFileName(name: string, fallback: string, extension: string): string {
  const ext = normalizeExtension(extension)
  const base = sanitizePathSegment(stripExtension(name), fallback)
  return `${base}.${ext}`
}

class ArchivePathAllocator {
  private readonly used = new Set<string>()

  allocate(pathValue: string): string {
    const normalized = normalizeArchivePath(pathValue)
    const parent = dirname(normalized)
    const base = basename(normalized)
    const extension = extname(base)
    const stem = extension ? stripExtension(base) : base
    let candidate = normalized
    let suffix = 2
    while (this.used.has(getPathCollisionKey(candidate))) {
      const nextBase = extension ? `${stem}-${suffix}.${extension}` : `${stem}-${suffix}`
      candidate = parent ? `${parent}/${nextBase}` : nextBase
      suffix += 1
    }
    this.used.add(getPathCollisionKey(candidate))
    return candidate
  }
}

class NotebookAssetBank {
  readonly files = new Map<string, Uint8Array>()
  readonly manifest = new Map<string, NotebookAssetManifest>()
  private readonly sourceToFile = new Map<string, string>()
  private readonly allocator: ArchivePathAllocator

  constructor(allocator: ArchivePathAllocator) {
    this.allocator = allocator
  }

  add(sourceKey: string, preferredName: string, bytes: Uint8Array, mimeType: string): string {
    const existing = this.sourceToFile.get(sourceKey)
    if (existing) return existing
    const fileName = makeFileName(preferredName, 'asset', getExtensionFromMimeType(mimeType))
    const file = this.allocator.allocate(`${ASSET_ROOT}/${fileName}`)
    this.sourceToFile.set(sourceKey, file)
    this.files.set(file, bytes)
    this.manifest.set(file, {
      file,
      source: sourceKey.startsWith('data:') ? undefined : sourceKey,
      mimeType,
      size: bytes.byteLength,
    })
    return file
  }
}

function getNotebookSummary(state: AppState, assetCount = 0): NotebookArchiveSummary {
  const projected = projectActiveDomainState(state)
  const spaces = projected.domains.reduce((count, domain) => count + domain.spaces.length, 0)
  const tabs = projected.domains.reduce(
    (count, domain) =>
      count +
      domain.spaces.reduce(
        (spaceCount, space) => spaceCount + space.data.tabs.reduce((tabCount, tab) => tabCount + 1 + tab.subTabs.length, 0),
        0,
      ),
    0,
  )
  const trashEntries =
    projected.domains.reduce(
      (count, domain) =>
        count +
        domain.spaces.reduce(
          (spaceCount, space) => spaceCount + space.data.deletedTabs.length + space.data.deletedSubTabs.length,
          0,
        ),
      0,
    ) +
    (projected.deletedSpaces ?? []).length +
    (projected.deletedDomains ?? []).length
  return {
    domains: projected.domains.length,
    spaces,
    tabs,
    notes: tabs,
    noteBodies: projected.noteBodies.length,
    aisles: projected.noteBodies.reduce((count, body) => count + body.aisles.length, 0),
    assets: assetCount,
    trashEntries,
    frontmatterTemplates: projected.frontmatter.templates.length,
    hasScratchpad: Boolean(projected.scratchpad?.noteBodyId),
  }
}

function exportMarkdownForAisleBody(state: AppState, body: NoteAisleBody): string {
  const markdown = normalizePreviewReferenceTokensForMarkdown(convertInternalTabsForExport(body.markdown), state)
  if (body.frontmatterStatus === 'invalid') return markdown
  return composeMarkdownFrontmatter(markdown, resolveFrontmatterReferencesForState(state, body.frontmatter ?? null))
}

async function getAssetBytesForExport(assetPath: string, options: BuildNotebookArchiveOptions): Promise<Uint8Array | null> {
  const fromCallback = options.readAssetBytes ? await options.readAssetBytes(assetPath) : null
  if (fromCallback) return fromCallback
  return getRegisteredAssetBytes(assetPath)
}

async function rewriteMarkdownAssetsForExport(
  markdown: string,
  noteFile: string,
  assetBank: NotebookAssetBank,
  issues: NotebookArchiveIssue[],
  options: BuildNotebookArchiveOptions,
): Promise<string> {
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
    const assetPath = parseAssetUrl(imageUrl)
    const decoded = assetPath ? null : decodeDataUrl(imageUrl)
    if (!assetPath && !decoded) {
      output += match[0]
      continue
    }

    const bytes = assetPath ? await getAssetBytesForExport(assetPath, options) : decoded?.bytes ?? null
    if (!bytes) {
      issues.push(
        createIssue(
          'missing-export-asset',
          'warning',
          'Referenced asset could not be read; the original Markdown reference was kept.',
          assetPath ?? noteFile,
        ),
      )
      output += match[0]
      continue
    }

    const mimeType = assetPath ? getRegisteredAssetMimeType(assetPath) : decoded?.mimeType ?? 'application/octet-stream'
    const preferredName = assetPath ? basename(assetPath) : `asset-${assetBank.files.size + 1}.${getExtensionFromMimeType(mimeType)}`
    const assetFile = assetBank.add(assetPath ?? imageUrl, preferredName, bytes, mimeType)
    output += `${imageBang}[${label}](${relativePath(noteFile, assetFile)}${normalizedMetadataFragment})`
  }
  output += markdown.slice(lastIndex)
  return output
}

function parseMarkdownFile(markdown: string, manifestBody: NotebookAisleBody): NoteAisleBody {
  const split = splitMarkdownFrontmatter(markdown)
  const base = {
    id: manifestBody.id,
    createdAt: manifestBody.createdAt,
    updatedAt: manifestBody.updatedAt,
    frontmatterMeta: manifestBody.frontmatterMeta,
  }
  if (split.status === 'valid') {
    return {
      ...base,
      markdown: split.markdown,
      frontmatter: split.frontmatter,
      frontmatterStatus: 'valid',
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  if (split.status === 'invalid') {
    return {
      ...base,
      markdown,
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterParseError: split.error,
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  return {
    ...base,
    markdown,
    frontmatter: manifestBody.frontmatter ?? null,
    frontmatterStatus: manifestBody.frontmatterStatus ?? (manifestBody.frontmatter ? 'valid' : 'none'),
  }
}

function stripNotebookSubTab(subTab: NotebookSubTab): SubTab {
  return {
    id: subTab.id,
    title: subTab.title,
    noteBodyId: subTab.noteBodyId,
  }
}

function stripNotebookTab(tab: NotebookTab): Tab {
  return {
    id: tab.id,
    title: tab.title,
    noteBodyId: tab.noteBodyId,
    activeSubTabId: tab.activeSubTabId,
    subTabs: tab.subTabs.map(stripNotebookSubTab),
  }
}

function stripNotebookWorkspace(data: NotebookWorkspaceData): WorkspaceData {
  return {
    activeTabId: data.activeTabId,
    tabs: data.tabs.map(stripNotebookTab),
    deletedTabs: data.deletedTabs.map((entry) => ({
      ...entry,
      tab: stripNotebookTab(entry.tab),
    })),
    deletedSubTabs: data.deletedSubTabs.map((entry) => ({
      ...entry,
      subTab: stripNotebookSubTab(entry.subTab),
    })),
  }
}

function stripNotebookSpace(space: NotebookSpace): Space {
  return {
    id: space.id,
    name: space.name,
    settings: space.settings,
    data: stripNotebookWorkspace(space.data),
  }
}

function stripNotebookDomain(domain: NotebookDomain): Domain {
  return {
    id: domain.id,
    name: domain.name,
    activeSpaceId: domain.activeSpaceId,
    spaces: domain.spaces.map(stripNotebookSpace),
  }
}

function stripNotebookDeletedSpace(entry: NotebookDeletedSpaceEntry): DeletedSpaceEntry {
  return {
    ...entry,
    space: stripNotebookSpace(entry.space),
  }
}

function stripNotebookDeletedDomain(entry: NotebookDeletedDomainEntry): DeletedDomainEntry {
  return {
    ...entry,
    domain: stripNotebookDomain(entry.domain),
    deletedSpaces: entry.deletedSpaces.map(stripNotebookDeletedSpace),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getZipObjectSize(entry: JSZip.JSZipObject): number {
  const withData = entry as ZipObjectWithData
  return typeof withData._data?.uncompressedSize === 'number' ? withData._data.uncompressedSize : 0
}

function isZipSymlink(entry: JSZip.JSZipObject): boolean {
  const permissions = typeof entry.unixPermissions === 'number' ? entry.unixPermissions : 0
  return (permissions & 0o170000) === 0o120000
}

function validateArchivePath(pathValue: string): NotebookArchiveIssue | null {
  if (!pathValue || pathValue.includes('\\')) {
    return createIssue('invalid-path', 'error', 'Archive path is invalid.', pathValue)
  }
  if (pathValue.startsWith('/') || /^[a-zA-Z]:/.test(pathValue)) {
    return createIssue('absolute-path', 'error', 'Archive path must be relative.', pathValue)
  }
  if (pathValue.split('/').some((segment) => segment === '..' || segment === '.')) {
    return createIssue('path-traversal', 'error', 'Archive path must not contain traversal segments.', pathValue)
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

function getRequiredManifestFiles(manifest: NotebookArchiveManifest): Set<string> {
  const files = new Set<string>()
  manifest.noteAisleBodies.forEach((body) => files.add(body.file))
  manifest.assets.forEach((asset) => files.add(asset.file))
  return files
}

function validateNotebookManifest(value: unknown): { manifest: NotebookArchiveManifest | null; issues: NotebookArchiveIssue[] } {
  const issues: NotebookArchiveIssue[] = []
  if (!isRecord(value)) {
    return {
      manifest: null,
      issues: [createIssue('corrupt-manifest', 'error', 'Notebook manifest is not a JSON object.', NOTEBOOK_ARCHIVE_MANIFEST)],
    }
  }
  if (value.format !== NOTEBOOK_ARCHIVE_FORMAT) {
    issues.push(createIssue('unsupported-format', 'error', 'Archive is not a Tabs notebook archive.', NOTEBOOK_ARCHIVE_MANIFEST))
  }
  if (value.version !== NOTEBOOK_ARCHIVE_VERSION) {
    issues.push(createIssue('unsupported-version', 'error', 'Notebook archive version is not supported.', NOTEBOOK_ARCHIVE_MANIFEST))
  }
  const manifest = value as NotebookArchiveManifest
  if (!Array.isArray(manifest.domains) || manifest.domains.length === 0) {
    issues.push(createIssue('missing-domains', 'error', 'Notebook manifest does not contain domains.', NOTEBOOK_ARCHIVE_MANIFEST))
  }
  if (!Array.isArray(manifest.noteBodies)) {
    issues.push(createIssue('missing-note-bodies', 'error', 'Notebook manifest does not contain note bodies.', NOTEBOOK_ARCHIVE_MANIFEST))
  }
  if (!Array.isArray(manifest.noteAisleBodies)) {
    issues.push(createIssue('missing-aisle-bodies', 'error', 'Notebook manifest does not contain aisle bodies.', NOTEBOOK_ARCHIVE_MANIFEST))
  }
  if (!isRecord(manifest.frontmatter)) {
    issues.push(createIssue('missing-frontmatter', 'error', 'Notebook manifest does not contain frontmatter settings.', NOTEBOOK_ARCHIVE_MANIFEST))
  }
  return {
    manifest: issues.some((issue) => issue.severity === 'error') ? null : manifest,
    issues,
  }
}

function isProtocolUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
}

function resolveArchiveAssetReference(noteFile: string, source: string, assetFiles: Map<string, NotebookImportedAsset>): string | null {
  const normalizedSource = normalizeArchivePath(source)
  if (!normalizedSource || isProtocolUrl(source)) return null
  const direct = assetFiles.has(normalizedSource) ? normalizedSource : ''
  if (direct) return direct
  const relative = normalizeArchivePath(joinPath(dirname(noteFile), normalizedSource))
  return assetFiles.has(relative) ? relative : null
}

async function getMaterializedAssetUrl(
  asset: NotebookImportedAsset,
  materializedAssets: Map<string, string>,
  options: MaterializeNotebookImportAssetsOptions,
  usedAssetPaths: Set<string>,
): Promise<string | null> {
  const existing = materializedAssets.get(asset.file)
  if (existing) return existing
  const imported = options.importAsset ? await options.importAsset(asset) : null
  if (imported) {
    materializedAssets.set(asset.file, imported)
    return imported
  }
  if (!options.importAsset) {
    const generateId = options.createId ?? createId
    let assetPath = ''
    while (!assetPath || usedAssetPaths.has(assetPath)) {
      assetPath = `assets/import-${sanitizePathSegment(generateId(), 'asset')}.${asset.extension}`
    }
    usedAssetPaths.add(assetPath)
    registerAssetBytes(assetPath, asset.bytes, asset.mimeType)
    const url = buildAssetUrl(assetPath)
    materializedAssets.set(asset.file, url)
    return url
  }
  return null
}

async function rewriteMarkdownAssetsForImport(
  markdown: string,
  noteFile: string,
  parsed: ParsedNotebookArchive,
  options: MaterializeNotebookImportAssetsOptions,
  materializedAssets: Map<string, string>,
  usedAssetPaths: Set<string>,
  warnings: string[],
): Promise<string> {
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
    if (parseAssetUrl(imageUrl) || imageUrl.startsWith('data:') || isProtocolUrl(imageUrl)) {
      output += match[0]
      continue
    }

    const assetFile = resolveArchiveAssetReference(noteFile, imageUrl, parsed.assetFiles)
    if (!assetFile) {
      if (warnings.length < MAX_IMPORT_ASSET_WARNINGS) warnings.push(`asset reference could not be resolved: ${imageUrl}`)
      output += match[0]
      continue
    }
    const asset = parsed.assetFiles.get(assetFile)
    if (!asset) {
      output += match[0]
      continue
    }
    const url = await getMaterializedAssetUrl(asset, materializedAssets, options, usedAssetPaths)
    if (!url) {
      if (warnings.length < MAX_IMPORT_ASSET_WARNINGS) warnings.push(`asset could not be imported: ${asset.file}`)
      output += match[0]
      continue
    }
    output += `${imageBang}[${label}](${url}${normalizedMetadataFragment})`
  }
  output += markdown.slice(lastIndex)
  return output
}

function collectReferencedNoteBodyIdsFromNotebookContent(state: AppState): Set<string> {
  const ids = new Set<string>()
  const collectTab = (tab: Tab) => {
    if (tab.noteBodyId) ids.add(tab.noteBodyId)
    tab.subTabs.forEach((subTab) => {
      if (subTab.noteBodyId) ids.add(subTab.noteBodyId)
    })
  }
  const collectWorkspace = (data: WorkspaceData) => {
    data.tabs.forEach(collectTab)
    data.deletedTabs.forEach((entry) => collectTab(entry.tab))
    data.deletedSubTabs.forEach((entry) => {
      if (entry.subTab.noteBodyId) ids.add(entry.subTab.noteBodyId)
    })
  }
  state.domains.forEach((domain) => domain.spaces.forEach((space) => collectWorkspace(space.data)))
  ;(state.deletedSpaces ?? []).forEach((entry) => collectWorkspace(entry.space.data))
  ;(state.deletedDomains ?? []).forEach((entry) => {
    entry.domain.spaces.forEach((space) => collectWorkspace(space.data))
    entry.deletedSpaces.forEach((spaceEntry) => collectWorkspace(spaceEntry.space.data))
  })
  return ids
}

function removeIgnoredScratchpadFromImport(state: AppState): AppState {
  const scratchpadBodyId = state.scratchpad?.noteBodyId
  if (!scratchpadBodyId) return {
    ...state,
    scratchpad: undefined,
  }
  const referenced = collectReferencedNoteBodyIdsFromNotebookContent(state)
  if (referenced.has(scratchpadBodyId)) return {
    ...state,
    scratchpad: undefined,
  }
  const noteBodies = state.noteBodies.filter((body) => body.id !== scratchpadBodyId)
  const referencedAisleBodyIds = new Set<string>()
  noteBodies.forEach((body) => body.aisles.forEach((aisle) => referencedAisleBodyIds.add(getAisleBodyId(aisle))))
  const noteAisleBodies = (state.noteAisleBodies ?? []).filter((body) => referencedAisleBodyIds.has(body.id))
  return {
    ...state,
    scratchpad: undefined,
    noteBodies,
    noteAisleBodies,
  }
}

function createNotebookTreeBuilder(state: AppState) {
  const pathAllocator = new ArchivePathAllocator()
  const noteBodiesById = new Map(state.noteBodies.map((body) => [body.id, body]))
  const aisleBodiesById = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const assignedNoteFiles = new Map<string, AssignedNoteFiles>()
  const aisleBodyFiles = new Map<string, string>()

  const assignNoteBodyFiles = (noteBodyId: string, baseFolder: string, primaryFileName: string): AssignedNoteFiles => {
    const existing = assignedNoteFiles.get(noteBodyId)
    if (existing) return existing
    const body = noteBodiesById.get(noteBodyId)
    const byAisleId = new Map<string, string>()
    const files: string[] = []
    if (!body) {
      const file = pathAllocator.allocate(joinPath(baseFolder, primaryFileName))
      assignedNoteFiles.set(noteBodyId, { byAisleId, files: [file] })
      return { byAisleId, files: [file] }
    }
    body.aisles.forEach((aisle, index) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const existingAisleBodyFile = aisleBodyFiles.get(aisleBodyId)
      const file = existingAisleBodyFile ?? pathAllocator.allocate(
        index === 0
          ? joinPath(baseFolder, primaryFileName)
          : joinPath(baseFolder, `${stripExtension(primaryFileName)}-aisles`, `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(aisle.id, 'aisle')}.md`),
      )
      aisleBodyFiles.set(aisleBodyId, file)
      byAisleId.set(aisle.id, file)
      files.push(file)
    })
    const assigned = { byAisleId, files }
    assignedNoteFiles.set(noteBodyId, assigned)
    return assigned
  }

  const decorateSubTab = (subTab: SubTab, index: number, folder: string): NotebookSubTab => {
    const preferredFile = `${String(index + 1).padStart(2, '0')}-${makeFileName(subTab.title, 'sub-tab', 'md')}`
    const assigned = assignNoteBodyFiles(subTab.noteBodyId, folder, preferredFile)
    return {
      ...subTab,
      file: assigned.files[0] ?? joinPath(folder, preferredFile),
    }
  }

  const decorateTab = (tab: Tab, index: number, spaceFolder: string): NotebookTab => {
    const folder = pathAllocator.allocate(joinPath(spaceFolder, `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(tab.title, 'parent')}`))
    const assignedHome = assignNoteBodyFiles(tab.noteBodyId, folder, 'home.md')
    return {
      ...tab,
      homeFile: assignedHome.files[0] ?? joinPath(folder, 'home.md'),
      subTabs: tab.subTabs.map((subTab, subTabIndex) => decorateSubTab(subTab, subTabIndex, folder)),
    }
  }

  const decorateWorkspace = (data: WorkspaceData, spaceFolder: string): NotebookWorkspaceData => ({
    activeTabId: data.activeTabId,
    tabs: data.tabs.map((tab, index) => decorateTab(tab, index, spaceFolder)),
    deletedTabs: data.deletedTabs.map((entry, index) => ({
      ...entry,
      tab: decorateTab(entry.tab, index, joinPath(spaceFolder, 'trash', 'parents')),
    })),
    deletedSubTabs: data.deletedSubTabs.map((entry, index) => ({
      ...entry,
      subTab: decorateSubTab(entry.subTab, index, joinPath(spaceFolder, 'trash', 'subtabs')),
    })),
  })

  const decorateSpace = (space: Space, index: number, domainFolder: string): NotebookSpace => {
    const folder = pathAllocator.allocate(joinPath(domainFolder, 'spaces', `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(space.name, 'space')}`))
    return {
      ...space,
      data: decorateWorkspace(space.data, folder),
    }
  }

  const decorateDomain = (domain: Domain, index: number, root = 'domains'): NotebookDomain => {
    const folder = pathAllocator.allocate(joinPath(root, `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(domain.name, 'domain')}`))
    return {
      ...domain,
      spaces: domain.spaces.map((space, spaceIndex) => decorateSpace(space, spaceIndex, folder)),
    }
  }

  const decorateDeletedSpace = (entry: DeletedSpaceEntry, index: number, root = 'trash/spaces'): NotebookDeletedSpaceEntry => {
    const folder = pathAllocator.allocate(joinPath(root, `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(entry.space.name, 'space')}`))
    return {
      ...entry,
      space: {
        ...entry.space,
        data: decorateWorkspace(entry.space.data, folder),
      },
    }
  }

  const decorateDeletedDomain = (entry: DeletedDomainEntry, index: number): NotebookDeletedDomainEntry => ({
    ...entry,
    domain: decorateDomain(entry.domain, index, 'trash/domains'),
    deletedSpaces: entry.deletedSpaces.map((spaceEntry, spaceIndex) =>
      decorateDeletedSpace(spaceEntry, spaceIndex, joinPath('trash', 'domains', sanitizePathSegment(entry.domain.name, 'domain'), 'spaces')),
    ),
  })

  const assignScratchpadFiles = (scratchpad: ScratchpadState | undefined): string[] => {
    if (!scratchpad?.noteBodyId) return []
    return assignNoteBodyFiles(scratchpad.noteBodyId, 'scratchpad', 'scratchpad.md').files
  }

  const assignUnreferencedNoteFiles = () => {
    state.noteBodies.forEach((body, index) => {
      if (assignedNoteFiles.has(body.id)) return
      assignNoteBodyFiles(body.id, joinPath('orphaned-notes', `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(body.id, 'note')}`), 'note.md')
    })
    ;(state.noteAisleBodies ?? []).forEach((body, index) => {
      if (aisleBodyFiles.has(body.id)) return
      const file = pathAllocator.allocate(joinPath('orphaned-aisles', `${String(index + 1).padStart(2, '0')}-${sanitizePathSegment(body.id, 'aisle')}.md`))
      aisleBodyFiles.set(body.id, file)
    })
  }

  return {
    aisleBodiesById,
    aisleBodyFiles,
    assignScratchpadFiles,
    assignUnreferencedNoteFiles,
    decorateDeletedDomain,
    decorateDeletedSpace,
    decorateDomain,
    pathAllocator,
  }
}

export async function buildNotebookArchive(options: BuildNotebookArchiveOptions): Promise<BuildNotebookArchiveResult> {
  const state = projectActiveDomainState(options.state)
  const treeBuilder = createNotebookTreeBuilder(state)
  const domains = state.domains.map((domain, index) => treeBuilder.decorateDomain(domain, index))
  const deletedSpaces = (state.deletedSpaces ?? []).map((entry, index) => treeBuilder.decorateDeletedSpace(entry, index))
  const deletedDomains = (state.deletedDomains ?? []).map((entry, index) => treeBuilder.decorateDeletedDomain(entry, index))
  const scratchpadFiles = treeBuilder.assignScratchpadFiles(state.scratchpad)
  treeBuilder.assignUnreferencedNoteFiles()

  const issues: NotebookArchiveIssue[] = []
  const zip = new JSZip()
  const assetBank = new NotebookAssetBank(treeBuilder.pathAllocator)
  const noteAisleBodies: NotebookAisleBody[] = []

  for (const body of state.noteAisleBodies ?? []) {
    const file = treeBuilder.aisleBodyFiles.get(body.id) ?? treeBuilder.pathAllocator.allocate(joinPath('orphaned-aisles', `${sanitizePathSegment(body.id, 'aisle')}.md`))
    noteAisleBodies.push({
      ...body,
      file,
    })
    const markdown = await rewriteMarkdownAssetsForExport(
      exportMarkdownForAisleBody(state, body),
      file,
      assetBank,
      issues,
      options,
    )
    zip.file(file, markdown)
  }

  const noteBodies: NotebookNoteBody[] = state.noteBodies.map((body) => ({
    ...body,
    aisles: body.aisles.map((aisle) => ({
      ...aisle,
      file: treeBuilder.aisleBodyFiles.get(getAisleBodyId(aisle)) ?? '',
    })),
  }))

  assetBank.files.forEach((bytes, file) => {
    zip.file(file, bytes)
  })

  const summary = getNotebookSummary(state, assetBank.files.size)
  const manifest: NotebookArchiveManifest = {
    format: NOTEBOOK_ARCHIVE_FORMAT,
    version: NOTEBOOK_ARCHIVE_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    metadata: {
      app: 'Tabs',
      ...(options.appVersion ? { appVersion: options.appVersion } : {}),
      ...summary,
    },
    domains,
    deletedSpaces,
    deletedDomains,
    noteBodies,
    noteAisleBodies,
    frontmatter: state.frontmatter,
    scratchpad: state.scratchpad ? { ...state.scratchpad, files: scratchpadFiles } : null,
    assets: Array.from(assetBank.manifest.values()),
  }

  zip.file(NOTEBOOK_ARCHIVE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  zip.file(
    README_PATH,
    'This Tabs notebook archive stores readable Markdown files plus tabs-notebook.json, which is authoritative for domains, spaces, tabs, aisles, trash, scratchpad, frontmatter, and assets.\n',
  )

  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    bytes,
    manifest,
    summary,
    issues,
  }
}

export async function parseNotebookArchive(bytes: Uint8Array | ArrayBuffer): Promise<ParseNotebookArchiveResult> {
  const archiveBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const issues: NotebookArchiveIssue[] = []
  if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    return {
      ok: false,
      error: 'Notebook archive is too large.',
      issues: [createIssue('archive-too-large', 'error', 'Notebook archive is too large.')],
    }
  }

  const duplicateEntries = detectDuplicateZipEntryNames(archiveBytes)
  if (duplicateEntries.length > 0) {
    return {
      ok: false,
      error: 'Notebook archive contains duplicate entries.',
      issues: duplicateEntries.map((entry) =>
        createIssue('duplicate-entry', 'error', 'Notebook archive contains duplicate entries.', entry),
      ),
    }
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(archiveBytes)
  } catch {
    return {
      ok: false,
      error: 'Notebook archive is not a readable zip file.',
      issues: [createIssue('invalid-zip', 'error', 'Notebook archive is not a readable zip file.')],
    }
  }

  const entries = Object.values(zip.files)
  if (entries.length > MAX_ARCHIVE_FILES) {
    return {
      ok: false,
      error: 'Notebook archive contains too many files.',
      issues: [createIssue('too-many-files', 'error', 'Notebook archive contains too many files.')],
    }
  }

  for (const entry of entries) {
    const unsafeOriginalName = typeof (entry as { unsafeOriginalName?: unknown }).unsafeOriginalName === 'string'
      ? (entry as { unsafeOriginalName: string }).unsafeOriginalName
      : entry.name
    const issue = validateArchivePath(unsafeOriginalName)
    if (issue) issues.push(issue)
    if (isZipSymlink(entry)) issues.push(createIssue('symlink-entry', 'error', 'Notebook archive must not contain symlinks.', entry.name))
  }
  if (issues.some((issue) => issue.severity === 'error')) {
    return { ok: false, error: issues.find((issue) => issue.severity === 'error')?.message ?? 'Notebook archive is invalid.', issues }
  }

  const manifestEntry = zip.file(NOTEBOOK_ARCHIVE_MANIFEST)
  if (!manifestEntry) {
    return {
      ok: false,
      error: 'Notebook archive is missing tabs-notebook.json.',
      issues: [createIssue('missing-manifest', 'error', 'Notebook archive is missing tabs-notebook.json.', NOTEBOOK_ARCHIVE_MANIFEST)],
    }
  }

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await manifestEntry.async('string'))
  } catch {
    return {
      ok: false,
      error: 'Notebook manifest is corrupt.',
      issues: [createIssue('corrupt-manifest', 'error', 'Notebook manifest is corrupt.', NOTEBOOK_ARCHIVE_MANIFEST)],
    }
  }

  const manifestValidation = validateNotebookManifest(rawManifest)
  issues.push(...manifestValidation.issues)
  if (!manifestValidation.manifest) {
    return {
      ok: false,
      error: issues.find((issue) => issue.severity === 'error')?.message ?? 'Notebook manifest is invalid.',
      issues,
    }
  }

  const manifest = manifestValidation.manifest
  const requiredFiles = getRequiredManifestFiles(manifest)
  for (const file of requiredFiles) {
    const issue = validateArchivePath(file)
    if (issue) issues.push(issue)
    if (!zip.file(file)) issues.push(createIssue('missing-file', 'error', 'Notebook archive is missing a file referenced by the manifest.', file))
  }
  for (const entry of entries) {
    if (entry.dir) continue
    const size = getZipObjectSize(entry)
    if (entry.name.endsWith('.md') && size > MAX_MARKDOWN_FILE_BYTES) {
      issues.push(createIssue('markdown-too-large', 'error', 'Notebook markdown file is too large.', entry.name))
    }
    if (entry.name.startsWith(`${ASSET_ROOT}/`) && size > MAX_ASSET_FILE_BYTES) {
      issues.push(createIssue('asset-too-large', 'error', 'Notebook asset file is too large.', entry.name))
    }
    if (
      entry.name !== NOTEBOOK_ARCHIVE_MANIFEST &&
      entry.name !== README_PATH &&
      !entry.name.endsWith('.md') &&
      !entry.name.startsWith(`${ASSET_ROOT}/`)
    ) {
      issues.push(createIssue('unexpected-file', 'warning', 'Notebook archive contains an unexpected file.', entry.name))
    }
  }
  if (issues.some((issue) => issue.severity === 'error')) {
    return { ok: false, error: issues.find((issue) => issue.severity === 'error')?.message ?? 'Notebook archive is invalid.', issues }
  }

  const assetFiles = new Map<string, NotebookImportedAsset>()
  for (const asset of manifest.assets) {
    const entry = zip.file(asset.file)
    if (!entry) continue
    const assetBytes = await entry.async('uint8array')
    const mimeType = typeof asset.mimeType === 'string' && asset.mimeType ? asset.mimeType : getMimeTypeFromExtension(extname(asset.file))
    assetFiles.set(asset.file, {
      file: asset.file,
      bytes: assetBytes,
      mimeType,
      extension: getExtensionFromMimeType(mimeType) || normalizeExtension(extname(asset.file)),
    })
  }

  const aisleBodyFiles = new Map<string, string>()
  const noteAisleBodies: NoteAisleBody[] = []
  for (const manifestBody of manifest.noteAisleBodies) {
    const entry = zip.file(manifestBody.file)
    if (!entry) continue
    const markdown = await entry.async('string')
    noteAisleBodies.push(parseMarkdownFile(markdown, manifestBody))
    aisleBodyFiles.set(manifestBody.id, manifestBody.file)
  }

  const domains = manifest.domains.map(stripNotebookDomain)
  const activeDomain = domains[0]
  const rawState = {
    theme: 'dawn',
    activeDomainId: activeDomain?.id ?? '',
    domains,
    deletedDomains: manifest.deletedDomains.map(stripNotebookDeletedDomain),
    deletedSpaces: manifest.deletedSpaces.map(stripNotebookDeletedSpace),
    scratchpad: manifest.scratchpad ? { noteBodyId: manifest.scratchpad.noteBodyId, activeAisleId: manifest.scratchpad.activeAisleId } : undefined,
    noteBodies: manifest.noteBodies.map((body) => ({
      ...body,
      aisles: body.aisles.map((aisle) => ({
        id: aisle.id,
        aisleBodyId: aisle.aisleBodyId,
      })),
    })),
    noteAisleBodies,
    activeSpaceId: activeDomain?.activeSpaceId ?? '',
    spaces: activeDomain?.spaces ?? [],
    frontmatter: manifest.frontmatter,
  }
  const state = parseSavedState(JSON.stringify(rawState))
  const summary = {
    ...getNotebookSummary(state, manifest.assets.length),
    repairedIds: undefined,
    warnings: issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message),
  }

  return {
    ok: true,
    archive: {
      manifest,
      state,
      scratchpad: manifest.scratchpad ? { noteBodyId: manifest.scratchpad.noteBodyId, activeAisleId: manifest.scratchpad.activeAisleId } : null,
      assetFiles,
      aisleBodyFiles,
      summary,
      issues,
    },
  }
}

export async function materializeNotebookImportAssets(
  parsed: ParsedNotebookArchive,
  options: MaterializeNotebookImportAssetsOptions = {},
): Promise<ParsedNotebookArchive> {
  if (parsed.assetFiles.size === 0) return parsed
  const materializedAssets = new Map<string, string>()
  const usedAssetPaths = new Set<string>()
  const warnings: string[] = []
  const noteAisleBodies: NoteAisleBody[] = []
  const skippedAisleBodyIds = new Set<string>()
  if (options.includeScratchpad === false && parsed.state.scratchpad?.noteBodyId) {
    const referenced = collectReferencedNoteBodyIdsFromNotebookContent(parsed.state)
    if (!referenced.has(parsed.state.scratchpad.noteBodyId)) {
      const scratchpadBody = parsed.state.noteBodies.find((body) => body.id === parsed.state.scratchpad?.noteBodyId)
      scratchpadBody?.aisles.forEach((aisle) => skippedAisleBodyIds.add(getAisleBodyId(aisle)))
    }
  }
  for (const body of parsed.state.noteAisleBodies ?? []) {
    const noteFile = parsed.aisleBodyFiles.get(body.id)
    if (!noteFile || skippedAisleBodyIds.has(body.id)) {
      noteAisleBodies.push(body)
      continue
    }
    noteAisleBodies.push({
      ...body,
      markdown: await rewriteMarkdownAssetsForImport(
        body.markdown,
        noteFile,
        parsed,
        options,
        materializedAssets,
        usedAssetPaths,
        warnings,
      ),
    })
  }
  const issues = [
    ...parsed.issues,
    ...warnings.map((warning) => createIssue('asset-import-warning', 'warning', warning)),
  ]
  return {
    ...parsed,
    state: {
      ...parsed.state,
      noteAisleBodies,
    },
    summary: {
      ...parsed.summary,
      warnings: [...(parsed.summary.warnings ?? []), ...warnings],
    },
    issues,
  }
}

export function mergeImportedNotebookState(
  current: AppState,
  imported: ParsedNotebookArchive,
  options: NotebookImportMergeOptions = {},
): NotebookImportMergeResult {
  const includeScratchpad = options.includeScratchpad ?? false
  const importState = includeScratchpad ? imported.state : removeIgnoredScratchpadFromImport(imported.state)
  const merged = mergeImportedBackupState(current, importState, options.createId ?? createId, {
    importScratchpadAsTab: false,
  })
  let nextState = merged.state
  let appliedScratchpad = false
  if (includeScratchpad && merged.summary.scratchpad) {
    nextState = projectActiveDomainState({
      ...nextState,
      scratchpad: merged.summary.scratchpad,
    })
    appliedScratchpad = true
  }
  return {
    state: nextState,
    summary: {
      ...merged.summary,
      appliedScratchpad,
    },
  }
}

export function toNotebookArchiveArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return toArrayBuffer(bytes)
}

export function notebookAssetToDataUrl(asset: NotebookImportedAsset): string {
  return encodeDataUrl(asset)
}
