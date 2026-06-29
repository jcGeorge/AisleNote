import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRINT_AISLE_PAYLOAD_CHANNEL,
  PRINT_AISLE_PAYLOAD_READY_CHANNEL,
  PRINT_AISLE_RENDER_READY_CHANNEL,
  getPrintAisleResult,
  getPdfExportOptions,
  normalizePrintDocumentPayload,
  normalizePrintAislePayload,
  exportPrintPdfPayload,
  printAislePayload,
} from './print-aisle.mjs'

const preloadSource = readFileSync(path.resolve(process.cwd(), 'electron/preload.cjs'), 'utf8')
const electronTypesSource = readFileSync(path.resolve(process.cwd(), 'src/types/electron-api.d.ts'), 'utf8')
const printIpcSource = readFileSync(path.resolve(process.cwd(), 'electron/print-aisle.mjs'), 'utf8')

function createPrintHarness({
  success = true,
  failureReason = '',
  saveResult = { canceled: false, filePath: '/tmp/export.pdf' },
  pdfBytes = Buffer.from('%PDF'),
  printToPdfError = null,
} = {}) {
  const ipcMain = new EventEmitter()
  const windows = []
  const writes = []
  let nextWebContentsId = 1
  const dialog = {
    saveDialogOptions: [],
    showSaveDialog: async (options) => {
      dialog.saveDialogOptions.push(options)
      return saveResult
    },
  }

  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.destroyed = false
      this.webContents = {
        id: nextWebContentsId++,
        sent: [],
        send: (channel, payload) => {
          this.webContents.sent.push({ channel, payload })
          if (channel === PRINT_AISLE_PAYLOAD_CHANNEL) {
            queueMicrotask(() => {
              ipcMain.emit(PRINT_AISLE_RENDER_READY_CHANNEL, { sender: this.webContents })
            })
          }
        },
        print: (options, callback) => {
          this.printOptions = options
          callback(success, failureReason)
        },
        printToPDF: async (options) => {
          this.printToPdfOptions = options
          if (printToPdfError) throw printToPdfError
          return pdfBytes
        },
      }
      windows.push(this)
    }

    loadFile(filePath, options) {
      this.loadedFile = { filePath, options }
      queueMicrotask(() => {
        ipcMain.emit(PRINT_AISLE_PAYLOAD_READY_CHANNEL, { sender: this.webContents })
      })
      return Promise.resolve()
    }

    loadURL(url) {
      this.loadedUrl = url
      queueMicrotask(() => {
        ipcMain.emit(PRINT_AISLE_PAYLOAD_READY_CHANNEL, { sender: this.webContents })
      })
      return Promise.resolve()
    }

    isDestroyed() {
      return this.destroyed
    }

    destroy() {
      this.destroyed = true
      this.emit('closed')
    }
  }

  const writeFile = async (filePath, bytes) => {
    writes.push({ filePath, bytes })
  }

  return { ipcMain, BrowserWindow: FakeBrowserWindow, dialog, windows, writes, writeFile }
}

describe('print aisle payload normalization', () => {
  it('normalizes string payload fields and rejects invalid payloads', () => {
    expect(normalizePrintAislePayload(null)).toBeNull()
    expect(normalizePrintAislePayload({ noteTitle: '  ', aisleLabel: '  ', markdown: 42 })).toEqual({
      noteTitle: 'Untitled',
      aisleLabel: 'Aisle',
      markdown: '',
    })
    expect(normalizePrintAislePayload({ noteTitle: ' Note ', aisleLabel: ' Aisle 2 ', markdown: '# Hi' })).toEqual({
      noteTitle: 'Note',
      aisleLabel: 'Aisle 2',
      markdown: '# Hi',
    })
    expect(normalizePrintDocumentPayload({
      noteTitle: ' Note ',
      mode: 'note',
      aisles: [
        { label: ' First ', markdown: '# First' },
        { label: '', markdown: '# Second' },
      ],
    })).toEqual({
      noteTitle: 'Note',
      mode: 'note',
      aisles: [
        { label: 'First', markdown: '# First' },
        { label: 'Aisle 2', markdown: '# Second' },
      ],
      defaultFileName: 'Note.pdf',
    })
    expect(normalizePrintDocumentPayload({
      noteTitle: 'Bad/Name',
      aisleLabel: 'Aisle: 1',
      markdown: '# Hi',
    })).toEqual({
      noteTitle: 'Bad/Name',
      mode: 'aisle',
      aisles: [{ label: 'Aisle: 1', markdown: '# Hi' }],
      defaultFileName: 'Bad Name - Aisle 1.pdf',
    })
  })

  it('treats print cancellation as a non-error result', () => {
    expect(getPrintAisleResult(true, '')).toEqual({ ok: true, canceled: false })
    expect(getPrintAisleResult(false, 'cancelled')).toEqual({ ok: true, canceled: true })
    expect(getPrintAisleResult(false, 'printer offline')).toEqual({ ok: false, error: 'printer offline' })
  })
})

describe('print aisle preload and type bridge', () => {
  it('exposes the print command and renderer handshake APIs', () => {
    expect(preloadSource).toContain("printAisle: (payload) => ipcRenderer.invoke('print-aisle', payload)")
    expect(preloadSource).toContain("exportPrintPdf: (payload) => ipcRenderer.invoke('export-print-pdf', payload)")
    expect(preloadSource).toContain("ipcRenderer.on('print-active-aisle-requested', listener)")
    expect(preloadSource).toContain("ipcRenderer.on('print-aisle-payload', listener)")
    expect(preloadSource).toContain("ipcRenderer.send('print-aisle-payload-ready')")
    expect(preloadSource).toContain("ipcRenderer.send('print-aisle-render-ready')")
    expect(printIpcSource).toContain("ipcMain.handle('print-aisle'")
    expect(printIpcSource).toContain("ipcMain.handle('export-print-pdf'")
    expect(electronTypesSource).toContain('export type ElectronPrintAislePayload')
    expect(electronTypesSource).toContain('export type ElectronPrintDocumentPayload')
    expect(electronTypesSource).toContain('printAisle?: (payload: ElectronPrintAislePayload) => Promise<ElectronPrintAisleResult>')
    expect(electronTypesSource).toContain('exportPrintPdf?: (payload: ElectronPrintDocumentPayload) => Promise<')
    expect(electronTypesSource).toContain('onPrintActiveAisleRequested?: (handler: () => void) => () => void')
  })
})

describe('printAislePayload', () => {
  it('prints through a hidden window and destroys it after success', async () => {
    const harness = createPrintHarness()

    const result = await printAislePayload({
      payload: { noteTitle: 'Note', aisleLabel: 'Aisle 1', markdown: '# Heading' },
      ipcMain: harness.ipcMain,
      BrowserWindow: harness.BrowserWindow,
      preloadPath: '/tmp/preload.cjs',
      appIndexPath: '/tmp/index.html',
    })

    const [window] = harness.windows
    expect(result).toEqual({ ok: true, canceled: false })
    expect(window.options).toMatchObject({ show: false, backgroundColor: '#ffffff' })
    expect(window.options.webPreferences).toMatchObject({
      preload: '/tmp/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    })
    expect(window.loadedFile).toEqual({ filePath: '/tmp/index.html', options: { query: { print: 'aisle' } } })
    expect(window.webContents.sent).toEqual([
      {
        channel: PRINT_AISLE_PAYLOAD_CHANNEL,
        payload: { noteTitle: 'Note', aisleLabel: 'Aisle 1', markdown: '# Heading' },
      },
    ])
    expect(window.printOptions).toEqual({ silent: false, printBackground: false })
    expect(window.destroyed).toBe(true)
  })

  it('destroys the hidden window after cancel and print failure', async () => {
    const cancelHarness = createPrintHarness({ success: false, failureReason: 'cancelled' })
    const cancelResult = await printAislePayload({
      payload: { noteTitle: 'Note', aisleLabel: 'Aisle 1', markdown: '' },
      ipcMain: cancelHarness.ipcMain,
      BrowserWindow: cancelHarness.BrowserWindow,
      preloadPath: '/tmp/preload.cjs',
      appIndexPath: '/tmp/index.html',
    })
    expect(cancelResult).toEqual({ ok: true, canceled: true })
    expect(cancelHarness.windows[0].destroyed).toBe(true)

    const failHarness = createPrintHarness({ success: false, failureReason: 'printer offline' })
    const failResult = await printAislePayload({
      payload: { noteTitle: 'Note', aisleLabel: 'Aisle 1', markdown: '' },
      ipcMain: failHarness.ipcMain,
      BrowserWindow: failHarness.BrowserWindow,
      preloadPath: '/tmp/preload.cjs',
      appIndexPath: '/tmp/index.html',
    })
    expect(failResult).toEqual({ ok: false, error: 'printer offline' })
    expect(failHarness.windows[0].destroyed).toBe(true)
  })

  it('loads the dev server print URL when provided', async () => {
    const harness = createPrintHarness()

    await printAislePayload({
      payload: { noteTitle: 'Note', aisleLabel: 'Aisle 1', markdown: '' },
      ipcMain: harness.ipcMain,
      BrowserWindow: harness.BrowserWindow,
      preloadPath: '/tmp/preload.cjs',
      appIndexPath: '/tmp/index.html',
      devServerUrl: 'http://127.0.0.1:5173/',
    })

    expect(harness.windows[0].loadedUrl).toBe('http://127.0.0.1:5173/?print=aisle')
  })
})

describe('exportPrintPdfPayload', () => {
  it('exports a PDF through a hidden print renderer and destroys it after success', async () => {
    const harness = createPrintHarness({ pdfBytes: Buffer.from('pdf-bytes') })

    const result = await exportPrintPdfPayload({
      payload: {
        noteTitle: 'Note',
        mode: 'note',
        aisles: [
          { label: 'Aisle 1', markdown: '# One' },
          { label: 'Aisle 2', markdown: '# Two' },
        ],
      },
      ipcMain: harness.ipcMain,
      BrowserWindow: harness.BrowserWindow,
      dialog: harness.dialog,
      preloadPath: '/tmp/preload.cjs',
      appIndexPath: '/tmp/index.html',
      writeFile: harness.writeFile,
    })

    const [window] = harness.windows
    expect(result).toEqual({ ok: true, canceled: false, filePath: '/tmp/export.pdf' })
    expect(harness.dialog.saveDialogOptions[0]).toMatchObject({
      title: 'Export Note to PDF',
      defaultPath: 'Note.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    expect(window.options).toMatchObject({ show: false, backgroundColor: '#ffffff' })
    expect(window.webContents.sent).toEqual([
      {
        channel: PRINT_AISLE_PAYLOAD_CHANNEL,
        payload: {
          noteTitle: 'Note',
          mode: 'note',
          aisles: [
            { label: 'Aisle 1', markdown: '# One' },
            { label: 'Aisle 2', markdown: '# Two' },
          ],
          defaultFileName: 'Note.pdf',
        },
      },
    ])
    expect(window.printToPdfOptions).toEqual(getPdfExportOptions())
    expect(harness.writes).toEqual([{ filePath: '/tmp/export.pdf', bytes: Buffer.from('pdf-bytes') }])
    expect(window.destroyed).toBe(true)
  })

  it('does not create the hidden print window when PDF save is canceled', async () => {
    const harness = createPrintHarness({ saveResult: { canceled: true } })

    const result = await exportPrintPdfPayload({
      payload: { noteTitle: 'Note', aisleLabel: 'Aisle 1', markdown: '' },
      ipcMain: harness.ipcMain,
      BrowserWindow: harness.BrowserWindow,
      dialog: harness.dialog,
      preloadPath: '/tmp/preload.cjs',
      appIndexPath: '/tmp/index.html',
      writeFile: harness.writeFile,
    })

    expect(result).toEqual({ ok: true, canceled: true })
    expect(harness.windows).toHaveLength(0)
    expect(harness.writes).toHaveLength(0)
  })

  it('destroys the hidden print window after PDF render failure', async () => {
    const harness = createPrintHarness({ printToPdfError: new Error('pdf failed') })

    const result = await exportPrintPdfPayload({
      payload: { noteTitle: 'Note', aisleLabel: 'Aisle 1', markdown: '' },
      ipcMain: harness.ipcMain,
      BrowserWindow: harness.BrowserWindow,
      dialog: harness.dialog,
      preloadPath: '/tmp/preload.cjs',
      appIndexPath: '/tmp/index.html',
      writeFile: harness.writeFile,
    })

    expect(result).toEqual({ ok: false, error: 'pdf failed' })
    expect(harness.windows[0].destroyed).toBe(true)
    expect(harness.writes).toHaveLength(0)
  })
})
