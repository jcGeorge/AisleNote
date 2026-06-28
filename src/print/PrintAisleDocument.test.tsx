import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PrintAisleDocumentContent, PrintAisleMarkdown } from './PrintAisleDocument'
import { getPrintMarkdownSource } from './print-markdown-source'

const sourceDir = dirname(fileURLToPath(import.meta.url))
const printCss = readFileSync(join(sourceDir, './print.css'), 'utf8')
const mainSource = readFileSync(join(sourceDir, '../main.tsx'), 'utf8')
const printDocumentSource = readFileSync(join(sourceDir, './PrintAisleDocument.tsx'), 'utf8')

function renderPrintMarkdown(markdown: string) {
  return renderToStaticMarkup(<PrintAisleMarkdown markdown={markdown} />)
}

describe('PrintAisleMarkdown', () => {
  it('keeps app-specific basic Markdown markers in print markup', () => {
    const html = renderPrintMarkdown([
      '# Heading',
      '',
      '- dashed item',
      '',
      '-- Annotation text',
      '',
      '--^ arrow text',
      '',
      '- [x] task item',
      '',
      '> quoted text',
      '',
      '---',
      '',
      '| A | B |',
      '| --- | --- |',
      '| one | two |',
      '',
      '`inline`',
      '',
      '```',
      'code block',
      '```',
      '',
      '![Diagram](data:image/png;base64,abc)',
    ].join('\n'))

    expect(html).toContain('aislenote-rendered-markdown-heading aislenote-rendered-markdown-heading-1')
    expect(html).toContain('aislenote-dash-list')
    expect(html).toContain('aislenote-dash-list-item')
    expect(html).toContain('aislenote-annotation-line')
    expect(html).toContain('aislenote-annotation-inline-arrow')
    expect(html).toContain('\u21b0')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked=""')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<hr/>')
    expect(html).toContain('<table>')
    expect(html).toContain('<code>inline</code>')
    expect(html).toContain('code block')
    expect(html).toContain('src="data:image/png;base64,abc"')
    expect(html).not.toContain('-- Annotation text')
    expect(html).not.toContain('--^ arrow text')
  })

  it('renders media and note preview tokens as static printable content', () => {
    const html = renderPrintMarkdown([
      '[audio](aislenote-asset:///assets/audio.mp3)',
      '',
      '![Linked note](aislenote://note/example)',
    ].join('\n'))

    expect(html).toContain('href="aislenote-asset:///assets/audio.mp3"')
    expect(html).not.toContain('aislenote-media-player')
    expect(html).toContain('aislenote-print-widget-fallback')
    expect(html).toContain('Linked note')
  })

  it('prints span-wrapped HTML content without exposing raw HTML tags', () => {
    const markdown = [
      '<p class="p1"><span class="s1">Alpha</span><span class="s2"> beta</span></p>',
      '<p class="p1"><span class="s1">Gamma</span><br><span class="s1">Delta</span></p>',
    ].join('\n')
    const html = renderPrintMarkdown(markdown)

    expect(getPrintMarkdownSource(markdown)).not.toContain('<p class="p1">')
    expect(getPrintMarkdownSource(markdown)).toContain('Alpha')
    expect(html).toContain('Alpha beta')
    expect(html).toContain('Gamma')
    expect(html).toContain('Delta')
    expect(html).not.toContain('&lt;span')
    expect(html).not.toContain('class=&quot;s1&quot;')
    expect(html).not.toContain('<span class="s1">')
  })
})

describe('PrintAisleDocument', () => {
  it('renders a whole-note PDF payload as multiple aisle sections without title chrome', () => {
    const html = renderToStaticMarkup(
      <PrintAisleDocumentContent
        payload={{
        noteTitle: 'Note title',
        mode: 'note',
        aisles: [
          { label: 'Aisle 1', markdown: '# First' },
          { label: 'Aisle 2', markdown: '# Second' },
        ],
        }}
      />,
    )

    expect(html).toContain('aria-label="Print note"')
    expect(html).toContain('data-print-mode="note"')
    expect(html).toContain('First')
    expect(html).toContain('Second')
    expect(html).not.toContain('Note title')
    expect(html).not.toContain('Aisle 1')
  })
})

describe('print mode wiring and styles', () => {
  it('switches the app entrypoint into print mode from the query string', () => {
    expect(mainSource).toContain("new URLSearchParams(window.location.search).get('print') === 'aisle'")
    expect(mainSource).toContain('isPrintAisleMode ? <PrintAisleDocument /> : <App />')
  })

  it('forces light printer-friendly CSS without app backgrounds', () => {
    expect(printCss).toContain('color-scheme: light !important')
    expect(printCss).toContain('background: #ffffff !important')
    expect(printCss).toContain('@page')
    expect(printCss).toContain('margin: 0.6in')
    expect(printCss).toContain('print-color-adjust: economy')
    expect(printCss).toContain('-webkit-print-color-adjust: economy')
  })

  it('does not add note title or aisle label chrome to print output', () => {
    expect(printDocumentSource).not.toContain('aislenote-print-header')
    expect(printDocumentSource).not.toContain('aislenote-print-note-title')
    expect(printDocumentSource).not.toContain('aislenote-print-aisle-label')
    expect(printCss).not.toContain('aislenote-print-header')
    expect(printCss).not.toContain('border-bottom: 1px solid #c9c9c9')
  })
})
