import { Fragment, Slice } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import { getMediaKindFromFile, type MediaKind } from '../media/media-utils'
import { createLinkMark } from './prosemirror-utils'

export type ImportAssetBlob = (blob: Blob, fileName?: string) => Promise<string | null>

export type MediaImportItem = {
  blob: Blob
  fileName: string
  kind: MediaKind
}

export type ImportedMediaLink = {
  label: string
  url: string
  kind: MediaKind
}

export type AssetLinkInsertion = {
  label: string
  url: string
}

type DataTransferLike = {
  files?: Iterable<Blob> | ArrayLike<Blob>
  items?: Iterable<{ kind?: string; type?: string }> | ArrayLike<{ kind?: string; type?: string }>
}

const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'weba',
  'audio/x-aac': 'aac',
  'audio/x-flac': 'flac',
  'audio/x-m4a': 'm4a',
  'audio/x-wav': 'wav',
}

const VIDEO_MIME_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}

function getMediaExtension(blob: Blob, kind: MediaKind): string {
  const mimeType = blob.type.trim().toLowerCase()
  const extension = kind === 'audio' ? AUDIO_MIME_EXTENSIONS[mimeType] : VIDEO_MIME_EXTENSIONS[mimeType]
  return extension ?? (kind === 'audio' ? 'mp3' : 'mp4')
}

export function getMediaImportFileName(blob: Blob, index: number, kind: MediaKind): string {
  if (typeof File !== 'undefined' && blob instanceof File && blob.name.trim()) return blob.name.trim()
  const suffix = index <= 1 ? '' : `-${index}`
  return `clipboard-${kind}${suffix}.${getMediaExtension(blob, kind)}`
}

function toArray<T>(items: Iterable<T> | ArrayLike<T>): T[] {
  return Array.from(items as ArrayLike<T>)
}

export function collectMediaImportItems(files: Iterable<Blob> | ArrayLike<Blob>): MediaImportItem[] {
  const items: MediaImportItem[] = []
  for (const file of toArray(files)) {
    const kind = getMediaKindFromFile({
      type: file.type,
      name: typeof File !== 'undefined' && file instanceof File ? file.name : undefined,
    })
    if (!kind) continue
    items.push({
      blob: file,
      kind,
      fileName: getMediaImportFileName(file, items.length + 1, kind),
    })
  }
  return items
}

export function getMediaFilesFromDataTransfer(dataTransfer: DataTransferLike | null | undefined): Blob[] {
  return dataTransfer?.files ? collectMediaImportItems(dataTransfer.files).map((item) => item.blob) : []
}

export function dataTransferHasMediaFiles(dataTransfer: DataTransferLike | null | undefined): boolean {
  if (!dataTransfer) return false
  if (dataTransfer.files && collectMediaImportItems(dataTransfer.files).length > 0) return true
  if (!dataTransfer.items) return false
  for (const item of toArray(dataTransfer.items)) {
    if (item.kind && item.kind !== 'file') continue
    if (getMediaKindFromFile({ type: item.type ?? '' })) return true
  }
  return false
}

export function buildMediaMarkdownLink(label: string, assetUrl: string): string {
  return `[${escapeMarkdownLinkLabel(label.trim() || 'media')}](${assetUrl})`
}

export async function importMediaFilesAsMarkdown(
  files: Iterable<Blob> | ArrayLike<Blob>,
  importBlobAsAssetUrl: ImportAssetBlob,
): Promise<string | null> {
  const importedLinks = await importMediaFilesAsLinks(files, importBlobAsAssetUrl)
  const markdownLinks = importedLinks.map((link) => buildMediaMarkdownLink(link.label, link.url))
  return markdownLinks.length > 0 ? markdownLinks.join('\n\n') : null
}

export async function importMediaFilesAsLinks(
  files: Iterable<Blob> | ArrayLike<Blob>,
  importBlobAsAssetUrl: ImportAssetBlob,
): Promise<ImportedMediaLink[]> {
  const importedLinks: ImportedMediaLink[] = []
  for (const item of collectMediaImportItems(files)) {
    const assetUrl = await importBlobAsAssetUrl(item.blob, item.fileName)
    if (assetUrl) {
      importedLinks.push({
        label: item.fileName,
        url: assetUrl,
        kind: item.kind,
      })
    }
  }
  return importedLinks
}

export function insertAssetLinksIntoWysiwygView(
  view: any | null,
  links: AssetLinkInsertion[],
  coords?: { left: number; top: number } | null,
): boolean {
  if (!view?.state?.schema || !view?.dispatch || links.length === 0) return false
  const linkMarkType = view.state.schema.marks?.link
  const hardBreakType = view.state.schema.nodes?.hardBreak
  if (!linkMarkType) return false

  let transaction = view.state.tr
  if (coords && typeof view.posAtCoords === 'function') {
    const resolvedPosition = view.posAtCoords(coords)
    if (typeof resolvedPosition?.pos === 'number') {
      try {
        transaction = transaction.setSelection(TextSelection.create(view.state.doc, resolvedPosition.pos))
      } catch {
        // Keep the current cursor if the drop coordinate resolves somewhere invalid for text insertion.
      }
    }
  }

  const nodes: any[] = []
  links.forEach((link, index) => {
    const label = link.label.trim() || 'media'
    if (index > 0 && hardBreakType) {
      nodes.push(hardBreakType.create(), hardBreakType.create())
    } else if (index > 0) {
      nodes.push(view.state.schema.text(' '))
    }
    nodes.push(view.state.schema.text(label, [createLinkMark(linkMarkType, link.url)]))
  })

  try {
    view.dispatch(transaction.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView())
    return true
  } catch {
    return false
  }
}
