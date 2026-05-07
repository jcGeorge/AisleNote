export {}

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      saveFile: (payload: { defaultPath: string; data: ArrayBuffer }) => Promise<{
        canceled: boolean
        filePath?: string
        error?: string
      }>
    }
  }
}
