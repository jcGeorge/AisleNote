export function registerUpdateIpc({ ipcMain, updateService }) {
  ipcMain.handle('get-runtime-info', async () => updateService.getRuntimeInfo())
  ipcMain.handle('get-update-status', async () => ({ status: updateService.getStatus() }))
  ipcMain.handle('check-for-updates', async () => updateService.checkForUpdates())
  ipcMain.handle('install-update', async () => updateService.installUpdate())
}
