export {}

import type { DiagnosticLogEntry } from '../diagnostics/diagnostic-log'
import type { NoteLocation, StorageProfileStatus, UserSettingsLocationStatus } from './app'

type SaveAppStatePayload = {
  serializedState: string
  baseRevision: number
}

type SaveAppStateMetrics = {
  totalDurationMs: number
  phases: {
    parseState: number
    buildFileMap: number
    noteBodyTraversal: number
    noteContentGeneration: number
    assetReferenceExtraction: number
    manifestAssembly: number
    assetResolve: number
    fingerprint: number
    expectedFileRebuild?: number
    textWrites: number
    binaryWrites: number
    prune: number
    appSettingsWrite: number
  }
  counts: {
    generatedFiles: number
    generatedBytes: number
    textFiles: number
    jsonFiles?: number
    mdFiles?: number
    binaryFiles: number
    existingAssetFiles: number
    expectedFiles?: number
    hashesComputed?: number
    assetsReferenced: number
    assetsReadFromDisk: number
    assetsReused: number
    assetBytesReferenced: number
    assetBytesReadFromDisk: number
    filesChanged: number
    filesSkipped: number
    filesPruned: number
    directoriesPruned: number
    aisleStorageCacheHits: number
    aisleStorageCacheMisses: number
  }
  mainProcess?: {
    receiveToSaveStartMs: number
    handlerDurationMs: number
  }
  pruneSkipped?: boolean
}

type SaveAppStateResult =
  | {
      ok: true
      serializedState: string
      revision: number
      saveMetrics?: SaveAppStateMetrics
    }
  | {
      ok: false
      reason: 'load-failed' | 'invalid-payload' | 'stale-revision' | 'save-failed'
      error?: string
      currentRevision?: number
      serializedState?: string | null
    }

type NotebookSelectorPayload = {
  notebookId?: string
  notebookPath?: string
}

type NotebookDeletePayload = NotebookSelectorPayload & {
  skipConfirmation?: boolean
}

type StorageProfileActionResult =
  | { canceled: true; status: StorageProfileStatus }
  | { ok: true; status: StorageProfileStatus; warning?: string }
  | { ok: false; error?: string; status: StorageProfileStatus }

type ImportImageAssetPayload = {
  bytes: ArrayBuffer
  name?: string
  type?: string
  extension?: string
}

type ImportAssetPayload = ImportImageAssetPayload
export type ElectronNoteRevealPayload =
  | { type: 'live-note'; location: NoteLocation; aisleId?: string }
  | { type: 'scratchpad' }
export type ElectronNotebookItemRevealPayload = {
  itemId: string
  itemType: 'note' | 'folder'
}
export type EditorSpellcheckContext = {
  suggestions: string[]
  misspelledWord: string
  selectionText: string
  canLookUpSelection: boolean
}

type ImportAssetResult =
  | {
      ok: true
      assetPath: string
      url: string
    }
  | {
      ok: false
      error: string
    }

type ImportImageAssetResult = ImportAssetResult

type ReadAssetResult =
  | {
      ok: true
      bytes: ArrayBuffer
    }
  | {
      ok: false
      error: string
    }

type ExportNotebookFolderResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      ok: true
      profileRootPath: string
      notebookPath: string
      notebookName: string
    }
  | {
      canceled: false
      ok: false
      error: string
    }

type OpenNotebookImportSourceResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      ok: true
      kind: 'notebook-zip'
      filePath?: string
      serializedState: string | null
      schemaVersion?: number | null
      health?: 'healthy' | 'warning' | 'error'
      issues?: StorageProfileStatus['issues']
      assets?: Array<{
        relativePath: string
        bytes: ArrayBuffer
        fileName?: string
        name?: string
        mimeType?: string
        extension?: string
      }>
    }
  | {
      canceled: false
      ok: true
      kind: 'notebook-folder'
      sourceId: string
      folderPath: string
      serializedState: string
      schemaVersion?: number | null
      health?: 'healthy' | 'warning' | 'error'
      issues?: StorageProfileStatus['issues']
    }
  | {
      canceled: false
      ok: true
      kind: 'markdown-folder'
      sourceId: string
      folderPath: string
      rootName?: string
      files: Array<{ relativePath: string; markdown: string; size?: number }>
      assetRoots?: Array<{ id: string; name?: string; sourceBasePath?: string }>
    }
  | {
      canceled: false
      ok: true
      kind: 'markdown-zip'
      filePath?: string
      rootName?: string
      files: Array<{ relativePath: string; markdown: string; size?: number }>
      assets?: Array<{
        assetRootId?: string
        relativePath: string
        bytes: ArrayBuffer
        fileName?: string
        name?: string
        mimeType?: string
        extension?: string
      }>
      assetRoots?: Array<{ id: string; name?: string; sourceBasePath?: string }>
      nativeNotebookError?: string
    }
  | {
      canceled: false
      ok: false
      error: string
      health?: 'healthy' | 'warning' | 'error'
      issues?: StorageProfileStatus['issues']
    }

type ReadFolderImportAssetResult =
  | {
      ok: true
      bytes: ArrayBuffer
      fileName?: string
      name?: string
      mimeType?: string
      extension?: string
      relativePath?: string
    }
  | {
      ok: false
      error: string
    }

type OpenUserSettingsFileResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      ok: true
      contents: string
      filePath?: string
    }
  | {
      canceled: false
      ok: false
      error: string
    }

type DiagnosticLogWriteResult =
  | {
      ok: true
    }
  | {
      ok: false
      error: string
    }

type DiagnosticLogDaysResult =
  | {
      ok: true
      days: string[]
    }
  | {
      ok: false
      error: string
      days: string[]
    }

type DiagnosticLogEntriesResult =
  | {
      ok: true
      entries: DiagnosticLogEntry[]
    }
  | {
      ok: false
      error: string
      entries: DiagnosticLogEntry[]
    }

type OpenDiagnosticsFolderResult =
  | {
      ok: true
    }
  | {
      ok: false
      error?: string
    }

type AppZoomChangedPayload = {
  zoomLevel: number
  zoomFactor: number
  percent: number
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      loadAppState: () => string | null
      loadAppStateResult?: () =>
        | {
            ok: true
            serializedState: string | null
            source: 'hybrid' | 'empty'
            schemaVersion?: number | null
            revision: number
          }
        | {
            ok: false
            serializedState: null
            source: 'hybrid'
            error: string
            conflicts?: string[]
            revision: number
          }
      saveAppState: (payload: SaveAppStatePayload) => SaveAppStateResult
      saveAppStateAsync?: (payload: SaveAppStatePayload) => Promise<SaveAppStateResult>
      importAsset?: (payload: ImportAssetPayload) => Promise<ImportAssetResult>
      importImageAsset?: (payload: ImportImageAssetPayload) => Promise<ImportImageAssetResult>
      openAsset?: (payload: { url?: string; assetPath?: string }) => Promise<{ ok: boolean; error?: string }>
      revealAsset?: (payload: { url?: string; assetPath?: string }) => Promise<{ ok: boolean; error?: string }>
      revealNoteLocation?: (payload: ElectronNoteRevealPayload) => Promise<{ ok: boolean; error?: string }>
      revealNotebookItemLocation?: (payload: ElectronNotebookItemRevealPayload) => Promise<{ ok: boolean; error?: string }>
      readAsset?: (payload: { url?: string; assetPath?: string }) => Promise<ReadAssetResult>
      getEditorSpellcheckContext?: (payload: { x: number; y: number }) => Promise<EditorSpellcheckContext | null>
      replaceMisspelling?: (payload: { word: string }) => Promise<{ ok: boolean; error?: string }>
      addWordToSpellCheckerDictionary?: (payload: { word: string }) => Promise<{ ok: boolean; error?: string }>
      showDefinitionForSelection?: () => Promise<{ ok: boolean; error?: string }>
      onAppStateUpdated?: (handler: (payload: { serializedState: string; revision: number }) => void) => () => void
      getStorageProfileStatus?: () => Promise<StorageProfileStatus>
      getUserSettingsLocationStatus?: () => Promise<UserSettingsLocationStatus>
      chooseNotebookLocation?: () => Promise<
        | { canceled: true }
        | { ok: true; locationPath: string }
        | { ok: false; error: string }
      >
      createNotebook?: (payload?: { name: string; locationPath: string }) => Promise<StorageProfileActionResult>
      renameNotebook?: (payload: { name: string }) => Promise<StorageProfileActionResult>
      openNotebook?: () => Promise<StorageProfileActionResult>
      switchNotebook?: (payload: NotebookSelectorPayload) => Promise<StorageProfileActionResult>
      forgetNotebook?: (payload: NotebookSelectorPayload) => Promise<StorageProfileActionResult>
      deleteNotebook?: (payload?: NotebookDeletePayload) => Promise<StorageProfileActionResult>
      moveStorageProfile?: () => Promise<StorageProfileActionResult>
      chooseUserSettingsFolder?: () => Promise<
        | { canceled: true; status: UserSettingsLocationStatus }
        | { ok: true; status: UserSettingsLocationStatus }
        | { ok: false; error?: string; status: UserSettingsLocationStatus }
      >
      resetUserSettingsFolder?: () => Promise<
        { ok: true; status: UserSettingsLocationStatus } | { ok: false; error?: string; status: UserSettingsLocationStatus }
      >
      resetUserSettingsToDefaults?: () => Promise<
        { ok: true; status: UserSettingsLocationStatus } | { ok: false; error?: string; status: UserSettingsLocationStatus }
      >
      retryUserSettingsSync?: () => Promise<
        { ok: true; status: UserSettingsLocationStatus } | { ok: false; error?: string; status: UserSettingsLocationStatus }
      >
      revealUserSettingsFolder?: () => Promise<{ ok: true } | { ok: false; error: string }>
      revealStorageProfile?: () => Promise<{ ok: true } | { ok: false; error: string }>
      revealRecoveredNotebookLocation?: (payload?: { messageId?: string; signature?: string }) => Promise<
        { ok: true } | { ok: false; error: string }
      >
      retryStorageProfile?: () => Promise<
        { ok: true; status: StorageProfileStatus; warning?: string } | { ok: false; error?: string; status: StorageProfileStatus }
      >
      onOpenNotebookManager?: (handler: () => void) => () => void
      onAppZoomChanged?: (handler: (payload: AppZoomChangedPayload) => void) => () => void
      onStorageProfileStatusUpdated?: (handler: (payload: StorageProfileStatus) => void) => () => void
      onUserSettingsLocationStatusUpdated?: (handler: (payload: UserSettingsLocationStatus) => void) => () => void
      exportNotebookFolder?: (payload: { serializedState: string }) => Promise<ExportNotebookFolderResult>
      openNotebookImportSource?: () => Promise<OpenNotebookImportSourceResult>
      readFolderImportAsset?: (payload: { sourceId: string; assetRootId?: string; relativePath: string }) => Promise<ReadFolderImportAssetResult>
      openUserSettingsFile?: () => Promise<OpenUserSettingsFileResult>
      openUserSettingsFromNotebookFolder?: () => Promise<OpenUserSettingsFileResult>
      saveUserSettingsFile?: (payload: { defaultPath: string; contents: string }) => Promise<{
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
      openExternalUrl?: (url: string) => Promise<{
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
      appendDiagnosticLogEntry?: (payload: DiagnosticLogEntry) => Promise<DiagnosticLogWriteResult>
      listDiagnosticLogDays?: () => Promise<DiagnosticLogDaysResult>
      readDiagnosticLogEntries?: (payload: { dayKey: string }) => Promise<DiagnosticLogEntriesResult>
      openDiagnosticsFolder?: () => Promise<OpenDiagnosticsFolderResult>
    }
    __aislenoteGetLatestAppState?: () => string
    __aislenoteGetAppStateRevision?: () => number
    __aislenoteHandleMultilineShortcut?: (direction: 'up' | 'down') => boolean
  }
}
