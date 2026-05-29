export {}

import type { StorageProfileStatus } from './app'
import type { AppStateSnapshotMode } from '../storage/persistence-debounce'

type SaveAppStatePayload = {
  serializedState: string
  baseRevision: number
  snapshotMode?: AppStateSnapshotMode
}

type SaveAppStateResult =
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

type ImportImageAssetPayload = {
  bytes: ArrayBuffer
  name?: string
  type?: string
  extension?: string
}

type ImportAssetPayload = ImportImageAssetPayload

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

type ImportAppStateArchiveResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      ok: true
      serializedState: string | null
      schemaVersion?: number | null
      health?: 'healthy' | 'warning' | 'error'
      issues?: StorageProfileStatus['issues']
    }
  | {
      canceled: false
      ok: false
      serializedState: null
      error: string
      health?: 'healthy' | 'warning' | 'error'
      issues?: StorageProfileStatus['issues']
    }

type OpenNotebookArchiveResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      ok: true
      bytes: ArrayBuffer
      filePath?: string
    }
  | {
      canceled: false
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
      readAsset?: (payload: { url?: string; assetPath?: string }) => Promise<ReadAssetResult>
      onAppStateUpdated?: (handler: (payload: { serializedState: string; revision: number }) => void) => () => void
      getStorageProfileStatus?: () => Promise<StorageProfileStatus>
      createNotebook?: (payload: { serializedState: string }) => Promise<
        | { canceled: true; status: StorageProfileStatus }
        | { ok: true; status: StorageProfileStatus }
        | { ok: false; error: string; status: StorageProfileStatus }
      >
      switchNotebook?: () => Promise<
        | { canceled: true; status: StorageProfileStatus }
        | { ok: true; status: StorageProfileStatus }
        | { ok: false; error: string; status: StorageProfileStatus }
      >
      chooseStorageFolder?: () => Promise<
        | { canceled: true; status: StorageProfileStatus }
        | { ok: true; status: StorageProfileStatus }
        | { ok: false; error: string; status: StorageProfileStatus }
      >
      moveStorageProfile?: () => Promise<
        | { canceled: true; status: StorageProfileStatus }
        | { ok: true; status: StorageProfileStatus }
        | { ok: false; error: string; status: StorageProfileStatus }
      >
      revealStorageProfile?: () => Promise<{ ok: true } | { ok: false; error: string }>
      retryStorageProfile?: () => Promise<
        { ok: true; status: StorageProfileStatus } | { ok: false; error?: string; status: StorageProfileStatus }
      >
      restoreStorageRecoverySnapshot?: (payload?: { snapshotPath?: string }) => Promise<
        { ok: true; status: StorageProfileStatus } | { ok: false; error?: string; status: StorageProfileStatus }
      >
      onStorageProfileStatusUpdated?: (handler: (payload: StorageProfileStatus) => void) => () => void
      exportAppState: (payload: { defaultPath: string; serializedState: string }) => Promise<{
        canceled: boolean
        filePath?: string
        error?: string
      }>
      importAppStateArchive?: () => Promise<ImportAppStateArchiveResult>
      openNotebookArchive?: () => Promise<OpenNotebookArchiveResult>
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
    }
    __tabsGetLatestAppState?: () => string
    __tabsGetAppStateRevision?: () => number
    __tabsHandleMultilineShortcut?: (direction: 'up' | 'down') => boolean
  }
}
