export function createNoopUpdateService(app) {
  const runtimeInfo = {
    version: typeof app?.getVersion === 'function' ? app.getVersion() : '0.0.0',
    platform: process.platform,
  }

  return {
    getRuntimeInfo: () => runtimeInfo,
    getStatus: () => 'idle',
    checkForUpdates: async () => ({ status: 'not-available' }),
    installUpdate: async () => ({ ok: false, error: 'Updates are not configured.' }),
  }
}
