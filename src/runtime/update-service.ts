export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'error'

export type AppRuntimeInfo = {
  version: string
  platform: string
}

export interface UpdateService {
  getRuntimeInfo(): AppRuntimeInfo
  getStatus(): UpdateStatus
  checkForUpdates(): Promise<UpdateStatus>
  installUpdate(): Promise<{ ok: boolean; error?: string }>
}

export function createNoopUpdateService(runtimeInfo: AppRuntimeInfo): UpdateService {
  return {
    getRuntimeInfo: () => runtimeInfo,
    getStatus: () => 'idle',
    checkForUpdates: async () => 'not-available',
    installUpdate: async () => ({ ok: false, error: 'Updates are not configured.' }),
  }
}
