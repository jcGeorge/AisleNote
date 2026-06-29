import * as React from 'react'
import { useEffect, useState, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  RENDERED_MARKDOWN_CLASS_NAMES,
  RENDERED_MARKDOWN_SURFACE_CLASS,
} from '../editor/rendered-markdown-surface'
import { resolveAssetDisplayUrl } from '../markdown/image-asset-registry'
import {
  MarkdownPreviewHeading1,
  MarkdownPreviewHeading2,
  MarkdownPreviewHeading3,
  MarkdownPreviewHeading4,
  MarkdownPreviewHeading5,
  MarkdownPreviewHeading6,
  MarkdownPreviewInput,
  MarkdownPreviewParagraph,
  createMarkdownPreviewListItem,
  createMarkdownPreviewUnorderedList,
} from '../components/notes/markdown-preview-components'
import type { ElectronPrintDocumentPayload, ElectronPrintableAislePayload } from '../types/electron-api'
import { getPrintMarkdownSource } from './print-markdown-source'
import './print.css'

void React

const PRINT_RENDER_READY_IMAGE_TIMEOUT_MS = 2000

type PrintMarkdownLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown
  children?: ReactNode
}

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined
}

function transformPrintUrl(url: string, key: string) {
  if (key === 'href' && /^aislenote-asset:/i.test(url)) return url
  if (key === 'src' && /^aislenote:\/\/note\//i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^aislenote-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

function PrintMarkdownLink({ node, href, children, className, ...props }: PrintMarkdownLinkProps) {
  void node
  return (
    <a
      {...props}
      href={href}
      className={mergeClassNames(className, RENDERED_MARKDOWN_CLASS_NAMES.link)}
    >
      {children}
    </a>
  )
}

function PrintMarkdownImage({ node, src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }) {
  void node
  const label = alt?.trim() || 'Linked note'
  if (src && /^aislenote:\/\/note\//i.test(src)) {
    return <span className="aislenote-print-widget-fallback">{label}</span>
  }
  return <img {...props} src={src} alt={alt} draggable={false} />
}

export function PrintAisleMarkdown({ markdown }: { markdown: string }) {
  const printMarkdown = React.useMemo(() => getPrintMarkdownSource(markdown), [markdown])
  const components = React.useMemo(
    () => ({
      a: PrintMarkdownLink,
      h1: MarkdownPreviewHeading1,
      h2: MarkdownPreviewHeading2,
      h3: MarkdownPreviewHeading3,
      h4: MarkdownPreviewHeading4,
      h5: MarkdownPreviewHeading5,
      h6: MarkdownPreviewHeading6,
      input: MarkdownPreviewInput,
      img: PrintMarkdownImage,
      li: createMarkdownPreviewListItem(printMarkdown),
      p: MarkdownPreviewParagraph,
      ul: createMarkdownPreviewUnorderedList(printMarkdown),
    }),
    [printMarkdown],
  )

  return (
    <section className={`aislenote-print-markdown aisle-edit-preview ${RENDERED_MARKDOWN_SURFACE_CLASS}`}>
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} urlTransform={transformPrintUrl} components={components}>
        {printMarkdown}
      </ReactMarkdown>
    </section>
  )
}

type NormalizedPrintDocumentPayload = {
  noteTitle: string
  mode: 'aisle' | 'note'
  aisles: ElectronPrintableAislePayload[]
}

function normalizeAisle(payload: Partial<ElectronPrintableAislePayload>, index: number): ElectronPrintableAislePayload {
  return {
    label: payload.label?.trim() || `Aisle ${index + 1}`,
    markdown: typeof payload.markdown === 'string' ? payload.markdown : '',
  }
}

function normalizePayload(payload: ElectronPrintDocumentPayload): NormalizedPrintDocumentPayload {
  const sourceAisles = Array.isArray(payload.aisles) && payload.aisles.length > 0
    ? payload.aisles
    : [{ label: payload.aisleLabel, markdown: payload.markdown }]
  return {
    noteTitle: payload.noteTitle?.trim() || 'Untitled',
    mode: payload.mode === 'note' ? 'note' : 'aisle',
    aisles: sourceAisles.map((aisle, index) => normalizeAisle(aisle, index)),
  }
}

function waitForFrame() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    window.requestAnimationFrame(() => resolve())
  })
}

async function waitForImages() {
  if (typeof document === 'undefined') return
  const images = Array.from(document.images)
  if (images.length <= 0) return
  const imageSettled = Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })
    }),
  )
  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, PRINT_RENDER_READY_IMAGE_TIMEOUT_MS)
  })
  await Promise.race([imageSettled, timeout])
}

async function waitForPrintDocumentReady() {
  await waitForFrame()
  await waitForFrame()
  await Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
  ])
  await waitForImages()
}

export function PrintAisleDocumentContent({ payload }: { payload: NormalizedPrintDocumentPayload | null }) {
  return (
    <main className="aislenote-print-root" aria-label={payload?.mode === 'note' ? 'Print note' : 'Print aisle'}>
      {payload ? (
        <div className="aislenote-print-document" data-print-mode={payload.mode}>
          {payload.aisles.map((aisle, index) => (
            <PrintAisleMarkdown key={`${aisle.label}-${index}`} markdown={aisle.markdown} />
          ))}
        </div>
      ) : (
        <p className="aislenote-print-loading">Preparing print...</p>
      )}
    </main>
  )
}

export function PrintAisleDocument() {
  const [payload, setPayload] = useState<NormalizedPrintDocumentPayload | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('aislenote-print-mode')
    document.body.classList.add('aislenote-print-mode')
    return () => {
      document.documentElement.classList.remove('aislenote-print-mode')
      document.body.classList.remove('aislenote-print-mode')
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onPrintAislePayload?.((nextPayload) => {
      setPayload(normalizePayload(nextPayload))
    })
    window.electronAPI?.notifyPrintAislePayloadReady?.()
    return unsubscribe ?? (() => undefined)
  }, [])

  useEffect(() => {
    if (!payload) return undefined
    let canceled = false
    void waitForPrintDocumentReady().then(() => {
      if (!canceled) window.electronAPI?.notifyPrintAisleRenderReady?.()
    })
    return () => {
      canceled = true
    }
  }, [payload])

  return <PrintAisleDocumentContent payload={payload} />
}
