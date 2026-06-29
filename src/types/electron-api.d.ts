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

type VaultSelectorPayload = {
  vaultId?: string
  vaultPath?: string
}

type VaultRenamePayload = VaultSelectorPayload & {
  name: string
}

type VaultDeletePayload = VaultSelectorPayload & {
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
export type ElectronVaultItemRevealPayload = {
  itemId: string
  itemType: 'note' | 'folder'
}
export type EditorSpellcheckContext = {
  suggestions: string[]
  misspelledWord: string
  selectionText: string
  canLookUpSelection: boolean
}

export type ElectronPrintableAislePayload = {
  label: string
  markdown: string
}

export type ElectronPrintDocumentPayload = {
  noteTitle: string
  mode?: 'aisle' | 'note'
  aisleLabel?: string
  markdown?: string
  aisles?: ElectronPrintableAislePayload[]
  defaultFileName?: string
}

export type ElectronPrintAislePayload = {
  noteTitle: string
  aisleLabel: string
  markdown: string
}

export type ElectronPrintAisleResult =
  | {
      ok: true
      canceled: boolean
    }
  | {
      ok: false
      error: string
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

type ExportVaultFolderResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      ok: true
      profileRootPath: string
      vaultPath: string
      vaultName: string
    }
  | {
      canceled: false
      ok: false
      error: string
    }

type OpenVaultImportSourceResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      ok: true
      kind: 'vault-zip'
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
      kind: 'vault-folder'
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
      nativeVaultError?: string
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

type DiagnosticLogDeleteResult =
  | {
      ok: true
      days: string[]
    }
  | {
      ok: false
      error: string
      days: string[]
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
      revealVaultItemLocation?: (payload: ElectronVaultItemRevealPayload) => Promise<{ ok: boolean; error?: string }>
      printAisle?: (payload: ElectronPrintAislePayload) => Promise<ElectronPrintAisleResult>
      exportPrintPdf?: (payload: ElectronPrintDocumentPayload) => Promise<
        | { ok: true; canceled: boolean; filePath?: string }
        | { ok: false; error: string }
      >
      readAsset?: (payload: { url?: string; assetPath?: string }) => Promise<ReadAssetResult>
      getEditorSpellcheckContext?: (payload: { x: number; y: number }) => Promise<EditorSpellcheckContext | null>
      replaceMisspelling?: (payload: { word: string }) => Promise<{ ok: boolean; error?: string }>
      addWordToSpellCheckerDictionary?: (payload: { word: string }) => Promise<{ ok: boolean; error?: string }>
      showDefinitionForSelection?: () => Promise<{ ok: boolean; error?: string }>
      onAppStateUpdated?: (handler: (payload: { serializedState: string; revision: number }) => void) => () => void
      getStorageProfileStatus?: () => Promise<StorageProfileStatus>
      getUserSettingsLocationStatus?: () => Promise<UserSettingsLocationStatus>
      chooseVaultLocation?: () => Promise<
        | { canceled: true }
        | { ok: true; locationPath: string }
        | { ok: false; error: string }
      >
      createVault?: (payload: { name: string; locationPath: string }) => Promise<StorageProfileActionResult>
      renameVault?: (payload: VaultRenamePayload) => Promise<StorageProfileActionResult>
      openVault?: () => Promise<StorageProfileActionResult>
      switchVault?: (payload: VaultSelectorPayload) => Promise<StorageProfileActionResult>
      forgetVault?: (payload: VaultSelectorPayload) => Promise<StorageProfileActionResult>
      deleteVault?: (payload?: VaultDeletePayload) => Promise<StorageProfileActionResult>
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
      revealRecoveredVaultLocation?: (payload?: { messageId?: string; signature?: string }) => Promise<
        { ok: true } | { ok: false; error: string }
      >
      retryStorageProfile?: () => Promise<
        { ok: true; status: StorageProfileStatus; warning?: string } | { ok: false; error?: string; status: StorageProfileStatus }
      >
      onOpenVaultManager?: (handler: () => void) => () => void
      onPrintActiveAisleRequested?: (handler: () => void) => () => void
      onPrintAislePayload?: (handler: (payload: ElectronPrintDocumentPayload) => void) => () => void
      notifyPrintAislePayloadReady?: () => void
      notifyPrintAisleRenderReady?: () => void
      onAppZoomChanged?: (handler: (payload: AppZoomChangedPayload) => void) => () => void
      onStorageProfileStatusUpdated?: (handler: (payload: StorageProfileStatus) => void) => () => void
      onUserSettingsLocationStatusUpdated?: (handler: (payload: UserSettingsLocationStatus) => void) => () => void
      exportVaultFolder?: (payload: { serializedState: string }) => Promise<ExportVaultFolderResult>
      openVaultImportSource?: () => Promise<OpenVaultImportSourceResult>
      readFolderImportAsset?: (payload: { sourceId: string; assetRootId?: string; relativePath: string }) => Promise<ReadFolderImportAssetResult>
      openUserSettingsFile?: () => Promise<OpenUserSettingsFileResult>
      openUserSettingsFromVaultFolder?: () => Promise<OpenUserSettingsFileResult>
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
      deleteDiagnosticLogDay?: (payload: { dayKey: string }) => Promise<DiagnosticLogDeleteResult>
      deleteAllDiagnosticLogs?: () => Promise<DiagnosticLogDeleteResult>
      openDiagnosticsFolder?: () => Promise<OpenDiagnosticsFolderResult>
    }
    __aislenoteGetLatestAppState?: () => string
    __aislenoteGetAppStateRevision?: () => number
    __aislenoteHandleMultilineShortcut?: (direction: 'up' | 'down') => boolean
  }
}
