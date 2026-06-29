import { writeFile as writeFileAsync } from 'node:fs/promises'

export const PRINT_AISLE_PAYLOAD_READY_CHANNEL = 'print-aisle-payload-ready'
export const PRINT_AISLE_RENDER_READY_CHANNEL = 'print-aisle-render-ready'
export const PRINT_AISLE_PAYLOAD_CHANNEL = 'print-aisle-payload'

const PRINT_AISLE_RENDER_TIMEOUT_MS = 10000
const PDF_FILE_FILTERS = [{ name: 'PDF', extensions: ['pdf'] }]

function normalizePrintableText(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function normalizePdfFileBaseName(value, fallback) {
  const normalized = normalizePrintableText(value, fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return (normalized || fallback).slice(0, 120)
}

function ensurePdfExtension(fileName) {
  return /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`
}

function getDefaultPdfFileName({ noteTitle, mode, aisles }) {
  const noteName = normalizePdfFileBaseName(noteTitle, 'Untitled')
  if (mode === 'note') return ensurePdfExtension(noteName)
  const aisleName = normalizePdfFileBaseName(aisles[0]?.label, 'Aisle')
  return ensurePdfExtension(`${noteName} - ${aisleName}`)
}

export function normalizePrintAislePayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  return {
    noteTitle: normalizePrintableText(payload.noteTitle, 'Untitled'),
    aisleLabel: normalizePrintableText(payload.aisleLabel, 'Aisle'),
    markdown: typeof payload.markdown === 'string' ? payload.markdown : '',
  }
}

export function normalizePrintDocumentPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const noteTitle = normalizePrintableText(payload.noteTitle, 'Untitled')
  const mode = payload.mode === 'note' ? 'note' : 'aisle'
  const payloadAisles = Array.isArray(payload.aisles) && payload.aisles.length > 0
    ? payload.aisles
    : [{ label: payload.aisleLabel, markdown: payload.markdown }]
  const aisles = payloadAisles.map((aisle, index) => ({
    label: normalizePrintableText(aisle?.label, `Aisle ${index + 1}`),
    markdown: typeof aisle?.markdown === 'string' ? aisle.markdown : '',
  }))
  const normalized = { noteTitle, mode, aisles }
  return {
    ...normalized,
    defaultFileName: ensurePdfExtension(
      normalizePdfFileBaseName(payload.defaultFileName, getDefaultPdfFileName(normalized)),
    ),
  }
}

export function getPrintAisleResult(success, failureReason = '') {
  if (success) return { ok: true, canceled: false }
  if (/cancel/i.test(String(failureReason ?? ''))) return { ok: true, canceled: true }
  return { ok: false, error: String(failureReason || 'Print failed.') }
}

export function printWebContents(webContents) {
  return new Promise((resolve) => {
    webContents.print({ silent: false, printBackground: false }, (success, failureReason) => {
      resolve(getPrintAisleResult(success, failureReason))
    })
  })
}

export function getPdfExportOptions() {
  return {
    displayHeaderFooter: false,
    landscape: false,
    pageSize: 'Letter',
    preferCSSPageSize: false,
    printBackground: false,
  }
}

export function waitForPrintWindowEvent({
  ipcMain,
  window,
  channel,
  timeoutMs = PRINT_AISLE_RENDER_TIMEOUT_MS,
}) {
  return new Promise((resolve, reject) => {
    if (!window || window.isDestroyed?.()) {
      reject(new Error('Print window is unavailable.'))
      return
    }

    let timeoutId
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      ipcMain.removeListener(channel, handleEvent)
      window.removeListener?.('closed', handleClosed)
    }
    const handleClosed = () => {
      cleanup()
      reject(new Error('Print window closed before rendering completed.'))
    }
    const handleEvent = (event, payload) => {
      if (event?.sender?.id !== window.webContents?.id) return
      cleanup()
      resolve(payload)
    }

    ipcMain.on(channel, handleEvent)
    window.once?.('closed', handleClosed)
    timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for print renderer.'))
    }, timeoutMs)
  })
}

export async function loadPrintAisleWindow({ window, devServerUrl, appIndexPath }) {
  if (devServerUrl) {
    const url = new URL(devServerUrl)
    url.searchParams.set('print', 'aisle')
    await window.loadURL(url.toString())
    return
  }
  await window.loadFile(appIndexPath, { query: { print: 'aisle' } })
}

function createHiddenPrintWindow({ BrowserWindow, preloadPath }) {
  return new BrowserWindow({
    width: 816,
    height: 1056,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
}

export async function printAislePayload({
  payload,
  ipcMain,
  BrowserWindow,
  preloadPath,
  appIndexPath,
  devServerUrl = '',
  timeoutMs = PRINT_AISLE_RENDER_TIMEOUT_MS,
}) {
  const normalizedPayload = normalizePrintAislePayload(payload)
  if (!normalizedPayload) return { ok: false, error: 'Print payload is invalid.' }

  const printWindow = createHiddenPrintWindow({ BrowserWindow, preloadPath })
  const payloadReady = waitForPrintWindowEvent({
    ipcMain,
    window: printWindow,
    channel: PRINT_AISLE_PAYLOAD_READY_CHANNEL,
    timeoutMs,
  })

  try {
    await loadPrintAisleWindow({ window: printWindow, devServerUrl, appIndexPath })
    await payloadReady
    const renderReady = waitForPrintWindowEvent({
      ipcMain,
      window: printWindow,
      channel: PRINT_AISLE_RENDER_READY_CHANNEL,
      timeoutMs,
    })
    printWindow.webContents.send(PRINT_AISLE_PAYLOAD_CHANNEL, normalizedPayload)
    await renderReady
    return await printWebContents(printWindow.webContents)
  } catch (error) {
    payloadReady.catch(() => undefined)
    return { ok: false, error: error instanceof Error ? error.message : 'Print failed.' }
  } finally {
    if (!printWindow.isDestroyed?.()) {
      printWindow.destroy()
    }
  }
}

export async function exportPrintPdfPayload({
  payload,
  ipcMain,
  BrowserWindow,
  dialog,
  preloadPath,
  appIndexPath,
  devServerUrl = '',
  timeoutMs = PRINT_AISLE_RENDER_TIMEOUT_MS,
  writeFile = writeFileAsync,
}) {
  const normalizedPayload = normalizePrintDocumentPayload(payload)
  if (!normalizedPayload) return { ok: false, error: 'PDF export payload is invalid.' }
  if (!dialog || typeof dialog.showSaveDialog !== 'function') {
    return { ok: false, error: 'PDF export is unavailable.' }
  }

  let saveResult
  try {
    saveResult = await dialog.showSaveDialog({
      title: normalizedPayload.mode === 'note' ? 'Export Note to PDF' : 'Export Aisle to PDF',
      defaultPath: normalizedPayload.defaultFileName,
      filters: PDF_FILE_FILTERS,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'PDF export failed.' }
  }
  if (saveResult.canceled || !saveResult.filePath) return { ok: true, canceled: true }

  const printWindow = createHiddenPrintWindow({ BrowserWindow, preloadPath })
  const payloadReady = waitForPrintWindowEvent({
    ipcMain,
    window: printWindow,
    channel: PRINT_AISLE_PAYLOAD_READY_CHANNEL,
    timeoutMs,
  })

  try {
    await loadPrintAisleWindow({ window: printWindow, devServerUrl, appIndexPath })
    await payloadReady
    const renderReady = waitForPrintWindowEvent({
      ipcMain,
      window: printWindow,
      channel: PRINT_AISLE_RENDER_READY_CHANNEL,
      timeoutMs,
    })
    printWindow.webContents.send(PRINT_AISLE_PAYLOAD_CHANNEL, normalizedPayload)
    await renderReady
    const pdfBytes = await printWindow.webContents.printToPDF(getPdfExportOptions())
    await writeFile(saveResult.filePath, pdfBytes)
    return { ok: true, canceled: false, filePath: saveResult.filePath }
  } catch (error) {
    payloadReady.catch(() => undefined)
    return { ok: false, error: error instanceof Error ? error.message : 'PDF export failed.' }
  } finally {
    if (!printWindow.isDestroyed?.()) {
      printWindow.destroy()
    }
  }
}

export function registerPrintIpc({
  ipcMain,
  BrowserWindow,
  dialog,
  preloadPath,
  appIndexPath,
  devServerUrlProvider = () => process.env.VITE_DEV_SERVER_URL || '',
}) {
  ipcMain.handle('print-aisle', async (_event, payload) =>
    printAislePayload({
      payload,
      ipcMain,
      BrowserWindow,
      preloadPath,
      appIndexPath,
      devServerUrl: devServerUrlProvider(),
    }),
  )
  ipcMain.handle('export-print-pdf', async (_event, payload) =>
    exportPrintPdfPayload({
      payload,
      ipcMain,
      BrowserWindow,
      dialog,
      preloadPath,
      appIndexPath,
      devServerUrl: devServerUrlProvider(),
    }),
  )
}
