import net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'

const greekSpanTableMarkdown = [
  '| General Understanding | Greek word | Correct Definition** |',
  '| --- | --- | --- |',
  '| Rapture | <span style="font-family:HelveticaNeue;">ἁ</span>ρπάζω | I seize/snatch/carry off |',
  '| Hypocrite | <span style="font-family:HelveticaNeue;">ὑ</span>ποκριτής | Stage Actor/Pretender |',
  '',
  '** Correct definition is not a good title.',
].join('\n')

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === 'object' && address?.port) resolve(address.port)
        else reject(new Error('Could not allocate a local port.'))
      })
    })
  })
}

describe('Toast UI inline HTML renderer', () => {
  let viteServer: ViteDevServer | null = null
  let browser: Browser | null = null
  let page: Page | null = null

  beforeAll(async () => {
    const port = await getAvailablePort()
    viteServer = await createServer({
      root: process.cwd(),
      server: { host: '127.0.0.1', port, strictPort: true },
      logLevel: 'silent',
    })
    await viteServer.listen()
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
    await page.addScriptTag({
      type: 'module',
      content: `
        import { Editor } from '/node_modules/@toast-ui/editor/dist/esm/index.js'
        import { AISLENOTE_TOAST_HTML_RENDERER } from '/src/editor/toast-inline-html-renderer.ts'
        import { sanitizeEditorHtml } from '/src/editor/editor-sanitizer.ts'

        window.__mountAisleNoteToastMarkdown = (markdown, options = {}) => {
          const root = document.createElement('div')
          root.style.height = options.height || '360px'
          document.body.appendChild(root)
          const editor = new Editor({
            el: root,
            initialValue: markdown,
            initialEditType: 'wysiwyg',
            previewStyle: 'tab',
            hideModeSwitch: true,
            toolbarItems: [],
            height: '100%',
            autofocus: false,
            usageStatistics: false,
            customHTMLRenderer: AISLENOTE_TOAST_HTML_RENDERER,
            ...(options.sanitize === false ? {} : { customHTMLSanitizer: sanitizeEditorHtml }),
          })
          const markdownOut = editor.getMarkdown()
          const htmlOut = editor.getHTML()
          editor.destroy()
          root.remove()
          return { markdownOut, htmlOut }
        }
      `,
    })
    await page.waitForFunction(() => typeof (window as any).__mountAisleNoteToastMarkdown === 'function')
  })

  afterAll(async () => {
    await page?.close()
    await browser?.close()
    await viteServer?.close()
  })

  it('mounts and round-trips inline span tags inside markdown table cells', async () => {
    const result = await page!.evaluate(async (markdown) => {
      return (window as any).__mountAisleNoteToastMarkdown(markdown)
    }, greekSpanTableMarkdown)

    expect(result.markdownOut).toContain('<span style="font-family:HelveticaNeue;">ἁ</span>ρπάζω')
    expect(result.markdownOut).toContain('<span style="font-family:HelveticaNeue;">ὑ</span>ποκριτής')
    expect(result.htmlOut).toContain('<span style="font-family: HelveticaNeue;">ἁ</span>ρπάζω')
  })

  it('continues to mount plain unicode Greek without span tags', async () => {
    const markdownLength = await page!.evaluate(async () => {
      return (window as any).__mountAisleNoteToastMarkdown('ἁρπάζω\n\nμετάνοια\n\nδικαιοσύνη', {
        height: '240px',
        sanitize: false,
      }).markdownOut.length
    })

    expect(markdownLength).toBeGreaterThan(0)
  })
})
