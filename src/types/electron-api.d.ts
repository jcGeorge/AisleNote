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

type ImportImageAssetResult =
  | {
      ok: true
      assetPath: string
      url: string
    }
  | {
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
            source: 'hybrid' | 'legacy' | 'empty'
            schemaVersion?: number | null
            revision: number
          }
        | {
            ok: false
            serializedState: null
            source: 'hybrid' | 'legacy'
            error: string
            conflicts?: string[]
            revision: number
          }
      saveAppState: (payload: SaveAppStatePayload) => SaveAppStateResult
      saveAppStateAsync?: (payload: SaveAppStatePayload) => Promise<SaveAppStateResult>
      importImageAsset?: (payload: ImportImageAssetPayload) => Promise<ImportImageAssetResult>
      onAppStateUpdated?: (handler: (payload: { serializedState: string; revision: number }) => void) => () => void
      getStorageProfileStatus?: () => Promise<StorageProfileStatus>
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
