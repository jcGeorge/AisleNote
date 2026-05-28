import { importImageBlobAsAssetUrl as defaultImportImageBlobAsAssetUrl } from '../markdown/image-asset-registry'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { sanitizeEditorHtml } from './editor-sanitizer'

export type ClipboardPasteMode = 'rich' | 'plainText'
export type ClipboardMarkdownSource = 'html' | 'plain-text' | 'image'

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

type ToastEditorLike = {
  setHTML: (html: string, cursorToEnd?: boolean) => void
  insertText: (text: string) => void
  getMarkdown: () => string
  destroy: () => void
  focus?: () => void
}

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

async function withTransientToastEditor(run: (editor: ToastEditorLike) => void): Promise<string> {
  if (typeof document === 'undefined') throw new Error('clipboard markdown conversion requires a DOM')
  const { Editor } = await import('@toast-ui/editor')
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.position = 'fixed'
  el.style.left = '-10000px'
  el.style.top = '-10000px'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.overflow = 'hidden'
  document.body.appendChild(el)

  const editor = new Editor({
    el,
    initialValue: '',
    initialEditType: 'wysiwyg',
    previewStyle: 'tab',
    hideModeSwitch: true,
    customHTMLSanitizer: sanitizeEditorHtml,
    toolbarItems: [],
    height: '1px',
    usageStatistics: false,
  }) as unknown as ToastEditorLike

  try {
    run(editor)
    return normalizeMarkdownForPersistence(editor.getMarkdown())
  } finally {
    editor.destroy()
    el.remove()
  }
}

export async function convertClipboardHtmlToMarkdown(html: string): Promise<string> {
  return withTransientToastEditor((editor) => editor.setHTML(html, true))
}

export async function convertClipboardPlainTextToMarkdown(text: string): Promise<string> {
  return withTransientToastEditor((editor) => {
    editor.focus?.()
    editor.insertText(text)
  })
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
          markdowns.push(`![${escapeMarkdownImageAltText(fileName)}](${assetUrl})`)
        }
      } catch {
        // Ignore a failed image item and keep checking the rest of the clipboard.
      }
    }
  }
  return markdowns
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
}: {
  mode: ClipboardPasteMode
  clipboard?: ClipboardLike | null
  convertHtmlToMarkdown?: MarkdownConverter
  convertPlainTextToMarkdown?: MarkdownConverter
  importImageBlobAsAssetUrl?: (blob: Blob, fileName?: string) => Promise<string | null>
}): Promise<ClipboardMarkdownReadResult> {
  if (!clipboard) return { ok: false, reason: 'unavailable' }

  if (mode === 'plainText') {
    return readPlainTextClipboard(clipboard, convertPlainTextToMarkdown)
  }

  if (clipboard.read) {
    try {
      const items = await clipboard.read()
      const html = await getFirstItemText(items, HTML_MIME)
      if (html && html.trim().length > 0) {
        try {
          const converted = toResult(await convertHtmlToMarkdown(html), 'html')
          if (converted.ok) return converted
        } catch {
          // Fall through to text/plain.
        }
      }

      const textResult = await convertTextResult(await getFirstItemText(items, PLAIN_TEXT_MIME), convertPlainTextToMarkdown)
      if (textResult) return textResult

      const imageMarkdowns = await getImageMarkdowns(items, importImageBlobAsAssetUrl)
      if (imageMarkdowns.length > 0) return toResult(imageMarkdowns.join('\n\n'), 'image')
    } catch {
      // Fall through to readText.
    }
  }

  return readPlainTextClipboard(clipboard, convertPlainTextToMarkdown)
}
