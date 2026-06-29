import {
  importBlobAsAssetUrl as defaultImportBlobAsAssetUrl,
  importImageBlobAsAssetUrl as defaultImportImageBlobAsAssetUrl,
} from '../markdown/image-asset-registry'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { importMediaFilesAsMarkdown, type ImportAssetBlob } from './media-file-insertion'
import { withDefaultInsertedImageDisplayWidth } from './image-insertion'
import {
  convertClipboardHtmlToVisualMarkdown,
  isLayoutSensitiveClipboardText,
  normalizeVisualClipboardText,
  AISLENOTE_MARKDOWN_CLIPBOARD_MIME,
} from './visual-clipboard'

export type ClipboardPasteMode = 'rich' | 'plainText'
export type ClipboardMarkdownSource = 'aislenote-markdown' | 'html' | 'plain-text' | 'image' | 'media'

export type ClipboardMarkdownReadResult =
  | { ok: true; markdown: string; source: ClipboardMarkdownSource; text?: string }
  | { ok: false; reason: 'empty' | 'unavailable' }

export type ClipboardLike = {
  read?: () => Promise<ClipboardItemLike[]>
  readText?: () => Promise<string>
}

export type ClipboardItemLike = {
  types?: readonly string[]
  getType?: (type: string) => Promise<Blob>
}

type MarkdownConverter = (value: string) => string | Promise<string>

const HTML_MIME = 'text/html'
const PLAIN_TEXT_MIME = 'text/plain'

function getGlobalClipboard(): ClipboardLike | null {
  return typeof navigator !== 'undefined' ? navigator.clipboard ?? null : null
}

function toResult(
  markdown: string,
  source: ClipboardMarkdownSource,
  text?: string,
): ClipboardMarkdownReadResult {
  const normalized = normalizeMarkdownForPersistence(markdown)
  if (normalized.trim().length <= 0) return { ok: false, reason: 'empty' }
  return text === undefined
    ? { ok: true, markdown: normalized, source }
    : { ok: true, markdown: normalized, source, text }
}

export async function convertClipboardHtmlToMarkdown(html: string): Promise<string> {
  return convertClipboardHtmlToVisualMarkdown(html)
}

export async function convertClipboardPlainTextToMarkdown(text: string): Promise<string> {
  return normalizeVisualClipboardText(text)
}

async function getItemText(item: ClipboardItemLike, type: string): Promise<string | null> {
  if (!item.types?.includes(type) || !item.getType) return null
  const blob = await item.getType(type)
  return blob.text()
}

async function getFirstItemText(items: readonly ClipboardItemLike[], type: string): Promise<string | null> {
  for (const item of items) {
    try {
      const text = await getItemText(item, type)
      if (text !== null) return text
    } catch {
      // Keep looking for another item/type before falling back.
    }
  }
  return null
}

function getImageExtension(type: string): string {
  const subtype = type.match(/^image\/([a-zA-Z0-9+.-]+)$/)?.[1] ?? 'png'
  if (subtype === 'jpeg') return 'jpg'
  if (subtype === 'svg+xml') return 'svg'
  return subtype.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
}

function getImageFileName(blob: Blob, index: number): string {
  if (typeof File !== 'undefined' && blob instanceof File && blob.name.trim()) return blob.name
  const suffix = index <= 1 ? '' : `-${index}`
  return `clipboard-image${suffix}.${getImageExtension(blob.type)}`
}

function escapeMarkdownImageAltText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}

async function getImageMarkdowns(
  items: readonly ClipboardItemLike[],
  importImageBlobAsAssetUrl: (blob: Blob, fileName?: string) => Promise<string | null>,
): Promise<string[]> {
  const markdowns: string[] = []
  for (const item of items) {
    const imageTypes = (item.types ?? []).filter((type) => type.startsWith('image/'))
    for (const imageType of imageTypes) {
      if (!item.getType) continue
      try {
        const blob = await item.getType(imageType)
        const fileName = getImageFileName(blob, markdowns.length + 1)
        const assetUrl = await importImageBlobAsAssetUrl(blob, fileName)
        if (assetUrl) {
          const displayUrl = await withDefaultInsertedImageDisplayWidth(assetUrl, blob, null)
          markdowns.push(`![${escapeMarkdownImageAltText(fileName)}](${displayUrl})`)
        }
      } catch {
        // Ignore a failed image item and keep checking the rest of the clipboard.
      }
    }
  }
  return markdowns
}

async function getMediaMarkdown(
  items: readonly ClipboardItemLike[],
  importBlobAsAssetUrl: ImportAssetBlob,
): Promise<string | null> {
  const blobs: Blob[] = []
  for (const item of items) {
    const mediaTypes = (item.types ?? []).filter((type) => type.startsWith('audio/') || type.startsWith('video/'))
    for (const mediaType of mediaTypes) {
      if (!item.getType) continue
      try {
        blobs.push(await item.getType(mediaType))
      } catch {
        // Ignore a failed media item and keep checking the rest of the clipboard.
      }
    }
  }
  return importMediaFilesAsMarkdown(blobs, importBlobAsAssetUrl)
}

async function convertTextResult(
  text: string | null,
  converter: MarkdownConverter,
): Promise<ClipboardMarkdownReadResult | null> {
  if (text === null) return null
  if (text.length <= 0) return { ok: false, reason: 'empty' }
  try {
    return toResult(await converter(text), 'plain-text', text)
  } catch {
    return null
  }
}

async function readPlainTextClipboard(
  clipboard: ClipboardLike,
  converter: MarkdownConverter,
): Promise<ClipboardMarkdownReadResult> {
  if (!clipboard.readText) return { ok: false, reason: 'unavailable' }
  try {
    const converted = await convertTextResult(await clipboard.readText(), converter)
    return converted ?? { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export async function readClipboardMarkdown({
  mode,
  clipboard = getGlobalClipboard(),
  convertHtmlToMarkdown = convertClipboardHtmlToMarkdown,
  convertPlainTextToMarkdown = convertClipboardPlainTextToMarkdown,
  importImageBlobAsAssetUrl = defaultImportImageBlobAsAssetUrl,
  importBlobAsAssetUrl = defaultImportBlobAsAssetUrl,
}: {
  mode: ClipboardPasteMode
  clipboard?: ClipboardLike | null
  convertHtmlToMarkdown?: MarkdownConverter
  convertPlainTextToMarkdown?: MarkdownConverter
  importImageBlobAsAssetUrl?: (blob: Blob, fileName?: string) => Promise<string | null>
  importBlobAsAssetUrl?: ImportAssetBlob
}): Promise<ClipboardMarkdownReadResult> {
  if (!clipboard) return { ok: false, reason: 'unavailable' }

  if (mode === 'plainText') {
    return readPlainTextClipboard(clipboard, convertPlainTextToMarkdown)
  }

  if (clipboard.read) {
    try {
      const items = await clipboard.read()
      const tabsMarkdown = await getFirstItemText(items, AISLENOTE_MARKDOWN_CLIPBOARD_MIME)
      if (tabsMarkdown && tabsMarkdown.length > 0) {
        const normalized = normalizeMarkdownForPersistence(normalizeVisualClipboardText(tabsMarkdown))
        return normalized.trim().length > 0
          ? { ok: true, markdown: normalized, source: 'aislenote-markdown', text: normalized }
          : { ok: false, reason: 'empty' }
      }
      const html = await getFirstItemText(items, HTML_MIME)
      const plainText = await getFirstItemText(items, PLAIN_TEXT_MIME)
      if (isLayoutSensitiveClipboardText(plainText)) {
        const textResult = await convertTextResult(plainText, convertPlainTextToMarkdown)
        if (textResult) return textResult
      }

      if (html && html.trim().length > 0) {
        try {
          const converted = toResult(await convertHtmlToMarkdown(html), 'html')
          if (converted.ok) return converted
        } catch {
          // Fall through to text/plain.
        }
      }

      const textResult = await convertTextResult(plainText, convertPlainTextToMarkdown)
      if (textResult) return textResult

      const imageMarkdowns = await getImageMarkdowns(items, importImageBlobAsAssetUrl)
      if (imageMarkdowns.length > 0) return toResult(imageMarkdowns.join('\n\n'), 'image')

      const mediaMarkdown = await getMediaMarkdown(items, importBlobAsAssetUrl)
      if (mediaMarkdown) return toResult(mediaMarkdown, 'media')
    } catch {
      // Fall through to readText.
    }
  }

  return readPlainTextClipboard(clipboard, convertPlainTextToMarkdown)
}
