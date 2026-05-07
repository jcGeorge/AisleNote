export {}

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      loadAppState: () => string | null
      saveAppState: (serializedState: string) => {
        ok: boolean
        error?: string
      }
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
    }
    __tabsGetLatestAppState?: () => string
  }
}
