export {}

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      loadAppState: () => string | null
      loadAppStateResult?: () =>
        | {
            ok: true
            serializedState: string | null
            source: 'hybrid' | 'hybrid-backup' | 'legacy' | 'empty'
            revision: number
          }
        | {
            ok: false
            serializedState: null
            source: 'hybrid' | 'hybrid-backup' | 'legacy'
            error: string
            revision: number
          }
      saveAppState: (payload: { serializedState: string; baseRevision: number }) =>
        | {
            ok: true
            serializedState: string
            revision: number
          }
        | {
            ok: false
            reason: 'load-failed' | 'invalid-payload' | 'stale-revision' | 'save-failed'
            error?: string
            currentRevision?: number
            serializedState?: string | null
          }
      onAppStateUpdated?: (handler: (payload: { serializedState: string; revision: number }) => void) => () => void
      exportAppState: (payload: { defaultPath: string; serializedState: string }) => Promise<{
        canceled: boolean
        filePath?: string
        error?: string
      }>
      saveFile: (payload: { defaultPath: string; data: ArrayBuffer }) => Promise<{
        canceled: boolean
        filePath?: string
        error?: string
      }>
      copyImageDataUrl: (dataUrl: string) => Promise<{
        ok: boolean
        error?: string
      }>
      getRuntimeInfo: () => Promise<{
        version: string
        platform: string
      }>
      getUpdateStatus: () => Promise<{
        status: 'idle' | 'checking' | 'available' | 'not-available' | 'error'
      }>
      checkForUpdates: () => Promise<{
        status: 'idle' | 'checking' | 'available' | 'not-available' | 'error'
      }>
      installUpdate: () => Promise<{
        ok: boolean
        error?: string
      }>
    }
    __tabsGetLatestAppState?: () => string
    __tabsGetAppStateRevision?: () => number
    __tabsHandleMultilineShortcut?: (direction: 'up' | 'down') => boolean
  }
}
