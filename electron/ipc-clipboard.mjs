export function registerClipboardIpc({ ipcMain, clipboard, nativeImage }) {
  ipcMain.handle('copy-image-data-url', async (_event, dataUrl) => {
    try {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return { ok: false, error: 'Invalid image payload' }
      }
      const image = nativeImage.createFromDataURL(dataUrl)
      if (image.isEmpty()) {
        return { ok: false, error: 'Empty image payload' }
      }
      clipboard.writeImage(image)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, error: message }
    }
  })
}
